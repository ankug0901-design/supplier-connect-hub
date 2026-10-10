type Annotation = { number: number; x_percent: number; y_percent: number; comment: string; media_index: number };
type ResponseProof = { title: string; status: string; client_comment?: string | null; client_name?: string | null; client_annotations?: Annotation[]; media_urls?: { type?: string; filename?: string; url: string }[] };
type RpcResult = { ok?: boolean; error?: string; proof?: ResponseProof; order?: { order_number?: string; client_name?: string }; order_number?: string; notify_admin?: boolean };
type Rpc = (payload: Record<string, unknown>) => Promise<{ data: RpcResult | RpcResult[] | null; error: { message: string } | null }>;

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

export function wrapNotificationHtml(proof: ResponseProof, title: string, orderNumber: string, clientName: string, name: string): string {
  const requested = proof.status === 'revision_requested';
  const actor = [clientName, name].filter(Boolean).join(' / ') || 'The client';
  const comment = requested && proof.client_comment ? `<p style="white-space:pre-wrap;">${escape(proof.client_comment)}</p>` : '';
  const marks = proof.client_annotations?.length ? `<p><strong>Marked Areas:</strong></p><ol>${proof.client_annotations.map(a => `<li value="${Number(a.number)}">${escape(a.comment)}</li>`).join('')}</ol>` : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Emboss Marketing — Proof Response</title></head><body style="margin:0;padding:0;background-color:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f9fafb"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;"><tr><td style="background-color:#0d7377;padding:32px 28px 24px 28px;border-radius:12px 12px 0 0;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:34px;font-weight:900;color:#ffffff;letter-spacing:0.5px;">EMBOSS MARKETING</div><div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;font-weight:600;color:rgba(255,255,255,0.55);letter-spacing:3px;text-transform:uppercase;padding-top:6px;">PRINTING &middot; PACKAGING &middot; POS MATERIALS</div></td></tr><tr><td style="padding:24px;font-size:14px;line-height:24px;word-break:break-word;"><p>Dear Team,</p><p>${escape(actor)} has ${requested ? 'requested changes for' : 'approved'} the proof '${escape(title)}' for order ${escape(orderNumber)}.</p>${comment}${marks}</td></tr><tr><td bgcolor="#f9fafb" align="center" style="padding:24px;border-top:1px solid #e5e7eb;font-size:12px;line-height:18px;color:#6b7280;">This is an automated notification from Supplier Connect.</td></tr></table></td></tr></table></body></html>`;
}

export async function handleProofResponse(payload: Record<string, unknown>, rpc: Rpc, send: (email: { to: string; subject: string; html: string }) => Promise<void>): Promise<RpcResult> {
  const action = payload.action;
  const token = typeof payload.approval_token === 'string' ? payload.approval_token.trim() : '';
  if (!token || token.length > 512 || (action !== 'approve_proof' && action !== 'request_revision')) return { ok: false, error: 'Valid review token and response action required' };
  const comment = typeof payload.comment === 'string' ? payload.comment.trim() : '';
  const name = typeof payload.client_name === 'string' ? payload.client_name.trim() : '';
  if (action === 'request_revision' && !comment) return { ok: false, error: 'Please describe the changes needed' };
  const annotations = payload.annotations ?? [];
  if (!Array.isArray(annotations) || annotations.length > 10) return { ok: false, error: 'A maximum of 10 markers is allowed' };
  const numbers = new Set<number>();
  for (const a of annotations) {
    if (!a || !Number.isInteger(a.number) || a.number < 1 || a.number > 10 || numbers.has(a.number) ||
        !Number.isFinite(a.x_percent) || a.x_percent < 0 || a.x_percent > 100 ||
        !Number.isFinite(a.y_percent) || a.y_percent < 0 || a.y_percent > 100 ||
        !Number.isInteger(a.media_index) || a.media_index < 0 || typeof a.comment !== 'string') return { ok: false, error: 'Invalid proof annotations' };
    numbers.add(a.number);
  }
  const lookup = await rpc({ action: 'get_proof_by_token', approval_token: token });
  const current = Array.isArray(lookup.data) ? lookup.data[0] : lookup.data;
  if (lookup.error || !current?.ok || !current.proof) return { ok: false, error: lookup.error?.message || current?.error || 'Proof not found' };
  for (const a of annotations) {
    const media = current.proof.media_urls?.[a.media_index];
    if (!media || (media.type || '').startsWith('video') || /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(media.filename || media.url)) return { ok: false, error: 'Markers must refer to proof images' };
  }
  const response = await rpc({ action, approval_token: token, comment, client_name: name, annotations });
  const result = Array.isArray(response.data) ? response.data[0] : response.data;
  if (response.error || !result?.ok || !result.proof) return { ok: false, error: response.error?.message || result?.error || 'Proof response could not be confirmed' };
  // Only the authoritative pending-to-responded RPC result permits notification.
  // A replay cannot trigger email because the RPC rejects already-responded proofs.
  if (result.notify_admin) {
    try {
      const orderNumber = result.order_number || current.order?.order_number || '';
      await send({
        to: 'operations@embossmarketing.in',
        subject: `Proof ${result.proof.status === 'approved' ? 'Approved' : 'Changes Requested'} — ${current.proof.title} (${orderNumber})`,
        html: wrapNotificationHtml(result.proof, current.proof.title, orderNumber, current.order?.client_name || '', result.proof.client_name || name),
      });
    } catch { /* A saved response must remain successful if notification fails. */ }
  }
  return result;
}