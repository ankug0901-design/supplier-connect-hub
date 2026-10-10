import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardCheck, Copy, Loader2, Mail, Plus, RefreshCw, Send, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PROOF_TYPES, proofLink, proofMedia, proofRpc, proofTypeLabel, type Proof, type ProofMedia } from '@/lib/proofApproval';
import { ProofMediaGrid } from './ProofMediaGrid';

type Item = { id: string; item_name: string | null; description: string | null };
type Props = {
  orderId: string; clientEmail: string | null; poId: string; items: Item[]; updatedBy: string;
  mediaBucket: string; sendEmail: (proof: Proof, recipient: string, cc?: string, subject?: string, message?: string) => Promise<void>;
};
const formatDate = (date: string) => new Date(date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function AdminProofSection({ orderId, clientEmail, poId, items: poItems, updatedBy, mediaBucket, sendEmail }: Props) {
  const { toast } = useToast();
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [items, setItems] = useState<Item[]>(poItems);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [revised, setRevised] = useState<Proof | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [itemId, setItemId] = useState('all');
  const [proofType, setProofType] = useState('artwork');
  const [recipient, setRecipient] = useState(clientEmail || '');
  const [media, setMedia] = useState<ProofMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [emailProof, setEmailProof] = useState<Proof | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const result = await proofRpc({ action: 'list_proofs', client_order_id: orderId }); setProofs(result.proofs || []); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load proofs'); }
    finally { setLoading(false); }
  }, [orderId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    void supabase.from('purchase_orders').select('items:po_items(id, item_name, description)').eq('client_order_id', orderId).then(({ data, error: queryError }) => {
      if (!active || queryError) return;
      const all = (data || []).flatMap(row => row.items || []);
      setItems(all.length ? all : poItems);
    });
    return () => { active = false; };
  }, [orderId, poItems]);

  const start = (proof: Proof | null = null) => {
    setRevised(proof); setTitle(proof?.title || ''); setDescription(proof?.description || '');
    setItemId(proof?.item_id || 'all'); setProofType(proof?.proof_type || 'artwork');
    setRecipient(proof?.email_recipient || clientEmail || ''); setMedia(proofMedia(proof?.media_urls)); setOpen(true);
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, Math.max(0, 10 - media.length))) {
        if (!/^(image|video)\//.test(file.type)) throw new Error('Please select images or videos');
        const path = `${poId}/${itemId === 'all' ? 'proofs' : itemId}/${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
        const { error: uploadError } = await supabase.storage.from(mediaBucket).upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        const url = supabase.storage.from(mediaBucket).getPublicUrl(path).data.publicUrl;
        setMedia(current => [...current, { url, type: file.type.startsWith('video/') ? 'video' : 'image', filename: file.name }]);
      }
    } catch (e) { toast({ title: 'Upload failed', description: e instanceof Error ? e.message : 'Please try again', variant: 'destructive' }); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || uploading || !title.trim() || !media.length || !recipient.trim()) return;
    setSaving(true);
    try {
      const result = await proofRpc(revised ? {
        action: 'resubmit_proof', proof_id: revised.id, title: title.trim(), description: description.trim(), media_urls: media, created_by: updatedBy,
      } : {
        action: 'create_proof', client_order_id: orderId, item_id: itemId === 'all' ? null : itemId,
        proof_type: proofType, title: title.trim(), description: description.trim(), media_urls: media, email_recipient: recipient.trim(), created_by: updatedBy,
      });
      if (!result.proof) throw new Error('Proof creation could not be confirmed');
      setOpen(false);
      await load();
      try { await sendEmail(result.proof, recipient.trim(), '', `Proof for Review — ${result.proof.title}`, ''); toast({ title: 'Proof created and email sent' }); }
      catch (e) { toast({ title: 'Proof saved; email not confirmed', description: `${e instanceof Error ? e.message : 'Please retry'}. Use Send Email to retry without creating another proof.`, variant: 'destructive' }); }
      await load();
    } catch (e) { toast({ title: 'Unable to save proof', description: e instanceof Error ? e.message : 'Please try again', variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  const openEmailDialog = (proof: Proof) => {
    setEmailTo(proof.email_recipient || clientEmail || '');
    setEmailCc('');
    setEmailSubject(`Proof for Review — ${proof.title}`);
    setEmailBody('');
    setEmailProof(proof);
  };
  const sendProofEmail = async () => {
    const proof = emailProof;
    if (!proof || busy !== null) return;
    const to = emailTo.trim();
    if (!to) { toast({ title: 'Enter an email recipient', variant: 'destructive' }); return; }
    setBusy(proof.id);
    try { await sendEmail(proof, to, emailCc.trim(), emailSubject, emailBody); toast({ title: 'Proof email sent' }); setEmailProof(null); await load(); }
    catch (e) { toast({ title: 'Email not confirmed', description: e instanceof Error ? e.message : 'Please retry', variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const remove = async (proof: Proof) => {
    if (!window.confirm(`Delete pending proof “${proof.title}”?`)) return;
    setBusy(proof.id);
    try { await proofRpc({ action: 'delete_proof', proof_id: proof.id }); await load(); }
    catch (e) { toast({ title: 'Unable to delete proof', description: e instanceof Error ? e.message : 'Please retry', variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  return <section className="space-y-4 border-t border-border pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><ClipboardCheck className="h-5 w-5" />Digital Proofs</h2><Button size="sm" onClick={() => start()} disabled={saving}><Plus />Upload New Proof</Button></div>
    {loading ? <div role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading proofs…</div> : error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">{error}<Button size="sm" variant="outline" onClick={load}><RefreshCw />Retry</Button></div> : !proofs.length ? <p className="py-3 text-sm text-muted-foreground">No digital proofs for this order yet.</p> : <div className="space-y-4">{proofs.map(proof => <article key={proof.id} className="space-y-3 border-b border-border pb-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-semibold">{proof.title}</h3><p className="mt-1 text-xs text-muted-foreground">Revision {proof.revision_number} · {formatDate(proof.created_at)}</p></div><div className="flex flex-wrap gap-2"><Badge variant="outline">{proofTypeLabel(proof.proof_type)}</Badge><Badge variant="outline" className={proof.status === 'approved' ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-foreground'}>{proof.status === 'pending' ? '⏳ Pending' : proof.status === 'approved' ? '✅ Approved' : '✏️ Changes Requested'}</Badge></div></div>
      {proof.description && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{proof.description}</p>}
      <ProofMediaGrid media={proof.media_urls} compact />
      {proof.client_response_at && <div className="border-l-2 border-border pl-3"><p className="text-xs text-muted-foreground">{proof.client_name || 'Client'} · {formatDate(proof.client_response_at)}</p>{proof.client_comment && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{proof.client_comment}</p>}</div>}
      {proof.email_sent_at && <p className="text-xs text-muted-foreground">Email sent {formatDate(proof.email_sent_at)} · {proof.email_recipient}</p>}
      <div className="flex flex-wrap gap-2">{proof.status === 'pending' && <><Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(proofLink(proof.approval_token)); toast({ title: 'Review link copied' }); } catch { toast({ title: 'Unable to copy link', variant: 'destructive' }); } }}><Copy />Copy Review Link</Button><Button size="sm" variant="outline" disabled={busy !== null || saving} onClick={() => openEmailDialog(proof)}>{busy === proof.id ? <Loader2 className="animate-spin" /> : <Mail />}Send Email</Button><Button size="sm" variant="ghost" className="text-destructive" disabled={busy !== null || saving} onClick={() => remove(proof)}><Trash2 />Delete</Button></>}{proof.status === 'revision_requested' && <Button size="sm" variant="outline" disabled={saving} onClick={() => start(proof)}><Upload />Resubmit Revised Proof</Button>}</div>
    </article>)}</div>}
    <Dialog open={open} onOpenChange={value => { if (!saving && !uploading) setOpen(value); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{revised ? `Resubmit Revised Proof · Revision ${revised.revision_number + 1}` : 'Upload New Proof'}</DialogTitle></DialogHeader><form onSubmit={create} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Item (optional)</Label><Select value={itemId} onValueChange={setItemId} disabled={!!revised || uploading || saving}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Whole order</SelectItem>{items.map(item => <SelectItem key={item.id} value={item.id}>{item.item_name || item.description || 'Item'}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Proof type</Label><Select value={proofType} onValueChange={setProofType} disabled={!!revised || saving}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PROOF_TYPES.map(type => <SelectItem key={type} value={type}>{proofTypeLabel(type)}</SelectItem>)}</SelectContent></Select></div></div>
      <div className="space-y-2"><Label htmlFor={`proof-title-${poId}`}>Title</Label><Input id={`proof-title-${poId}`} value={title} onChange={e => setTitle(e.target.value)} required disabled={saving} /></div>
      <div className="space-y-2"><Label htmlFor={`proof-description-${poId}`}>Description (optional)</Label><Textarea id={`proof-description-${poId}`} value={description} onChange={e => setDescription(e.target.value)} rows={3} disabled={saving} /></div>
      <div className="space-y-2"><Label>Images / Videos</Label><input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => upload(e.target.files)} /><Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading || saving || media.length >= 10}>{uploading ? <Loader2 className="animate-spin" /> : <Plus />}Add media</Button><ProofMediaGrid media={media} compact /><div className="space-y-1">{media.map((m, i) => <div key={`${m.url}-${i}`} className="flex min-w-0 items-center justify-between gap-2 text-xs"><span className="truncate">{m.filename || 'Proof media'}</span><Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`Remove ${m.filename || 'media'}`} disabled={uploading || saving} onClick={() => setMedia(current => current.filter((_, index) => index !== i))}><X /></Button></div>)}</div></div>
      <div className="space-y-2"><Label htmlFor={`proof-email-${poId}`}>Email recipient</Label><Input id={`proof-email-${poId}`} type="email" required value={recipient} onChange={e => setRecipient(e.target.value)} disabled={saving} /></div>
      <DialogFooter><Button type="button" variant="outline" disabled={saving || uploading} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving || uploading || !title.trim() || !media.length || !recipient.trim()} className="h-auto min-h-10 whitespace-normal">{saving ? <Loader2 className="animate-spin" /> : <Mail />}{revised ? 'Resubmit & Send for Approval' : 'Create & Send for Approval'}</Button></DialogFooter>
    </form></DialogContent></Dialog>
    <Dialog open={emailProof !== null} onOpenChange={value => { if (!value && busy === null) setEmailProof(null); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Send email — {emailProof?.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor={`proof-email-to-${poId}`}>To</Label><Input id={`proof-email-to-${poId}`} type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} disabled={busy !== null} /></div>
          <div className="space-y-1"><Label htmlFor={`proof-email-cc-${poId}`}>Cc (comma separated)</Label><Input id={`proof-email-cc-${poId}`} value={emailCc} onChange={e => setEmailCc(e.target.value)} placeholder="optional" disabled={busy !== null} /></div>
          <div className="space-y-1"><Label htmlFor={`proof-email-subject-${poId}`}>Subject</Label><Input id={`proof-email-subject-${poId}`} value={emailSubject} onChange={e => setEmailSubject(e.target.value)} disabled={busy !== null} /></div>
          <div className="space-y-1"><Label htmlFor={`proof-email-message-${poId}`}>Message</Label><Textarea id={`proof-email-message-${poId}`} rows={6} value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder="Optional note to include..." disabled={busy !== null} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEmailProof(null)} disabled={busy !== null}>Cancel</Button>
          <Button onClick={sendProofEmail} disabled={busy !== null} className="gap-2">{busy !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}