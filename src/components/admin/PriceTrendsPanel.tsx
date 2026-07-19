import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle } from 'lucide-react';
const PRICE_TRENDS_URL = 'https://n8n.srv1141999.hstgr.cloud/webhook/rfq-price-trends';

interface TrendPoint {
  date: string;
  unit_price: number;
  rfq_id?: string | null;
  category?: string | null;
  supplier_email?: string | null;
  supplier_company?: string | null;
}

interface RawResponse {
  points?: TrendPoint[];
  data?: TrendPoint[];
  trends?: TrendPoint[];
  [k: string]: any;
}

// Color palette for supplier lines
const COLORS = [
  '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
];

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });

const fmtINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

export default function PriceTrendsPanel() {
  const [category, setCategory] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (category.trim()) payload.category = category.trim();
      if (supplierEmail.trim()) payload.supplier_email = supplierEmail.trim();
      const res = await n8nPost('rfq-price-trends', payload);
      if (!res.ok) throw new Error(res.text || `HTTP ${res.status}`);
      const json: RawResponse | TrendPoint[] = res.data;
      const arr: TrendPoint[] = Array.isArray(json)
        ? json
        : (json.points || json.data || json.trends || []);
      setPoints(arr);
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch price trends');
      setPoints([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, []);

  // Group by supplier
  const suppliers = useMemo(() => {
    const map = new Map<string, TrendPoint[]>();
    for (const p of points) {
      const key = p.supplier_company || p.supplier_email || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).map(([name, pts], i) => {
      const sorted = [...pts].sort((a, b) => +new Date(a.date) - +new Date(b.date));
      const prices = sorted.map((p) => Number(p.unit_price)).filter((n) => !isNaN(n));
      const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
      const min = prices.length ? Math.min(...prices) : 0;
      const max = prices.length ? Math.max(...prices) : 0;
      const trend = prices.length >= 2 ? prices[prices.length - 1] - prices[0] : 0;
      return { name, color: COLORS[i % COLORS.length], points: sorted, avg, min, max, trend };
    });
  }, [points]);

  // Merge into single chart dataset keyed by date
  const chartData = useMemo(() => {
    const byDate = new Map<string, any>();
    for (const s of suppliers) {
      for (const p of s.points) {
        const key = p.date;
        if (!byDate.has(key)) byDate.set(key, { date: key, _label: fmtDate(key) });
        byDate.get(key)[s.name] = Number(p.unit_price);
        byDate.get(key)[`${s.name}__meta`] = { rfq_id: p.rfq_id, category: p.category };
      }
    }
    return Array.from(byDate.values()).sort((a, b) => +new Date(a.date) - +new Date(b.date));
  }, [suppliers]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    return (
      <div className="rounded-lg border bg-popover p-3 text-xs shadow-lg">
        <div className="mb-2 font-medium text-foreground">{fmtDate(label)}</div>
        <div className="space-y-1.5">
          {payload.map((p: any) => {
            const meta = row?.[`${p.dataKey}__meta`];
            return (
              <div key={p.dataKey} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                  <span className="font-medium">{p.dataKey}</span>
                  <span className="ml-auto font-semibold">{fmtINR(p.value)}</span>
                </div>
                {meta && (
                  <div className="ml-4 text-muted-foreground">
                    {meta.rfq_id && <span>RFQ: {meta.rfq_id}</span>}
                    {meta.category && <span className="ml-2">· {meta.category}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="flex-1 min-w-48">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
          <Input
            placeholder="e.g. Offset Printing"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-48">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Supplier Email</label>
          <Input
            placeholder="supplier@example.com"
            value={supplierEmail}
            onChange={(e) => setSupplierEmail(e.target.value)}
          />
        </div>
        <Button onClick={fetchData} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Apply
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Unable to load price trends</div>
            <div className="text-xs opacity-80">{error}</div>
            <div className="mt-1 text-xs opacity-70">
              The price trend service is temporarily unreachable. Please retry shortly.
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border bg-card p-6"><div className="h-64 animate-pulse rounded-md bg-muted" /></div>
      ) : suppliers.length === 0 ? (
        !error && (
          <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">
            No price trend data available.
          </div>
        )
      ) : (
        <>
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-3 text-sm font-medium text-foreground">Unit Price Over Time</div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {suppliers.map((s) => (
                    <Line
                      key={s.name}
                      type="monotone"
                      dataKey={s.name}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map((s) => (
              <div key={s.name} className="rounded-xl border bg-card p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
                  <div className="font-medium text-foreground truncate">{s.name}</div>
                  <span className="ml-auto inline-flex items-center gap-1 text-xs">
                    {s.trend < 0 ? (
                      <span className="flex items-center gap-1 text-success"><TrendingDown className="h-3.5 w-3.5" />{fmtINR(Math.abs(s.trend))}</span>
                    ) : s.trend > 0 ? (
                      <span className="flex items-center gap-1 text-destructive"><TrendingUp className="h-3.5 w-3.5" />{fmtINR(s.trend)}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted-foreground"><Minus className="h-3.5 w-3.5" />flat</span>
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg</div>
                    <div className="text-sm font-semibold">{fmtINR(s.avg)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Min</div>
                    <div className="text-sm font-semibold text-success">{fmtINR(s.min)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Max</div>
                    <div className="text-sm font-semibold text-destructive">{fmtINR(s.max)}</div>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {s.points.length} data point{s.points.length === 1 ? '' : 's'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
