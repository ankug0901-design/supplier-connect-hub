import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Download, Files, Loader2, Mail, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { DOCUMENT_TYPES, documentFileUrl, documentLink, documentRpc, documentTypeLabel, formatFileSize, type OrderDocument } from '@/lib/documentHub';
import { DocumentTypeBadge } from './DocumentTypeBadge';

type Item = { id: string; item_name: string | null };
type Props = {
  orderId: string; clientEmail: string | null; poId: string; items: Item[]; updatedBy: string; mediaBucket: string;
  sendEmail: (doc: OrderDocument, recipient: string) => Promise<void>;
};
export function AdminDocumentSection({ orderId, clientEmail, poId, items: poItems, updatedBy, mediaBucket, sendEmail }: Props) {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<OrderDocument[]>([]);
  const [items, setItems] = useState<Item[]>(poItems);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [documentType, setDocumentType] = useState('invoice');
  const [itemId, setItemId] = useState('all');
  const [recipient, setRecipient] = useState(clientEmail || '');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const request = ++epoch.current;
    setLoading(true); setError('');
    try { const result = await documentRpc({ action: 'list_documents', client_order_id: orderId }); if (request === epoch.current) setDocuments(result.documents || []); }
    catch (e) { if (request === epoch.current) setError(e instanceof Error ? e.message : 'Unable to load documents'); }
    finally { if (request === epoch.current) setLoading(false); }
  }, [orderId]);
  useEffect(() => { setDocuments([]); void load(); return () => { epoch.current++; }; }, [load]);
  useEffect(() => {
    let active = true;
    void supabase.from('purchase_orders').select('items:po_items(id, item_name)').eq('client_order_id', orderId).then(({ data, error: queryError }) => {
      if (!active || queryError) return;
      const all = (data || []).flatMap(row => row.items || []);
      setItems(all.length ? all : poItems);
    });
    return () => { active = false; };
  }, [orderId, poItems]);
  const start = () => { setTitle(''); setDescription(''); setDocumentType('invoice'); setItemId('all'); setFile(null); setRecipient(clientEmail || ''); setOpen(true); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !file || !title.trim()) return;
    setSaving(true);
    try {
      const path = `documents/${orderId}/${Date.now()}_${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from(mediaBucket).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (uploadError) throw uploadError;
      const fileUrl = supabase.storage.from(mediaBucket).getPublicUrl(path).data.publicUrl;
      const result = await documentRpc({ action: 'upload_document', client_order_id: orderId, item_id: itemId === 'all' ? null : itemId, document_type: documentType, title: title.trim(), description: description.trim(), file_url: fileUrl, file_name: file.name, file_size_bytes: file.size, uploaded_by: updatedBy });
      if (!result.id || !result.access_token) throw new Error('Document creation could not be confirmed');
      setOpen(false); setFile(null); await load(); toast({ title: 'Document uploaded' });
    } catch (e) { toast({ title: 'Unable to save document', description: e instanceof Error ? e.message : 'Please try again', variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  const notify = async (doc: OrderDocument) => {
    const to = recipient.trim() || doc.email_recipient || clientEmail;
    if (!to) { toast({ title: 'Enter an email recipient', variant: 'destructive' }); return; }
    setBusy(doc.id);
    try {
      await sendEmail(doc, to);
      try { await documentRpc({ action: 'mark_email_sent', id: doc.id, email_recipient: to }); }
      catch { throw new Error('Email sent, but its sent timestamp could not be saved; check before retrying'); }
      toast({ title: 'Document email sent' }); await load();
    } catch (e) { toast({ title: 'Email not confirmed', description: e instanceof Error ? e.message : 'Please retry', variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const remove = async (doc: OrderDocument) => {
    if (!window.confirm(`Delete document “${doc.title}”?`)) return;
    setBusy(doc.id);
    try { await documentRpc({ action: 'delete_document', id: doc.id }); await load(); }
    catch (e) { toast({ title: 'Unable to delete document', description: e instanceof Error ? e.message : 'Please retry', variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  return <section className="space-y-4 border-t border-border pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><Files className="h-5 w-5" />Documents</h2><Button size="sm" onClick={start} disabled={saving || busy !== null}><Plus />Upload Document</Button></div>
    <div className="space-y-2"><Label htmlFor={`document-recipient-${poId}`}>Email recipient</Label><Input id={`document-recipient-${poId}`} type="email" value={recipient} onChange={e => setRecipient(e.target.value)} disabled={busy !== null} /></div>
    {loading ? <div role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading documents…</div> : error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">{error}<Button size="sm" variant="outline" onClick={load}><RefreshCw />Retry</Button></div> : !documents.length ? <p className="py-3 text-sm text-muted-foreground">No documents for this order yet.</p> : <div className="space-y-4">{documents.map(doc => <article key={doc.id} className="space-y-3 border-b border-border pb-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-semibold">{doc.title}</h3><p className="mt-1 break-all text-xs text-muted-foreground">{doc.file_name} · {formatFileSize(doc.file_size_bytes)}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleString('en-IN')}{doc.item_name && ` · ${doc.item_name}`}</p></div><DocumentTypeBadge type={doc.document_type} /></div>
      {doc.description && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{doc.description}</p>}
      {doc.email_sent_at && <p className="text-xs text-muted-foreground">Email sent {new Date(doc.email_sent_at).toLocaleString('en-IN')} · {doc.email_recipient}</p>}
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(documentLink(doc.access_token)); toast({ title: 'Document link copied' }); } catch { toast({ title: 'Unable to copy link', variant: 'destructive' }); } }}><Copy />Copy Link</Button><Button size="sm" variant="outline" disabled={busy !== null || saving} onClick={() => notify(doc)}>{busy === doc.id ? <Loader2 className="animate-spin" /> : <Mail />}Send Email</Button>{documentFileUrl(doc.file_url) && <Button asChild size="sm" variant="outline"><a href={documentFileUrl(doc.file_url)} target="_blank" rel="noopener noreferrer"><Download />Download</a></Button>}<Button size="sm" variant="ghost" className="text-destructive" disabled={busy !== null || saving} onClick={() => remove(doc)}><Trash2 />Delete</Button></div>
    </article>)}</div>}
    <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader><form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Document type</Label><Select value={documentType} onValueChange={setDocumentType} disabled={saving}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DOCUMENT_TYPES.map(type => <SelectItem key={type} value={type}>{documentTypeLabel(type)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Item (optional)</Label><Select value={itemId} onValueChange={setItemId} disabled={saving}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Whole order</SelectItem>{items.map(item => <SelectItem key={item.id} value={item.id}>{item.item_name || 'Item'}</SelectItem>)}</SelectContent></Select></div></div>
      <div className="space-y-2"><Label htmlFor={`document-title-${poId}`}>Title</Label><Input id={`document-title-${poId}`} required value={title} onChange={e => setTitle(e.target.value)} disabled={saving} /></div>
      <div className="space-y-2"><Label htmlFor={`document-description-${poId}`}>Description (optional)</Label><Textarea id={`document-description-${poId}`} rows={3} value={description} onChange={e => setDescription(e.target.value)} disabled={saving} /></div>
      <div className="space-y-2"><Label>File</Label><input ref={fileRef} type="file" className="hidden" onChange={e => { const selected = e.target.files?.[0]; setFile(selected || null); if (!title && selected) setTitle(selected.name.replace(/\.[^.]+$/, '')); }} /><Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={saving}><Plus />Choose file</Button>{file && <p className="break-all text-xs text-muted-foreground">{file.name} · {formatFileSize(file.size)}</p>}</div>
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving || !title.trim() || !file}>{saving ? <Loader2 className="animate-spin" /> : <Plus />}Upload Document</Button></DialogFooter>
    </form></DialogContent></Dialog>
  </section>;
}