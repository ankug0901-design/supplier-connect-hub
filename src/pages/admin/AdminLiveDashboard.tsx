import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, ChevronDown, ChevronRight, Trophy, Clock, Users } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { n8nPost } from '@/lib/n8n';

const REFRESH_MS = 60_000;

type Quote = {
  supplier_email?: string;
  supplier_company?: string;
  quoted_unit_price?: number | null;
  quoted_gst_percent?: number | null;
  status?: string | null;
  quote_source?: string | null;
  quote_received_at?: string | null;
};

type OpenRfq = {
  rfq_id: string;
  product_name?: string;
  client_name?: string;
  response_deadline?: string | null;
  closing_time?: string | null;
  deadline_at?: string | null;
  total_suppliers?: number;
  quotes_received?: number;
  cheapest_price?: number | null;
  cheapest_supplier?: string | null;
  quotes?: Quote[];
};

function pickDeadline(r: OpenRfq): Date | null {
  if (r.deadline_at) {
    const d = new Date(r.deadline_at);
    if (!isNaN(d.getTime())) return d;
  }
  if (r.response_deadline) {
    const timePart = (r.closing_time || '17:00').slice(0, 5);
    const iso = `${r.response_deadline}T${timePart}:00`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function fmtRemaining(target: Date | null, now: number): { label: string; tone: 'red' | 'orange' | 'green' | 'muted' } {
  if (!target) return { label: '—', tone: 'muted' };
  const ms = target.getTime() - now;
  if (ms <= 0) return { label: 'Closed', tone: 'red' };
  const hrs = ms / 3_600_000;
  const h = Math.floor(hrs);
  const m = Math.floor((ms - h * 3_600_000) / 60_000);
  const d = Math.floor(h / 24);
  const label = d > 0 ? `${d}d ${h % 24}h left` : `${h}h ${m}m left`;
  const tone: 'red' | 'orange' | 'green' = hrs < 2 ? 'red' : hrs < 8 ? 'orange' : 'green';
  return { label, tone };
}

const toneCls: Record<string, string> = {
  red: 'border-red-300 bg-red-50 text-red-700',
  orange: 'border-orange-300 bg-orange-50 text-orange-700',
  green: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  muted: 'border-slate-300 bg-slate-50 text-slate-600',
};

function inr(n?: number | null): string {
  if (n == null || isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function AdminLiveDashboard() {
  const [rows, setRows] = useState<OpenRfq[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState<number>(Date.now());
  const abortRef = useRef<AbortController | null>(null);

  const load = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRefreshing(true);
    try {
      const res = await n8nPost('rfq-dashboard', {});
      if (ctrl.signal.aborted) return;
      if (!res.ok) throw new Error(res.text || `HTTP ${res.status}`);
      const data = res.data;
      const list: OpenRfq[] = Array.isArray(data) ? data : (data?.rfqs || data?.rows || data?.data || []);
      setRows(list);
      setError(null);
      setLastFetched(new Date());
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setError(e?.message || 'Failed to load');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const poll = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearInterval(poll); clearInterval(tick); abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const da = pickDeadline(a)?.getTime() ?? Infinity;
      const db = pickDeadline(b)?.getTime() ?? Infinity;
      return da - db;
    });
  }, [rows]);

  return (
    <DashboardLayout title="Live Dashboard" subtitle="Real-time view of all open RFQs">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            {lastFetched ? `Last updated ${lastFetched.toLocaleTimeString()}` : 'Loading…'} · auto-refresh every 60s
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>

        {error && (
          <Card className="border-red-300 bg-red-50">
            <CardContent className="py-4 text-sm text-red-800">
              Failed to load live data: {error}. Endpoint: <span className="font-mono">{ENDPOINT}</span>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : sorted.length === 0 && !error ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">No open RFQs right now.</CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map((r) => {
              const deadline = pickDeadline(r);
              const rem = fmtRemaining(deadline, now);
              const total = Number(r.total_suppliers ?? r.quotes?.length ?? 0);
              const received = Number(r.quotes_received ?? (r.quotes || []).filter((q) => q.status === 'quote_submitted' || q.quoted_unit_price != null).length);
              const pct = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
              const cheapestPrice = r.cheapest_price ?? (() => {
                const prices = (r.quotes || []).map((q) => Number(q.quoted_unit_price)).filter((n) => !isNaN(n) && n > 0);
                return prices.length ? Math.min(...prices) : null;
              })();
              const cheapestSupplier = r.cheapest_supplier ?? (() => {
                if (cheapestPrice == null) return null;
                const hit = (r.quotes || []).find((q) => Number(q.quoted_unit_price) === cheapestPrice);
                return hit?.supplier_company || hit?.supplier_email || null;
              })();
              const isOpen = !!expanded[r.rfq_id];
              return (
                <Card key={r.rfq_id} className="overflow-hidden">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-muted-foreground">{r.rfq_id}</div>
                        <h3 className="truncate text-base font-bold">{r.product_name || 'Unnamed product'}</h3>
                        <p className="truncate text-xs text-muted-foreground">Client: {r.client_name || '—'}</p>
                      </div>
                      <Badge variant="outline" className={cn('shrink-0 border', toneCls[rem.tone])}>
                        <Clock className="mr-1 h-3 w-3" /> {rem.label}
                      </Badge>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> Response rate</span>
                        <span className="font-medium text-foreground">{received} / {total} quoted</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cn('h-full rounded-full transition-all', pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-500')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2.5">
                      <div className="flex items-center gap-2 text-xs font-medium text-emerald-800">
                        <Trophy className="h-3.5 w-3.5" /> Cheapest so far
                      </div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-emerald-900">{cheapestSupplier || '—'}</span>
                        <span className="font-mono text-sm font-bold text-emerald-900">{inr(cheapestPrice)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpanded((e) => ({ ...e, [r.rfq_id]: !isOpen }))}
                      className="flex w-full items-center justify-between rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <span className="inline-flex items-center gap-1">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        Supplier quotes ({(r.quotes || []).length})
                      </span>
                      <span className="text-muted-foreground">{isOpen ? 'Hide' : 'Show'}</span>
                    </button>

                    {isOpen && (
                      <div className="rounded-md border border-slate-200">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-2 py-1.5">Supplier</th>
                              <th className="px-2 py-1.5 text-right">Unit price</th>
                              <th className="px-2 py-1.5 text-right">GST</th>
                              <th className="px-2 py-1.5">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(r.quotes || []).length === 0 && (
                              <tr><td colSpan={4} className="px-2 py-2 text-center text-muted-foreground">No suppliers yet</td></tr>
                            )}
                            {(r.quotes || []).map((q, i) => {
                              const price = Number(q.quoted_unit_price);
                              const isCheapest = cheapestPrice != null && price === cheapestPrice;
                              return (
                                <tr key={i} className={cn('border-t', isCheapest && 'bg-emerald-50/60')}>
                                  <td className="px-2 py-1.5">
                                    <div className="truncate font-medium">{q.supplier_company || q.supplier_email || '—'}</div>
                                    {q.supplier_company && q.supplier_email && (
                                      <div className="truncate text-[10px] text-muted-foreground">{q.supplier_email}</div>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono">
                                    {q.quoted_unit_price != null ? inr(q.quoted_unit_price) : <span className="text-muted-foreground">—</span>}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono">
                                    {q.quoted_gst_percent != null ? `${q.quoted_gst_percent}%` : <span className="text-muted-foreground">—</span>}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                                      {q.status || 'pending'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
