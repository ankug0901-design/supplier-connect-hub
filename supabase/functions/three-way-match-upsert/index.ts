// Edge function for N8N "3 Way Matching" workflow to upsert matched records.
// N8N should POST an array (or single object) of match records.
// Auth: send header `x-n8n-key: <N8N_ACCESS_CODE>` to authorize.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-n8n-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_FIELDS = [
  "client_invoice_number",
  "client_invoice_date",
  "client_invoice_amount",
  "client_name",
  "client_invoice_status",
  "supplier_invoice_number",
  "supplier_invoice_date",
  "supplier_invoice_amount",
  "supplier_id",
  "supplier_name",
  "supplier_company",
  "po_number",
  "client_quantity",
  "supplier_quantity",
  "quantity_match",
  "amount_match",
  "client_payment_received",
  "client_payment_date",
  "client_payment_amount",
  "client_payment_reference",
  "supplier_payment_status",
  "supplier_payment_eligible",
  "match_status",
  "notes",
  "raw_payload",
  "matched_at",
];

function sanitize(row: any) {
  const out: any = {};
  for (const k of ALLOWED_FIELDS) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") out[k] = row[k];
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const expected = Deno.env.get("N8N_ACCESS_CODE");
    // Accept several header name variants N8N might send
    const provided =
      req.headers.get("x-n8n-key") ??
      req.headers.get("x_n8n_key") ??
      req.headers.get("X-N8N-Key") ??
      "";
    // Trim whitespace + strip surrounding quotes (common N8N expression mistake)
    const cleaned = provided.trim().replace(/^["']|["']$/g, "");

    if (!expected || cleaned !== expected) {
      // Diagnostic logging — does NOT leak secret values
      const allHeaders: Record<string, string> = {};
      req.headers.forEach((v, k) => {
        allHeaders[k] = k.toLowerCase().includes("key") || k.toLowerCase().includes("auth")
          ? `len=${v.length}`
          : v;
      });
      console.log("AUTH FAIL", JSON.stringify({
        provided_len: provided.length,
        cleaned_len: cleaned.length,
        expected_len: expected?.length ?? 0,
        first2: cleaned.slice(0, 2),
        last2: cleaned.slice(-2),
        match_after_clean: cleaned === expected,
        headers: allHeaders,
      }));
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const records: any[] = Array.isArray(body) ? body : Array.isArray(body?.records) ? body.records : [body];
    const rows = records.map(sanitize).filter((r) => Object.keys(r).length > 0);

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "No valid rows" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("three_way_matches")
      .upsert(rows, {
        onConflict: "client_invoice_number,supplier_invoice_number,po_number",
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, count: data?.length ?? rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
