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
]);

// Subset of paths that only admins are allowed to invoke.
const ADMIN_ONLY_PATHS = new Set([
  'rfq-manage',
  'rfq-issue-po',
  'bulk-register-suppliers',
  'rfq-send-attachment',
  'rfq-quote-accepted',
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

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return json({ error: 'Invalid body' }, 400);
    }
    const { path, payload } = body as { path?: string; payload?: Record<string, unknown> };
    if (!path || !ALLOWED_PATHS.has(path)) {
      return json({ error: 'Path not allowed' }, 400);
    }
    if (!payload || typeof payload !== 'object') {
      return json({ error: 'Missing payload' }, 400);
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

    // Strip any client-supplied access_code and inject server-side
    const safePayload = { ...payload } as Record<string, unknown>;
    delete safePayload.access_code;

    const res = await fetch(`${N8N_BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_code: accessCode, ...safePayload }),
    });

    const text = await res.text();
    // Pass through JSON when possible, otherwise raw text
    const contentType = res.headers.get('content-type') || 'application/json';
    return new Response(text, {
      status: res.status,
      headers: { ...corsHeaders, 'Content-Type': contentType },
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
