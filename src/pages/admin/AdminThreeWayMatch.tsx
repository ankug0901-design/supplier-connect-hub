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
import { Search, RefreshCw, CheckCircle2, XCircle, AlertCircle, Eye } from 'lucide-react';
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
const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');
const fmtQty = (n: number | null | undefined) =>
  typeof n === 'number' ? n.toLocaleString('en-IN') : '—';

function StatusBadge({ value }: { value: string | null }) {
  const v = (value || '').toLowerCase();
  if (v === 'matched') return <Badge className="bg-success/15 text-success border-success/30">Matched</Badge>;
  if (v === 'partial') return <Badge className="bg-warning/15 text-warning border-warning/30">Partial</Badge>;
  if (v === 'mismatch') return <Badge variant="destructive">Mismatch</Badge>;
  return <Badge variant="secondary">{value || 'Unmatched'}</Badge>;
}

function PayBadge({ value }: { value: string | null }) {
  const v = (value || '').toLowerCase();
  if (v === 'paid' || v === 'released') return <Badge className="bg-success/15 text-success border-success/30">{value}</Badge>;
  if (v === 'eligible') return <Badge className="bg-primary/15 text-primary border-primary/30">Eligible</Badge>;
  if (v === 'hold' || v === 'blocked') return <Badge variant="destructive">{value}</Badge>;
  return <Badge variant="secondary">{value || 'Pending'}</Badge>;
}

function BoolIcon({ v }: { v: boolean | null }) {
  if (v === true) return <CheckCircle2 className="h-4 w-4 text-success inline" />;
  if (v === false) return <XCircle className="h-4 w-4 text-destructive inline" />;
  return <AlertCircle className="h-4 w-4 text-muted-foreground inline" />;
}

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

export default function AdminThreeWayMatch() {
  const [rows, setRows] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'matched' | 'partial' | 'mismatch' | 'release'>('all');
  const [selected, setSelected] = useState<Match | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('three_way_matches')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1000);
    if (!error && data) {
      // Collect all invoice numbers to enrich missing date/status from invoices table
      const invNums = new Set<string>();
      (data as any[]).forEach((r) => {
        (r.client_invoices || []).forEach((i: any) => i?.invoice_number && invNums.add(i.invoice_number));
        (r.supplier_invoices || []).forEach((i: any) => i?.invoice_number && invNums.add(i.invoice_number));
      });
      const enrichMap = new Map<string, { date?: string | null; status?: string | null }>();
      if (invNums.size) {
        const { data: invRows } = await supabase
          .from('invoices')
          .select('invoice_number, date, status')
          .in('invoice_number', Array.from(invNums));
        (invRows || []).forEach((iv: any) => {
          enrichMap.set(iv.invoice_number, { date: iv.date, status: iv.status });
        });
      }
      const enrichItem = (i: any) => {
        if (!i?.invoice_number) return i;
        const extra = enrichMap.get(i.invoice_number);
        if (!extra) return i;
        return {
          ...i,
          date: i.date ?? extra.date ?? null,
          status: i.status ?? extra.status ?? null,
        };
      };
      const enriched = (data as any[]).map((r) => ({
        ...r,
        client_invoices: (r.client_invoices || []).map(enrichItem),
        supplier_invoices: (r.supplier_invoices || []).map(enrichItem),
      }));
      setRows(enriched as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('three_way_matches_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'three_way_matches' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

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

  const stats = useMemo(() => ({
    total: rows.length,
    matched: rows.filter((r) => (r.match_status || '').toLowerCase() === 'matched').length,
    partial: rows.filter((r) => (r.match_status || '').toLowerCase() === 'partial').length,
    mismatch: rows.filter((r) => (r.match_status || '').toLowerCase() === 'mismatch').length,
    release: rows.filter((r) => r.supplier_payment_eligible).length,
  }), [rows]);

  return (
    <DashboardLayout
      title="3-Way Matching"
      subtitle="Sales Order ↔ Client Invoices ↔ Supplier Invoices ↔ Payments (from N8N workflow)"
      actions={
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Total SOs', value: stats.total, tone: 'bg-muted' },
          { label: 'Matched', value: stats.matched, tone: 'bg-success/10 text-success' },
          { label: 'Partial', value: stats.partial, tone: 'bg-warning/10 text-warning' },
          { label: 'Mismatch', value: stats.mismatch, tone: 'bg-destructive/10 text-destructive' },
          { label: 'Payment Eligible', value: stats.release, tone: 'bg-primary/10 text-primary' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className={`p-4 rounded-lg ${s.tone}`}>
              <p className="text-xs font-medium opacity-80">{s.label}</p>
              <p className="text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base">Sales Orders</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SO, PO, invoice, supplier..."
                className="pl-8 w-72"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mb-4">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="matched">Matched</TabsTrigger>
              <TabsTrigger value="partial">Partial</TabsTrigger>
              <TabsTrigger value="mismatch">Mismatch</TabsTrigger>
              <TabsTrigger value="release">Payment Eligible</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SO #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>PO(s)</TableHead>
                  <TableHead className="text-center">Client Inv</TableHead>
                  <TableHead className="text-right">Client Total</TableHead>
                  <TableHead className="text-center">Sup. Inv</TableHead>
                  <TableHead className="text-right">Sup. Total</TableHead>
                  <TableHead className="text-center">Qty Match</TableHead>
                  <TableHead className="text-center">Client Paid</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Sup. Payment</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                    No matched SOs yet. N8N workflow will populate this list.
                  </TableCell></TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono font-medium">{r.so_number || '—'}</TableCell>
                    <TableCell className="whitespace-normal break-words min-w-[180px]">{r.client_name || '—'}</TableCell>
                    <TableCell className="whitespace-normal break-words min-w-[180px]">{r.supplier_company || r.supplier_name || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {(r.po_numbers && r.po_numbers.length) ? r.po_numbers.join(', ') : '—'}
                    </TableCell>
                    <TableCell className="text-center">{r.client_invoices?.length ?? 0}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.client_invoice_amount)}</TableCell>
                    <TableCell className="text-center">{r.supplier_invoices?.length ?? 0}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.supplier_invoice_amount)}</TableCell>
                    <TableCell className="text-center">
                      <div><BoolIcon v={r.quantity_match} /></div>
                      <div className="text-[10px] text-muted-foreground">
                        {fmtQty(r.client_quantity)} / {fmtQty(r.supplier_quantity)}
                      </div>
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
                ))}
              </TableBody>
            </Table>
          </div>
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
