import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  balance?: number | null;
  balance_due?: number | null;
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

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const getN8nStatus = (r: Pick<Match, 'raw_payload' | 'match_status'>): string => {
  const s = r.raw_payload?.status;
  if (typeof s === 'string' && s.trim()) return s.trim();
  return r.match_status || '';
};

const MATCHED_STATUSES = new Set(['Fully Settled', 'Awaiting 45 Days', 'Release to Supplier', 'Client Payment Due']);
const PARTIAL_STATUSES = new Set(['Both Unpaid', 'Partial', 'Awaiting Supplier Bill']);

const N8N_TONE: Record<string, string> = {
  'Fully Settled': 'bg-success/15 text-success border-success/30',
  'Release to Supplier': 'bg-primary/15 text-primary border-primary/30',
  'Awaiting 45 Days': 'bg-warning/15 text-warning border-warning/30',
  'Client Payment Due': 'bg-warning/15 text-warning border-warning/30',
  'Awaiting Supplier Bill': 'bg-muted text-muted-foreground border-border',
  'Partial': 'bg-warning/15 text-warning border-warning/30',
  'Both Unpaid': 'bg-destructive/15 text-destructive border-destructive/30',
};

function N8nStatusBadge({ value }: { value: string | null }) {
  if (!value) return <Badge variant="secondary">Unknown</Badge>;
  const cls = N8N_TONE[value] || 'bg-muted text-muted-foreground border-border';
  return <Badge className={cls}>{value}</Badge>;
}

// Legacy badge kept for the Dialog header that still uses match_status text.
function StatusBadge({ value }: { value: string | null }) {
  const v = (value || '').toLowerCase();
  if (v === 'matched') return <Badge className="bg-success/15 text-success border-success/30">Matched</Badge>;
  if (v === 'partial') return <Badge className="bg-warning/15 text-warning border-warning/30">Partial</Badge>;
  if (v === 'mismatch') return <Badge variant="destructive">Mismatch</Badge>;
  return <Badge variant="secondary">{value || 'Unmatched'}</Badge>;
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

const PAID_STATUS_WORDS = ['paid', 'closed', 'completed', 'settled', 'received', 'yes'];
const isPaidInvoice = (it: any) => {
  const s = (it?.status || '').toLowerCase().trim();
  if (PAID_STATUS_WORDS.includes(s)) return true;
  if (PAID_STATUS_WORDS.some((w) => s.includes(w))) return true;
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
  label, value, sub, icon: Icon, tone, onClick, active,
}: { label: string; value: string; sub?: React.ReactNode; icon: any; tone: string; onClick?: () => void; active?: boolean }) {
  const clickable = !!onClick;
  return (
    <Card
      className={`overflow-hidden ${clickable ? 'cursor-pointer transition hover:shadow-md hover:-translate-y-0.5' : ''} ${active ? 'ring-2 ring-primary' : ''}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
    >
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

  const clientInvoices = r.client_invoices || [];
  const supplierInvoices = r.supplier_invoices || [];

  const clientTotal = clientInvoices.reduce((s, i) => s + num(i.amount), 0);
  const supplierTotal = supplierInvoices.reduce((s, i) => s + num(i.amount), 0);
  const balanceDue = supplierInvoices.reduce((s, i) => s + num(i.balance_due ?? i.balance), 0);

  const clientPaidAmt = clientInvoices
    .filter((i) => isPaidInvoice(i))
    .reduce((s, i) => s + num(i.payment_amount), 0);
  const clientBalance = clientInvoices.reduce((s, i) => s + num(i.balance ?? 0), 0);

  const n8nStatus = getN8nStatus(r);
  const clientLabel = r.client_name || 'Client';
  const supplierLabel = r.supplier_company || r.supplier_name || 'Supplier';

  // group supplier invoices by po
  const supplierGroups = useMemo(() => {
    const map = new Map<string, InvoiceItem[]>();
    supplierInvoices.forEach((i) => {
      const key = i.po_number || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    });
    return Array.from(map.entries());
  }, [supplierInvoices]);

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
              <div className="text-sm text-muted-foreground truncate">{clientLabel}</div>
              <div className="text-xs text-muted-foreground truncate">
                Vendor: <span className="font-medium text-foreground">{supplierLabel}</span>
                {r.po_numbers?.length ? <> · PO: <span className="font-mono">{r.po_numbers.join(', ')}</span></> : null}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs md:w-[420px]">
            <div>
              <div className="text-muted-foreground">Client Inv</div>
              <div className="font-semibold">{fmtMoneyShort(clientTotal)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Supplier</div>
              <div className="font-semibold">{fmtMoneyShort(supplierTotal)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Due</div>
              <div className="font-semibold">{fmtMoneyShort(balanceDue)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <N8nStatusBadge value={n8nStatus} />
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
              <div className="font-semibold">{fmtMoney(clientBalance)}</div>
            </div>
            <div className="p-2 rounded-md bg-background border">
              <div className="text-muted-foreground">Supplier Due</div>
              <div className="font-semibold">{fmtMoney(balanceDue)}</div>
            </div>
            <div className="p-2 rounded-md bg-background border">
              <div className="text-muted-foreground">Updated</div>
              <div className="font-semibold">{new Date(r.updated_at).toLocaleDateString('en-IN')}</div>
            </div>
          </div>

          {clientInvoices.length > 0 && (
            <div className="rounded-md border bg-background overflow-hidden">
              <div className="px-3 py-2 bg-muted/50 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="font-semibold">🧾 Client Invoices</span>
                <span className="text-muted-foreground">Total: <span className="text-foreground font-medium">{fmtMoneyShort(clientTotal)}</span></span>
                <span className="text-muted-foreground">Paid: <span className="text-foreground font-medium">{fmtMoneyShort(clientPaidAmt)}</span></span>
                <span className="text-muted-foreground">Balance: <span className="text-foreground font-medium">{fmtMoneyShort(clientBalance)}</span></span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Invoice #</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs text-right">Balance</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientInvoices.map((it, idx) => (
                    <TableRow key={`c${idx}`}>
                      <TableCell className="text-xs font-medium">{it.invoice_number || '—'}</TableCell>
                      <TableCell className="text-xs">{fmtDate(it.date)}</TableCell>
                      <TableCell className="text-xs text-right">{fmtMoney(num(it.amount))}</TableCell>
                      <TableCell className="text-xs text-right">{fmtMoney(num(it.balance))}</TableCell>
                      <TableCell className="text-xs"><PaidPill paid={isPaidInvoice(it)} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {supplierGroups.map(([po, items]) => {
            const sAmt = items.reduce((s, i) => s + num(i.amount), 0);
            const sDue = items.reduce((s, i) => s + num(i.balance_due ?? i.balance), 0);
            return (
              <div key={po} className="rounded-md border bg-background overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="font-semibold">📦 Supplier PO:</span>
                  <span className="font-mono">{po}</span>
                  <span className="text-muted-foreground">Total: <span className="text-foreground font-medium">{fmtMoneyShort(sAmt)}</span></span>
                  <span className="text-muted-foreground">Due: <span className="text-foreground font-medium">{fmtMoneyShort(sDue)}</span></span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Invoice #</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs text-right">Balance Due</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it, idx) => (
                      <TableRow key={`s${idx}`}>
                        <TableCell className="text-xs font-medium">{it.invoice_number || '—'}</TableCell>
                        <TableCell className="text-xs">{fmtDate(it.date)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtMoney(num(it.amount))}</TableCell>
                        <TableCell className="text-xs text-right">{fmtMoney(num(it.balance_due ?? it.balance))}</TableCell>
                        <TableCell className="text-xs"><PaidPill paid={isPaidInvoice(it)} /></TableCell>
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
  const [searchParams] = useSearchParams();
  const initialTab = (() => {
    const t = (searchParams.get('tab') || searchParams.get('filter') || '').toLowerCase();
    if (t === 'exception' || t === 'exceptions' || t === 'mismatch') return 'mismatch' as const;
    if (t === 'matched' || t === 'partial' || t === 'release' || t === 'all') return t as any;
    return 'all' as const;
  })();
  const [tab, setTab] = useState<'all' | 'matched' | 'partial' | 'mismatch' | 'release'>(initialTab);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [selected, setSelected] = useState<Match | null>(null);
  const loadInFlightRef = useRef(false);
  const pendingReloadRef = useRef(false);
  const mountedRef = useRef(true);

  const load = useCallback(async ({ showSpinner = false }: { showSpinner?: boolean } = {}) => {
    if (loadInFlightRef.current) {
      pendingReloadRef.current = true;
      return;
    }

    loadInFlightRef.current = true;
    if (showSpinner) setLoading(true);
    const { data, error } = await supabase
      .from('three_way_matches')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1000);

    if (error) {
      console.warn('3-way match refresh failed', error);
    } else if (data) {
      const invNums = new Set<string>();
      (data as any[]).forEach((r) => {
        (r.client_invoices || []).forEach((i: any) => i?.invoice_number && invNums.add(i.invoice_number));
        (r.supplier_invoices || []).forEach((i: any) => i?.invoice_number && invNums.add(i.invoice_number));
      });
      const enrichMap = new Map<string, { id?: string; date?: string | null; status?: string | null; payment_date?: string | null }>();
      const paidInvoiceIds = new Map<string, { amount: number; date?: string | null }>();
      if (invNums.size) {
        const { data: invRows } = await supabase
          .from('invoices')
          .select('id, invoice_number, date, status, payment_date')
          .in('invoice_number', Array.from(invNums));
        (invRows || []).forEach((iv: any) => {
          enrichMap.set(iv.invoice_number, { id: iv.id, date: iv.date, status: iv.status, payment_date: iv.payment_date });
        });
        const invoiceIds = (invRows || []).map((iv: any) => iv.id).filter(Boolean);
        if (invoiceIds.length) {
          const { data: payRows } = await supabase
            .from('payments')
            .select('invoice_id, amount, status, date')
            .in('invoice_id', invoiceIds);
          (payRows || []).forEach((p: any) => {
            if (!p.invoice_id) return;
            const prev = paidInvoiceIds.get(p.invoice_id) || { amount: 0, date: null as string | null };
            paidInvoiceIds.set(p.invoice_id, {
              amount: prev.amount + Number(p.amount || 0),
              date: prev.date || p.date || null,
            });
          });
        }
      }
      const enrichItem = (i: any) => {
        if (!i?.invoice_number) return i;
        const extra = enrichMap.get(i.invoice_number);
        const pay = extra?.id ? paidInvoiceIds.get(extra.id) : undefined;
        const livePaid =
          PAID_STATUS_WORDS.some((w) => (extra?.status || '').toLowerCase().includes(w)) ||
          (pay && pay.amount > 0);
        const merged = {
          ...i,
          date: i.date ?? extra?.date ?? null,
          payment_date: i.payment_date ?? pay?.date ?? extra?.payment_date ?? null,
          payment_amount: Number(i.payment_amount || 0) || Number(pay?.amount || 0),
          status: livePaid ? 'paid' : (extra?.status ?? i.status ?? null),
        };
        return merged;
      };
      const enriched = (data as any[]).map((r) => {
        const client_invoices = (r.client_invoices || []).map(enrichItem);
        const supplier_invoices = (r.supplier_invoices || []).map(enrichItem);

        const allClientPaid = client_invoices.length > 0 && client_invoices.every((i: any) => isPaidInvoice(i));
        const anyClientPaid = client_invoices.some((i: any) => isPaidInvoice(i));
        const allSupplierPaid = supplier_invoices.length > 0 && supplier_invoices.every((i: any) => isPaidInvoice(i));

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
      if (mountedRef.current) setRows(enriched as any);
    }

    loadInFlightRef.current = false;
    if (mountedRef.current && showSpinner) setLoading(false);
    if (pendingReloadRef.current && mountedRef.current) {
      pendingReloadRef.current = false;
      window.setTimeout(() => load({ showSpinner: false }), 250);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load({ showSpinner: true });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poller = window.setInterval(() => load({ showSpinner: false }), 60_000);
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => load({ showSpinner: false }), 1200);
    };
    const ch = supabase
      .channel('three_way_matches_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'three_way_matches' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, trigger)
      .subscribe();
    return () => {
      mountedRef.current = false;
      if (timer) clearTimeout(timer);
      window.clearInterval(poller);
      supabase.removeChannel(ch);
    };
  }, [load]);

  // Top-level KPIs computed from JSONB arrays
  const kpis = useMemo(() => {
    let clientTotal = 0, clientPaid = 0, clientBalance = 0;
    let supplierTotal = 0, supplierBalance = 0;
    rows.forEach((r) => {
      (r.client_invoices || []).forEach((i) => {
        clientTotal += num(i.amount);
        clientBalance += num(i.balance);
        if (isPaidInvoice(i)) clientPaid += num(i.payment_amount);
      });
      (r.supplier_invoices || []).forEach((i) => {
        supplierTotal += num(i.amount);
        supplierBalance += num(i.balance_due ?? i.balance);
      });
    });
    return {
      activeSOs: rows.length,
      clientTotal, clientPaid, clientBalance,
      supplierTotal, supplierBalance,
    };
  }, [rows]);

  // Overdue supplier bills: unpaid + balance_due > 0 + 45+ days
  const overdue = useMemo(() => {
    const items: { r: Match; bill: InvoiceItem; days: number }[] = [];
    rows.forEach((r) => {
      (r.supplier_invoices || []).forEach((b) => {
        if (isPaidInvoice(b)) return;
        if (num(b.balance_due ?? b.balance) <= 0) return;
        const d = daysSince(b.date) ?? 0;
        if (d >= 45) items.push({ r, bill: b, days: d });
      });
    });
    return items;
  }, [rows]);
  const overdueTotal = overdue.reduce((s, x) => s + num(x.bill.balance_due ?? x.bill.balance ?? x.bill.amount), 0);

  const counts = useMemo(() => {
    const byStatus = (pred: (s: string) => boolean) =>
      rows.filter((r) => pred(getN8nStatus(r))).length;
    return {
      all: rows.length,
      matched: byStatus((s) => MATCHED_STATUSES.has(s)),
      partial: byStatus((s) => PARTIAL_STATUSES.has(s)),
      mismatch: 0,
      release: byStatus((s) => s === 'Release to Supplier'),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const s = getN8nStatus(r);
      if (tab === 'matched' && !MATCHED_STATUSES.has(s)) return false;
      if (tab === 'partial' && !PARTIAL_STATUSES.has(s)) return false;
      if (tab === 'mismatch') return false;
      if (tab === 'release' && s !== 'Release to Supplier') return false;
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
          <Button variant="outline" size="sm" onClick={() => load({ showSpinner: true })} disabled={loading}>
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
          active={tab === 'all'}
          onClick={() => setTab('all')}
        />
        <HeroStat
          label="Client Invoice Total"
          value={fmtMoneyShort(kpis.clientTotal)}
          icon={Receipt}
          tone="bg-primary/10 text-primary"
          sub={<>Paid {fmtMoneyShort(kpis.clientPaid)} · Balance <b>{fmtMoneyShort(kpis.clientBalance)}</b></>}
          active={tab === 'matched'}
          onClick={() => setTab('matched')}
        />
        <HeroStat
          label="Supplier Invoice Total"
          value={fmtMoneyShort(kpis.supplierTotal)}
          icon={Wallet}
          tone="bg-warning/10 text-warning"
          sub={<>Due <b>{fmtMoneyShort(kpis.supplierBalance)}</b></>}
          active={tab === 'partial'}
          onClick={() => setTab('partial')}
        />
        <HeroStat
          label="Payment Eligible"
          value={String(counts.release)}
          icon={TrendingUp}
          tone="bg-success/10 text-success"
          sub={<>Ready to release to suppliers</>}
          active={tab === 'release'}
          onClick={() => setTab('release')}
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
            <p className="text-xs text-muted-foreground">45-day terms crossed · Balance due to supplier</p>

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
                      <TableCell className="text-xs text-right font-semibold">{fmtMoney(num(x.bill.balance_due ?? x.bill.balance ?? x.bill.amount))}</TableCell>
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
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-center">Client Paid</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Sup. Payment</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono font-medium">{r.so_number || '—'}</TableCell>
                        <TableCell className="whitespace-normal break-words min-w-[180px]">{r.client_name || '—'}</TableCell>
                        <TableCell className="whitespace-normal break-words min-w-[180px]">{r.supplier_company || r.supplier_name || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{(r.po_numbers && r.po_numbers.length) ? r.po_numbers.join(', ') : '—'}</TableCell>
                        <TableCell className="text-right">{fmtMoney(r.client_invoice_amount)}</TableCell>
                        <TableCell className="text-right">{fmtMoney(r.supplier_invoice_amount)}</TableCell>
                        <TableCell className="text-center">
                          <div><BoolIcon v={r.quantity_match} /></div>
                          <div className="text-[10px] text-muted-foreground">{fmtQty(r.client_quantity)} / {fmtQty(r.supplier_quantity)}</div>
                        </TableCell>
                        <TableCell className="text-center"><BoolIcon v={r.client_payment_received} /></TableCell>
                        <TableCell><N8nStatusBadge value={getN8nStatus(r)} /></TableCell>
                        <TableCell><N8nStatusBadge value={getN8nStatus(r)} /></TableCell>
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
                  <div><span className="text-muted-foreground">Supplier payment:</span> <N8nStatusBadge value={getN8nStatus(selected)} /></div>
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
