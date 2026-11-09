import { useEffect, useState } from 'react';
import { Loader2, Paperclip, X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SUPPLIER_TICKET_TYPES, TICKET_PRIORITIES, TICKET_TYPES, ticketLabel } from '@/lib/ticketRules';
import { Option, Ticket, TicketInput, createTicket, errorMessage, loadAdmins, loadSuppliers, uploadTicketFiles } from '@/lib/tickets';
import { SearchSelect } from './SearchSelect';
import { TagInput } from './TagInput';

export interface TicketDefaults extends Partial<TicketInput> { labels?: { po?: string; rfq?: string; invoice?: string; supplier?: string } }

const db = supabase as any;
const blank = (mode: 'admin' | 'supplier', d?: TicketDefaults): TicketInput => ({
  subject: '', description: '', ticket_type: mode === 'supplier' ? 'query' : 'issue', priority: 'medium', tags: [],
  linked_po_id: null, linked_rfq_id: null, linked_client_order_id: null, linked_invoice_id: null, supplier_id: null, assigned_to: null, due_date: null,
  ...d,
});

export function CreateTicketSheet({ open, onOpenChange, defaults, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; defaults?: TicketDefaults; onCreated?: (t: Ticket) => void }) {
  const { isAdmin, user, supplier } = useAuth();
  const mode = isAdmin ? 'admin' : 'supplier';
  const [form, setForm] = useState<TicketInput>(() => blank(mode, defaults));
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [opts, setOpts] = useState<{ pos: Option[]; rfqs: Option[]; orders: Option[]; suppliers: Option[]; admins: Option[] }>({ pos: [], rfqs: [], orders: [], suppliers: [], admins: [] });
  const [optError, setOptError] = useState('');

  useEffect(() => { if (open) { const { labels, ...rest } = defaults || {}; setForm(blank(mode, rest)); setFiles([]); } }, [open]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const [po, rfq, orders, suppliers, admins] = await Promise.all([
          db.from('purchase_orders').select('id, po_number, supplier_id').order('date', { ascending: false }).limit(1000),
          db.from('rfq_portal_requests').select('rfq_id, supplier_id, product_name').order('created_at', { ascending: false }).limit(1000),
          isAdmin ? db.from('client_orders').select('id, order_number, client_name').order('created_at', { ascending: false }).limit(1000) : { data: [] },
          isAdmin ? loadSuppliers() : [],
          isAdmin ? loadAdmins() : [],
        ]);
        const err = po.error || rfq.error || orders.error; if (err) throw err;
        const seen = new Set<string>();
        const rfqs = (rfq.data || []).filter((r: any) => !seen.has(r.rfq_id) && seen.add(r.rfq_id)).map((r: any) => ({ value: r.rfq_id, label: r.rfq_id, sub: r.product_name, supplierId: r.supplier_id }));
        if (alive) setOpts({ pos: (po.data || []).map((p: any) => ({ value: p.id, label: p.po_number, supplierId: p.supplier_id })), rfqs, orders: (orders.data || []).map((o: any) => ({ value: o.id, label: o.order_number, sub: o.client_name })), suppliers, admins });
      } catch (e) { if (alive) setOptError(errorMessage(e)); }
    })();
    return () => { alive = false; };
  }, [open, isAdmin]);

  const set = (patch: Partial<TicketInput>) => setForm(f => ({ ...f, ...patch }));
  const types = mode === 'supplier' ? SUPPLIER_TICKET_TYPES : TICKET_TYPES;

  async function save() {
    if (!form.subject.trim()) { toast.error('Subject is required.'); return; }
    if (!user) { toast.error('Please sign in again.'); return; }
    setSaving(true);
    try {
      const attachments = files.length ? await uploadTicketFiles(files) : [];
      const sup = mode === 'supplier' ? { id: supplier?.id ?? null, name: supplier?.company ?? null } : { id: form.supplier_id ?? null, name: opts.suppliers.find(s => s.value === form.supplier_id)?.label ?? defaults?.labels?.supplier ?? null };
      const admin = opts.admins.find(a => a.value === form.assigned_to);
      const input: TicketInput = {
        ...form, subject: form.subject.trim(), description: form.description?.trim() || null, attachments,
        supplier_id: sup.id, supplier_name: sup.name, linked_supplier_id: sup.id,
        assigned_to: mode === 'admin' ? form.assigned_to ?? null : null, assigned_to_name: mode === 'admin' ? admin?.label ?? null : null,
        due_date: form.due_date ? new Date(`${form.due_date}T23:59:00`).toISOString() : null,
        linked_client_order_id: mode === 'admin' ? form.linked_client_order_id ?? null : null,
      };
      const t = await createTicket(input, { id: user.id, name: supplier?.name || user.email || (mode === 'admin' ? 'Admin' : 'Supplier'), role: mode });
      toast.success(`Ticket ${t.ticket_number} created`);
      onOpenChange(false); onCreated?.(t);
    } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  }

  const field = (label: string, el: React.ReactNode, req = false) => <div className="space-y-1.5"><Label>{label}{req && <span className="text-destructive"> *</span>}</Label>{el}</div>;
  return (
    <Sheet open={open} onOpenChange={o => !saving && onOpenChange(o)}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b bg-gradient-primary p-6 text-primary-foreground">
          <SheetTitle className="text-primary-foreground">Create Ticket</SheetTitle>
          <SheetDescription className="text-primary-foreground/80">Raise an issue or query for the team to track.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {optError && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Some lists could not load: {optError}</p>}
          {field('Subject', <Input value={form.subject} maxLength={200} onChange={e => set({ subject: e.target.value })} placeholder="Short summary of the issue" />, true)}
          {field('Description', <Textarea rows={5} value={form.description || ''} onChange={e => set({ description: e.target.value })} placeholder="Describe the issue, steps taken and what you need…" />)}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('Ticket Type', <Select value={form.ticket_type} onValueChange={v => set({ ticket_type: v })}><SelectTrigger aria-label="Ticket type"><SelectValue /></SelectTrigger><SelectContent>{types.map(t => <SelectItem key={t} value={t}>{ticketLabel(t)}</SelectItem>)}</SelectContent></Select>)}
            {field('Priority', <Select value={form.priority} onValueChange={v => set({ priority: v })}><SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger><SelectContent>{TICKET_PRIORITIES.map(t => <SelectItem key={t} value={t}>{ticketLabel(t)}</SelectItem>)}</SelectContent></Select>)}
          </div>
          {field('Link to PO', <SearchSelect label="Purchase order" placeholder="Optional" options={opts.pos} value={form.linked_po_id ?? null} fallbackLabel={defaults?.labels?.po} onChange={(v, o) => set({ linked_po_id: v, ...(mode === 'admin' && o?.supplierId && !form.supplier_id ? { supplier_id: o.supplierId } : {}) })} />)}
          {field('Link to RFQ', <SearchSelect label="RFQ" placeholder="Optional" options={opts.rfqs} value={form.linked_rfq_id ?? null} fallbackLabel={defaults?.labels?.rfq} onChange={(v, o) => set({ linked_rfq_id: v, ...(mode === 'admin' && o?.supplierId && !form.supplier_id ? { supplier_id: o.supplierId } : {}) })} />)}
          {defaults?.linked_invoice_id && field('Linked Invoice', <Input disabled value={defaults.labels?.invoice || defaults.linked_invoice_id} />)}
          {mode === 'admin' && <>
            {field('Link to Client Order', <SearchSelect label="Client order" placeholder="Optional" options={opts.orders} value={form.linked_client_order_id ?? null} onChange={v => set({ linked_client_order_id: v })} />)}
            <div className="grid gap-4 sm:grid-cols-2">
              {field('Supplier', <SearchSelect label="Supplier" placeholder="Optional" options={opts.suppliers} value={form.supplier_id ?? null} fallbackLabel={defaults?.labels?.supplier} onChange={v => set({ supplier_id: v })} />)}
              {field('Assigned To', <SearchSelect label="Assignee" placeholder="Unassigned" options={opts.admins} value={form.assigned_to ?? null} onChange={v => set({ assigned_to: v })} />)}
            </div>
          </>}
          {field('Due Date', <Input type="date" value={form.due_date?.slice(0, 10) || ''} onChange={e => set({ due_date: e.target.value || null })} />)}
          {field('Tags', <TagInput value={form.tags || []} onChange={tags => set({ tags })} />)}
          {field('Attachments', <div className="space-y-2">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground hover:bg-muted/50"><Paperclip className="h-4 w-4" />Add files<input type="file" multiple className="sr-only" onChange={e => { setFiles(f => [...f, ...Array.from(e.target.files || [])]); e.target.value = ''; }} /></label>
            {files.map((f, i) => <div key={i} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5 text-sm"><span className="truncate">{f.name}</span><Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button></div>)}
          </div>)}
        </div>
        <SheetFooter className="border-t p-4">
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving} onClick={save}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Ticket</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
