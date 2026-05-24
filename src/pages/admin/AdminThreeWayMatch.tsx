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

type Match = {
  id: string;
  client_invoice_number: string | null;
  client_invoice_date: string | null;
  client_invoice_amount: number | null;
  client_name: string | null;
  client_invoice_status: string | null;
  supplier_invoice_number: string | null;
  supplier_invoice_date: string | null;
  supplier_invoice_amount: number | null;
  supplier_name: string | null;
  supplier_company: string | null;
  po_number: string | null;
  client_quantity: number | null;
  supplier_quantity: number | null;
  quantity_match: boolean | null;
  amount_match: boolean | null;
  client_payment_received: boolean | null;
  client_payment_date: string | null;
  client_payment_amount: number | null;
  client_payment_reference: string | null;
  supplier_payment_status: string | null;
  supplier_payment_eligible: boolean | null;
  match_status: string | null;
  notes: string | null;
  raw_payload: any;
  matched_at: string | null;
  updated_at: string;
};

const fmtMoney = (n: number | null | undefined) =>
  typeof n === 'number'
    ? '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

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
    if (!error && data) setRows(data as any);
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
      return [
        r.client_invoice_number, r.supplier_invoice_number, r.po_number,
        r.client_name, r.supplier_name, r.supplier_company,
      ].some((v) => (v || '').toLowerCase().includes(q));
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
      subtitle="Client invoices ↔ Supplier invoices ↔ Client payments (from N8N workflow)"
      actions={
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Total Records', value: stats.total, tone: 'bg-muted' },
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
          <CardTitle className="text-base">Matched Records</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search invoice, PO, supplier..."
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
                  <TableHead>Client Invoice</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Client Amt</TableHead>
                  <TableHead>Supplier Invoice</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Sup. Amt</TableHead>
                  <TableHead>PO</TableHead>
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
                    No matching records yet. N8N workflow will populate this list.
                  </TableCell></TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.client_invoice_number || '—'}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(r.client_invoice_date)}</div>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">{r.client_name || '—'}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.client_invoice_amount)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.supplier_invoice_number || '—'}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(r.supplier_invoice_date)}</div>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">{r.supplier_company || r.supplier_name || '—'}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.supplier_invoice_amount)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.po_number || '—'}</TableCell>
                    <TableCell className="text-center"><BoolIcon v={r.quantity_match} /></TableCell>
                    <TableCell className="text-center"><BoolIcon v={r.amount_match} /></TableCell>
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Match Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Client Invoice</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs">
                    <div><span className="text-muted-foreground">Number:</span> <b>{selected.client_invoice_number || '—'}</b></div>
                    <div><span className="text-muted-foreground">Date:</span> {fmtDate(selected.client_invoice_date)}</div>
                    <div><span className="text-muted-foreground">Amount:</span> {fmtMoney(selected.client_invoice_amount)}</div>
                    <div><span className="text-muted-foreground">Client:</span> {selected.client_name || '—'}</div>
                    <div><span className="text-muted-foreground">Qty:</span> {selected.client_quantity ?? '—'}</div>
                    <div><span className="text-muted-foreground">Status:</span> {selected.client_invoice_status || '—'}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Supplier Invoice</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs">
                    <div><span className="text-muted-foreground">Number:</span> <b>{selected.supplier_invoice_number || '—'}</b></div>
                    <div><span className="text-muted-foreground">Date:</span> {fmtDate(selected.supplier_invoice_date)}</div>
                    <div><span className="text-muted-foreground">Amount:</span> {fmtMoney(selected.supplier_invoice_amount)}</div>
                    <div><span className="text-muted-foreground">Supplier:</span> {selected.supplier_company || selected.supplier_name || '—'}</div>
                    <div><span className="text-muted-foreground">Qty:</span> {selected.supplier_quantity ?? '—'}</div>
                    <div><span className="text-muted-foreground">PO:</span> {selected.po_number || '—'}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Client Payment</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs">
                    <div><span className="text-muted-foreground">Received:</span> <BoolIcon v={selected.client_payment_received} /></div>
                    <div><span className="text-muted-foreground">Date:</span> {fmtDate(selected.client_payment_date)}</div>
                    <div><span className="text-muted-foreground">Amount:</span> {fmtMoney(selected.client_payment_amount)}</div>
                    <div><span className="text-muted-foreground">Reference:</span> {selected.client_payment_reference || '—'}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Supplier Payment</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs">
                    <div><span className="text-muted-foreground">Status:</span> <PayBadge value={selected.supplier_payment_status} /></div>
                    <div><span className="text-muted-foreground">Eligible:</span> <BoolIcon v={selected.supplier_payment_eligible} /></div>
                    <div><span className="text-muted-foreground">Match:</span> <StatusBadge value={selected.match_status} /></div>
                    <div><span className="text-muted-foreground">Qty Match:</span> <BoolIcon v={selected.quantity_match} /> &nbsp; <span className="text-muted-foreground">Amt Match:</span> <BoolIcon v={selected.amount_match} /></div>
                  </CardContent>
                </Card>
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
