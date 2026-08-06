import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, Search, Copy, ChevronDown, ChevronRight, Package, Truck,
  AlertTriangle, PackageCheck, Factory, Inbox, RefreshCw, CalendarIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { poTrackerRpc } from '@/lib/poTracker';

type Any = any;

const unwrap = (res: Any) => {
  let d = res?.data;
  if (Array.isArray(d) && d.length > 0 && !d[0]?.po_number && !d[0]?.order_number) {
    d = d[0];
  }
  return d;
};

function asArray(v: Any): Any[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    for (const k of ['rows', 'orders', 'data', 'items', 'purchase_orders', 'pos', 'results']) {
      if (Array.isArray(v[k])) return v[k];
    }
  }
  return [];
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString('en-IN');
}

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const fmtINR = (n: Any) => `₹${INR.format(Number(n) || 0)}`;

const todayStr = () => new Date().toISOString().slice(0, 10);

const isOverdue = (o: Any) =>
  !!o?.expected_delivery &&
  String(o.expected_delivery).slice(0, 10) < todayStr() &&
  !['delivered', 'cancelled'].includes(String(o?.overall_status || ''));

const STATUS_META: Record<string, { label: string; cls: string }> = {
  order_received: { label: 'Order Received', cls: 'bg-muted text-muted-foreground border-border' },
  material_sourced: { label: 'Material Sourced', cls: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  in_production: { label: 'In Production', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  dispatched: { label: 'Dispatched', cls: 'bg-purple-500/10 text-purple-600 border-purple-500/30' },
  delivered: { label: 'Delivered', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  cancelled: { label: 'Cancelled', cls: 'bg-muted text-muted-foreground border-border' },
};

function StatusBadge({ order }: { order: Any }) {
  if (isOverdue(order)) {
    return (
      <Badge variant="outline" className="animate-pulse border-destructive/40 bg-destructive/10 text-destructive">
        <AlertTriangle className="mr-1 h-3 w-3" /> Overdue
      </Badge>
    );
  }
  const key = String(order?.overall_status || 'order_received');
  const meta = STATUS_META[key] || { label: key.replace(/_/g, ' '), cls: 'bg-muted text-muted-foreground border-border' };
  return <Badge variant="outline" className={cn('capitalize', meta.cls)}>{meta.label}</Badge>;
}

function copy(text: string) {
  navigator.clipboard.writeText(text);
  toast.success('Copied to clipboard');
}

function KpiCard({ label, value, icon: Icon, gradient, danger }: Any) {
  return (
    <Card className={cn('overflow-hidden border-0 shadow-sm', danger ? 'bg-gradient-to-br from-destructive to-destructive/70' : gradient)}>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/80">{label}</p>
          <p className="mt-1 text-3xl font-bold text-white">{value}</p>
        </div>
        <div className="rounded-xl bg-white/15 p-3">
          <Icon className="h-6 w-6 text-white" />
        </div>
      </CardContent>
    </Card>
  );
}

const FILTERS = ['All', 'In Production', 'Dispatched', 'Delivered', 'Overdue'] as const;
type Filter = typeof FILTERS[number];

export default function AdminPoTracker() {
  const [orders, setOrders] = useState<Any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Any>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await poTrackerRpc({ action: 'list_orders' });
      setOrders(asArray(data));
    } catch (e: any) {
      toast.error('Failed to load client orders');
      setOrders([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const kpis = useMemo(() => {
    const active = orders.filter((o) => !['delivered', 'cancelled'].includes(String(o.overall_status))).length;
    const prod = orders.filter((o) => o.overall_status === 'in_production').length;
    const disp = orders.filter((o) => o.overall_status === 'dispatched').length;
    const over = orders.filter(isOverdue).length;
    return { active, prod, disp, over };
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === 'In Production' && o.overall_status !== 'in_production') return false;
      if (filter === 'Dispatched' && o.overall_status !== 'dispatched') return false;
      if (filter === 'Delivered' && o.overall_status !== 'delivered') return false;
      if (filter === 'Overdue' && !isOverdue(o)) return false;
      if (!q) return true;
      return (
        String(o.order_number || '').toLowerCase().includes(q) ||
        String(o.client_name || '').toLowerCase().includes(q)
      );
    });
  }, [orders, filter, search]);

  const toggleRow = async (row: Any) => {
    const id = String(row.id);
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!details[id]) {
      setDetailLoading(id);
      try {
        const data = await poTrackerRpc({ action: 'get_detail', order_id: row.id });
        const d = Array.isArray(data) ? data[0] : (data?.data ?? data);
        setDetails((p) => ({ ...p, [id]: d }));
      } catch {
        toast.error('Failed to load order detail');
      }
      setDetailLoading(null);
    }
  };

  return (
    <DashboardLayout
      title="PO Production Tracker"
      subtitle="Track client orders through production, dispatch and delivery."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
          </Button>
          <Button onClick={() => setDrawerOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create Client Order
          </Button>
        </div>
      }
    >
      <div className="space-y-6">


        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Active Orders" value={kpis.active} icon={Package} gradient="bg-gradient-to-br from-primary to-primary/70" />
          <KpiCard label="In Production" value={kpis.prod} icon={Factory} gradient="bg-gradient-to-br from-amber-500 to-amber-400" />
          <KpiCard label="Dispatched" value={kpis.disp} icon={Truck} gradient="bg-gradient-to-br from-purple-600 to-purple-400" />
          <KpiCard label="Overdue" value={kpis.over} icon={AlertTriangle} danger={kpis.over > 0} gradient="bg-gradient-to-br from-slate-600 to-slate-400" />
        </div>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      filter === f ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order # or client…" className="pl-9" />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="w-8 py-2" />
                    <th className="py-2 pr-4">Order #</th>
                    <th className="py-2 pr-4">Client</th>
                    <th className="py-2 pr-4">POs</th>
                    <th className="py-2 pr-4">Supplier(s)</th>
                    <th className="py-2 pr-4">Due Date</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    </td></tr>
                  )}
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">
                      <Inbox className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      No client orders found.
                    </td></tr>
                  )}
                  {!loading && filtered.map((o) => {
                    const id = String(o.id);
                    const pos = asArray(o.purchase_orders);
                    const suppliers = Array.from(new Set(pos.map((p: Any) => p.supplier_name).filter(Boolean)));
                    const open = expanded === id;
                    return (
                      <Fragment key={id}>
                        <tr className={cn('cursor-pointer border-b transition-colors hover:bg-muted/40', open && 'bg-muted/30')} onClick={() => toggleRow(o)}>
                          <td className="py-3">
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </td>
                          <td className="py-3 pr-4 font-medium">{o.order_number || '—'}</td>
                          <td className="py-3 pr-4">{o.client_name || '—'}</td>
                          <td className="py-3 pr-4">{pos.length}</td>
                          <td className="py-3 pr-4 max-w-[240px] truncate text-muted-foreground">{suppliers.join(', ') || '—'}</td>
                          <td className="py-3 pr-4">{fmtDate(o.expected_delivery)}</td>
                          <td className="py-3 pr-4"><StatusBadge order={o} /></td>
                        </tr>
                        {open && (
                          <tr className="border-b bg-muted/20">
                            <td colSpan={7} className="p-4">
                              {detailLoading === id ? (
                                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
                              ) : (
                                <OrderDetail detail={details[id] || o} order={o} />
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <CreateOrderDrawer open={drawerOpen} onOpenChange={setDrawerOpen} onCreated={load} />
    </DashboardLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function OrderDetail({ detail, order }: { detail: Any; order: Any }) {
  const d = detail || {};
  const trackingUrl = d.tracking_url || order?.tracking_url;
  const pos = asArray(d.purchase_orders?.length ? d.purchase_orders : order?.purchase_orders);
  const updates = asArray(d.production_updates);
  const dispatch = d.dispatch || d.dispatch_info;
  const proofs = asArray(d.delivery_proof_urls || d.delivery_proofs);

  return (
    <div className="space-y-6">
      {trackingUrl && (
        <Section title="Tracking URL">
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background px-3 py-2 text-xs">{trackingUrl}</code>
            <Button size="sm" variant="outline" onClick={() => copy(trackingUrl)}><Copy className="h-4 w-4" /></Button>
          </div>
        </Section>
      )}

      <Section title={`Linked Purchase Orders (${pos.length})`}>
        {pos.length === 0 ? <p className="text-sm text-muted-foreground">No linked POs.</p> : (
          <div className="space-y-3">
            {pos.map((p: Any, i: number) => (
              <div key={p.id || i} className="rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{p.po_number || '—'}</div>
                  <div className="text-sm text-muted-foreground">{p.supplier_name || '—'}</div>
                  <div className="text-sm">{fmtINR(p.amount ?? p.total)}</div>
                  <div className="text-sm text-muted-foreground">Due {fmtDate(p.expected_delivery)}</div>
                </div>
                {asArray(p.items).length > 0 && (
                  <div className="mt-3 space-y-2">
                    {asArray(p.items).map((it: Any, j: number) => (
                      <div key={it.id || j} className="rounded-md bg-muted/40 p-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">{it.item_name || it.name || '—'}</span>
                          <span className="text-muted-foreground">Qty {it.quantity ?? '—'}</span>
                          {it.current_stage && (
                            <Badge variant="outline" className="capitalize">{String(it.current_stage).replace(/_/g, ' ')}</Badge>
                          )}
                        </div>
                        {asArray(it.production_stages).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {asArray(it.production_stages).map((s: Any, k: number) => {
                              const name = typeof s === 'string' ? s : (s.stage || s.name || '');
                              const done = typeof s === 'object' && (s.completed || s.status === 'completed' || !!s.completed_at);
                              return (
                                <span key={k} className={cn(
                                  'rounded-full border px-2 py-0.5 text-[11px] capitalize',
                                  done ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : 'border-border text-muted-foreground'
                                )}>
                                  {String(name).replace(/_/g, ' ')}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {updates.length > 0 && (
        <Section title="Production Updates">
          <div className="space-y-3 border-l-2 border-border pl-4">
            {updates.map((u: Any, i: number) => (
              <div key={u.id || i} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium capitalize">{String(u.stage || u.title || 'Update').replace(/_/g, ' ')}</span>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(u.created_at || u.updated_at)}</span>
                </div>
                {u.notes && <p className="text-sm text-muted-foreground">{u.notes}</p>}
                {asArray(u.media_urls).length > 0 && (
                  <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {asArray(u.media_urls).map((m: string, k: number) => (
                      <a key={k} href={m} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border">
                        <img src={m} alt={`Production update photo ${k + 1}`} loading="lazy" className="h-20 w-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {dispatch && (
        <Section title="Dispatch">
          <div className="grid gap-3 rounded-lg border bg-background p-3 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Vehicle</p>{dispatch.vehicle_number || '—'}</div>
            <div><p className="text-xs text-muted-foreground">Transporter</p>{dispatch.transporter || '—'}</div>
            <div><p className="text-xs text-muted-foreground">LR Number</p>{dispatch.lr_number || '—'}</div>
          </div>
        </Section>
      )}

      {proofs.length > 0 && (
        <Section title="Delivery Proof">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {proofs.map((m: Any, k: number) => {
              const url = typeof m === 'string' ? m : m.url;
              return (
                <a key={k} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border">
                  <img src={url} alt={`Delivery proof ${k + 1}`} loading="lazy" className="h-20 w-full object-cover" />
                </a>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

function CreateOrderDrawer({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientPoRef, setClientPoRef] = useState('');
  const [expected, setExpected] = useState<Date | undefined>();
  const [notes, setNotes] = useState('');
  const [notifyClient, setNotifyClient] = useState(true);
  const [notifySuppliers, setNotifySuppliers] = useState(true);
  const [pos, setPos] = useState<Any[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  const [poSearch, setPoSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPosLoading(true);
    n8nPost('po-tracker', { action: 'list_pos', unlinked_only: true }).then((res) => {
      setPos(res.ok ? asArray(unwrap(res) ?? res.data) : []);
      if (!res.ok) toast.error('Failed to load purchase orders');
      setPosLoading(false);
    });
  }, [open]);

  const reset = () => {
    setClientName(''); setClientEmail(''); setClientPhone(''); setClientPoRef('');
    setExpected(undefined); setNotes(''); setSelected([]); setPoSearch('');
    setNotifyClient(true); setNotifySuppliers(true);
  };

  const filteredPos = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    if (!q) return pos;
    return pos.filter((p) =>
      String(p.po_number || '').toLowerCase().includes(q) ||
      String(p.supplier_name || '').toLowerCase().includes(q)
    );
  }, [pos, poSearch]);

  const submit = async () => {
    if (!clientName.trim()) { toast.error('Client name is required'); return; }
    setSaving(true);
    const res = await n8nPost('po-tracker', {
      action: 'create_client_order',
      client_name: clientName.trim(),
      client_email: clientEmail.trim() || null,
      client_phone: clientPhone.trim() || null,
      client_po_reference: clientPoRef.trim() || null,
      expected_delivery: expected ? format(expected, 'yyyy-MM-dd') : null,
      notes: notes.trim() || null,
      purchase_order_ids: selected,
      notify_client: notifyClient,
      notify_suppliers: notifySuppliers,
    });
    setSaving(false);
    if (!res.ok) { toast.error('Failed to create client order'); return; }
    const out = unwrap(res) || {};
    const url = out.tracking_url;
    if (url) {
      toast.success('Client order created', {
        description: url,
        action: { label: 'Copy link', onClick: () => copy(url) },
        duration: 10000,
      });
    } else {
      toast.success('Client order created');
    }
    reset();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Create Client Order</SheetTitle>
          <SheetDescription>Link purchase orders and generate a client tracking link.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Client name *</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Acme Foods Pvt Ltd" />
            </div>
            <div className="space-y-1.5">
              <Label>Client email</Label>
              <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="orders@acme.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Client phone</Label>
              <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+91…" />
            </div>
            <div className="space-y-1.5">
              <Label>Client PO reference</Label>
              <Input value={clientPoRef} onChange={(e) => setClientPoRef(e.target.value)} placeholder="PO-2026-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Expected delivery</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !expected && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {expected ? format(expected, 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={expected} onSelect={setExpected} initialFocus className={cn('p-3 pointer-events-auto')} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Any special instructions…" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Link Purchase Orders {selected.length > 0 && <span className="text-muted-foreground">({selected.length} selected)</span>}</Label>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={poSearch} onChange={(e) => setPoSearch(e.target.value)} placeholder="Search PO # or supplier…" className="pl-9" />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
              {posLoading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>}
              {!posLoading && filteredPos.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No unlinked purchase orders.</p>
              )}
              {!posLoading && filteredPos.map((p: Any) => {
                const id = String(p.id ?? p.po_id ?? p.po_number);
                const checked = selected.includes(id);
                return (
                  <label key={id} className={cn('flex cursor-pointer items-center gap-3 rounded-md p-2 transition-colors hover:bg-muted', checked && 'bg-primary/5')}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => setSelected((prev) => (v ? [...prev, id] : prev.filter((x) => x !== id)))}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{p.po_number || '—'}</span>
                        <span className="text-sm">{fmtINR(p.amount ?? p.total)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{p.supplier_name || '—'}</span>
                        <span>{fmtDate(p.expected_delivery)}</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="notify-client" className="font-normal">Notify client by email</Label>
              <Switch id="notify-client" checked={notifyClient} onCheckedChange={setNotifyClient} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notify-suppliers" className="font-normal">Notify suppliers by email</Label>
              <Switch id="notify-suppliers" checked={notifySuppliers} onCheckedChange={setNotifySuppliers} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pb-6">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}
              Create Order
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
