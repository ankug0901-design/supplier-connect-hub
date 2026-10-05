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

    return json({ success: true, inserted, updated, errors: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dispatch sync failed";
    return json(
      { success: false, inserted: 0, updated: 0, errors: [message] },
      500,
    );
  }
});
