// Daily PO delivery-date confirmation reminder.
// - First email goes out on the day the PO is created (or first time this function sees it).
// - Then a daily reminder until all line items have a confirmed_delivery_date.
// - CC: all admin + super_user suppliers.
//
// Auth: accepts service role token OR anon apikey (cron) OR admin user.
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

const escapeHtml = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function buildHtml(opts: {
  supplierName: string;
  poNumber: string;
  poDate: string;
  items: { name: string; description?: string; qty: number }[];
  reminderCount: number;
  poUrl: string;
}) {
  const itemsRows = opts.items
    .map((it) => {
      const name = escapeHtml(it.name || "—");
      const desc =
        it.description && it.description.trim() && it.description.trim() !== (it.name || "").trim()
          ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${escapeHtml(it.description)}</div>`
          : "";
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#1f2937;">
          <div style="font-weight:600;">${name}</div>${desc}
        </td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#1f2937;text-align:right;vertical-align:top;">${it.qty}</td>
      </tr>`;
    })
    .join("");

  const heading =
    opts.reminderCount === 0
      ? "Action required: Confirm delivery dates"
      : `Reminder #${opts.reminderCount}: Confirm delivery dates for ${escapeHtml(opts.poNumber)}`;

  const intro =
    opts.reminderCount === 0
      ? `A new purchase order <strong>${escapeHtml(opts.poNumber)}</strong> dated ${escapeHtml(opts.poDate)} has been issued to you.`
      : `This is a daily reminder. Delivery dates for purchase order <strong>${escapeHtml(opts.poNumber)}</strong> are still pending your confirmation.`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:20px;">
      <h1 style="margin:0;font-size:18px;color:#0f172a;">Emboss Marketing</h1>
      <div style="font-size:12px;color:#6b7280;">${SITE_NAME}</div>
    </div>
    <p style="margin:0 0 14px;color:#1f2937;font-size:15px;line-height:1.6;">Dear ${escapeHtml(opts.supplierName)},</p>
    <p style="margin:0 0 14px;color:#1f2937;font-size:15px;line-height:1.6;">${intro}</p>
    <p style="margin:0 0 14px;color:#1f2937;font-size:15px;line-height:1.6;">
      Please log in to the supplier portal and confirm the expected delivery date for each line item below.
      Until these dates are recorded, you <strong>cannot download the PO</strong> or <strong>upload invoices</strong> against it.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #e5e7eb;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:8px;text-align:left;font-size:12px;color:#374151;text-transform:uppercase;">Item</th>
          <th style="padding:8px;text-align:right;font-size:12px;color:#374151;text-transform:uppercase;">Qty</th>
        </tr>
      </thead>
      <tbody>${itemsRows || `<tr><td colspan="2" style="padding:12px;text-align:center;color:#6b7280;font-size:13px;">No line items found</td></tr>`}</tbody>
    </table>
    <p style="margin:20px 0 0;">
      <a href="${opts.poUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">Confirm delivery dates</a>
    </p>
    <p style="margin-top:32px;color:#6b7280;font-size:12px;">This is an automated message from the Emboss Marketing supplier portal. Daily reminders will continue until delivery dates are confirmed.</p>
  </div>
</body></html>`;
}

async function getOrCreateUnsubscribeToken(admin: any, email: string): Promise<string> {
  const lower = String(email).toLowerCase();
  const { data: existing } = await admin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", lower)
    .maybeSingle();
  if (existing?.token) return existing.token as string;
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { error } = await admin.from("email_unsubscribe_tokens").insert({ email: lower, token });
  if (error) {
    const { data: again } = await admin
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", lower)
      .maybeSingle();
    if (again?.token) return again.token as string;
    throw error;
  }
  return token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Auth: service role token, anon apikey (cron), or admin user
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const apikey = req.headers.get("apikey") || "";
  let authorized = false;
  if (token && token === SERVICE_KEY) authorized = true;
  else if (!token && apikey === ANON_KEY) authorized = true;
  else if (token) {
    const u = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: ud } = await u.auth.getUser(token);
    if (ud?.user) {
      const { data: row } = await u.from("suppliers").select("role").eq("user_id", ud.user.id).maybeSingle();
      if (["admin", "super_user"].includes(String(row?.role || ""))) authorized = true;
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Optional explicit single PO id (e.g., to test or trigger from app)
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const explicitPoId: string | undefined = body?.po_id;

  // POs needing reminders: not yet delivery-confirmed, not closed/cancelled/rejected,
  // not fully paid (we use status not in completed/closed/cancelled/rejected).
  let q = admin
    .from("purchase_orders")
    .select("id, po_number, date, supplier_id, status, delivery_dates_confirmed_at, delivery_notification_sent_at, delivery_reminder_count, delivery_first_notified_at")
    .is("delivery_dates_confirmed_at", null)
    .not("status", "in", "(closed,cancelled,rejected,completed,void)");
  if (explicitPoId) q = q.eq("id", explicitPoId);

  const { data: pos, error: poErr } = await q;
  if (poErr) {
    return new Response(JSON.stringify({ error: poErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Admin/super_user CC list
  const { data: ccRows } = await admin
    .from("suppliers")
    .select("email,role")
    .in("role", ["admin", "super_user"]);
  const ccList = Array.from(
    new Set((ccRows || []).map((r: any) => String(r.email || "").toLowerCase()).filter(Boolean)),
  );

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const po of pos || []) {
    try {
      // Skip if already reminded within last 20h (avoids double-fire when cron retriggered)
      if (po.delivery_notification_sent_at) {
        const sinceMs = Date.now() - new Date(po.delivery_notification_sent_at).getTime();
        if (sinceMs < 20 * 60 * 60 * 1000) {
          skipped++;
          continue;
        }
      }

      // Make sure there's nothing already confirmed (race)
      const { data: items } = await admin
        .from("po_items")
        .select("id, item_name, description, quantity, confirmed_delivery_date")
        .eq("po_id", po.id);
      const pending = (items || []).filter((it: any) => !it.confirmed_delivery_date);
      if (!pending.length && (items || []).length > 0) {
        await admin
          .from("purchase_orders")
          .update({ delivery_dates_confirmed_at: new Date().toISOString() })
          .eq("id", po.id);
        skipped++;
        continue;
      }

      // Supplier contact
      const { data: sup } = await admin
        .from("suppliers")
        .select("id, name, company, email")
        .eq("id", po.supplier_id)
        .maybeSingle();
      if (!sup?.email) {
        skipped++;
        continue;
      }

      // Suppression check
      const { data: suppressed } = await admin
        .from("suppressed_emails")
        .select("email")
        .eq("email", String(sup.email).toLowerCase())
        .maybeSingle();
      if (suppressed) {
        skipped++;
        continue;
      }

      const reminderCount = po.delivery_reminder_count || 0;
      const poUrl = `${SITE_URL}/purchase-orders/${po.id}`;
      const html = buildHtml({
        supplierName: sup.name || sup.company || "Supplier",
        poNumber: po.po_number,
        poDate: po.date,
        items: (items || []).map((it: any) => ({
          name: it.item_name || it.description || "—",
          description: it.description || "",
          qty: Number(it.quantity || 0),
        })),
        reminderCount,
        poUrl,
      });
      const itemNames = (items || [])
        .map((it: any) => String(it.item_name || it.description || "").trim())
        .filter(Boolean);
      const itemHint = itemNames.length
        ? ` – ${itemNames.slice(0, 2).join(", ")}${itemNames.length > 2 ? ` +${itemNames.length - 2} more` : ""}`
        : "";
      const subject =
        reminderCount === 0
          ? `New PO ${po.po_number}${itemHint} – confirm delivery dates`
          : `Reminder: confirm delivery dates for PO ${po.po_number}${itemHint}`;

      const unsubscribeToken = await getOrCreateUnsubscribeToken(admin, sup.email);
      const messageId = `po-delivery-${po.id}-${new Date().toISOString().slice(0, 10)}`;

      const payload = {
        to: sup.email,
        cc: ccList.filter((e) => e !== String(sup.email).toLowerCase()),
        from: FROM_ADDRESS,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text: `Please confirm delivery dates for PO ${po.po_number} at ${poUrl}`,
        purpose: "transactional",
        label: "po-delivery-reminder",
        idempotency_key: messageId,
        message_id: messageId,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      };

      const { error: enqErr } = await admin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload,
      });
      if (enqErr) throw enqErr;

      await admin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "po-delivery-reminder",
        recipient_email: sup.email,
        status: "pending",
      });

      await admin
        .from("purchase_orders")
        .update({
          delivery_notification_sent_at: new Date().toISOString(),
          delivery_reminder_count: reminderCount + 1,
          delivery_first_notified_at: po.delivery_first_notified_at || new Date().toISOString(),
        })
        .eq("id", po.id);

      sent++;
    } catch (e: any) {
      errors.push(`PO ${po.po_number}: ${e?.message || e}`);
    }
  }

  // Kick the queue processor
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/process-email-queue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: "{}",
    });
  } catch (_) { /* ignore */ }

  return new Response(JSON.stringify({ sent, skipped, total: (pos || []).length, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
