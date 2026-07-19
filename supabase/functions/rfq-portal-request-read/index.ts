// Read rfq_portal_requests via service role, authenticated with N8N_ACCESS_CODE.
// POST { rfq_id: "..." } OR { select?: "*", filters?: { col: value | [values] }, limit?, order? }
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
    return json({ error: "Body must be an object" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const select = typeof body.select === "string" && body.select.trim() ? body.select : "*";
  let q = supabase.from("rfq_portal_requests").select(select);

  const filters: Record<string, unknown> =
    body.filters && typeof body.filters === "object" ? body.filters : {};
  if (typeof body.rfq_id === "string" && body.rfq_id.trim()) {
    filters.rfq_id = body.rfq_id.trim();
  }

  for (const [k, v] of Object.entries(filters)) {
    if (Array.isArray(v)) q = q.in(k, v as any);
    else if (v === null) q = q.is(k, null);
    else q = q.eq(k, v as any);
  }

  if (typeof body.order === "string" && body.order.trim()) {
    const [col, dir] = body.order.split(":");
    q = q.order(col.trim(), { ascending: (dir ?? "asc").toLowerCase() !== "desc" });
  }
  const limit = Number.isFinite(body.limit) ? Number(body.limit) : 1000;
  q = q.limit(Math.min(Math.max(limit, 1), 5000));

  const { data, error } = await q;
  if (error) return json({ error: error.message, details: error }, 500);
  return json({ ok: true, count: data?.length ?? 0, rows: data ?? [] });
});
