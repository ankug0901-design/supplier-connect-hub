// Edge function for n8n / Python agent — updates an RFQ portal request row
// with a supplier quote parsed from an email reply.
//
// Auth: header `x-n8n-key: <N8N_ACCESS_CODE>`.
// Method: POST. Lookup by (rfq_id, supplier_email case-insensitive).
//
// Behavior:
//   - No matching row → 404
//   - Row already decided (status in accepted/rejected) → 409
//   - Otherwise → update quote fields and return the fresh row

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
function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function intish(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}

const DECIDED = new Set(["accepted", "rejected"]);

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
      return json({ error: "Body must be a JSON object" }, 400);
    }

    const rfq_id = s(body.rfq_id);
    const supplier_email = s(body.supplier_email)?.toLowerCase() ?? null;
    if (!rfq_id) return json({ error: "rfq_id is required" }, 400);
    if (!supplier_email) return json({ error: "supplier_email is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Locate the row (case-insensitive email match)
    const { data: existing, error: findErr } = await supabase
      .from("rfq_portal_requests")
      .select("id, status, emboss_decision")
      .eq("rfq_id", rfq_id)
      .ilike("supplier_email", supplier_email)
      .maybeSingle();

    if (findErr) return json({ error: findErr.message }, 500);
    if (!existing) return json({ error: "No matching RFQ row" }, 404);

    const currentStatus = (existing.status ?? "").toLowerCase();
    const currentDecision = (existing.emboss_decision ?? "").toLowerCase();
    if (DECIDED.has(currentStatus) || DECIDED.has(currentDecision)) {
      return json({ error: "RFQ already decided" }, 409);
    }

    // Build update payload — only include provided fields
    const patch: Record<string, unknown> = {};
    const setIf = (key: string, val: unknown) => {
      if (val !== null && val !== undefined) patch[key] = val;
    };

    setIf("quoted_unit_price", num(body.quoted_unit_price));
    setIf("quoted_gst_percent", num(body.quoted_gst_percent));
    setIf("total_price", num(body.total_price));
    setIf("lead_time_days", intish(body.lead_time_days));
    setIf("payment_terms", s(body.payment_terms));
    setIf("quote_validity_days", intish(body.quote_validity_days));
    setIf("setup_charges", num(body.setup_charges));
    setIf("quote_source", s(body.quote_source));
    setIf("quote_received_at", s(body.quote_received_at));
    setIf("quote_parsing_confidence", num(body.quote_parsing_confidence));
    setIf("quote_raw_email_body", s(body.quote_raw_email_body));
    setIf("quote_email_message_id", s(body.quote_email_message_id));

    const newStatus = s(body.status);
    if (newStatus) {
      const allowed = new Set([
        "pending",
        "quote_submitted",
        "quoted_incomplete",
      ]);
      if (!allowed.has(newStatus.toLowerCase())) {
        return json({ error: `Invalid status: ${newStatus}` }, 400);
      }
      patch.status = newStatus.toLowerCase();
    } else if (Object.keys(patch).length > 0 && currentStatus === "pending") {
      patch.status = "quote_submitted";
    }

    // Set quote_submitted_at if we're recording a quote for the first time
    if (patch.status === "quote_submitted" || patch.status === "quoted_incomplete") {
      patch.quote_submitted_at = s(body.quote_received_at) ?? new Date().toISOString();
    }

    if (Object.keys(patch).length === 0) {
      return json({ error: "No quote fields provided" }, 400);
    }

    console.log("rfq-quote-upsert patch", JSON.stringify(patch));
    const { data: updated, error: updErr } = await supabase
      .from("rfq_portal_requests")
      .update(patch)
      .eq("id", existing.id)
      .select()
      .single();

    if (updErr) {
      console.error("rfq-quote-upsert update error", updErr);
      return json({ error: updErr.message, details: updErr }, 500);
    }
    return json({ ok: true, row: updated }, 200);
  } catch (e: any) {
    console.error("rfq-quote-upsert unhandled", e);
    return json({ error: e?.message ?? "Server error", stack: e?.stack }, 500);
  }
});
