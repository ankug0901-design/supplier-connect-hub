import { supabase } from '@/integrations/supabase/client';

export type ProofMedia = { url: string; type?: string; filename?: string };
export type ProofAnnotation = {
  number: number; x_percent: number; y_percent: number; comment: string; media_index: number;
};
export type GroupResponse = {
  id: string; email_recipient: string; status: string; client_name: string | null;
  client_response_at: string | null; is_current: boolean;
};
export type Proof = {
  id: string; client_order_id: string; item_id: string | null; proof_type: string;
  title: string; description: string | null; media_urls: ProofMedia[];
  status: 'pending' | 'approved' | 'revision_requested'; approval_token: string;
  revision_number: number; created_at: string; client_response_at: string | null;
  client_comment: string | null; client_name: string | null; email_recipient: string | null;
  email_sent_at?: string | null;
  client_annotations?: ProofAnnotation[];
  proof_group_id?: string | null;
};
export type ProofResult = {
  ok: boolean; error?: string; proof?: Proof; proofs?: Proof[];
  order?: { order_number?: string; client_name?: string; client_po_ref?: string };
  item?: { item_name?: string; description?: string; quantity?: number } | null;
  group_responses?: GroupResponse[] | null;
  order_number?: string;
  notify_admin?: boolean;
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
export const MAX_PROOF_ANNOTATIONS = 10;
export function addProofAnnotation(annotations: ProofAnnotation[], mediaIndex: number, x: number, y: number): ProofAnnotation[] {
  if (annotations.length >= MAX_PROOF_ANNOTATIONS) return annotations;
  const number = Array.from({ length: MAX_PROOF_ANNOTATIONS }, (_, i) => i + 1).find(n => !annotations.some(a => a.number === n));
  if (number === undefined) return annotations;
  return [...annotations, { number, media_index: mediaIndex, x_percent: Math.max(0, Math.min(100, x)), y_percent: Math.max(0, Math.min(100, y)), comment: '' }];
}
export function proofFilename(media: ProofMedia): string {
  if (media.filename) return media.filename;
  try { return decodeURIComponent(new URL(media.url).pathname.split('/').pop() || '') || 'proof-file'; }
  catch { return 'proof-file'; }
}
export async function downloadProofFile(url: string, filename: string) {
  let blobUrl: string | undefined;
  let anchor: HTMLAnchorElement | undefined;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    blobUrl = URL.createObjectURL(blob);
    anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename || 'proof-file';
    document.body.appendChild(anchor);
    anchor.click();
  } catch { window.open(url, '_blank'); }
  finally {
    anchor?.remove();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}
export function proofResponsePayload(action: 'approve_proof' | 'request_revision', token: string, comment: string, name: string, annotations?: ProofAnnotation[]) {
  if (!token) throw new Error('Review token required');
  if (action === 'request_revision' && !comment.trim()) throw new Error('Please describe the changes needed');
  if ((annotations?.length || 0) > MAX_PROOF_ANNOTATIONS) throw new Error('A maximum of 10 markers is allowed');
  return { action, approval_token: token, comment: comment.trim(), client_name: name.trim(), annotations: annotations || [] };
}