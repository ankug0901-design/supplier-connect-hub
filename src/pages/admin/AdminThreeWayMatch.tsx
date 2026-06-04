import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import {
  Search, RefreshCw, CheckCircle2, XCircle, AlertCircle, Eye,
  TrendingUp, FileText, Receipt, Wallet, AlertTriangle, ChevronDown, ChevronRight,
  LayoutGrid, List as ListIcon,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

type InvoiceItem = {
  invoice_number?: string;
  date?: string | null;
  amount?: number | null;
  quantity?: number | null;
  status?: string | null;
  po_number?: string | null;
  payment_date?: string | null;
  payment_amount?: number | null;
  payment_reference?: string | null;
};

type Match = {
  id: string;
  so_number: string | null;
  client_name: string | null;
  supplier_name: string | null;
  supplier_company: string | null;
  po_numbers: string[] | null;
  client_invoices: InvoiceItem[] | null;
  supplier_invoices: InvoiceItem[] | null;
  client_invoice_amount: number | null;
  supplier_invoice_amount: number | null;
  client_quantity: number | null;
  supplier_quantity: number | null;
  quantity_match: boolean | null;
  client_payment_received: boolean | null;
  client_invoice_status: string | null;
  match_status: string | null;
  supplier_payment_status: string | null;
  supplier_payment_eligible: boolean | null;
  notes: string | null;
  raw_payload: any;
  updated_at: string;
};

const fmtMoney = (n: number | null | undefined) =>
  typeof n === 'number'
    ? '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
const fmtMoneyShort = (n: number | null | undefined) =>
  typeof n === 'number'
    ? '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : '—';
const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');
const fmtQty = (n: number | null | undefined) =>
  typeof n === 'number' ? n.toLocaleString('en-IN') : '—';
const daysSince = (d: string | null | undefined) => {
  if (!d) return null;
  const ms = Date.now() - new Date(d).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

function StatusBadge({ value }: { value: string | null }) {
  const v = (value || '').toLowerCase();
  if (v === 'matched') return <Badge className="bg-success/15 text-success border-success/30">Matched</Badge>;
  if (v === 'partial') return <Badge className="bg-warning/15 text-warning border-warning/30">Partial</Badge>;
  if (v === 'mismatch') return <Badge variant="destructive">Mismatch</Badge>;
  return <Badge variant="secondary">{value || 'Unmatched'}</Badge>;
}

function PayBadge({ value }: { value: string | null }) {
  const v = (value || '').toLowerCase();
  if (v === 'paid' || v === 'released') return <Badge className="bg-success/15 text-success border-success/30 capitalize">{value}</Badge>;
  if (v === 'eligible') return <Badge className="bg-primary/15 text-primary border-primary/30">Eligible</Badge>;
  if (v === 'hold' || v === 'blocked') return <Badge variant="destructive" className="capitalize">{value}</Badge>;
  return <Badge variant="secondary" className="capitalize">{value || 'Pending'}</Badge>;
}

function BoolIcon({ v }: { v: boolean | null }) {
  if (v === true) return <CheckCircle2 className="h-4 w-4 text-success inline" />;
  if (v === false) return <XCircle className="h-4 w-4 text-destructive inline" />;
  return <AlertCircle className="h-4 w-4 text-muted-foreground inline" />;
}

function PaidPill({ paid }: { paid: boolean }) {
  return paid
    ? <span className="inline-flex items-center gap-1 text-success text-xs font-medium"><CheckCircle2 className="h-3 w-3" /> Paid</span>
    : <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium"><XCircle className="h-3 w-3" /> Unpaid</span>;
}

const PAID_STATUS_WORDS = ['paid', 'closed', 'completed', 'settled', 'received'];
const isPaidInvoice = (it: any) => {
  const s = (it?.status || '').toLowerCase();
  if (PAID_STATUS_WORDS.some((w) => s.includes(w))) return true;
  if (Number(it?.payment_amount || 0) > 0) return true;
  if (it?.payment_date) return true;
  return false;
};

function InvoiceList({ items }: { items: InvoiceItem[] }) {
  if (!items?.length) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Invoice #</TableHead>
            <TableHead className="text-xs">Date</TableHead>
            <TableHead className="text-xs text-right">Qty</TableHead>
            <TableHead className="text-xs text-right">Amount</TableHead>
            <TableHead className="text-xs">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it, idx) => (
            <TableRow key={idx}>
              <TableCell className="text-xs font-medium">{it.invoice_number || '—'}</TableCell>
              <TableCell className="text-xs">{fmtDate(it.date)}</TableCell>
              <TableCell className="text-xs text-right">{fmtQty(it.quantity ?? null)}</TableCell>
              <TableCell className="text-xs text-right">{fmtMoney(it.amount ?? null)}</TableCell>
              <TableCell className="text-xs capitalize">{it.status || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function HeroStat({
  label, value, sub, icon: Icon, tone,
}: { label: string; value: string; sub?: React.ReactNode; icon: any; tone: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className={`p-4 ${tone}`}>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium opacity-80 uppercase tracking-wide">{label}</p>
              <p className="text-2xl font-bold leading-tight">{value}</p>
            </div>
            <Icon className="h-5 w-5 opacity-70" />
          </div>
          {sub && <div className="mt-2 text-xs opacity-80">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function SoCard({ r, onView }: { r: Match; onView: () => void }) {
  const [open, setOpen] = useState(false);
  const margin = (r.client_invoice_amount || 0) - (r.supplier_invoice_amount || 0);
  const balanceDue = (r.supplier_invoice_amount || 0) -
    (r.supplier_invoices || []).reduce((s, i) => s + (Number(i.payment_amount) || 0), 0);
  const clientPaidAmt = (r.client_invoices || []).reduce(
    (s, i) => s + (Number(i.payment_amount) || ((i.status || '').toLowerCase() === 'paid' ? Number(i.amount) || 0 : 0)),
    0,
  );

  // group invoices by PO
  const groups = useMemo(() => {
    const map = new Map<string, { client: InvoiceItem[]; supplier: InvoiceItem[] }>();
    const push = (po: string, side: 'client' | 'supplier', it: InvoiceItem) => {
      const key = po || '—';
      if (!map.has(key)) map.set(key, { client: [], supplier: [] });
      map.get(key)![side].push(it);
    };
    (r.client_invoices || []).forEach((i) => push(i.po_number || '—', 'client', i));
    (r.supplier_invoices || []).forEach((i) => push(i.po_number || '—', 'supplier', i));
    return Array.from(map.entries());
  }, [r]);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left hover:bg-muted/40 transition"
      >
        <div className="p-4 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {open ? <ChevronDown className="h-4 w-4 mt-1 shrink-0" /> : <ChevronRight className="h-4 w-4 mt-1 shrink-0" />}
            <div className="min-w-0">
              <div className="font-mono text-sm font-semibold">{r.so_number || '—'}</div>
              <div className="text-sm text-muted-foreground truncate">{r.client_name || '—'}</div>
              <div className="text-xs text-muted-foreground truncate">
                Vendor: <span className="font-medium text-foreground">{r.supplier_company || r.supplier_name || '—'}</span>
                {r.po_numbers?.length ? <> · PO: <span className="font-mono">{r.po_numbers.join(', ')}</span></> : null}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs md:w-[520px]">
            <div>
              <div className="text-muted-foreground">Client Inv</div>
              <div className="font-semibold">{fmtMoneyShort(r.client_invoice_amount)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Supplier</div>
              <div className="font-semibold">{fmtMoneyShort(r.supplier_invoice_amount)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Margin</div>
              <div className={`font-semibold ${margin >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtMoneyShort(margin)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Due</div>
              <div className="font-semibold">{fmtMoneyShort(balanceDue)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge value={r.match_status} />
            <PayBadge value={r.supplier_payment_status} />
            {r.supplier_payment_eligible && <Badge className="bg-primary/15 text-primary border-primary/30">Pay Eligible</Badge>}
          </div>
        </div>
      </button>
      {open && (
        <div className="border-t bg-muted/20 p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-2 rounded-md bg-background border">
              <div className="text-muted-foreground">Client Paid</div>
              <div className="font-semibold">{fmtMoney(clientPaidAmt)}</div>
            </div>
            <div className="p-2 rounded-md bg-background border">
              <div className="text-muted-foreground">Client Balance</div>
              <div className="font-semibold">{fmtMoney((r.client_invoice_amount || 0) - clientPaidAmt)}</div>
            </div>
            <div className="p-2 rounded-md bg-background border">
              <div className="text-muted-foreground">Qty Match</div>
              <div className="font-semibold"><BoolIcon v={r.quantity_match} /> {fmtQty(r.client_quantity)} / {fmtQty(r.supplier_quantity)}</div>
            </div>
            <div className="p-2 rounded-md bg-background border">
              <div className="text-muted-foreground">Updated</div>
              <div className="font-semibold">{new Date(r.updated_at).toLocaleDateString('en-IN')}</div>
            </div>
          </div>

          {groups.map(([po, g]) => {
            const cAmt = g.client.reduce((s, i) => s + (Number(i.amount) || 0), 0);
            const sAmt = g.supplier.reduce((s, i) => s + (Number(i.amount) || 0), 0);
            const gMargin = cAmt - sAmt;
            return (
              <div key={po} className="rounded-md border bg-background overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="font-semibold">📦 PO:</span>
                  <span className="font-mono">{po}</span>
                  <span className="text-muted-foreground">Client: <span className="text-foreground font-medium">{fmtMoneyShort(cAmt)}</span></span>
                  <span className="text-muted-foreground">Supplier: <span className="text-foreground font-medium">{fmtMoneyShort(sAmt)}</span></span>
                  <span className="text-muted-foreground">Margin: <span className={`font-medium ${gMargin >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtMoneyShort(gMargin)}</span></span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Side</TableHead>
                      <TableHead className="text-xs">Invoice #</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.client.map((it, idx) => (
                      <TableRow key={`c${idx}`}>
                        <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">Client</Badge></TableCell>
                        <TableCell className="text-xs font-medium">{it.invoice_number || '—'}</TableCell>
                        <TableCell className="text-xs">{fmtDate(it.date)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtQty(it.quantity ?? null)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtMoney(it.amount ?? null)}</TableCell>
                        <TableCell className="text-xs"><PaidPill paid={(it.status || '').toLowerCase() === 'paid'} /></TableCell>
                      </TableRow>
                    ))}
                    {g.supplier.map((it, idx) => (
                      <TableRow key={`s${idx}`}>
                        <TableCell className="text-xs"><Badge variant="outline" className="text-[10px] bg-muted">Supplier</Badge></TableCell>
                        <TableCell className="text-xs font-medium">{it.invoice_number || '—'}</TableCell>
                        <TableCell className="text-xs">{fmtDate(it.date)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtQty(it.quantity ?? null)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtMoney(it.amount ?? null)}</TableCell>
                        <TableCell className="text-xs"><PaidPill paid={(it.status || '').toLowerCase() === 'paid'} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          })}

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onView(); }}>
              <Eye className="h-4 w-4 mr-1" /> Full details
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function AdminThreeWayMatch() {
  const [rows, setRows] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'matched' | 'partial' | 'mismatch' | 'release'>('all');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [selected, setSelected] = useState<Match | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('three_way_matches')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1000);
    if (!error && data) {
      const invNums = new Set<string>();
      (data as any[]).forEach((r) => {
        (r.client_invoices || []).forEach((i: any) => i?.invoice_number && invNums.add(i.invoice_number));
        (r.supplier_invoices || []).forEach((i: any) => i?.invoice_number && invNums.add(i.invoice_number));
      });
      const enrichMap = new Map<string, { id?: string; date?: string | null; status?: string | null }>();
      const paidInvoiceIds = new Set<string>();
      if (invNums.size) {
        const { data: invRows } = await supabase
          .from('invoices')
          .select('id, invoice_number, date, status')
          .in('invoice_number', Array.from(invNums));
        (invRows || []).forEach((iv: any) => {
          enrichMap.set(iv.invoice_number, { id: iv.id, date: iv.date, status: iv.status });
        });
        const invoiceIds = (invRows || []).map((iv: any) => iv.id).filter(Boolean);
        if (invoiceIds.length) {
          const { data: payRows } = await supabase
            .from('payments')
            .select('invoice_id, amount, status')
            .in('invoice_id', invoiceIds);
          (payRows || []).forEach((p: any) => {
            if (p.invoice_id && Number(p.amount || 0) > 0) paidInvoiceIds.add(p.invoice_id);
          });
        }
      }
      const isPaidStatus = (s?: string | null) => (s || '').toLowerCase() === 'paid';
      const enrichItem = (i: any) => {
        if (!i?.invoice_number) return i;
        const extra = enrichMap.get(i.invoice_number);
        if (!extra) return i;
        const livePaid = isPaidStatus(extra.status) || (extra.id && paidInvoiceIds.has(extra.id));
        return {
          ...i,
          date: i.date ?? extra.date ?? null,
          status: livePaid ? 'paid' : (extra.status ?? i.status ?? null),
        };
      };
      const enriched = (data as any[]).map((r) => {
        const client_invoices = (r.client_invoices || []).map(enrichItem);
        const supplier_invoices = (r.supplier_invoices || []).map(enrichItem);

        const allClientPaid = client_invoices.length > 0 && client_invoices.every((i: any) => isPaidStatus(i.status));
        const anyClientPaid = client_invoices.some((i: any) => isPaidStatus(i.status));
        const allSupplierPaid = supplier_invoices.length > 0 && supplier_invoices.every((i: any) => isPaidStatus(i.status));

        const client_payment_received = allClientPaid;
        const client_invoice_status = allClientPaid ? 'paid' : (anyClientPaid ? 'partial' : 'unpaid');
        const supplier_payment_eligible = allClientPaid && r.quantity_match === true;
        const supplier_payment_status = allSupplierPaid
          ? 'paid'
          : supplier_payment_eligible ? 'eligible' : 'pending';

        return {
          ...r,
          client_invoices,
          supplier_invoices,
          client_payment_received,
          client_invoice_status,
          supplier_payment_eligible,
          supplier_payment_status,
        };
      });
      setRows(enriched as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    let timer: any = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => load(), 400);
    };
    const ch = supabase
      .channel('three_way_matches_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'three_way_matches' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, trigger)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, []);

  // Top-level KPIs (mirror the email report)
  const kpis = useMemo(() => {
    let clientTotal = 0, clientPaid = 0, supplierTotal = 0, supplierPaid = 0;
    rows.forEach((r) => {
      clientTotal += Number(r.client_invoice_amount || 0);
      supplierTotal += Number(r.supplier_invoice_amount || 0);
      (r.client_invoices || []).forEach((i) => {
        if ((i.status || '').toLowerCase() === 'paid') clientPaid += Number(i.amount || 0);
        else clientPaid += Number(i.payment_amount || 0);
      });
      (r.supplier_invoices || []).forEach((i) => {
        if ((i.status || '').toLowerCase() === 'paid') supplierPaid += Number(i.amount || 0);
        else supplierPaid += Number(i.payment_amount || 0);
      });
    });
    return {
      activeSOs: rows.length,
      clientTotal, clientPaid, clientBalance: clientTotal - clientPaid,
      supplierTotal, supplierPaid, supplierBalance: supplierTotal - supplierPaid,
      margin: clientTotal - supplierTotal,
    };
  }, [rows]);

  // Overdue supplier bills: client fully paid + supplier unpaid + > 45 days
  const overdue = useMemo(() => {
    const items: { r: Match; bill: InvoiceItem; days: number }[] = [];
    rows.forEach((r) => {
      if (!r.client_payment_received) return;
      (r.supplier_invoices || []).forEach((b) => {
        const isPaid = (b.status || '').toLowerCase() === 'paid';
        if (isPaid) return;
        const d = daysSince(b.date) ?? 0;
        if (d >= 45) items.push({ r, bill: b, days: d });
      });
    });
    return items;
  }, [rows]);
  const overdueTotal = overdue.reduce((s, x) => s + Number(x.bill.amount || 0), 0);

  const counts = useMemo(() => ({
    all: rows.length,
    matched: rows.filter((r) => (r.match_status || '').toLowerCase() === 'matched').length,
    partial: rows.filter((r) => (r.match_status || '').toLowerCase() === 'partial').length,
    mismatch: rows.filter((r) => (r.match_status || '').toLowerCase() === 'mismatch').length,
    release: rows.filter((r) => r.supplier_payment_eligible).length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === 'matched' && (r.match_status || '').toLowerCase() !== 'matched') return false;
      if (tab === 'partial' && (r.match_status || '').toLowerCase() !== 'partial') return false;
      if (tab === 'mismatch' && (r.match_status || '').toLowerCase() !== 'mismatch') return false;
      if (tab === 'release' && !r.supplier_payment_eligible) return false;
      if (!q) return true;
      const inv = [
        ...(r.client_invoices || []).map((i) => i.invoice_number || ''),
        ...(r.supplier_invoices || []).map((i) => i.invoice_number || ''),
      ].join(' ').toLowerCase();
      return [
        r.so_number, r.client_name, r.supplier_name, r.supplier_company,
        ...(r.po_numbers || []),
      ].some((v) => (v || '').toLowerCase().includes(q)) || inv.includes(q);
    });
  }, [rows, search, tab]);

  const tabConfig: { key: typeof tab; label: string; count: number; cls: string }[] = [
    { key: 'all', label: 'All', count: counts.all, cls: 'data-[state=active]:bg-foreground data-[state=active]:text-background' },
    { key: 'matched', label: 'Matched', count: counts.matched, cls: 'data-[state=active]:bg-success data-[state=active]:text-success-foreground' },
    { key: 'partial', label: 'Partial', count: counts.partial, cls: 'data-[state=active]:bg-warning data-[state=active]:text-warning-foreground' },
    { key: 'mismatch', label: 'Mismatch', count: counts.mismatch, cls: 'data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground' },
    { key: 'release', label: 'Payment Eligible', count: counts.release, cls: 'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground' },
  ];

  return (
    <DashboardLayout
      title="3-Way Matching"
      subtitle="Sales Order ↔ Client Invoices ↔ Supplier Invoices ↔ Payments"
      actions={
        <div className="flex items-center gap-2">
          <div className="hidden md:flex rounded-md border overflow-hidden">
            <button onClick={() => setView('cards')} className={`px-3 py-1.5 text-xs flex items-center gap-1 ${view === 'cards' ? 'bg-foreground text-background' : 'bg-background'}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </button>
            <button onClick={() => setView('table')} className={`px-3 py-1.5 text-xs flex items-center gap-1 border-l ${view === 'table' ? 'bg-foreground text-background' : 'bg-background'}`}>
              <ListIcon className="h-3.5 w-3.5" /> Table
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      }
    >
      {/* Hero KPI cards mirroring the email report */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <HeroStat
          label="Active SOs"
          value={String(kpis.activeSOs)}
          icon={FileText}
          tone="bg-muted text-foreground"
          sub={<>Across all clients & suppliers</>}
        />
        <HeroStat
          label="Client Invoice Total"
          value={fmtMoneyShort(kpis.clientTotal)}
          icon={Receipt}
          tone="bg-primary/10 text-primary"
          sub={<>Paid {fmtMoneyShort(kpis.clientPaid)} · Balance <b>{fmtMoneyShort(kpis.clientBalance)}</b></>}
        />
        <HeroStat
          label="Supplier Invoice Total"
          value={fmtMoneyShort(kpis.supplierTotal)}
          icon={Wallet}
          tone="bg-warning/10 text-warning"
          sub={<>Due <b>{fmtMoneyShort(kpis.supplierBalance)}</b></>}
        />
        <HeroStat
          label="Total Margin"
          value={fmtMoneyShort(kpis.margin)}
          icon={TrendingUp}
          tone={kpis.margin >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}
          sub={kpis.margin >= 0 ? 'Profitable ✓' : 'Loss'}
        />
      </div>

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Supplier Payments Overdue — Action Required
              <Badge variant="destructive" className="ml-1">{overdue.length} bill{overdue.length > 1 ? 's' : ''}</Badge>
              <span className="ml-auto text-sm font-semibold">Total Due: {fmtMoney(overdueTotal)}</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">45-day terms crossed · Client has fully paid</p>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-background overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">SO #</TableHead>
                    <TableHead className="text-xs">Supplier</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Supplier Inv #</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs text-right">Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdue.map((x, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-xs font-mono">{x.r.so_number}</TableCell>
                      <TableCell className="text-xs font-medium">{x.r.supplier_company || x.r.supplier_name || '—'}</TableCell>
                      <TableCell className="text-xs">{x.r.client_name || '—'}</TableCell>
                      <TableCell className="text-xs font-mono">{x.bill.invoice_number || '—'}</TableCell>
                      <TableCell className="text-xs">{fmtDate(x.bill.date)}</TableCell>
                      <TableCell className="text-xs text-right font-semibold">{fmtMoney(x.bill.amount ?? null)}</TableCell>
                      <TableCell className="text-xs text-right"><Badge variant="destructive">{x.days}d</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base">SO-wise Detail</CardTitle>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SO, PO, invoice, supplier..."
              className="pl-8 w-full md:w-80"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mb-4">
            <TabsList className="flex flex-wrap h-auto">
              {tabConfig.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className={`gap-2 ${t.cls}`}>
                  {t.label}
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] data-[state=active]:bg-background/20">
                    {t.count}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No SOs in this view. N8N workflow populates this list nightly.
            </div>
          ) : view === 'cards' ? (
            <div className="space-y-3">
              {filtered.map((r) => (
                <SoCard key={r.id} r={r} onView={() => setSelected(r)} />
              ))}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SO #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>PO(s)</TableHead>
                    <TableHead className="text-right">Client Total</TableHead>
                    <TableHead className="text-right">Sup. Total</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-center">Client Paid</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Sup. Payment</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const margin = (r.client_invoice_amount || 0) - (r.supplier_invoice_amount || 0);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono font-medium">{r.so_number || '—'}</TableCell>
                        <TableCell className="whitespace-normal break-words min-w-[180px]">{r.client_name || '—'}</TableCell>
                        <TableCell className="whitespace-normal break-words min-w-[180px]">{r.supplier_company || r.supplier_name || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{(r.po_numbers && r.po_numbers.length) ? r.po_numbers.join(', ') : '—'}</TableCell>
                        <TableCell className="text-right">{fmtMoney(r.client_invoice_amount)}</TableCell>
                        <TableCell className="text-right">{fmtMoney(r.supplier_invoice_amount)}</TableCell>
                        <TableCell className={`text-right font-medium ${margin >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtMoneyShort(margin)}</TableCell>
                        <TableCell className="text-center">
                          <div><BoolIcon v={r.quantity_match} /></div>
                          <div className="text-[10px] text-muted-foreground">{fmtQty(r.client_quantity)} / {fmtQty(r.supplier_quantity)}</div>
                        </TableCell>
                        <TableCell className="text-center"><BoolIcon v={r.client_payment_received} /></TableCell>
                        <TableCell><StatusBadge value={r.match_status} /></TableCell>
                        <TableCell><PayBadge value={r.supplier_payment_status} /></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setSelected(r)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              SO {selected?.so_number} — <StatusBadge value={selected?.match_status ?? null} />
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-md border space-y-1">
                  <div><span className="text-muted-foreground">Client:</span> <b>{selected.client_name || '—'}</b></div>
                  <div><span className="text-muted-foreground">Client total:</span> {fmtMoney(selected.client_invoice_amount)}</div>
                  <div><span className="text-muted-foreground">Client qty:</span> {fmtQty(selected.client_quantity)}</div>
                  <div><span className="text-muted-foreground">Client paid:</span> <BoolIcon v={selected.client_payment_received} /></div>
                </div>
                <div className="p-3 rounded-md border space-y-1">
                  <div><span className="text-muted-foreground">Supplier:</span> <b>{selected.supplier_company || selected.supplier_name || '—'}</b></div>
                  <div><span className="text-muted-foreground">Supplier total:</span> {fmtMoney(selected.supplier_invoice_amount)}</div>
                  <div><span className="text-muted-foreground">Supplier qty:</span> {fmtQty(selected.supplier_quantity)}</div>
                  <div><span className="text-muted-foreground">Supplier payment:</span> <PayBadge value={selected.supplier_payment_status} /></div>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2">Client Invoices</div>
                <InvoiceList items={selected.client_invoices || []} />
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2">Supplier Invoices</div>
                <InvoiceList items={selected.supplier_invoices || []} />
              </div>
              {selected.notes && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Notes</div>
                  <div className="text-sm bg-muted/40 p-3 rounded-md whitespace-pre-wrap">{selected.notes}</div>
                </div>
              )}
              {selected.raw_payload && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Raw payload from N8N</summary>
                  <pre className="bg-muted/40 p-3 rounded-md mt-2 overflow-x-auto">{JSON.stringify(selected.raw_payload, null, 2)}</pre>
                </details>
              )}
              <div className="text-xs text-muted-foreground text-right">
                Last updated: {new Date(selected.updated_at).toLocaleString('en-IN')}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
