import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, FileQuestion, Loader2, TrendingUp, Clock, CheckCircle2, ArrowRight, Eye,
  Package, ReceiptText, Wallet, Truck, UserPlus, AlertCircle, IndianRupee, Activity,
  Sparkles,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

type Row = Record<string, string | number | boolean | null | undefined>;

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function fmtINR(n: number) {
  if (!n) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

export default function AdminDashboard() {
  const [rfqRows, setRfqRows] = useState<Row[]>([]);
  const [pos, setPos] = useState<Row[]>([]);
  const [invoices, setInvoices] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [registrations, setRegistrations] = useState<Row[]>([]);
  const [challans, setChallans] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
      supabase.from('rfq_portal_requests').select('*').order('created_at', { ascending: false }).limit(2000),
      supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('suppliers').select('*').limit(5000),
      supabase.from('supplier_registrations').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('delivery_challans').select('*').order('created_at', { ascending: false }).limit(500),
    ]);
    setRfqRows(r1.data || []);
    setPos(r2.data || []);
    setInvoices(r3.data || []);
    setPayments(r4.data || []);
    setSuppliers(r5.data || []);
    setRegistrations(r6.data || []);
    setChallans(r7.data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin_dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rfq_portal_requests' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const companyByEmail = useMemo(() => {
    const map: Record<string, string> = {};
    suppliers.forEach((s) => {
      const k = String(s.email || '').trim().toLowerCase();
      if (k && s.company) map[k] = s.company;
    });
    return map;
  }, [suppliers]);

  const supplierById = useMemo(() => {
    const m: Record<string, Row> = {};
    suppliers.forEach((s) => { m[String(s.id)] = s; });
    return m;
  }, [suppliers]);

  const kpis = useMemo(() => {
    const now = Date.now();
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    // RFQ groups
    const groups = new Map<string, Row[]>();
    rfqRows.forEach((r) => {
      if (!groups.has(r.rfq_id)) groups.set(r.rfq_id, []);
      groups.get(r.rfq_id)!.push(r);
    });
    let activeRfqs = 0;
    let pendingAction = 0;
    groups.forEach((items) => {
      const first = items[0];
      const deadlinePassed = first.response_deadline
        ? new Date(`${String(first.response_deadline).slice(0, 10)}T17:00:00+05:30`).getTime() < now
        : false;
      const closed = !!first.rfq_closed_at || deadlinePassed;
      const hasOpen = items.some((r) => ['pending', 'quote_submitted'].includes(r.status));
      const decided = items.some((r) => ['accepted', 'rejected'].includes(r.status));
      if (hasOpen && !closed && !decided) activeRfqs++;
      const allQuoted = items.length > 0 && items.every((r) => r.status === 'quote_submitted');
      if (allQuoted && !decided) pendingAction++;
    });

    const poValueMonth = pos
      .filter((p) => {
        if (['rejected', 'cancelled', 'void'].includes(String(p.status))) return false;
        const d = p.date ? new Date(p.date) : null;
        return d && d >= monthStart;
      })
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const openPOs = pos.filter((p) => !['completed', 'closed', 'cancelled', 'rejected', 'void'].includes(String(p.status))).length;

    const invoicesPending = invoices.filter((i) => String(i.status) === 'pending').length;
    const invoiceValuePending = invoices
      .filter((i) => String(i.status) === 'pending')
      .reduce((s, i) => s + Number(i.amount || 0), 0);

    const paidThisMonth = payments
      .filter((p) => ['paid', 'completed'].includes(String(p.status)) && new Date(p.date || p.created_at) >= monthStart)
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    const pendingRegistrations = registrations.filter((r) => String(r.status) === 'pending').length;
    const shipmentsInTransit = challans.filter((c) => !['delivered', 'cancelled'].includes(String(c.manifest_status))).length;

    const decidedThisWeek = rfqRows.filter((r) => r.decided_at && new Date(r.decided_at) >= weekAgo).length;

    return {
      activeRfqs, pendingAction, decidedThisWeek,
      totalSuppliers: suppliers.length,
      pendingRegistrations,
      openPOs, poValueMonth,
      invoicesPending, invoiceValuePending,
      paidThisMonth,
      shipmentsInTransit,
    };
  }, [rfqRows, pos, invoices, payments, suppliers, registrations, challans]);

  const recentRfq = useMemo(() => {
    const seen = new Set<string>();
    const list: { rfq_id: string; items: Row[] }[] = [];
    for (const r of rfqRows) {
      if (seen.has(r.rfq_id)) continue;
      seen.add(r.rfq_id);
      list.push({ rfq_id: r.rfq_id, items: rfqRows.filter((x) => x.rfq_id === r.rfq_id) });
      if (list.length >= 6) break;
    }
    return list;
  }, [rfqRows]);

  const recentPOs = useMemo(() => pos.slice(0, 5), [pos]);
  const recentInvoices = useMemo(() => invoices.slice(0, 5), [invoices]);
  const recentPayments = useMemo(() => payments.slice(0, 5), [payments]);

  const topSuppliers = useMemo(() => {
    const counts = new Map<string, number>();
    rfqRows.forEach((r) => {
      if (r.status === 'quote_submitted' || r.status === 'accepted') {
        counts.set(r.supplier_email, (counts.get(r.supplier_email) || 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([email, count]) => ({
        email,
        company: companyByEmail[String(email).trim().toLowerCase()] || email,
        count,
      }));
  }, [rfqRows, companyByEmail]);

  return (
    <DashboardLayout title="Admin Dashboard" subtitle="Procurement command centre">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Hero KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="PO Value (This Month)"
              value={fmtINR(kpis.poValueMonth)}
              hint={`${kpis.openPOs} open POs`}
              icon={<Package className="h-5 w-5" />}
              accent="from-primary/15 to-primary/0"
              iconClass="bg-primary/10 text-primary"
            />
            <KpiCard
              label="Pending Invoices"
              value={String(kpis.invoicesPending)}
              hint={fmtINR(kpis.invoiceValuePending) + ' awaiting'}
              icon={<ReceiptText className="h-5 w-5" />}
              accent="from-orange-500/15 to-orange-500/0"
              iconClass="bg-orange-500/10 text-orange-600"
            />
            <KpiCard
              label="Paid (This Month)"
              value={fmtINR(kpis.paidThisMonth)}
              hint="Across all suppliers"
              icon={<Wallet className="h-5 w-5" />}
              accent="from-emerald-500/15 to-emerald-500/0"
              iconClass="bg-emerald-500/10 text-emerald-600"
            />
            <KpiCard
              label="Active Suppliers"
              value={String(kpis.totalSuppliers)}
              hint={`${kpis.pendingRegistrations} pending approval`}
              icon={<Users className="h-5 w-5" />}
              accent="from-blue-500/15 to-blue-500/0"
              iconClass="bg-blue-500/10 text-blue-600"
            />
          </div>

          {/* Secondary KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MiniStat label="Active RFQs" value={kpis.activeRfqs} icon={<FileQuestion className="h-4 w-4" />} />
            <MiniStat label="Quotes Pending Review" value={kpis.pendingAction} icon={<AlertCircle className="h-4 w-4" />} tone="orange" />
            <MiniStat label="Shipments In Transit" value={kpis.shipmentsInTransit} icon={<Truck className="h-4 w-4" />} tone="blue" />
            <MiniStat label="Decisions This Week" value={kpis.decidedThisWeek} icon={<CheckCircle2 className="h-4 w-4" />} tone="green" />
          </div>

          {/* Two-column: Recent POs + Recent Invoices */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-primary/10 p-1.5 text-primary"><Package className="h-4 w-4" /></div>
                  <CardTitle className="text-base">Recent Purchase Orders</CardTitle>
                </div>
                <Link to="/purchase-orders"><Button variant="ghost" size="sm">View all <ArrowRight className="ml-1 h-3 w-3" /></Button></Link>
              </CardHeader>
              <CardContent className="pt-0">
                {recentPOs.length === 0 ? (
                  <EmptyRow text="No purchase orders yet" />
                ) : (
                  <ul className="divide-y">
                    {recentPOs.map((p) => (
                      <li key={p.id} className="flex items-center justify-between py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.po_number}</p>
                          <p className="truncate text-xs text-muted-foreground">{supplierById[p.supplier_id]?.company || '—'} · {fmtDate(p.date)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold">{fmtINR(Number(p.amount || 0))}</span>
                          <StatusPill status={p.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-orange-500/10 p-1.5 text-orange-600"><ReceiptText className="h-4 w-4" /></div>
                  <CardTitle className="text-base">Recent Invoices</CardTitle>
                </div>
                <Link to="/invoices"><Button variant="ghost" size="sm">View all <ArrowRight className="ml-1 h-3 w-3" /></Button></Link>
              </CardHeader>
              <CardContent className="pt-0">
                {recentInvoices.length === 0 ? (
                  <EmptyRow text="No invoices yet" />
                ) : (
                  <ul className="divide-y">
                    {recentInvoices.map((i) => (
                      <li key={i.id} className="flex items-center justify-between py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{i.invoice_number}</p>
                          <p className="truncate text-xs text-muted-foreground">{supplierById[i.supplier_id]?.company || '—'} · {fmtDate(i.date)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold">{fmtINR(Number(i.amount || 0))}</span>
                          <StatusPill status={i.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Payments + Recent RFQ Activity */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-primary/10 p-1.5 text-primary"><Activity className="h-4 w-4" /></div>
                  <CardTitle className="text-base">Recent RFQ Activity</CardTitle>
                </div>
                <Link to="/admin/rfq"><Button variant="ghost" size="sm">View all <ArrowRight className="ml-1 h-3 w-3" /></Button></Link>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-2 font-medium">RFQ</th>
                        <th className="py-2 pr-2 font-medium">Product</th>
                        <th className="py-2 pr-2 font-medium">Quoted</th>
                        <th className="py-2 pr-2 font-medium">Deadline</th>
                        <th className="py-2 pr-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRfq.length === 0 && (
                        <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No RFQs yet</td></tr>
                      )}
                      {recentRfq.map(({ rfq_id, items }) => {
                        const first = items[0];
                        const quoted = items.filter((r) => ['quote_submitted', 'accepted'].includes(r.status)).length;
                        const decided = items.some((r) => ['accepted', 'rejected'].includes(r.status));
                        const closed = !!first.rfq_closed_at;
                        const status = decided ? 'Decided' : closed ? 'Closed' : quoted >= items.length ? 'Ready' : quoted > 0 ? 'Partial' : 'Awaiting';
                        return (
                          <tr key={rfq_id} className="border-b last:border-0">
                            <td className="py-3 pr-2 font-mono text-xs">{rfq_id}</td>
                            <td className="py-3 pr-2 max-w-[200px] truncate">{first.product_name}</td>
                            <td className="py-3 pr-2">{quoted}/{items.length}</td>
                            <td className="py-3 pr-2">{fmtDate(first.response_deadline)}</td>
                            <td className="py-3 pr-2"><StatusPill status={status} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-600"><IndianRupee className="h-4 w-4" /></div>
                  <CardTitle className="text-base">Recent Payments</CardTitle>
                </div>
                <Link to="/payments"><Button variant="ghost" size="sm">All</Button></Link>
              </CardHeader>
              <CardContent className="pt-0">
                {recentPayments.length === 0 ? (
                  <EmptyRow text="No payments yet" />
                ) : (
                  <ul className="divide-y">
                    {recentPayments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{fmtINR(Number(p.amount || 0))}</p>
                          <p className="truncate text-xs text-muted-foreground">{p.transaction_id || '—'} · {fmtDate(p.date)}</p>
                        </div>
                        <StatusPill status={p.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top suppliers + Quick actions */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-blue-500/10 p-1.5 text-blue-600"><TrendingUp className="h-4 w-4" /></div>
                  <CardTitle className="text-base">Top Suppliers by Engagement</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {topSuppliers.length === 0 ? (
                  <EmptyRow text="No quotes submitted yet" />
                ) : (
                  <ul className="divide-y">
                    {topSuppliers.map((s, i) => (
                      <li key={s.email} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{s.company}</p>
                            <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                          </div>
                        </div>
                        <Badge variant="secondary">{s.count} quotes</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <QuickAction to="/admin/suppliers" icon={<Users className="h-5 w-5" />} title="Manage Suppliers" desc="View & edit details" />
              <QuickAction to="/admin/registrations" icon={<UserPlus className="h-5 w-5" />} title="Review Registrations" desc={`${kpis.pendingRegistrations} pending`} highlight={kpis.pendingRegistrations > 0} />
              <QuickAction to="/admin/rfq" icon={<FileQuestion className="h-5 w-5" />} title="RFQ Workspace" desc={`${kpis.pendingAction} need action`} highlight={kpis.pendingAction > 0} />
              <QuickAction to="/admin/ai-insights" icon={<Sparkles className="h-5 w-5" />} title="AI Insights" desc="Validate, score & forecast" />
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function KpiCard({ label, value, hint, icon, accent, iconClass }: { label: string; value: string; hint?: string; icon: React.ReactNode; accent: string; iconClass: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent}`} />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className={`rounded-lg p-2 ${iconClass}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone?: 'orange' | 'blue' | 'green' }) {
  const toneClass =
    tone === 'orange' ? 'text-orange-600 bg-orange-500/10' :
    tone === 'blue' ? 'text-blue-600 bg-blue-500/10' :
    tone === 'green' ? 'text-green-600 bg-green-500/10' :
    'text-primary bg-primary/10';
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-md p-2 ${toneClass}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status?: string }) {
  const s = String(status || 'pending').toLowerCase();
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    awaiting: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    partial: 'bg-amber-100 text-amber-800 border-amber-200',
    quote_submitted: 'bg-blue-100 text-blue-800 border-blue-200',
    ready: 'bg-blue-100 text-blue-800 border-blue-200',
    accepted: 'bg-green-100 text-green-800 border-green-200',
    paid: 'bg-green-100 text-green-800 border-green-200',
    completed: 'bg-green-100 text-green-800 border-green-200',
    decided: 'bg-green-100 text-green-800 border-green-200',
    delivered: 'bg-green-100 text-green-800 border-green-200',
    closed: 'bg-muted text-foreground/70 border-border',
    rejected: 'bg-red-100 text-red-800 border-red-200',
    cancelled: 'bg-red-100 text-red-800 border-red-200',
  };
  const cls = map[s] || 'bg-muted text-foreground/70 border-border';
  const label = s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function EmptyRow({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function QuickAction({ to, icon, title, desc, highlight }: { to: string; icon: React.ReactNode; title: string; desc: string; highlight?: boolean }) {
  return (
    <Link to={to}>
      <Card className={`group cursor-pointer transition-all hover:shadow-md hover:border-primary/50 ${highlight ? 'border-primary/40' : ''}`}>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
            <div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </CardContent>
      </Card>
    </Link>
  );
}
