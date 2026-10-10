import { supabase } from '@/integrations/supabase/client';

export type ProofMedia = { url: string; type?: string; filename?: string };
export type Proof = {
  id: string; client_order_id: string; item_id: string | null; proof_type: string;
  title: string; description: string | null; media_urls: ProofMedia[];
  status: 'pending' | 'approved' | 'revision_requested'; approval_token: string;
  revision_number: number; created_at: string; client_response_at: string | null;
  client_comment: string | null; client_name: string | null; email_recipient: string | null;
  email_sent_at?: string | null;
};
export type ProofResult = {
  ok: boolean; error?: string; proof?: Proof; proofs?: Proof[];
  order?: { order_number?: string; client_name?: string; client_po_ref?: string };
  item?: { item_name?: string; description?: string; quantity?: number } | null;
};
export const PROOF_TYPES = ['artwork', 'print_sample', 'color_swatch', 'mockup', 'other'] as const;
export const proofTypeLabel = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
export const proofLink = (token: string) => `https://supplierconnect.embossmarketing.in/proof?t=${encodeURIComponent(token)}`;
export const isProofVideo = (m: ProofMedia) => (m.type || '').startsWith('video') || /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(m.filename || m.url);
export function proofMedia(raw: unknown): ProofMedia[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is ProofMedia => !!m && typeof m.url === 'string' && /^https?:\/\//i.test(m.url));
}
export async function proofRpc(payload: Record<string, unknown>): Promise<ProofResult> {
  const { data, error } = await (supabase as any).rpc('proof_manage', { payload });
  if (error) throw new Error(error.message);
  const result: ProofResult = Array.isArray(data) ? data[0] : data;
  if (!result || result.ok === false) throw new Error(result?.error || 'Proof request failed');
  return result;
}
export function proofResponsePayload(action: 'approve_proof' | 'request_revision', token: string, comment: string, name: string) {
  if (!token) throw new Error('Review token required');
  if (action === 'request_revision' && !comment.trim()) throw new Error('Please describe the changes needed');
  return { action, approval_token: token, comment: comment.trim(), client_name: name.trim() };
}