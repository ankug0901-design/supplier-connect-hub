// Public webhook endpoint Zoho Books can call when a Purchase Order is
// created/approved/updated. On receipt, we kick off zoho-sync for the
// specific vendor so the portal reflects the change within seconds.
//
// Configure in Zoho Books:
//   Settings -> Automation -> Webhooks
//   URL:    https://<project-ref>.supabase.co/functions/v1/zoho-webhook?token=<WEBHOOK_TOKEN>
//   Module: Purchase Orders
//   Events: Create, Edit, Status Change (approved)
//   Payload should include vendor_id (default Zoho payload does)

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-webhook-token") || "";
  const expected = Deno.env.get("ZOHO_WEBHOOK_TOKEN") || "";
  if (!expected || token !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  // Try common shapes Zoho sends
  const po = payload?.purchaseorder || payload?.purchase_order || payload?.data || payload;
  const vendorId: string | undefined =
    po?.vendor_id || po?.vendorId || payload?.vendor_id || payload?.vendorId;

  let supplierId: string | null = null;
  if (vendorId) {
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data } = await admin
      .from("suppliers")
      .select("id")
      .eq("zoho_vendor_id", String(vendorId))
      .maybeSingle();
    supplierId = data?.id ?? null;
  }

  // Fire-and-forget zoho-sync. Targeted if we have the supplier id,
  // otherwise full sync so we still pick up the change.
  const syncBody = supplierId ? { supplier_id: supplierId } : {};
  try {
    await fetch(`${supabaseUrl}/functions/v1/zoho-sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(syncBody),
    });
  } catch (e) {
    console.error("zoho-webhook: sync kick failed", e);
  }

  return new Response(
    JSON.stringify({ ok: true, triggered: true, supplier_id: supplierId, vendor_id: vendorId ?? null }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
