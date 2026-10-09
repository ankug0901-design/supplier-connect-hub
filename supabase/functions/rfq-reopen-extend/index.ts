// Reopen or extend an RFQ. Updates rfq_portal_requests rows for the given
// rfq_id and notifies all suppliers with app emails.
// Replaces the flaky n8n `rfq-manage` webhook for these two actions.
import { EmailAPIError, sendLovableEmail } from 'npm:@lovable.dev/email-js@0.3.1';
import { recordEmailSendOutcome } from '../_shared/email-send-outcome.ts';
import { retryRateLimitedEmail } from '../_shared/email-rate-limit.ts';
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_NAME = "Supplier Connect Hub | Emboss Marketing";
const SENDER_DOMAIN = "notify.embossmarketing.in";
const FROM_ADDRESS = `Emboss Procurement <noreply@${SENDER_DOMAIN}>`;
const SITE_URL = "https://supplierconnect.embossmarketing.in";

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}

function buildHtml(opts: { subject: string; intro: string; details: Array<[string, string]>; reason: string; cta: string }): string {
  const rows = opts.details.map(
    ([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;">${esc(k)}</td><td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:600;">${esc(v)}</td></tr>`,
  ).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(opts.subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="border-bottom:2px solid #10B981;padding-bottom:12px;margin-bottom:20px;">
      <h1 style="margin:0;font-size:18px;color:#0f172a;">Emboss Marketing</h1>
      <div style="font-size:12px;color:#6b7280;">${SITE_NAME}</div>
    </div>
    <p style="margin:0 0 14px;color:#1f2937;font-size:15px;line-height:1.6;">${esc(opts.intro)}</p>
    <table style="border-collapse:collapse;margin:8px 0 16px;">${rows}</table>
    <p style="margin:0 0 14px;color:#1f2937;font-size:14px;line-height:1.6;"><strong>Reason:</strong> ${esc(opts.reason)}</p>
    <p style="margin:20px 0 0;"><a href="${SITE_URL}" style="display:inline-block;background:#10B981;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">${esc(opts.cta)}</a></p>
    <p style="margin-top:32px;color:#6b7280;font-size:12px;">This is an automated notification from the Emboss Marketing supplier portal.</p>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Authorize: admin/super_user, OR user with admin-rfq access
    const { data: caller } = await admin.from("suppliers").select("role").eq("user_id", userData.user.id).maybeSingle();
    const role = caller?.role;
    let allowed = role === "admin" || role === "super_user";
    if (!allowed) {
      const { data: override } = await admin
        .from("supplier_section_access")
        .select("enabled")
        .eq("user_id", userData.user.id)
        .eq("section_key", "admin-rfq")
        .maybeSingle();
      allowed = override?.enabled === true;
      if (override == null && role) {
        const { data: roleAccess } = await admin
          .from("role_section_access")
          .select("enabled")
          .eq("role", role)
          .eq("section_key", "admin-rfq")
          .maybeSingle();
        allowed = roleAccess?.enabled === true;
      }
    }
    if (!allowed) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Invalid body" }, 400);
    const { rfq_id, action, new_deadline, new_deadline_time, reason, actioned_by } = body as Record<string, any>;

    if (!rfq_id || !action || !["reopen", "extend"].includes(action)) {
      return json({ error: "rfq_id and action(reopen|extend) required" }, 400);
    }
    if (!new_deadline || !new_deadline_time) return json({ error: "new_deadline and new_deadline_time required" }, 400);
    if (!reason || String(reason).trim().length < 10) return json({ error: "reason must be at least 10 characters" }, 400);

    // Load rows for this RFQ
    const { data: rows, error: loadErr } = await admin
      .from("rfq_portal_requests")
      .select("id, rfq_id, supplier_email, supplier_name, product_name, client_name, response_deadline, closing_time, rfq_closed_at, status")
      .eq("rfq_id", rfq_id);
    if (loadErr) return json({ error: loadErr.message }, 500);
    if (!rows || rows.length === 0) return json({ error: "RFQ not found" }, 404);

    // Update DB
    const patch: Record<string, any> = {
      response_deadline: new_deadline,
      closing_time: new_deadline_time,
      updated_at: new Date().toISOString(),
    };
    if (action === "reopen") patch.rfq_closed_at = null;

    const { error: updErr } = await admin.from("rfq_portal_requests").update(patch).eq("rfq_id", rfq_id);
    if (updErr) return json({ error: updErr.message }, 500);

    // Compose email
    const first = rows[0];
    const productName = first.product_name || "RFQ";
    const clientName = first.client_name || "";
    const isReopen = action === "reopen";
    const subject = isReopen
      ? `RFQ Reopened: ${productName} (${rfq_id}) — Please Submit Your Quote`
      : `RFQ Deadline Extended: ${productName} (${rfq_id})`;
    const intro = isReopen
      ? `The RFQ ${rfq_id} for ${productName} has been reopened. You can now submit or update your quote before the new closing time.`
      : `The submission deadline for RFQ ${rfq_id} (${productName}) has been extended. Please submit your quote before the new closing time.`;

    // Format deadline nicely
    let deadlineDisplay = `${new_deadline} at ${new_deadline_time} IST`;
    try {
      const d = new Date(`${new_deadline}T${new_deadline_time}:00+05:30`);
      deadlineDisplay = d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true,
      }) + " IST";
    } catch { /* keep fallback */ }

    const details: Array<[string, string]> = [
      ["RFQ ID", rfq_id],
      ["Product", productName],
    ];
    if (clientName) details.push(["Client", clientName]);
    details.push(["New Closing", deadlineDisplay]);
    if (actioned_by) details.push(["Actioned by", String(actioned_by)]);

    const html = buildHtml({ subject, intro, details, reason: String(reason).trim(), cta: "Open Supplier Portal" });

    // Send emails per unique supplier email
    const seen = new Set<string>();
    const targets = rows
      .map((r) => (r.supplier_email || "").toString().trim().toLowerCase())
      .filter((e) => e && !seen.has(e) && (seen.add(e), true));

    let queued = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const email of targets) {
      try {
        const messageId = `rfq-${action}-${rfq_id}-${email}-${Date.now()}`;

        const payload = {
          to: email,
          from: FROM_ADDRESS,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text: `${intro}\n\nRFQ: ${rfq_id}\nProduct: ${productName}\nNew closing: ${deadlineDisplay}\n\nReason: ${reason}\n\nPortal: ${SITE_URL}`,
          purpose: "transactional" as const,
          label: `rfq-${action}`,
          idempotency_key: messageId,
        };

        try {
          const apiKey = Deno.env.get('LOVABLE_API_KEY');
          if (!apiKey) throw new Error('Email sending is not configured');
          // This legacy feature composes its HTML at send time; preserve its content.
          await retryRateLimitedEmail(() => sendLovableEmail(payload, { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') }));
          await recordEmailSendOutcome(admin, { message_id: messageId, template_name: `rfq-${action}`, recipient_email: email, status: 'sent' });
        } catch (error) {
          const suppressed = error instanceof EmailAPIError && error.code === 'recipient_suppressed';
          await recordEmailSendOutcome(admin, { message_id: messageId, template_name: `rfq-${action}`, recipient_email: email, status: suppressed ? 'suppressed' : 'failed', error_message: error instanceof Error ? error.message : String(error) });
          if (suppressed) { skipped++; continue; }
          else { throw error; }
        }

        queued++;
      } catch (e: any) {
        errors.push(`${email}: ${e?.message || String(e)}`);
      }
    }

    return json({ ok: true, action, rfq_id, updated: rows.length, emails_queued: queued, emails_skipped: skipped, errors });
  } catch (e: any) {
    console.error("rfq-reopen-extend unhandled", e);
    return json({ error: e?.message || "Server error", stack: e?.stack }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
