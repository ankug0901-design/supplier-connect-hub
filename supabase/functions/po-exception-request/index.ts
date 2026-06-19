// Supplier submits an exception request for a PO whose delivery dates were not
// confirmed within 3 days of release. Emails admins, super_users and the fixed
// internal CC list. Records the request via the SECURITY DEFINER RPC
// `request_po_exception`.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_NAME = "Supplier Connect Hub | Emboss Marketing";
const SENDER_DOMAIN = "notify.embossmarketing.in";
const FROM_DOMAIN = "notify.embossmarketing.in";
const FROM_ADDRESS = `Emboss Procurement <noreply@${FROM_DOMAIN}>`;
const SITE_URL = "https://supplierconnect.embossmarketing.in";
const FIXED_CC = ["info@embossmarketing.in", "pooja.rathee@embossmarketing.in"];

const escapeHtml = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: userData } = await userClient.auth.getUser(token);
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const poId: string = body?.po_id;
    const reason: string = (body?.reason || "").toString().trim();
    if (!poId || reason.length < 5) {
      return new Response(JSON.stringify({ error: "po_id and reason (min 5 chars) are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record via SECURITY DEFINER RPC (also enforces authorization)
    const { data: requestId, error: rpcErr } = await userClient.rpc("request_po_exception", {
      _po_id: poId,
      _reason: reason,
    });
    if (rpcErr) {
      return new Response(JSON.stringify({ error: rpcErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch PO + supplier for the email
    const { data: po } = await admin
      .from("purchase_orders")
      .select("id, po_number, date, supplier_id, delivery_first_notified_at")
      .eq("id", poId)
      .maybeSingle();
    const { data: sup } = po
      ? await admin
          .from("suppliers")
          .select("id, name, company, email")
          .eq("id", po.supplier_id)
          .maybeSingle()
      : { data: null as any };

    // Admin / super_user emails + fixed CC
    const { data: adminRows } = await admin
      .from("suppliers")
      .select("email, role")
      .in("role", ["admin", "super_user"]);
    const recipients = Array.from(
      new Set(
        [
          ...(adminRows || []).map((r: any) => String(r.email || "").toLowerCase()),
          ...FIXED_CC.map((e) => e.toLowerCase()),
        ].filter(Boolean),
      ),
    );

    const poUrl = `${SITE_URL}/purchase-orders/${po?.id || poId}`;
    const releasedAt = po?.delivery_first_notified_at || po?.date || "";
    const daysOpen = releasedAt
      ? Math.floor((Date.now() - new Date(releasedAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const supplierLabel = sup?.company || sup?.name || "Unknown supplier";

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:20px;">
      <h1 style="margin:0;font-size:18px;color:#0f172a;">Emboss Marketing</h1>
      <div style="font-size:12px;color:#6b7280;">${SITE_NAME}</div>
    </div>
    <h2 style="margin:0 0 12px;color:#b45309;font-size:18px;">Delivery-date exception requested</h2>
    <p style="margin:0 0 12px;color:#1f2937;font-size:14px;line-height:1.6;">
      Supplier <strong>${escapeHtml(supplierLabel)}</strong> has not confirmed delivery dates within 3 days of release
      and is requesting an exception so they can download the PO and upload invoices.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0 16px;font-size:14px;color:#1f2937;">
      <tr><td style="padding:6px 0;color:#6b7280;width:160px;">PO Number</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(po?.po_number || "—")}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">PO Date</td><td style="padding:6px 0;">${escapeHtml(po?.date || "—")}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Days since release</td><td style="padding:6px 0;">${daysOpen}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Supplier email</td><td style="padding:6px 0;">${escapeHtml(sup?.email || "—")}</td></tr>
    </table>
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;background:#f9fafb;">
      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Reason from supplier</div>
      <div style="font-size:14px;color:#111827;white-space:pre-wrap;">${escapeHtml(reason)}</div>
    </div>
    <p style="margin:20px 0 0;">
      <a href="${SITE_URL}/admin/exception-requests" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">Review request</a>
      &nbsp;
      <a href="${poUrl}" style="color:#0f172a;text-decoration:underline;font-size:14px;">Open PO</a>
    </p>
    <p style="margin-top:32px;color:#6b7280;font-size:12px;">
      Automated alert from the Emboss Marketing supplier portal.
    </p>
  </div>
</body></html>`;

    const messageId = `po-exception-${requestId}`;
    const subject = `Exception requested: PO ${po?.po_number || ""} – delivery dates not confirmed`;

    // Send a single email with admins / super_users / fixed CC as recipients.
    const primary = recipients[0];
    if (primary) {
      const payload = {
        to: primary,
        cc: recipients.slice(1),
        from: FROM_ADDRESS,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text: `Supplier ${supplierLabel} requested an exception for PO ${po?.po_number}. Reason: ${reason}. Review at ${SITE_URL}/admin/exception-requests`,
        purpose: "transactional",
        label: "po-exception-request",
        idempotency_key: messageId,
        message_id: messageId,
        queued_at: new Date().toISOString(),
      };
      const { error: enqErr } = await admin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload,
      });
      if (enqErr) console.warn("enqueue_email failed", enqErr);

      await admin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "po-exception-request",
        recipient_email: primary,
        status: "pending",
      });

      try {
        await fetch(`${SUPABASE_URL}/functions/v1/process-email-queue`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: "{}",
        });
      } catch (_) {
        /* ignore */
      }
    }

    return new Response(JSON.stringify({ request_id: requestId, notified: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
