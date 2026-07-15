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
  'rfq-send-attachment',
  'rfq-issue-po',
  'bulk-register-suppliers',
  'rfq-tca-report',
  'delhivery-b2b-master',
]);

// Subset of paths that only top-tier admins are allowed to invoke.
const ADMIN_ONLY_PATHS = new Set([
  'rfq-issue-po',
  'bulk-register-suppliers',
  'rfq-send-attachment',
  'delhivery-b2b-master',
]);

// RFQ operators may invoke these when they have RFQ Management page access.
const RFQ_MANAGEMENT_PATHS = new Set([
  'rfq-manage',
  'rfq-quote-accepted',
  'rfq-tca-report',
]);

// Paths that accept multipart/form-data (file uploads) instead of JSON.
const MULTIPART_PATHS = new Set([
  'delhivery-b2b-master',
]);

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

    // Enforce admin-only paths server-side
    if (ADMIN_ONLY_PATHS.has(path)) {
      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { data: callerRow } = await adminClient
        .from('suppliers')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      if (callerRow?.role !== 'admin') {
        return json({ error: 'Forbidden - admin only' }, 403);
      }
    }

    // Enforce RFQ-management access server-side for RFQ actions
    if (RFQ_MANAGEMENT_PATHS.has(path)) {
      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { data: callerRow } = await adminClient
        .from('suppliers')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      const role = callerRow?.role;
      if (role !== 'admin') {
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
    if (!res.ok && /no item to return was found/i.test(text)) {
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
