import { Fragment, useEffect, useMemo, useState } from 'react';
const FragmentWithKey = Fragment as any;
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Award, Search, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import PriceTrendsPanel from '@/components/admin/PriceTrendsPanel';

interface VendorScoreRow {
  id: string;
  supplier_id: string | null;
  company: string | null;
  score: number;
  grade: string | null;
  strengths: any;
  weaknesses: any;
  recommendation: string | null;
  scored_at: string;
}

const gradeColor = (grade?: string | null) => {
  switch ((grade || '').toUpperCase()) {
    case 'A': return 'bg-success/10 text-success border-success/30';
    case 'B': return 'bg-primary/10 text-primary border-primary/30';
    case 'C': return 'bg-warning/10 text-warning border-warning/30';
    case 'D':
    case 'F': return 'bg-destructive/10 text-destructive border-destructive/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const toArray = (v: any): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : x?.text ?? JSON.stringify(x))).filter(Boolean);
  if (typeof v === 'string') return [v];
  if (typeof v === 'object') return Object.values(v).map((x: any) => String(x));
  return [];
};

export default function AdminVendorScores() {
  const [rows, setRows] = useState<VendorScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('vendor_scores')
        .select('id, supplier_id, company, score, grade, strengths, weaknesses, recommendation, scored_at')
        .order('scored_at', { ascending: false });
      if (error) console.error(error);
      setRows((data ?? []) as VendorScoreRow[]);
      setLoading(false);
    })();
  }, []);

  // Group by supplier — latest first
  const grouped = useMemo(() => {
    const map = new Map<string, VendorScoreRow[]>();
    for (const r of rows) {
      const key = r.supplier_id || r.company || r.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    // For each group, latest first (already sorted desc). Compute ranking by latest score.
    const list = Array.from(map.entries()).map(([key, history]) => ({
      key,
      company: history[0].company || 'Unknown',
      latest: history[0],
      history: [...history].sort((a, b) => +new Date(a.scored_at) - +new Date(b.scored_at)),
    }));
    list.sort((a, b) => b.latest.score - a.latest.score);
    return list;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return grouped;
    return grouped.filter((g) => g.company.toLowerCase().includes(q));
  }, [grouped, search]);

  return (
    <DashboardLayout title="Supplier Performance" subtitle="Vendor scores, grades, and history across all suppliers">
      <Tabs defaultValue="scores" className="space-y-4">
        <TabsList>
          <TabsTrigger value="scores">Scores</TabsTrigger>
          <TabsTrigger value="price-trends">Price Trends</TabsTrigger>
        </TabsList>
        <TabsContent value="scores" className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search supplier…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {filtered.length} supplier{filtered.length === 1 ? '' : 's'} scored
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border bg-card p-6"><div className="h-40 animate-pulse rounded-md bg-muted" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">
            No vendor scores found.
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Supplier</th>
                  <th className="px-4 py-3 text-left">Score</th>
                  <th className="px-4 py-3 text-left">Grade</th>
                  <th className="px-4 py-3 text-left">Trend</th>
                  <th className="px-4 py-3 text-left">Last Scored</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g, idx) => {
                  const prev = g.history.length > 1 ? g.history[g.history.length - 2] : null;
                  const delta = prev ? g.latest.score - prev.score : 0;
                  const isOpen = expanded === g.key;
                  const chartData = g.history.map((s) => ({
                    date: new Date(s.scored_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
                    score: s.score,
                  }));
                  const strengths = toArray(g.latest.strengths).slice(0, 4);
                  const weaknesses = toArray(g.latest.weaknesses).slice(0, 4);
                  return (
                    <FragmentWithKey key={g.key}>
                      <tr className="border-t hover:bg-muted/20" key={`${g.key}-row`}>
                        <td className="px-4 py-3 font-semibold text-muted-foreground">#{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{g.company}</td>
                        <td className="px-4 py-3"><span className="text-lg font-bold">{g.latest.score}</span><span className="text-xs text-muted-foreground"> / 100</span></td>
                        <td className="px-4 py-3">
                          {g.latest.grade && (
                            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold ${gradeColor(g.latest.grade)}`}>
                              {g.latest.grade}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {prev ? (
                            <span className={`inline-flex items-center gap-1 text-xs ${delta > 0 ? 'text-success' : delta < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : delta < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                              {delta > 0 ? '+' : ''}{delta}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(g.latest.scored_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setExpanded(isOpen ? null : g.key)}>
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-muted/10 border-t">
                          <td colSpan={7} className="p-6">
                            <div className="grid gap-6 lg:grid-cols-3">
                              <div className="lg:col-span-2">
                                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                                  <Award className="h-4 w-4 text-primary" /> Score History
                                </div>
                                <div className="h-56 w-full">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                                      <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                                      <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '0.5rem' }} />
                                      <ReferenceLine y={75} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                                      <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                              <div className="space-y-3">
                                {strengths.length > 0 && (
                                  <div className="rounded-lg border border-success/20 bg-success/5 p-3">
                                    <div className="mb-1 flex items-center gap-2 text-xs font-medium text-success">
                                      <CheckCircle2 className="h-3.5 w-3.5" /> Strengths
                                    </div>
                                    <ul className="space-y-1 text-xs text-foreground">
                                      {strengths.map((s, i) => <li key={i}>• {s}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {weaknesses.length > 0 && (
                                  <div className="rounded-lg border border-warning/20 bg-warning/5 p-3">
                                    <div className="mb-1 flex items-center gap-2 text-xs font-medium text-warning">
                                      <AlertTriangle className="h-3.5 w-3.5" /> Areas to Improve
                                    </div>
                                    <ul className="space-y-1 text-xs text-foreground">
                                      {weaknesses.map((s, i) => <li key={i}>• {s}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {g.latest.recommendation && (
                                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                                    <div className="text-xs font-medium uppercase tracking-wide text-primary">Recommendation</div>
                                    <p className="mt-1 text-xs text-foreground">{g.latest.recommendation}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </FragmentWithKey>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </TabsContent>
        <TabsContent value="price-trends">
          <PriceTrendsPanel />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
