import { EmailAPIError, sendLovableEmail } from 'npm:@lovable.dev/email-js@0.3.1';
import { recordEmailSendOutcome } from '../_shared/email-send-outcome.ts';
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

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}

function buildHtml(opts: { subject: string; body: string; cta?: string; recipientName?: string }): string {
  const paragraphs = opts.body
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;color:#1f2937;font-size:15px;line-height:1.6;">${escapeHtml(p)}</p>`) 
    .join("");
  const cta = opts.cta
    ? `<p style="margin:20px 0 0;"><a href="${SITE_URL}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">${escapeHtml(opts.cta)}</a></p>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(opts.subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:20px;">
      <h1 style="margin:0;font-size:18px;color:#0f172a;">Emboss Marketing</h1>
      <div style="font-size:12px;color:#6b7280;">${SITE_NAME}</div>
    </div>
    ${paragraphs}
    ${cta}
    <p style="margin-top:32px;color:#6b7280;font-size:12px;">This is an automated reminder from the Emboss Marketing supplier portal.</p>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: caller } = await admin
      .from("suppliers")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!caller || !["admin", "super_user"].includes(caller.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { recipientEmail, recipientName, subject, body: emailBody, callToAction, supplierId, preview } = body || {};

    if (!recipientEmail || !subject || !emailBody) {
      return new Response(JSON.stringify({ error: "recipientEmail, subject and body are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = buildHtml({ subject, body: emailBody, cta: callToAction, recipientName });

    // Preview mode: return rendered HTML without sending
    if (preview) {
      return new Response(JSON.stringify({ preview: true, subject, html, from: FROM_ADDRESS, to: recipientEmail }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageId = `nudge-${supplierId || "x"}-${crypto.randomUUID()}`;

    const payload = {
      to: recipientEmail,
      from: FROM_ADDRESS,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text: emailBody,
      purpose: "transactional" as const,
      label: "supplier-nudge",
      idempotency_key: messageId,
    };

    try {
      const apiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!apiKey) throw new Error('Email sending is not configured');
      // This legacy feature composes its HTML at send time; preserve its content.
      await sendLovableEmail(payload, { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') });
      await recordEmailSendOutcome(admin, { message_id: messageId, template_name: "supplier-nudge", recipient_email: recipientEmail, status: 'sent' });
    } catch (error) {
      const suppressed = error instanceof EmailAPIError && error.code === 'recipient_suppressed';
      await recordEmailSendOutcome(admin, { message_id: messageId, template_name: "supplier-nudge", recipient_email: recipientEmail, status: suppressed ? 'suppressed' : 'failed', error_message: error instanceof Error ? error.message : String(error) });
      if (suppressed) { return new Response(JSON.stringify({ success: false, suppressed: true, message_id: messageId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
      else { throw error; }
    }

    return new Response(JSON.stringify({ success: true, message_id: messageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-supplier-nudge error", e);
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
