// Authenticated proxy for N8N webhooks. Keeps the N8N access code server-side.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const N8N_BASE = 'https://n8n.srv1141999.hstgr.cloud/webhook';

// Whitelist of allowed N8N webhook paths. Anything else is rejected.
const ALLOWED_PATHS = new Set([
  'zoho-supplier-data',
  'supplier-bill-upload',
  'rfq-automation-form',
  'rfq-quote-received',
  'rfq-quote-accepted',
  'rfq-manage',
  'rfq-operations',
  'rfq-send-attachment',
  'rfq-issue-po',
  'bulk-register-suppliers',
  'rfq-tca-report',
  'delhivery-b2b-master',
  'rfq-dashboard',
  'rfq-price-trends',
  'po-tracker',
  'send-email',
  'notify-emboss-team',
]);

// Subset of paths that only top-tier admins are allowed to invoke.
const ADMIN_ONLY_PATHS = new Set([
  'rfq-issue-po',
  'bulk-register-suppliers',
  'rfq-send-attachment',
  'delhivery-b2b-master',
  'send-email',
]);

// RFQ operators may invoke these when they have RFQ Management page access.
const RFQ_MANAGEMENT_PATHS = new Set([
  'rfq-manage',
  'rfq-operations',
  'rfq-quote-accepted',
  'rfq-tca-report',
]);

// Paths that accept multipart/form-data (file uploads) instead of JSON.
const MULTIPART_PATHS = new Set([
  'delhivery-b2b-master',
]);

// Paths where the upstream n8n webhook is registered as GET (query-string only).
const GET_PATHS = new Set([
  'rfq-price-trends',
]);

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function brandedEmailHtml(contentHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Emboss Marketing</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3f4f6">
    <tr><td align="center" style="padding:24px 0;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr>
          <td style="background-color:#0d7377;padding:24px 32px;">
            <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.5px;">EMBOSS MARKETING</div>
            <div style="color:#a5f3f3;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-top:4px;">PRINTING · PACKAGING · POS MATERIALS</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            ${contentHtml}
          </td>
        </tr>
        <tr>
          <td style="background-color:#f9fafb;padding:16px 32px;text-align:center;color:#6b7280;font-size:12px;line-height:1.5;">
            Emboss Marketing LLP · Gurugram, Haryana
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Require authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const accessCode = Deno.env.get('N8N_ACCESS_CODE');
    if (!accessCode) {
      return json({ error: 'Server not configured' }, 500);
    }

    // Detect multipart (file upload) vs JSON requests
    const contentType = req.headers.get('content-type') || '';
    const isMultipart = contentType.toLowerCase().startsWith('multipart/form-data');

    let path: string | undefined;
    let payload: Record<string, unknown> | undefined;
    let multipartForm: FormData | null = null;

    if (isMultipart) {
      // For multipart uploads, the n8n webhook path comes from ?path= query string
      path = new URL(req.url).searchParams.get('path') || undefined;
      if (!path || !MULTIPART_PATHS.has(path)) {
        return json({ error: 'Path not allowed for multipart upload' }, 400);
      }
      try {
        multipartForm = await req.formData();
      } catch {
        return json({ error: 'Invalid multipart body' }, 400);
      }
    } else {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== 'object') {
        return json({ error: 'Invalid body' }, 400);
      }
      ({ path, payload } = body as { path?: string; payload?: Record<string, unknown> });
      if (!path || !ALLOWED_PATHS.has(path)) {
        return json({ error: 'Path not allowed' }, 400);
      }
      if (!payload || typeof payload !== 'object') {
        return json({ error: 'Missing payload' }, 400);
      }
    }

    // Resolve caller's admin/role posture once, using the authoritative
    // is_admin() RPC (runs as the caller, honors suppliers.role checks) plus
    // a service-role fallback lookup for the plain role string.
    const needsRoleCheck = ADMIN_ONLY_PATHS.has(path) || RFQ_MANAGEMENT_PATHS.has(path);
    if (needsRoleCheck) {
      let isAdmin = false;
      try {
        const { data: adminRpc } = await supabase.rpc('is_admin');
        isAdmin = adminRpc === true;
      } catch {
        isAdmin = false;
      }

      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      let role: string | undefined;
      if (!isAdmin) {
        const { data: callerRow } = await adminClient
          .from('suppliers')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
        role = callerRow?.role ?? undefined;
        if (role === 'admin' || role === 'super_user') isAdmin = true;
      }

      if (ADMIN_ONLY_PATHS.has(path) && !isAdmin) {
        return json({ error: 'Forbidden - admin only' }, 403);
      }

      if (RFQ_MANAGEMENT_PATHS.has(path) && !isAdmin) {
        const { data: override } = await adminClient
          .from('supplier_section_access')
          .select('enabled')
          .eq('user_id', user.id)
          .eq('section_key', 'admin-rfq')
          .maybeSingle();
        let allowed = override?.enabled === true;
        if (override == null && role) {
          const { data: roleAccess } = await adminClient
            .from('role_section_access')
            .select('enabled')
            .eq('role', role)
            .eq('section_key', 'admin-rfq')
            .maybeSingle();
          allowed = roleAccess?.enabled === true;
        }
        if (!allowed) {
          return json({ error: 'Forbidden - RFQ Management access required' }, 403);
        }
      }
    }

    const buildRequest = (): { url: string; init: RequestInit } => {
      if (isMultipart && multipartForm) {
        const outForm = new FormData();
        for (const [k, v] of multipartForm.entries()) {
          if (k === 'access_code') continue;
          outForm.append(k, v as Blob | string);
        }
        outForm.append('access_code', accessCode);
        return { url: `${N8N_BASE}/${path}`, init: { method: 'POST', body: outForm } };
      }
      const safePayload = { ...(payload as Record<string, unknown>) };
      delete safePayload.access_code;

      if (path === 'notify-emboss-team') {
        const p = safePayload;
        const order_number = String(p.order_number || '');
        const client_name = String(p.client_name || '');
        const tracking_token = String(p.tracking_token || '');
        const po_number = String(p.po_number || '');
        const item_name = String(p.item_name || '');
        const stage = String(p.stage || '');
        const status = String(p.status || '');
        const note = String(p.note || '');
        const supplier_name = String(p.supplier_name || '');
        const subject = `Production Update: PO ${po_number} — ${item_name || 'Item'}`;
        const detailRows = [
          ...(order_number ? [{ label: 'Order Number', value: order_number }] : []),
          ...(client_name ? [{ label: 'Client', value: client_name }] : []),
          { label: 'PO Number', value: po_number },
          { label: 'Item', value: item_name || 'Item' },
          { label: 'Stage', value: stage },
          { label: 'Status', value: status },
          ...(note ? [{ label: 'Note', value: note }] : []),
          { label: 'Supplier', value: supplier_name },
          { label: 'Timestamp', value: new Date().toISOString() },
        ];
        const rowsHtml = detailRows.map((r) =>
          `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;width:140px;vertical-align:top;">${r.label}</td>` +
          `<td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:600;color:#111827;">${escapeHtml(r.value)}</td></tr>`
        ).join('');
        const trackButton = tracking_token
          ? `<div style="margin-top:24px;text-align:center;">` +
            `<a href="https://supplierconnect.embossmarketing.in/track?t=${encodeURIComponent(tracking_token)}" ` +
            `style="display:inline-block;background-color:#0d7377;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Track Your Order</a>` +
            `</div>`
          : '';
        const htmlBody = brandedEmailHtml(
          `<h2 style="margin:0 0 20px;color:#111827;font-size:20px;font-weight:700;">Production Update</h2>` +
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:14px;color:#374151;line-height:1.5;">${rowsHtml}</table>` +
          trackButton
        );
        return {
          url: `${N8N_BASE}/send-email`,
          init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_code: accessCode,
              to: 'pooja.rathee@embossmarketing.in,hkumar@embossmarketing.in,ankur.gupta@embossmarketing.in',
              subject,
              html: htmlBody,
            }),
          },
        };
      }

      if (GET_PATHS.has(path!)) {
        const qs = new URLSearchParams({ access_code: accessCode });
        for (const [k, v] of Object.entries(safePayload)) {
          if (v == null || v === '') continue;
          qs.append(k, typeof v === 'string' ? v : JSON.stringify(v));
        }
        return { url: `${N8N_BASE}/${path}?${qs.toString()}`, init: { method: 'GET' } };
      }
      return {
        url: `${N8N_BASE}/${path}`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_code: accessCode, ...safePayload }),
        },
      };
    };

    let res: Response;
    const { url, init } = buildRequest();
    try {
      res = await fetch(url, init);
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      const isTls = /invalid peer certificate|certificate|tls|ssl/i.test(msg);
      console.error('n8n-proxy upstream fetch failed', { path, msg });

      if (isTls) {
        // Do NOT fall back to plain HTTP: that would leak the N8N access
        // code and payload in cleartext. Surface a clear error so the
        // upstream certificate gets renewed.
        return json({
          error: 'Automation service is temporarily unreachable (upstream TLS certificate is invalid). Please contact support to renew the certificate.',
          upstream: msg,
          code: 'UPSTREAM_TLS_ERROR',
        }, 502);
      }
      return json({
        error: 'Automation service is temporarily unreachable. Please try again shortly.',
        upstream: msg,
        code: 'UPSTREAM_UNREACHABLE',
      }, 502);
    }


    const text = await res.text();
    const upstreamCT = res.headers.get('content-type') || '';
    let outBody = text;
    let outStatus = res.status;
    // n8n "lastNode" response mode returns HTTP 500 with
    // {"code":0,"message":"No item to return was found"} when the terminal
    // node emits nothing (e.g. an email/send node). The workflow itself ran
    // successfully, so surface this to the client as a 200.
    if (!res.ok && /(no item to return was found|unused respond to webhook node)/i.test(text)) {
      outStatus = 200;
      outBody = JSON.stringify({ ok: true, status: 200, message: 'Workflow executed (no response payload).' });
    } else if (!text || !text.trim()) {
      outBody = JSON.stringify({ ok: res.ok, status: res.status, message: '' });
    } else if (!upstreamCT.includes('application/json')) {
      outBody = JSON.stringify({ ok: res.ok, status: res.status, message: text });
    }
    return new Response(outBody, {
      status: outStatus,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Proxy error' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
