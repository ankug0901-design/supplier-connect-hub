import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Calendar, FileText, Link2, Loader2, Lock, Paperclip, Send, Tag, User, X } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { TICKET_PRIORITIES, TICKET_STATUSES, canCommentOnTicket, statusPatch, ticketLabel } from '@/lib/ticketRules';
import { Option, Ticket, TicketActor, TicketAttachment, TicketAudit, TicketComment, addComment, errorMessage, loadAdmins, openTicketFile, ticketDate, updateTicketField, uploadTicketFiles } from '@/lib/tickets';
import { PriorityBadge, StatusBadge, TypeBadge } from './TicketBadges';
import { TagInput } from './TagInput';

const db = supabase as any;
const initials = (n: string) => n.split(/\s+|@/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';

function Attachments({ items }: { items?: TicketAttachment[] | null }) {
  if (!items?.length) return null;
  return <div className="mt-2 flex flex-wrap gap-1.5">{items.map(a => (
    <button key={a.path} type="button" className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background/70 px-2 py-1 text-xs hover:bg-muted" onClick={() => openTicketFile(a).catch(e => toast.error(errorMessage(e)))}>
      <Paperclip className="h-3 w-3 shrink-0" /><span className="truncate">{a.name}</span>
    </button>
  ))}</div>;
}

export function TicketDetailPage({ mode }: { mode: 'admin' | 'supplier' }) {
  const { id } = useParams();
  const { user, supplier, isReadOnly } = useAuth();
  const base = mode === 'admin' ? '/admin/tickets' : '/supplier/tickets';
  const actor: TicketActor = { id: user?.id || '', name: supplier?.name || user?.email || (mode === 'admin' ? 'Admin' : 'Supplier'), role: mode };
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [audit, setAudit] = useState<TicketAudit[]>([]);
  const [admins, setAdmins] = useState<Option[]>([]);
  const [links, setLinks] = useState<{ po?: string; order?: string; asset?: string; invoice?: string }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [internal, setInternal] = useState(false);
  const [tags, setTags] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      const [t, c, a] = await Promise.all([
        db.from('tickets').select('*').eq('id', id).maybeSingle(),
        db.from('ticket_comments').select('*').eq('ticket_id', id).order('created_at'),
        mode === 'admin' ? db.from('ticket_audit_log').select('*').eq('ticket_id', id).order('created_at', { ascending: false }) : { data: [] },
      ]);
      if (t.error) throw t.error; if (c.error) throw c.error; if (a.error) throw a.error;
      if (!t.data) throw new Error('Ticket not found or you do not have access to it.');
      setTicket(t.data); setTags(t.data.tags || []); setComments(mode === 'admin' ? c.data : c.data.filter((x: TicketComment) => !x.is_internal)); setAudit(a.data || []);
      const d = t.data as Ticket;
      const [po, order, asset, inv] = await Promise.all([
        d.linked_po_id ? db.from('purchase_orders').select('po_number').eq('id', d.linked_po_id).maybeSingle() : null,
        d.linked_client_order_id && mode === 'admin' ? db.from('client_orders').select('order_number').eq('id', d.linked_client_order_id).maybeSingle() : null,
        d.linked_asset_id && mode === 'admin' ? db.from('assets').select('name').eq('id', d.linked_asset_id).maybeSingle() : null,
        d.linked_invoice_id ? db.from('invoices').select('invoice_number').eq('id', d.linked_invoice_id).maybeSingle() : null,
      ]);
      setLinks({ po: po?.data?.po_number, order: order?.data?.order_number, asset: asset?.data?.name, invoice: inv?.data?.invoice_number });
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [id, mode]);
  useEffect(() => { setLoading(true); void load(); if (mode === 'admin') loadAdmins().then(setAdmins).catch(() => {}); }, [load, mode]);

  async function run(work: () => Promise<void>, ok?: string) {
    setBusy(true);
    try { await work(); if (ok) toast.success(ok); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); await load(); }
  }
  const canComment = !!ticket && canCommentOnTicket(mode, ticket, user?.id, supplier?.id);
  const changeStatus = (s: string) => mode === 'admin' && ticket && s !== ticket.status && run(async () => {
    await updateTicketField(ticket, statusPatch(s, actor.name), 'status', ticket.status, s, actor);
    await addComment(ticket.id, actor, `${actor.name} changed status from ${ticketLabel(ticket.status)} → ${ticketLabel(s)}`, [], false, { from: ticket.status, to: s });
  }, 'Status updated');
  const changePriority = (p: string) => ticket && p !== ticket.priority && run(() => updateTicketField(ticket, { priority: p }, 'priority', ticket.priority, p, actor), 'Priority updated');
  const reassign = (uid: string) => ticket && run(async () => {
    const a = admins.find(x => x.value === uid);
    const next = uid === 'none' ? null : uid;
    await updateTicketField(ticket, { assigned_to: next, assigned_to_name: a?.label ?? null }, 'assigned_to', ticket.assigned_to_name, a?.label ?? null, actor);
  }, 'Assignee updated');
  const saveTags = () => ticket && run(() => updateTicketField(ticket, { tags }, 'tags', (ticket.tags || []).join(', '), tags.join(', '), actor), 'Tags saved');
  const submit = () => {
    if (!canComment) { toast.error('You can only reply to tickets you raised or that are linked to your company.'); return; }
    if (!ticket || (!text.trim() && !files.length)) { toast.error('Write a comment or attach a file.'); return; }
    return run(async () => {
      const att = files.length ? await uploadTicketFiles(files) : [];
      await addComment(ticket.id, actor, text.trim() || '(attachment)', att, internal);
      setText(''); setFiles([]); setInternal(false);
    }, internal ? 'Internal note added' : 'Comment added');
  };

  if (loading) return <DashboardLayout title="Ticket"><div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  if (error || !ticket) return <DashboardLayout title="Ticket"><div role="alert" className="space-y-3 border-l-4 border-destructive bg-destructive/10 p-5"><p className="text-sm text-destructive">{error}</p><Button variant="outline" asChild><Link to={base}>Back to tickets</Link></Button></div></DashboardLayout>;

  const canEdit = mode === 'admin' && !isReadOnly;
  const linkRow = (label: string, value: string | undefined | null, to: string) => <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">{label}</span><Link className="truncate font-medium text-primary hover:underline" to={to}>{value}</Link></div>;
  const anyLink = ticket.linked_po_id || ticket.linked_rfq_id || ticket.linked_client_order_id || ticket.linked_asset_id || ticket.linked_invoice_id;
  const panel = (title: string, Icon: any, children: React.ReactNode) => <section className="rounded-lg border bg-card p-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" />{title}</h3><div className="space-y-2">{children}</div></section>;
  const kv = (k: string, v: React.ReactNode) => <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium">{v || '—'}</span></div>;

  return (
    <DashboardLayout title={ticket.ticket_number} subtitle={ticket.subject}>
      <div className="space-y-5">
        <Button variant="ghost" className="gap-2" asChild><Link to={base}><ArrowLeft className="h-4 w-4" />All tickets</Link></Button>
        <header className="rounded-lg border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1"><p className="font-mono text-xs font-semibold text-muted-foreground">{ticket.ticket_number}</p><h1 className="text-xl font-semibold leading-tight">{ticket.subject}</h1><div className="flex flex-wrap gap-2 pt-1"><TypeBadge type={ticket.ticket_type} />{(ticket.tags || []).map(t => <Badge key={t} variant="outline" className="rounded-full text-[11px]">#{t}</Badge>)}</div></div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit ? <>
                <Select value={ticket.status} onValueChange={changeStatus} disabled={busy}><SelectTrigger aria-label="Change status" className="h-9 w-auto gap-2 border-0 bg-transparent p-0 shadow-none"><StatusBadge status={ticket.status} /></SelectTrigger><SelectContent>{TICKET_STATUSES.map(s => <SelectItem key={s} value={s}>{ticketLabel(s)}</SelectItem>)}</SelectContent></Select>
                <Select value={ticket.priority} onValueChange={changePriority} disabled={busy}><SelectTrigger aria-label="Change priority" className="h-9 w-auto gap-2 border-0 bg-transparent p-0 shadow-none"><PriorityBadge priority={ticket.priority} /></SelectTrigger><SelectContent>{TICKET_PRIORITIES.map(s => <SelectItem key={s} value={s}>{ticketLabel(s)}</SelectItem>)}</SelectContent></Select>
                <Select value={ticket.assigned_to || 'none'} onValueChange={reassign} disabled={busy}><SelectTrigger aria-label="Reassign" className="h-9 w-48"><User className="mr-1 h-4 w-4" /><SelectValue placeholder="Unassigned" /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{admins.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent></Select>
              </> : <><StatusBadge status={ticket.status} /><PriorityBadge priority={ticket.priority} /></>}
            </div>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[7fr_3fr]">
          <div className="space-y-5">
            <section className="rounded-lg border bg-card p-5"><h2 className="mb-2 text-sm font-semibold">Description</h2><p className="whitespace-pre-wrap text-sm text-foreground/90">{ticket.description || <span className="text-muted-foreground">No description provided.</span>}</p><Attachments items={ticket.attachments} /></section>

            <section className="rounded-lg border bg-card">
              <h2 className="border-b px-5 py-3 text-sm font-semibold">Conversation <span className="text-muted-foreground">({comments.filter(c => !c.status_change_to).length})</span></h2>
              <div className="space-y-4 p-5">
                {!comments.length && <p className="py-8 text-center text-sm text-muted-foreground">No comments yet. Start the conversation below.</p>}
                {comments.map(c => {
                  if (c.status_change_to) return <div key={c.id} className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /><span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">{c.commenter_name} changed status <StatusBadge status={c.status_change_from || ''} /><ArrowRight className="h-3 w-3" /><StatusBadge status={c.status_change_to} /> · {ticketDate(c.created_at)}</span><span className="h-px flex-1 bg-border" /></div>;
                  const right = c.commenter_role === 'admin';
                  return (
                    <div key={c.id} className={cn('flex gap-3', right && 'flex-row-reverse')}>
                      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold', right ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground')}>{initials(c.commenter_name)}</div>
                      <div className={cn('max-w-[80%] space-y-1', right && 'text-right')}>
                        <div className={cn('flex flex-wrap items-center gap-2 text-xs', right && 'justify-end')}><span className="font-semibold">{c.commenter_name}</span><Badge variant="outline" className="rounded-full px-1.5 py-0 text-[10px]">{ticketLabel(c.commenter_role || 'system')}</Badge>{c.is_internal && <Badge className="gap-1 rounded-full border-amber-300 bg-amber-100 px-1.5 py-0 text-[10px] text-amber-800 hover:bg-amber-100"><Lock className="h-2.5 w-2.5" />Internal</Badge>}<span className="text-muted-foreground">{ticketDate(c.created_at)}</span></div>
                        <div className={cn('inline-block rounded-2xl px-4 py-2.5 text-left text-sm', c.is_internal ? 'border border-amber-200 bg-amber-50 text-amber-950' : right ? 'rounded-tr-sm bg-primary/10' : 'rounded-tl-sm bg-muted')}>
                          <p className="whitespace-pre-wrap">{c.comment_text}</p><Attachments items={c.attachments} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {!isReadOnly && !canComment && <p className="border-t p-4 text-sm text-muted-foreground">Replies are limited to tickets you raised or that are linked to your company.</p>}
              {!isReadOnly && canComment && <div className={cn('space-y-3 border-t p-4', internal && 'bg-amber-50/60')}>
                <Textarea aria-label="Comment" rows={3} value={text} onChange={e => setText(e.target.value)} placeholder={internal ? 'Internal note — only admins can see this' : 'Write a reply…'} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(); }} />
                {files.length > 0 && <div className="flex flex-wrap gap-1.5">{files.map((f, i) => <Badge key={i} variant="secondary" className="gap-1">{f.name}<button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button></Badge>)}</div>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-4">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><Paperclip className="h-4 w-4" />Attach<input type="file" multiple className="sr-only" onChange={e => { setFiles(f => [...f, ...Array.from(e.target.files || [])]); e.target.value = ''; }} /></label>
                    {mode === 'admin' && <label className="inline-flex items-center gap-2 text-sm"><Checkbox checked={internal} onCheckedChange={v => setInternal(v === true)} />Internal Note</label>}
                  </div>
                  <Button disabled={busy} onClick={submit}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Add Comment</Button>
                </div>
              </div>}
            </section>
          </div>

          <aside className="space-y-4">
            {panel('Linked Items', Link2, anyLink ? <>
              {ticket.linked_po_id && linkRow('Purchase Order', links.po || 'View PO', `/purchase-orders/${ticket.linked_po_id}`)}
              {ticket.linked_rfq_id && linkRow('RFQ', ticket.linked_rfq_id, mode === 'admin' ? '/admin/rfq' : '/rfq-requests')}
              {ticket.linked_client_order_id && mode === 'admin' && linkRow('Client Order', links.order || 'View order', '/admin/po-tracker')}
              {ticket.linked_asset_id && mode === 'admin' && linkRow('Asset', links.asset || 'View asset', '/admin/assets')}
              {ticket.linked_invoice_id && linkRow('Invoice', links.invoice || 'View invoice', '/invoices')}
            </> : <p className="text-sm text-muted-foreground">Nothing linked.</p>)}
            {panel('People', User, <>{kv('Created by', ticket.created_by_name)}{kv('Assigned to', ticket.assigned_to_name || 'Unassigned')}{kv('Supplier', ticket.supplier_name)}</>)}
            {panel('Dates', Calendar, <>{kv('Created', ticketDate(ticket.created_at))}{kv('Last updated', ticketDate(ticket.updated_at))}{kv('Due', ticket.due_date ? new Date(ticket.due_date).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : null)}{kv('Resolved', ticket.resolved_at ? ticketDate(ticket.resolved_at) : null)}</>)}
            {panel('Tags', Tag, <>
              <TagInput value={tags} onChange={setTags} disabled={!canEdit} />
              {canEdit && tags.join('|') !== (ticket.tags || []).join('|') && <Button size="sm" disabled={busy} onClick={saveTags}>Save tags</Button>}
              {!canEdit && !tags.length && <p className="text-sm text-muted-foreground">No tags.</p>}
            </>)}
            {mode === 'admin' && panel('Activity Log', FileText, audit.length ? <ol className="relative space-y-3 border-l pl-4">{audit.map(a => (
              <li key={a.id} className="text-xs"><span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-card bg-primary" /><p><span className="font-semibold">{a.performed_by_name || 'System'}</span> {ticketLabel(a.action).toLowerCase()}{a.field_changed && a.old_value !== undefined && (a.old_value || a.new_value) ? <>: <span className="text-muted-foreground">{a.old_value || '—'}</span> → <span className="font-medium">{a.new_value || '—'}</span></> : null}</p><p className="text-muted-foreground">{ticketDate(a.created_at)}</p></li>
            ))}</ol> : <p className="text-sm text-muted-foreground">No activity yet.</p>)}
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
