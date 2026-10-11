import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders as sdkCorsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const SYNC_KEY = "emboss-sync-2026";
const corsHeaders = {
  ...sdkCorsHeaders,
  "Access-Control-Allow-Headers": `${sdkCorsHeaders["Access-Control-Allow-Headers"]}, x-sync-key`,
};
const allowedStatuses = [
  "dispatched",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
] as const;

const nullableText = z.string().trim().max(2_000).nullable().optional();
const nullableDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must use YYYY-MM-DD format")
  .nullable()
  .optional();

const DispatchRecordSchema = z.object({
  po_id: z.string().uuid(),
  client_order_id: z.string().uuid().nullable().optional(),
  lr_number: z.string().trim().min(1).max(255),
  awb_number: nullableText,
  courier_name: nullableText,
  dispatch_quantity: z.coerce.number().int().nonnegative(),
  dispatch_date: nullableDate,
  actual_delivery_date: nullableDate,
  delivery_status: z.enum(allowedStatuses),
  receiver_name: nullableText,
  receiver_phone: nullableText,
  notes: nullableText,
  delivery_proof_urls: z.array(z.string().url()).max(100).nullable().optional(),
});

const BodySchema = z.object({
  records: z.array(DispatchRecordSchema).max(500),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(
      { success: false, inserted: 0, updated: 0, errors: ["Method not allowed"] },
      405,
    );
  }

  if (req.headers.get("x-sync-key") !== SYNC_KEY) {
    return json(
      { success: false, inserted: 0, updated: 0, errors: ["Unauthorized"] },
      401,
    );
  }

  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return json(
      { success: false, inserted: 0, updated: 0, errors: ["Invalid JSON body"] },
      400,
    );
  }

  const parsed = BodySchema.safeParse(input);
  if (!parsed.success) {
    return json(
      {
        success: false,
        inserted: 0,
        updated: 0,
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  const records = parsed.data.records;
  const duplicateKeys = new Set<string>();
  const seenKeys = new Set<string>();
  for (const record of records) {
    const key = `${record.po_id}:${record.lr_number}`;
    if (seenKeys.has(key)) duplicateKeys.add(key);
    seenKeys.add(key);
  }
  if (duplicateKeys.size > 0) {
    return json(
      {
        success: false,
        inserted: 0,
        updated: 0,
        errors: [...duplicateKeys].map((key) => `Duplicate po_id/lr_number in request: ${key}`),
      },
      400,
    );
  }

  if (records.length === 0) {
    return json({ success: true, inserted: 0, updated: 0, errors: [] });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const poIds = [...new Set(records.map((record) => record.po_id))];

    // --- FIX 1: AWB-based deduplication ---
    // When the same shipment (same AWB) arrives with a different LR number,
    // update the existing record's LR number instead of creating a duplicate.
    const awbNumbers = records
      .map((r) => r.awb_number?.trim())
      .filter((a): a is string => !!a && a.length > 0);

    if (awbNumbers.length > 0) {
      // Find existing records with matching AWBs but different LR numbers
      const { data: awbMatches } = await supabase
        .from("po_dispatch")
        .select("id,po_id,lr_number,awb_number")
        .in("po_id", poIds)
        .in("awb_number", awbNumbers);

      if (awbMatches && awbMatches.length > 0) {
        // Build a map: po_id+awb -> existing record
        const existingByAwb = new Map<string, { id: string; lr_number: string }>();
        for (const row of awbMatches) {
          if (row.awb_number) {
            existingByAwb.set(`${row.po_id}:${row.awb_number}`, {
              id: row.id,
              lr_number: row.lr_number,
            });
          }
        }

        // For each incoming record, if there's an existing record with same AWB
        // but different LR, update the existing record's LR to match the incoming one
        // so the upsert will hit the existing row instead of creating a new one
        for (const record of records) {
          if (!record.awb_number) continue;
          const awbKey = `${record.po_id}:${record.awb_number}`;
          const existing = existingByAwb.get(awbKey);
          if (existing && existing.lr_number !== record.lr_number) {
            // Update the existing record's LR number to match incoming
            await supabase
              .from("po_dispatch")
              .update({ lr_number: record.lr_number })
              .eq("id", existing.id);
          }
        }
      }
    }

    // Lookup existing records for insert/update counting
    const { data: existing, error: lookupError } = await supabase
      .from("po_dispatch")
      .select("po_id,lr_number")
      .in("po_id", poIds);

    if (lookupError) throw lookupError;

    const existingKeys = new Set(
      (existing ?? []).map((row) => `${row.po_id}:${row.lr_number}`),
    );
    const updated = records.filter((record) =>
      existingKeys.has(`${record.po_id}:${record.lr_number}`)
    ).length;
    const inserted = records.length - updated;

    const { error: upsertError } = await supabase
      .from("po_dispatch")
      .upsert(records, { onConflict: "po_id,lr_number", ignoreDuplicates: false });

    if (upsertError) throw upsertError;

    // --- FIX 2: Recalculate order status after sync ---
    // Collect all affected client_order_ids and call _po_recalc_status for each
    const affectedOrderIds = new Set<string>();

    // Get client_order_ids from the records themselves
    for (const record of records) {
      if (record.client_order_id) {
        affectedOrderIds.add(record.client_order_id);
      }
    }

    // Also look up client_order_ids from po_dispatch for records that didn't include it
    if (affectedOrderIds.size < records.length) {
      const { data: dispatchRows } = await supabase
        .from("po_dispatch")
        .select("client_order_id")
        .in("po_id", poIds)
        .not("client_order_id", "is", null);

      if (dispatchRows) {
        for (const row of dispatchRows) {
          if (row.client_order_id) {
            affectedOrderIds.add(row.client_order_id);
          }
        }
      }
    }

    // Call _po_recalc_status for each affected order (best-effort)
    const recalcErrors: string[] = [];
    for (const orderId of affectedOrderIds) {
      const { error: recalcError } = await supabase.rpc("_po_recalc_status", {
        p_order_id: orderId,
      });
      if (recalcError) {
        recalcErrors.push(`recalc ${orderId}: ${recalcError.message}`);
      }
    }

    return json({
      success: true,
      inserted,
      updated,
      recalculated: affectedOrderIds.size,
      errors: recalcErrors.length > 0 ? recalcErrors : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dispatch sync failed";
    return json(
      { success: false, inserted: 0, updated: 0, errors: [message] },
      500,
    );
  }
});
