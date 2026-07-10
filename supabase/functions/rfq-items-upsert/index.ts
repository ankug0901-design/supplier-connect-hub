// Edge function for n8n RFQ Automation workflow — upserts the items array for
// a multi-item RFQ into public.rfq_items, bypassing RLS via service role.
//
// Auth: header `x-n8n-key: <N8N_ACCESS_CODE>` (same secret as
// rfq-portal-request-upsert / three-way-match-upsert).
// Method: POST.
//
// Expected payload:
// {
//   "rfq_id": "RFQ-...",
//   "items": [
//     { "item_number": 1, "product_category": "...", "product_name": "...",
//       "quantity": "...", "dimensions": "...", "material": "...",
//       "print_process": "...", "finish": "...", "colours": "...",
//       "artwork_status": "...", "extra_specs": "...",
//       "attachment_url": "...", "attachment_name": "..." },
//     ...
//   ]
// }
//
// Behaviour:
//   - Upserts every item (rfq_id + item_number is the conflict key).
//   - Deletes any existing rows for this rfq_id whose item_number > items.length
//     (so re-submission with fewer items removes the extras).
//   - Updates rfq_portal_requests.is_multi_item / item_count accordingly.
//   - Returns the fresh item list for the rfq_id.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-n8n-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function s(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const expected = Deno.env.get("N8N_ACCESS_CODE");
    const provided =
      req.headers.get("x-n8n-key") ??
      req.headers.get("x_n8n_key") ??
      req.headers.get("X-N8N-Key") ??
      "";
    const cleaned = provided.trim().replace(/^["']|["']$/g, "");
    if (!expected || cleaned !== expected) {
      return json({ error: "Unauthorized" }, 401);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const rfq_id = s(body?.rfq_id);
    const itemsIn: any[] = Array.isArray(body?.items) ? body.items : [];
    if (!rfq_id) return json({ error: "rfq_id is required" }, 400);
    if (itemsIn.length === 0) return json({ error: "items must be a non-empty array" }, 400);
    if (itemsIn.length > 50) return json({ error: "too many items (max 50)" }, 400);

    const rows = itemsIn.map((it, idx) => {
      const item_number = Number(it?.item_number) || idx + 1;
      return {
        rfq_id,
        item_number,
        product_category: s(it.product_category),
        product_name: s(it.product_name) ?? "Item",
        quantity: s(it.quantity) ?? "1",
        dimensions: s(it.dimensions),
        material: s(it.material),
        print_process: s(it.print_process),
        finish: s(it.finish),
        colours: s(it.colours),
        artwork_status: s(it.artwork_status),
        extra_specs: s(it.extra_specs),
        attachment_url: s(it.attachment_url),
        attachment_name: s(it.attachment_name),
      };
    });

    // Validate required fields per item
    for (const r of rows) {
      if (!r.product_name || !r.quantity) {
        return json({ error: `Item ${r.item_number} missing product_name or quantity` }, 400);
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: upsertErr } = await supabase
      .from("rfq_items")
      .upsert(rows, { onConflict: "rfq_id,item_number" });
    if (upsertErr) return json({ error: upsertErr.message, details: upsertErr }, 500);

    // Trim removed items
    const maxItem = rows.reduce((m, r) => Math.max(m, r.item_number), 0);
    const { error: delErr } = await supabase
      .from("rfq_items")
      .delete()
      .eq("rfq_id", rfq_id)
      .gt("item_number", maxItem);
    if (delErr) return json({ error: delErr.message, details: delErr }, 500);

    // Reflect multi-item flags on rfq_portal_requests (all supplier rows)
    await supabase
      .from("rfq_portal_requests")
      .update({ is_multi_item: rows.length > 1, item_count: rows.length })
      .eq("rfq_id", rfq_id);

    const { data: items, error: readErr } = await supabase
      .from("rfq_items")
      .select("*")
      .eq("rfq_id", rfq_id)
      .order("item_number", { ascending: true });
    if (readErr) return json({ error: readErr.message }, 500);

    return json({ ok: true, items }, 200);
  } catch (e: any) {
    return json({ error: e?.message ?? "Server error" }, 500);
  }
});
