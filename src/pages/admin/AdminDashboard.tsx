import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, FileQuestion, Loader2, TrendingUp, Clock, CheckCircle2, ArrowRight, Eye } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

type Row = any;

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export default function AdminDashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [companyByEmail, setCompanyByEmail] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [{ data: rfqs }, { data: sups }] = await Promise.all([
      supabase.from('rfq_portal_requests').select('*').order('created_at', { ascending: false }).limit(2000),
      supabase.from('suppliers').select('email,company').limit(5000),
    ]);
    const map: Record<string, string> = {};
    (sups || []).forEach((s: any) => {
      const k = String(s.email || '').trim().toLowerCase();
      if (k && s.company) map[k] = s.company;
    });
    setCompanyByEmail(map);
    setRows(rfqs || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin_dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rfq_portal_requests' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const now = Date.now();

    // Group by rfq_id
    const groups = new Map<string, Row[]>();
    rows.forEach((r) => {
      if (!groups.has(r.rfq_id)) groups.set(r.rfq_id, []);
      groups.get(r.rfq_id)!.push(r);
    });

    let activeRfqs = 0;
    let awaitingQuotes = 0;
    let pendingAction = 0;
    groups.forEach((items) => {
      const first = items[0];
      const deadlinePassed = first.response_deadline
        ? new Date(`${String(first.response_deadline).slice(0, 10)}T17:00:00+05:30`).getTime() < now
        : false;
      const closed = !!first.rfq_closed_at || deadlinePassed;
      const hasOpenRows = items.some((r) => ['pending', 'quote_submitted'].includes(r.status));
      const decided = items.some((r) => ['accepted', 'rejected'].includes(r.status));
      if (hasOpenRows && !closed && !decided) activeRfqs++;
      const allQuoted = items.every((r) => r.status === 'quote_submitted');
      if (allQuoted && !decided) pendingAction++;
    });

    rows.forEach((r) => {
      const deadlinePassed = r.response_deadline
        ? new Date(`${String(r.response_deadline).slice(0, 10)}T17:00:00+05:30`).getTime() < now
        : false;
      if (r.status === 'pending' && !deadlinePassed) awaitingQuotes++;
    });

    const quotesToday = rows.filter((r) => r.quote_submitted_at && String(r.quote_submitted_at).slice(0, 10) === todayStr).length;
    const decidedThisWeek = rows.filter((r) => r.decided_at && new Date(r.decided_at) >= weekAgo).length;

    return { activeRfqs, quotesToday, awaitingQuotes, decidedThisWeek, pendingAction };
  }, [rows]);

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const list: { rfq_id: string; items: Row[] }[] = [];
    for (const r of rows) {
      if (seen.has(r.rfq_id)) continue;
      seen.add(r.rfq_id);
      list.push({ rfq_id: r.rfq_id, items: rows.filter((x) => x.rfq_id === r.rfq_id) });
      if (list.length >= 10) break;
    }
    return list;
  }, [rows]);

  const topSuppliers = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => {
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
  }, [rows, companyByEmail]);

  const pendingActionList = useMemo(() => {
    const groups = new Map<string, Row[]>();
    rows.forEach((r) => {
      if (!groups.has(r.rfq_id)) groups.set(r.rfq_id, []);
      groups.get(r.rfq_id)!.push(r);
    });
    const list: { rfq_id: string; items: Row[] }[] = [];
    groups.forEach((items, rfq_id) => {
      const decided = items.some((r) => ['accepted', 'rejected'].includes(r.status));
      const allQuoted = items.length > 0 && items.every((r) => r.status === 'quote_submitted');
      if (allQuoted && !decided) list.push({ rfq_id, items });
    });
    return list.slice(0, 5);
  }, [rows]);

  return (
    <DashboardLayout title="Admin Dashboard" subtitle="Procurement command centre">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ROW 1 — KPI cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Active RFQs" value={stats.activeRfqs} icon={<FileQuestion className="h-5 w-5 text-primary" />} />
            <KpiCard label="Quotes Received Today" value={stats.quotesToday} icon={<TrendingUp className="h-5 w-5 text-blue-600" />} />
            <KpiCard label="Awaiting Quotes" value={stats.awaitingQuotes} icon={<Clock className="h-5 w-5 text-orange-500" />} />
            <KpiCard label="Decisions This Week" value={stats.decidedThisWeek} icon={<CheckCircle2 className="h-5 w-5 text-green-600" />} />
          </div>

          {/* ROW 2 — Recent RFQ Activity */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Recent RFQ Activity</CardTitle>
              <Link to="/admin/rfq">
                <Button variant="ghost" size="sm">View all <ArrowRight className="ml-1 h-4 w-4" /></Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr className="text-left">
                      <th className="p-2">RFQ ID</th>
                      <th className="p-2">Product</th>
                      <th className="p-2">Client</th>
                      <th className="p-2">Suppliers</th>
                      <th className="p-2">Quoted/Total</th>
                      <th className="p-2">Deadline</th>
                      <th className="p-2">Status</th>
                      <th className="p-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.length === 0 && (
                      <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">No RFQs yet</td></tr>
                    )}
                    {recent.map(({ rfq_id, items }) => {
                      const first = items[0];
                      const quoted = items.filter((r) => ['quote_submitted', 'accepted'].includes(r.status)).length;
                      const decided = items.some((r) => ['accepted', 'rejected'].includes(r.status));
                      const closed = !!first.rfq_closed_at;
                      const status = decided ? 'Decision Made' : closed ? 'Closed' : quoted >= items.length ? 'Ready to Compare' : quoted > 0 ? 'Partial Quotes' : 'Awaiting Quotes';
                      const tone =
                        status === 'Decision Made' ? 'bg-green-100 text-green-800' :
                        status === 'Closed' ? 'bg-red-100 text-red-800' :
                        status === 'Ready to Compare' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800';
                      return (
                        <tr key={rfq_id} className="border-t">
                          <td className="p-2 font-mono text-xs">{rfq_id}</td>
                          <td className="p-2">{first.product_name}</td>
                          <td className="p-2">{first.client_name}</td>
                          <td className="p-2">{items.length}</td>
                          <td className="p-2">{quoted}/{items.length}</td>
                          <td className="p-2">{fmtDate(first.response_deadline)}</td>
                          <td className="p-2"><Badge variant="outline" className={tone}>{status}</Badge></td>
                          <td className="p-2 text-right">
                            <Link to="/admin/rfq">
                              <Button size="sm" variant="outline"><Eye className="mr-1 h-3 w-3" /> View</Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* ROW 3 — side-by-side */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top Suppliers by Response Rate</CardTitle>
              </CardHeader>
              <CardContent>
                {topSuppliers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No quotes submitted yet</p>
                ) : (
                  <ul className="divide-y">
                    {topSuppliers.map((s, i) => (
                      <li key={s.email} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                            {i + 1}
                          </span>
                          <div>
                            <p className="text-sm font-medium">{s.company}</p>
                            <p className="text-xs text-muted-foreground">{s.email}</p>
                          </div>
                        </div>
                        <Badge variant="secondary">{s.count} quotes</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Quotes Pending Action</CardTitle>
                <Badge variant="outline">{stats.pendingAction}</Badge>
              </CardHeader>
              <CardContent>
                {pendingActionList.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Nothing pending — you're all caught up!</p>
                ) : (
                  <ul className="divide-y">
                    {pendingActionList.map(({ rfq_id, items }) => {
                      const first = items[0];
                      return (
                        <li key={rfq_id} className="flex items-center justify-between py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{first.product_name}</p>
                            <p className="font-mono text-xs text-muted-foreground">{rfq_id} · {items.length} quotes</p>
                          </div>
                          <Link to="/admin/rfq">
                            <Button size="sm" variant="outline">Review</Button>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Link to="/admin/suppliers">
              <Card className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50">
                <CardContent className="flex items-center justify-between p-6">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-primary" />
                    <div>
                      <h3 className="text-base font-semibold">Manage Suppliers</h3>
                      <p className="text-xs text-muted-foreground">View & edit supplier details</p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-primary" />
                </CardContent>
              </Card>
            </Link>
            <Link to="/admin/registrations">
              <Card className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50">
                <CardContent className="flex items-center justify-between p-6">
                  <div className="flex items-center gap-3">
                    <FileQuestion className="h-5 w-5 text-primary" />
                    <div>
                      <h3 className="text-base font-semibold">Review Registrations</h3>
                      <p className="text-xs text-muted-foreground">Approve or reject pending applications</p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-primary" />
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
