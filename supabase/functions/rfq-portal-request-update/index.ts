// Update rows in rfq_portal_requests via service role, authenticated with N8N_ACCESS_CODE.
// POST { rfq_id: "...", filters?: { col: value | [values] | null }, updates: { col: value, ... } }
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

  const rfqId = s(body.rfq_id);
  if (!rfqId) return json({ error: "Missing required field: rfq_id" }, 400);

  const updates = body.updates;
  if (!updates || typeof updates !== "object" || Array.isArray(updates) || Object.keys(updates).length === 0) {
    return json({ error: "Missing or empty 'updates' object" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let q = supabase.from("rfq_portal_requests").update(updates).eq("rfq_id", rfqId);

  const filters: Record<string, unknown> =
    body.filters && typeof body.filters === "object" && !Array.isArray(body.filters)
      ? body.filters
      : {};

  for (const [k, v] of Object.entries(filters)) {
    if (k === "rfq_id") continue;
    if (Array.isArray(v)) q = q.in(k, v as any);
    else if (v === null) q = q.is(k, null);
    else q = q.eq(k, v as any);
  }

  const { data, error } = await q.select();
  if (error) return json({ error: error.message, details: error }, 500);

  return json({ ok: true, updated_count: data?.length ?? 0, rows: data ?? [] });
});
