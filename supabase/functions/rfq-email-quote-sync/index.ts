// Server-side endpoint for the n8n "Emboss — Email Quote Parser" workflow
// (and "Accept RFQ by Email Reply"). The workflow previously called PostgREST
// directly with the anon key, but rfq_portal_requests has no anon SELECT/UPDATE
// policy so every read returned [] and every PATCH affected 0 rows — silently
// dropping every emailed supplier quote.
//
// Auth: header `x-n8n-key: <N8N_ACCESS_CODE>` (same secret as the other n8n
// upsert functions).
//
// Actions (single POST endpoint, body.action selects):
//   { action: "fetch_rfq",      rfq_id, supplier_email? }
//       → { ok, rows: rfq_portal_requests[] }
//   { action: "submit_quote",   rfq_id, supplier_email, quoted_unit_price?,
//                               quoted_gst_percent?, lead_time_days?,
//                               payment_terms?, validity_days?, setup_charges?,
//                               supplier_notes? }
//       → { ok, row }
//   { action: "list_submitted", rfq_id }
//       → { ok, rows: [{ supplier_email, total_price }] }
//   { action: "accept_quote",   rfq_id, supplier_email, reason?,
//                               actioned_by_email?, actioned_by_name? }
//       → { ok, accepted, rejected_count }

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

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

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
  if (!body || typeof body !== "object") {
    return json({ error: "Body must be a JSON object" }, 400);
  }

  const action = str(body.action);
  if (!action) return json({ error: "Missing 'action'" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (action === "fetch_rfq") {
      const rfq_id = str(body.rfq_id);
      if (!rfq_id) return json({ error: "Missing rfq_id" }, 400);
      let q = supabase.from("rfq_portal_requests").select("*").eq("rfq_id", rfq_id);
      const supplier_email = str(body.supplier_email)?.toLowerCase();
      if (supplier_email) q = q.eq("supplier_email", supplier_email);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, rows: data ?? [] });
    }

    if (action === "submit_quote") {
      const rfq_id = str(body.rfq_id);
      const supplier_email = str(body.supplier_email)?.toLowerCase();
      if (!rfq_id || !supplier_email) {
        return json({ error: "Missing rfq_id or supplier_email" }, 400);
      }

      const quoted_unit_price = num(body.quoted_unit_price);
      const quoted_gst_percent = num(body.quoted_gst_percent) ?? 18;
      const lead_time_days = num(body.lead_time_days);
      const validity_days = num(body.validity_days) ?? 30;
      const setup_charges = num(body.setup_charges) ?? 0;
      const payment_terms = str(body.payment_terms) ?? "";
      const supplier_notes_in = str(body.supplier_notes) ?? "";
      const supplier_notes = supplier_notes_in
        ? `${supplier_notes_in} [Via email reply]`
        : "[Via email reply]";

      const total_price =
        quoted_unit_price !== null
          ? Number((quoted_unit_price * (1 + quoted_gst_percent / 100)).toFixed(2))
          : null;

      const patch: Record<string, unknown> = {
        status: "quote_submitted",
        quoted_unit_price,
        quoted_gst_percent,
        total_price,
        lead_time_days,
        payment_terms,
        validity_days,
        setup_charges,
        supplier_notes,
        quote_submitted_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("rfq_portal_requests")
        .update(patch)
        .eq("rfq_id", rfq_id)
        .eq("supplier_email", supplier_email)
        .select()
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) {
        return json(
          { error: "No matching rfq_portal_requests row for this rfq_id + supplier_email" },
          404,
        );
      }
      return json({ ok: true, row: data });
    }

    if (action === "list_submitted") {
      const rfq_id = str(body.rfq_id);
      if (!rfq_id) return json({ error: "Missing rfq_id" }, 400);
      const { data, error } = await supabase
        .from("rfq_portal_requests")
        .select("supplier_email,total_price,quoted_unit_price,lead_time_days")
        .eq("rfq_id", rfq_id)
        .eq("status", "quote_submitted");
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, rows: data ?? [] });
    }

    if (action === "accept_quote") {
      const rfq_id = str(body.rfq_id);
      const supplier_email = str(body.supplier_email)?.toLowerCase();
      if (!rfq_id || !supplier_email) {
        return json({ error: "Missing rfq_id or supplier_email" }, 400);
      }
      const reason = str(body.reason) ?? "Accepted via email reply";
      const actioned_by_email = str(body.actioned_by_email);
      const actioned_by_name = str(body.actioned_by_name);
      const notes = [
        reason,
        actioned_by_name || actioned_by_email
          ? `By: ${actioned_by_name ?? ""} <${actioned_by_email ?? ""}>`.trim()
          : null,
      ]
        .filter(Boolean)
        .join(" | ");

      const now = new Date().toISOString();
      const { data: accepted, error: aErr } = await supabase
        .from("rfq_portal_requests")
        .update({ emboss_decision: "accepted", emboss_notes: notes, decided_at: now })
        .eq("rfq_id", rfq_id)
        .eq("supplier_email", supplier_email)
        .select()
        .maybeSingle();
      if (aErr) return json({ error: aErr.message }, 500);
      if (!accepted) return json({ error: "Quote row not found" }, 404);

      const { data: rejected, error: rErr } = await supabase
        .from("rfq_portal_requests")
        .update({ emboss_decision: "rejected", emboss_notes: "Auto-rejected — another supplier accepted", decided_at: now })
        .eq("rfq_id", rfq_id)
        .neq("supplier_email", supplier_email)
        .select("id");
      if (rErr) return json({ error: rErr.message }, 500);

      return json({ ok: true, accepted, rejected_count: rejected?.length ?? 0 });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? "Server error" }, 500);
  }
});
