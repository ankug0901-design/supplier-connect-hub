import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const path = "draft_1784553673467_ot0vsu/1_1784553913423_Metal_FSU.jpeg";
  const rfqId = "RFQ-20260720-1333-ISHW";
  const { data: signed, error: sErr } = await supabase.storage
    .from("rfq-attachments")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (sErr || !signed?.signedUrl) {
    return new Response(JSON.stringify({ error: sErr?.message || "sign failed" }), { status: 500 });
  }
  const { data: upd, error: uErr } = await supabase
    .from("rfq_portal_requests")
    .update({ artwork_drive_url: signed.signedUrl })
    .eq("rfq_id", rfqId)
    .select("id, supplier_email, artwork_drive_url");
  if (uErr) {
    return new Response(JSON.stringify({ error: uErr.message, signedUrl: signed.signedUrl }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, updated: upd?.length ?? 0, signedUrl: signed.signedUrl }), {
    headers: { "Content-Type": "application/json" },
  });
});
