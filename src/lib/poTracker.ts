import { supabase } from '@/integrations/supabase/client';

/**
 * Calls the po_tracker_manage Postgres RPC function directly.
 * This is SECURITY DEFINER so it works for any authenticated user.
 * Bypasses the n8n proxy chain entirely — simpler and more reliable.
 */
export async function poTrackerRpc(payload: Record<string, unknown>): Promise<any> {
  const { data, error } = await (supabase as any).rpc('po_tracker_manage', {
    payload: payload as any,
  });
  if (error) throw new Error(error.message);
  return data;
}
