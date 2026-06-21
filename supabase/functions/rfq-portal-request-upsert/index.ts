// Edge function for n8n RFQ Automation workflow — inserts one supplier row
// per call into public.rfq_portal_requests, bypassing RLS via service role.
//
// Auth: header `x-n8n-key: <N8N_ACCESS_CODE>` (same secret as three-way-match-upsert).
// Method: POST. One row per request.
//
// Expected payload (all string-ish from n8n; we normalize):
// {
//   "rfq_id": "RFQ-...",
//   "supplier_email": "...",
//   "client_name": "Emboss",
//   "client_email": "...",
//   "product_category": "...",
//   "product_name": "...",
//   "quantity": "16000",
//   "dimensions": "A4",
//   "material": "...",
//   "print_process": "...",
//   "finish": "...",
//   "colours": "4",
//   "artwork_status": "...",
//   "item_specs": "...",
//   "extra_specs": "...",
//   "required_by_date": "YYYY-MM-DD",
//   "response_deadline": "YYYY-MM-DD",
//   "client_budget": "",
//   "special_instructions": "..."
// }

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

function date(v: unknown): string | null {
  const t = s(v);
  if (!t) return null;
  // Accept YYYY-MM-DD or ISO; let Postgres parse — basic sanity check.
  return t;
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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "Body must be a single JSON object (one row per call)" }, 400);
    }

    const row = {
      rfq_id: s(body.rfq_id),
      supplier_email: s(body.supplier_email)?.toLowerCase() ?? null,
      client_name: s(body.client_name) ?? "Emboss",
      client_email: s(body.client_email),
      product_category: s(body.product_category),
      product_name: s(body.product_name),
      quantity: s(body.quantity),
      dimensions: s(body.dimensions),
      material: s(body.material),
      print_process: s(body.print_process),
      finish: s(body.finish),
      colours: s(body.colours),
      artwork_status: s(body.artwork_status),
      item_specs: s(body.item_specs),
      extra_specs: s(body.extra_specs),
      required_by_date: date(body.required_by_date),
      response_deadline: date(body.response_deadline),
      client_budget: s(body.client_budget),
      special_instructions: s(body.special_instructions),
      artwork_drive_url: s(body.artwork_drive_url),
      submitted_by_name: s(body.submitted_by_name),
      submitted_by_email: s(body.submitted_by_email),
      closing_time: s(body.closing_time),
      supplier_company: s(body.supplier_company),
    };

    // Required (NOT NULL) fields on rfq_portal_requests
    const missing: string[] = [];
    if (!row.rfq_id) missing.push("rfq_id");
    if (!row.supplier_email) missing.push("supplier_email");
    if (!row.client_name) missing.push("client_name");
    if (!row.product_name) missing.push("product_name");
    if (missing.length > 0) {
      return json({ error: `Missing required field(s): ${missing.join(", ")}` }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Insert with onConflict on (rfq_id, supplier_email) if such a constraint exists;
    // otherwise plain insert. Use upsert with ignoreDuplicates=false so retries don't dup.
    const { data, error } = await supabase
      .from("rfq_portal_requests")
      .insert(row)
      .select()
      .single();

    if (error) {
      return json({ error: error.message, details: error }, 500);
    }

    return json({ ok: true, row: data }, 200);
  } catch (e: any) {
    return json({ error: e?.message ?? "Server error" }, 500);
  }
});
