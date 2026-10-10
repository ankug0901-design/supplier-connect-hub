import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, Download, Loader2, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ProofMediaGrid } from '@/components/proofs/ProofMediaGrid';
import { ProofAnnotator } from '@/components/proofs/ProofAnnotator';
import { downloadProofFile, proofFilename, proofMedia, proofRpc, proofResponsePayload, proofTypeLabel, type ProofAnnotation, type ProofResult } from '@/lib/proofApproval';

function Brand() {
  return <div><div className="text-lg font-extrabold sm:text-xl"><span className="text-primary">EMBOSS</span> MARKETING</div><div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 sm:text-[11px]">Printing · Packaging · POS Materials</div></div>;
}
const dateLabel = (date: string | null) => date ? new Date(date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const escapeNotificationHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));

export default function ProofApproval() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const [data, setData] = useState<ProofResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<'approve_proof' | 'request_revision' | null>(null);
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [annotations, setAnnotations] = useState<ProofAnnotation[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const request = ++epoch.current;
    setLoading(true); setData(null); setMode(null); setSubmitted(false); setSubmitError(''); setComment(''); setName(''); setAnnotations([]);
    try {
      if (!token) throw new Error('Missing token');
      const result = await proofRpc({ action: 'get_proof_by_token', approval_token: token });
      if (!result.proof || !result.order) throw new Error('Proof not found');
      if (request === epoch.current) { setData(result); setError(false); }
    } catch { if (request === epoch.current) setError(true); }
    finally { if (request === epoch.current) setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); return () => { epoch.current++; }; }, [load]);
  useEffect(() => { document.title = 'Proof Approval · Emboss Marketing'; }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mode || saving || data?.proof?.status !== 'pending') return;
    setSaving(true); setSubmitError('');
    const request = epoch.current;
    try {
      const result = await proofRpc(proofResponsePayload(mode, token, comment, name, mode === 'request_revision' ? annotations : []));
      if (!result.proof) throw new Error('Your response could not be confirmed. Please try again.');
      if (request === epoch.current) { setData(current => current ? { ...current, proof: result.proof } : current); setMode(null); setSubmitted(true); }
      if (result.notify_admin && result.order_number) {
        try {
          const approved = mode === 'approve_proof';
          const response = await fetch('https://n8n.srv1141999.hstgr.cloud/webhook/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: 'embossmarketing@gmail.com',
              subject: `Proof ${approved ? 'Approved' : 'Revision Requested'} — ${result.order_number}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background-color:#0d7377;padding:32px 28px 24px 28px;border-radius:12px 12px 0 0;">
                  <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:0.5px;">EMBOSS MARKETING</div>
                  <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.55);letter-spacing:3px;text-transform:uppercase;padding-top:6px;">PRINTING &middot; PACKAGING &middot; POS MATERIALS</div>
                </div>
                <div style="padding:28px;background:#ffffff;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
                  <h2 style="color:#0d7377;margin:0 0 16px;">Proof ${approved ? 'Approved ✓' : 'Revision Requested ✎'}</h2>
                  <p><strong>Order:</strong> ${escapeNotificationHtml(result.order_number)}</p>
                  <p><strong>Client:</strong> ${escapeNotificationHtml(result.proof.client_name || name.trim() || data?.order?.client_name || 'Unknown')}</p>
                  <p><strong>Status:</strong> ${approved ? 'Approved' : 'Changes Requested'}</p>
                  ${mode === 'request_revision' && comment.trim() ? `<p><strong>Comments:</strong> ${escapeNotificationHtml(comment.trim())}</p>` : ''}
                  ${mode === 'request_revision' && annotations.length > 0 ? `<p><strong>Annotations:</strong> ${annotations.length} markup(s) added to proof</p>` : ''}
                  <p style="margin-top:20px;"><a href="https://supplierconnect.embossmarketing.in" style="background:#0d7377;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">View in Admin Panel</a></p>
                </div>
              </div>`,
            }),
          });
          if (!response.ok) throw new Error('Admin notification was not accepted');
        } catch (notifyErr) {
          console.error('Admin notification failed:', notifyErr);
        }
      }
    } catch (e) { if (request === epoch.current) setSubmitError(e instanceof Error ? e.message : 'Unable to submit your response. Please try again.'); }
    finally { setSaving(false); }
  };
  const proof = data?.proof;
  const order = data?.order;
  const media = proofMedia(proof?.media_urls);
  return <div className="proof-public min-h-screen bg-background text-foreground">
    <header className="border-b border-border bg-background"><div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6"><Brand />{order && <div className="text-right"><p className="text-sm font-semibold">{order.order_number}</p><p className="text-xs text-muted-foreground">Digital Proof Approval</p></div>}</div></header>
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {loading && <div role="status" aria-label="Loading proof" className="animate-pulse space-y-6 motion-reduce:animate-none"><div className="h-8 w-2/3 rounded bg-muted" /><div className="h-24 rounded-lg bg-muted" /><div className="h-72 rounded-lg bg-muted" /><div className="h-12 w-1/2 rounded-lg bg-muted" /></div>}
      {!loading && error && <div className="rounded-lg border border-border bg-muted/60 px-6 py-16 text-center"><ClipboardCheck className="mx-auto mb-4 h-12 w-12 text-muted-foreground" /><h1 className="text-xl font-bold">Proof not found</h1><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">This review link is invalid or unavailable. Please check the link or contact your Emboss Marketing representative.</p><Button variant="outline" onClick={load} className="mt-5"><RefreshCw />Try again</Button></div>}
      {!loading && !error && proof && order && <div className="space-y-6">
        <div><h1 className="text-2xl font-bold sm:text-3xl">{proof.title}</h1>{data?.item?.item_name && <p className="mt-2 break-words text-sm text-muted-foreground">Item: {data?.item?.item_name}</p>}<p className="mt-2 text-sm text-muted-foreground">{order.client_name}</p><div className="mt-3 flex flex-wrap gap-2"><Badge variant="secondary">{proofTypeLabel(proof.proof_type)}</Badge>{proof.revision_number > 1 && <Badge variant="outline">Revision {proof.revision_number}</Badge>}</div></div>
        <dl className="grid grid-cols-1 gap-4 border-y border-border py-4 sm:grid-cols-3">{[['Order Number', order.order_number], ['Client Name', order.client_name], ['Client PO#', order.client_po_ref]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{value || '—'}</dd></div>)}</dl>
        {proof.description && <section className="rounded-lg border border-border bg-muted/60 p-4"><h2 className="mb-2 text-xs font-semibold text-muted-foreground">Notes</h2><p className="whitespace-pre-wrap break-words text-sm leading-6">{proof.description}</p></section>}
        <ProofMediaGrid media={proof.media_urls} />
        {media.length > 0 && <section aria-label="Proof downloads" className="flex flex-col items-start gap-2">{media.map((file, index) => <Button key={`${file.url}-${index}`} type="button" variant="outline" onClick={() => void downloadProofFile(file.url, proofFilename(file))} className="h-auto max-w-full py-2"><Download className="shrink-0" /><span className="min-w-0 whitespace-normal break-all text-left">{media.length === 1 ? 'Download Proof' : file.filename || `Download Proof ${index + 1}`}</span></Button>)}</section>}
        {proof.status !== 'pending' && <section role="status" className={`rounded-lg border p-5 ${proof.status === 'approved' ? 'border-success/20 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-foreground'}`}><div className="flex items-start gap-3">{proof.status === 'approved' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <Pencil className="mt-0.5 h-5 w-5 shrink-0 text-warning" />}<div><h2 className="font-semibold">{proof.status === 'approved' ? 'Proof Approved' : 'Changes Requested'} on {dateLabel(proof.client_response_at)}</h2>{submitted && <p className="mt-1 text-sm">Thank you. Your response has been recorded.</p>}{proof.client_comment && <p className="mt-3 whitespace-pre-wrap break-words text-sm">{proof.client_comment}</p>}{proof.client_name && <p className="mt-2 text-xs">{proof.client_name}</p>}</div></div></section>}
        {proof.status === 'pending' && <section className="border-t border-border pt-6">
          {!mode ? <div className="flex flex-col gap-3 sm:flex-row"><Button variant="success" size="lg" onClick={() => { setMode('approve_proof'); setSubmitError(''); }}><CheckCircle2 />Approve Proof</Button><Button variant="warning" size="lg" onClick={() => { setMode('request_revision'); setSubmitError(''); }}><Pencil />Request Changes</Button></div> : <form onSubmit={submit} className="space-y-4"><h2 className="text-lg font-semibold">{mode === 'approve_proof' ? 'Approve Proof' : 'Request Changes'}</h2><div className="space-y-2"><Label htmlFor="proof-comment">{mode === 'request_revision' ? 'Changes needed (required)' : 'Comment (optional)'}</Label><Textarea id="proof-comment" rows={4} value={comment} onChange={e => setComment(e.target.value)} required={mode === 'request_revision'} disabled={saving} placeholder={mode === 'request_revision' ? 'Describe the changes needed…' : 'Add a comment…'} /></div>{mode === 'request_revision' && <ProofAnnotator media={media} annotations={annotations} onAnnotationsChange={setAnnotations} disabled={saving} />}<div className="space-y-2"><Label htmlFor="proof-name">Your name (optional)</Label><Input id="proof-name" value={name} onChange={e => setName(e.target.value)} disabled={saving} /></div>{submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}<div className="flex flex-wrap gap-3"><Button type="submit" variant={mode === 'approve_proof' ? 'success' : 'warning'} disabled={saving || (mode === 'request_revision' && !comment.trim())}>{saving ? <Loader2 className="animate-spin" /> : mode === 'approve_proof' ? <CheckCircle2 /> : <Pencil />}{mode === 'approve_proof' ? 'Approve' : 'Submit'}</Button><Button type="button" variant="outline" onClick={() => setMode(null)} disabled={saving}>Cancel</Button></div></form>}
        </section>}
      </div>}
    </main>
    <footer className="mt-10 border-t border-border py-8 text-center"><Brand /><p className="mt-3 text-xs text-muted-foreground/70">Emboss Marketing LLP · Gurugram, Haryana</p></footer>
  </div>;
}