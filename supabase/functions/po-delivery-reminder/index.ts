// One PO release / delivery-date confirmation notice per purchase order.
// - CC: all admin + super_user suppliers.
//
// Auth: accepts service role token (cron) OR authenticated admin user.
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts';
import { DELIVERY_CONFIRMATION_CC, poReleaseEmailKey, shouldNotifyPoRelease } from '../_shared/supplier-email-policy.ts';
import { z } from 'npm:zod@3.25.76';
import { recordEmailSendOutcome } from '../_shared/email-send-outcome.ts';
import { retryRateLimitedEmail } from '../_shared/email-rate-limit.ts';
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SITE_URL = "https://supplierconnect.embossmarketing.in";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) return new Response(JSON.stringify({ error: 'Server configuration missing' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  // Auth: requires service-role token (cron/internal) OR an authenticated admin/super_user.
  // getUser validates the user JWT before the role check. The previous
  // "apikey === ANON_KEY" shortcut has been removed because
  // the anon key is public and would let anyone trigger mass reminder emails.
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  let authorized = false;
  if (token && token === SERVICE_KEY) {
    authorized = true;
  } else if (token) {
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
  const parsed = z.object({ po_id: z.string().uuid().optional() }).safeParse(body);
  if (!parsed.success) return new Response(JSON.stringify({ error: 'Invalid PO ID' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const explicitPoId = parsed.data.po_id;

  // Released POs with no prior notice; daily cron is only a retry opportunity.
  let q = admin
    .from("purchase_orders")
    .select("id, po_number, date, supplier_id, status, delivery_dates_confirmed_at, delivery_notification_sent_at, delivery_reminder_count, delivery_first_notified_at")
    .is("delivery_notification_sent_at", null)
    .is("delivery_first_notified_at", null)
    .in("status", ["approved", "open"]);
  if (explicitPoId) q = q.eq("id", explicitPoId);

  const { data: pos, error: poErr } = await q;
  if (poErr) {
    return new Response(JSON.stringify({ error: poErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Admin/super_user CC list + fixed internal recipients
  const { data: ccRows } = await admin
    .from("suppliers")
    .select("email,role")
    .in("role", ["admin", "super_user"]);
  const FIXED_CC = ["info@embossmarketing.in", "pooja.rathee@embossmarketing.in", DELIVERY_CONFIRMATION_CC];
  const ccList = Array.from(
    new Set(
      [
        ...(ccRows || []).map((r: any) => String(r.email || "").toLowerCase()),
        ...FIXED_CC.map((e) => e.toLowerCase()),
      ].filter(Boolean),
    ),
  );

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const po of pos || []) {
    try {
      if (!shouldNotifyPoRelease(po)) { skipped++; continue; }
      const { data: items, error: itemsError } = await admin.from("po_items")
        .select("id, item_name, description, quantity").eq("po_id", po.id);
      if (itemsError) throw itemsError;
      // Insert triggers may precede line-item sync; the sync kick retries afterward.
      if (!items?.length) { skipped++; continue; }

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

      const reminderCount = po.delivery_reminder_count || 0;
      const poUrl = `${SITE_URL}/purchase-orders/${po.id}`;
      const messageId = poReleaseEmailKey(po.id);
      let wasSent = false;
      try {
        const outcome = await retryRateLimitedEmail(() => sendTemplateEmail('po-release', sup.email, {
          idempotencyKey: messageId,
          cc: ccList.filter((email) => email !== String(sup.email).toLowerCase()),
          templateData: {
            supplierName: sup.name || sup.company || 'Supplier',
            poNumber: po.po_number, poDate: po.date, poUrl,
            items: items.map((item: any) => ({ name: item.item_name || item.description || '—', description: item.description || '', qty: Number(item.quantity || 0) })),
          },
        }));
        await recordEmailSendOutcome(admin, { message_id: messageId, template_name: 'po-release', recipient_email: sup.email, status: outcome.sent ? 'sent' : 'suppressed' });
        wasSent = outcome.sent;
      } catch (error) {
        await recordEmailSendOutcome(admin, { message_id: messageId, template_name: 'po-release', recipient_email: sup.email, status: 'failed', error_message: error instanceof Error ? error.message : String(error) });
        throw error;
      }

      const { error: markerError } = await admin
        .from("purchase_orders")
        .update({
          delivery_notification_sent_at: new Date().toISOString(),
          delivery_reminder_count: reminderCount + 1,
          delivery_first_notified_at: po.delivery_first_notified_at || new Date().toISOString(),
        })
        .eq("id", po.id);
      if (markerError) throw markerError;

      if (wasSent) sent++;
      else skipped++;
    } catch (e: any) {
      errors.push(`PO ${po.po_number}: ${e?.message || e}`);
    }
  }

  return new Response(JSON.stringify({ sent, skipped, total: (pos || []).length, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
