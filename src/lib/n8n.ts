import { supabase } from '@/integrations/supabase/client';

export type N8nPath =
  | 'zoho-supplier-data'
  | 'supplier-bill-upload'
  | 'rfq-automation-form'
  | 'rfq-quote-received'
  | 'rfq-quote-accepted'
  | 'rfq-manage'
  | 'rfq-operations'
  | 'rfq-send-attachment'
  | 'rfq-issue-po'
  | 'bulk-register-suppliers'
  | 'rfq-tca-report'
  | 'rfq-dashboard'
  | 'rfq-price-trends';

export interface N8nResult {
  ok: boolean;
  status: number;
  text: string;
  data: any;
}

/**
 * Calls an N8N webhook via the authenticated n8n-proxy edge function.
 * The proxy injects the server-side N8N_ACCESS_CODE so the secret never
 * leaves the backend. Returns a fetch-like result for easy migration from
 * direct fetch() calls.
 */
export async function n8nPost(path: N8nPath, payload: Record<string, unknown>): Promise<N8nResult> {
  const { data, error } = await supabase.functions.invoke('n8n-proxy', {
    body: { path, payload },
  });
  if (error) {
    // supabase.functions.invoke surfaces non-2xx as error. Extract context if available.
    const ctx: any = (error as any).context;
    let text = error.message || 'Proxy error';
    let status = ctx?.status || 500;
    try {
      if (ctx?.body) {
        const t = typeof ctx.body === 'string' ? ctx.body : await new Response(ctx.body).text();
        if (t) text = t;
      }
    } catch { /* ignore */ }
    return { ok: false, status, text, data: null };
  }
  const text = typeof data === 'string' ? data : JSON.stringify(data ?? '');
  return { ok: true, status: 200, text, data };
}
