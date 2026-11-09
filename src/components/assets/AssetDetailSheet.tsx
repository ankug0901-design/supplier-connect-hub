import { useEffect, useState } from 'react';
import { Archive, Check, Download, Edit, Loader2, MessageSquare, Share2, Upload, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Asset, AssetAudit, AssetComment, Actor, AssetInput, assetDate, assetLabel, assetSize, assetFileUrl, downloadAsset, errorMessage, writeAssetAudit } from '@/lib/assetLibrary';
import { statusFields } from '@/lib/assetRules';
import { AssetFields } from './AssetFields';
import { AssetPreview } from './AssetPreview';
export function AssetStatus({ status }: { status: string }) {
  const tone = status === 'approved' ? 'border-success/30 bg-success/10 text-success' : status === 'pending_review' ? 'border-warning/30 bg-warning/10 text-warning' : status === 'rejected' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border bg-muted text-muted-foreground';
  return <Badge variant="outline" className={`${tone} whitespace-nowrap`}>{assetLabel(status)}</Badge>;
}
export function AssetDetailSheet({ asset, assets, clients, actor, onClose, onRefresh, onVersion, onSelect, initialEdit = false, readOnly }: { asset: Asset; assets: Asset[]; clients: string[]; actor: Actor; onClose: () => void; onRefresh: () => Promise<void>; onVersion: (asset: Asset) => void; onSelect: (asset: Asset) => void; initialEdit?: boolean; readOnly: boolean }) {
  const [logs, setLogs] = useState<AssetAudit[]>([]);
  const [comments, setComments] = useState<AssetComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(initialEdit);
  const [input, setInput] = useState<AssetInput>(asset);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [reply, setReply] = useState<AssetComment | null>(null);
  async function loadActivity() {
    setLoading(true); setLoadError('');
    try {
      const [audit, discussion] = await Promise.all([supabase.from('asset_audit_log').select('*').eq('asset_id', asset.id).order('created_at', { ascending: false }), supabase.from('asset_comments').select('*').eq('asset_id', asset.id).order('created_at')]);
      if (audit.error) throw audit.error; if (discussion.error) throw discussion.error;
      setLogs(audit.data || []); setComments(discussion.data || []);
    } catch (error) { setLoadError(errorMessage(error)); } finally { setLoading(false); }
  }
  useEffect(() => { void loadActivity(); }, [asset.id]);
  const connected = new Set([asset.id]);
  let grew = true;
  while (grew) { grew = false; for (const a of assets) if (connected.has(a.id) && a.parent_asset_id && !connected.has(a.parent_asset_id)) { connected.add(a.parent_asset_id); grew = true; } else if (a.parent_asset_id && connected.has(a.parent_asset_id) && !connected.has(a.id)) { connected.add(a.id); grew = true; } }
  const versions = assets.filter(a => connected.has(a.id)).sort((a, b) => b.version - a.version);
  async function action(work: () => Promise<void>) { setBusy(true); try { await work(); } catch (error) { toast.error(errorMessage(error)); await onRefresh(); await loadActivity(); } finally { setBusy(false); } }
  async function setStatus(status: string) {
    await action(async () => {
      if (readOnly) throw new Error('This view is read-only.');
      const fields = statusFields(status, actor.name, reason);
      const { data, error } = await supabase.from('assets').update(fields).eq('id', asset.id).eq('status', asset.status).select('id');
      if (error) throw error; if (!data?.length) throw new Error('Asset changed. Refresh before retrying.');
      await writeAssetAudit(asset.id, status, actor, { field_changed: 'status', old_value: asset.status, new_value: status, ...(status === 'rejected' ? { notes: reason.trim() } : {}) });
      toast.success(`Asset ${assetLabel(status).toLowerCase()}`); setRejectOpen(false); setReason(''); await onRefresh(); await loadActivity();
    });
  }
  async function saveMetadata() {
    if (!input.name.trim()) { toast.error('Asset name is required.'); return; }
    await action(async () => {
      if (readOnly) throw new Error('This view is read-only.');
      const patch = { name: input.name.trim(), description: input.description, asset_type: input.asset_type, category: input.category, sub_category: input.sub_category, client_name: input.client_name, tags: input.tags, linked_po_id: input.linked_po_id, linked_rfq_id: input.linked_rfq_id };
      const { data, error } = await supabase.from('assets').update(patch).eq('id', asset.id).eq('updated_at', asset.updated_at).select('id');
      if (error) throw error; if (!data?.length) throw new Error('Asset changed. Refresh before retrying.');
      for (const field of Object.keys(patch) as (keyof typeof patch)[]) if (JSON.stringify(asset[field]) !== JSON.stringify(patch[field])) await writeAssetAudit(asset.id, 'updated', actor, { field_changed: field, old_value: JSON.stringify(asset[field]), new_value: JSON.stringify(patch[field]) });
      toast.success('Asset details saved'); setEditing(false); await onRefresh(); await loadActivity();
    });
  }
  async function postComment() {
    if (!comment.trim()) return;
    await action(async () => {
      if (readOnly) throw new Error('This view is read-only.');
      const { error } = await supabase.from('asset_comments').insert({ asset_id: asset.id, parent_comment_id: reply?.id || null, comment_text: comment.trim(), commenter_id: actor.id, commenter_name: actor.name, commenter_role: 'admin' });
      if (error) throw error;
      setComment(''); setReply(null); await writeAssetAudit(asset.id, 'commented', actor); await loadActivity(); toast.success('Comment added');
    });
  }
  function renderComment(row: AssetComment, visited = new Set<string>(), depth = 0): React.ReactNode {
    if (visited.has(row.id)) return null;
    const seen = new Set([...visited, row.id]);
    return <div key={row.id} className={`space-y-2 border-l-2 pl-3 ${depth ? 'mt-3' : 'mb-4'}`}><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{row.commenter_name}</span><span className="text-xs text-muted-foreground">{assetDate(row.created_at)}</span></div><p className="whitespace-pre-wrap break-words text-sm">{row.comment_text}</p>{!readOnly && <Button variant="ghost" size="sm" disabled={busy} onClick={() => setReply(row)}>Reply</Button>}{comments.filter(c => c.parent_comment_id === row.id).map(c => renderComment(c, seen, depth + 1))}</div>;
  }
  const metadata: [string, unknown][] = [['Asset code', asset.asset_code], ['Type', assetLabel(asset.asset_type)], ['Category', asset.category], ['Sub-category', asset.sub_category], ['Client', asset.client_name], ['Version', `v${asset.version}${asset.is_latest ? ' · Latest' : ''}`], ['File', asset.file_name], ['File size', assetSize(asset.file_size_bytes)], ['MIME type', asset.mime_type], ['Uploaded by', asset.uploaded_by_name], ['Uploaded', assetDate(asset.created_at)], ['Updated', assetDate(asset.updated_at)], ['Linked PO', asset.linked_po_id], ['Linked RFQ', asset.linked_rfq_id], ['Client order', asset.linked_client_order_id], ['Approved by', asset.approved_by], ['Approved at', asset.approved_at && assetDate(asset.approved_at)], ['Rejection reason', asset.rejection_reason], ['Parent version', asset.parent_asset_id], ['Uploader ID', asset.uploaded_by], ['Asset ID', asset.id], ['Metadata', asset.metadata ? JSON.stringify(asset.metadata) : null]];
  return <Sheet open onOpenChange={v => { if (!v && !busy) onClose(); }}><SheetContent className="w-full overflow-y-auto sm:max-w-3xl" onInteractOutside={e => { if (busy) e.preventDefault(); }}><SheetHeader className="mb-5 pr-6"><SheetTitle className="break-words">{asset.name}</SheetTitle><SheetDescription>{asset.asset_code} · v{asset.version}</SheetDescription></SheetHeader><AssetPreview asset={asset} large />
    <div className="my-4 flex flex-wrap items-center gap-2"><AssetStatus status={asset.status} /><Button variant="outline" size="sm" disabled={busy} onClick={() => action(() => downloadAsset(asset))}><Download className="mr-2 h-4 w-4" />Download</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => action(async () => { await navigator.clipboard.writeText(await assetFileUrl(asset)); toast.success('Secure file link copied — expires in 1 hour'); })}><Share2 className="mr-2 h-4 w-4" />Share</Button>{!readOnly && <><Button size="sm" disabled={busy || asset.status === 'approved'} onClick={() => setStatus('approved')}><Check className="mr-1 h-4 w-4" />Approve</Button><Button variant="outline" size="sm" disabled={busy || asset.status === 'rejected'} onClick={() => setRejectOpen(true)}><X className="mr-1 h-4 w-4" />Reject</Button><Button variant="outline" size="sm" disabled={busy || asset.status === 'archived'} onClick={() => setStatus('archived')}><Archive className="mr-1 h-4 w-4" />Archive</Button></>}</div>
    <Tabs defaultValue="details"><TabsList className="grid w-full grid-cols-4"><TabsTrigger value="details">Details</TabsTrigger><TabsTrigger value="versions">Versions</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger><TabsTrigger value="comments">Comments</TabsTrigger></TabsList>
      <TabsContent value="details" className="space-y-4 pt-3">{editing && !readOnly ? <><AssetFields value={input} onChange={setInput} clients={clients} /><div className="flex gap-2"><Button disabled={busy} onClick={saveMetadata}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Changes</Button><Button variant="outline" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button></div></> : <>{!readOnly && <Button variant="outline" size="sm" onClick={() => { setInput(asset); setEditing(true); }}><Edit className="mr-2 h-4 w-4" />Edit Metadata</Button>}{asset.description && <p className="whitespace-pre-wrap break-words text-sm">{asset.description}</p>}<div className="flex flex-wrap gap-1">{asset.tags?.map(t => <Badge variant="secondary" key={t}>{t}</Badge>)}</div><dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">{metadata.map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{value ? String(value) : '—'}</dd></div>)}</dl></>}</TabsContent>
      <TabsContent value="versions" className="space-y-4 pt-3">{asset.is_latest && !readOnly && <Button disabled={busy} onClick={() => onVersion(asset)}><Upload className="mr-2 h-4 w-4" />Upload New Version</Button>}{versions.map(v => <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3"><div><p className="text-sm font-medium">v{v.version} · {v.asset_code} {v.is_latest && <Badge variant="secondary">Latest</Badge>}</p><p className="text-xs text-muted-foreground">{assetDate(v.created_at)} · {v.uploaded_by_name}</p></div><div className="flex gap-1"><Button variant="outline" size="sm" onClick={() => onSelect(v)}>View</Button><Button variant="ghost" size="icon" aria-label={`Download version ${v.version}`} onClick={() => action(() => downloadAsset(v))}><Download className="h-4 w-4" /></Button></div></div>)}</TabsContent>
      <TabsContent value="activity" className="pt-3">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : loadError ? <p role="alert" className="text-destructive">{loadError}<Button variant="outline" onClick={loadActivity}>Retry</Button></p> : !logs.length ? <p className="text-sm text-muted-foreground">No activity yet.</p> : logs.map(log => <div key={log.id} className="mb-4 border-l-2 border-primary/30 pl-4"><p className="text-sm font-medium">{assetLabel(log.action)}{log.field_changed && ` · ${assetLabel(log.field_changed)}`}</p><p className="text-xs text-muted-foreground">{log.performed_by_name} · {assetDate(log.created_at)}</p>{log.field_changed && <p className="mt-1 break-words text-xs">{log.old_value || '—'} → {log.new_value || '—'}</p>}{log.notes && <p className="mt-1 break-words text-sm">{log.notes}</p>}</div>)}</TabsContent>
      <TabsContent value="comments" className="pt-3">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : loadError ? <p role="alert" className="text-destructive">{loadError}</p> : <>{comments.filter(c => !c.parent_comment_id || !comments.some(p => p.id === c.parent_comment_id)).map(c => renderComment(c))}{!comments.length && <p className="mb-4 text-sm text-muted-foreground">No comments yet.</p>}{!readOnly && <div className="space-y-3 border-t pt-4">{reply && <div className="flex items-center gap-2 text-xs">Replying to {reply.commenter_name}<Button size="icon" variant="ghost" aria-label="Cancel reply" onClick={() => setReply(null)}><X className="h-3 w-3" /></Button></div>}<Textarea aria-label="Comment" value={comment} onChange={e => setComment(e.target.value)} placeholder="Write a comment…" /><Button disabled={busy || !comment.trim()} onClick={postComment}><MessageSquare className="mr-2 h-4 w-4" />Post Comment</Button></div>}</>}</TabsContent>
    </Tabs>
    <Dialog open={rejectOpen} onOpenChange={v => { if (!busy) setRejectOpen(v); }}><DialogContent><DialogHeader><DialogTitle>Reject Asset</DialogTitle><DialogDescription>{asset.name}</DialogDescription></DialogHeader><Textarea aria-label="Rejection reason" placeholder="Reason for rejection" value={reason} onChange={e => setReason(e.target.value)} /><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setRejectOpen(false)}>Cancel</Button><Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => setStatus('rejected')}>Reject</Button></DialogFooter></DialogContent></Dialog>
  </SheetContent></Sheet>;
}