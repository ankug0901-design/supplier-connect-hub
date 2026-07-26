// Manage rfq_documents (list / insert / delete) via service role.
// Auth: `x-n8n-key: <N8N_ACCESS_CODE>` (n8n / Python agent) or `apikey: <anon key>` (browser).
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

function authenticate(req: Request): boolean {
  const expected = Deno.env.get("N8N_ACCESS_CODE");
  const n8nKey =
    req.headers.get("x-n8n-key") ??
    req.headers.get("x_n8n_key") ??
    req.headers.get("X-N8N-Key") ??
    "";
  const cleaned = n8nKey.trim().replace(/^["']|["']$/g, "");
  if (expected && cleaned === expected) return true;
  const apikey = req.headers.get("apikey") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (apikey && anonKey && apikey === anonKey) return true;
  return false;
}

const VALID_DOC_TYPES = [
  "artwork",
  "boq_template",
  "reference",
  "technical_drawing",
  "specification",
  "other",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!authenticate(req)) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ error: "Body must be an object" }, 400);
  }

  const action = s(body.action);
  if (!action || !["list", "insert", "delete"].includes(action)) {
    return json({ error: "action must be one of: list, insert, delete" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (action === "list") {
      const rfq_id = s(body.rfq_id);
      if (!rfq_id) return json({ error: "rfq_id is required for list" }, 400);
      let q = supabase
        .from("rfq_documents")
        .select("*")
        .eq("rfq_id", rfq_id)
        .order("doc_type")
        .order("item_number", { ascending: true, nullsFirst: true })
        .order("uploaded_at", { ascending: true });
      const doc_type = s(body.doc_type);
      if (doc_type) q = q.eq("doc_type", doc_type);
      const { data, error } = await q;
      if (error) return json({ error: error.message, details: error }, 500);
      return json({ ok: true, count: (data ?? []).length, documents: data ?? [] });
    }

    if (action === "insert") {
      const rfq_id = s(body.rfq_id);
      if (!rfq_id) return json({ error: "rfq_id is required for insert" }, 400);
      let docs: any[] = [];
      if (Array.isArray(body.documents)) docs = body.documents;
      else if (body.doc_type && body.file_url) docs = [body];
      if (docs.length === 0) {
        return json({ error: "Provide doc_type + file_url, or a documents[] array" }, 400);
      }
      if (docs.length > 20) return json({ error: "Maximum 20 documents per batch" }, 400);

      const rows: any[] = [];
      for (const doc of docs) {
        const doc_type = s(doc.doc_type);
        const file_url = s(doc.file_url);
        const file_name = s(doc.file_name);
        if (!doc_type || !VALID_DOC_TYPES.includes(doc_type)) {
          return json(
            { error: `Invalid doc_type "${doc_type}". Must be one of: ${VALID_DOC_TYPES.join(", ")}` },
            400,
          );
        }
        if (!file_url) return json({ error: "file_url is required" }, 400);
        if (!file_name) return json({ error: "file_name is required" }, 400);
        rows.push({
          rfq_id,
          doc_type,
          file_url,
          file_name,
          file_size_bytes: Number.isFinite(Number(doc.file_size_bytes))
            ? Number(doc.file_size_bytes)
            : null,
          uploaded_by: s(doc.uploaded_by),
          item_number: Number.isFinite(Number(doc.item_number)) ? Number(doc.item_number) : null,
          notes: s(doc.notes),
        });
      }
      const { data, error } = await supabase.from("rfq_documents").insert(rows).select();
      if (error) return json({ error: error.message, details: error }, 500);
      return json({ ok: true, inserted: (data ?? []).length, documents: data ?? [] });
    }

    if (action === "delete") {
      const id = s(body.id);
      const rfq_id = s(body.rfq_id);
      const doc_type = s(body.doc_type);
      if (id) {
        const { error } = await supabase.from("rfq_documents").delete().eq("id", id);
        if (error) return json({ error: error.message, details: error }, 500);
        return json({ ok: true, deleted_id: id });
      }
      if (rfq_id && doc_type) {
        const { data, error } = await supabase
          .from("rfq_documents")
          .delete()
          .eq("rfq_id", rfq_id)
          .eq("doc_type", doc_type)
          .select("id");
        if (error) return json({ error: error.message, details: error }, 500);
        return json({
          ok: true,
          deleted_count: (data ?? []).length,
          deleted_ids: (data ?? []).map((r: any) => r.id),
        });
      }
      return json({ error: "Provide id (single delete) or rfq_id + doc_type (bulk delete)" }, 400);
    }

    return json({ error: "Unhandled action" }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? "Server error" }, 500);
  }
});
