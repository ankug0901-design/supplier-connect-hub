import { useEffect, useState } from 'react';
import { Award, TrendingUp, TrendingDown, Minus, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';

interface VendorScore {
  id: string;
  score: number;
  grade: string | null;
  strengths: any;
  weaknesses: any;
  recommendation: string | null;
  scored_at: string;
}

interface Props {
  supplierId: string;
}

const gradeColor = (grade?: string | null) => {
  switch ((grade || '').toUpperCase()) {
    case 'A':
      return 'bg-success/10 text-success border-success/30';
    case 'B':
      return 'bg-primary/10 text-primary border-primary/30';
    case 'C':
      return 'bg-warning/10 text-warning border-warning/30';
    case 'D':
    case 'F':
      return 'bg-destructive/10 text-destructive border-destructive/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

const toArray = (v: any): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : x?.text ?? JSON.stringify(x))).filter(Boolean);
  if (typeof v === 'string') return [v];
  if (typeof v === 'object') return Object.values(v).map((x: any) => String(x));
  return [];
};

export function PerformanceCard({ supplierId }: Props) {
  const [scores, setScores] = useState<VendorScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('vendor_scores')
        .select('id, score, grade, strengths, weaknesses, recommendation, scored_at')
        .eq('supplier_id', supplierId)
        .order('scored_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('Failed to load vendor scores', error);
        setScores([]);
      } else {
        setScores((data ?? []) as VendorScore[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supplierId]);

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-card">
        <div className="h-40 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-card">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Your Performance</h3>
            <p className="text-sm text-muted-foreground">
              No performance scores available yet. Scores appear once your activity has been evaluated.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const latest = scores[scores.length - 1];
  const previous = scores.length > 1 ? scores[scores.length - 2] : null;
  const delta = previous ? latest.score - previous.score : 0;

  const chartData = scores.map((s) => ({
    date: new Date(s.scored_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    score: s.score,
    grade: s.grade,
  }));

  const strengths = toArray(latest.strengths).slice(0, 4);
  const weaknesses = toArray(latest.weaknesses).slice(0, 4);

  return (
    <div className="rounded-xl border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Your Performance</h3>
            <p className="text-sm text-muted-foreground">
              Score history and latest evaluation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-3xl font-bold text-foreground">{latest.score}</div>
            <div className="text-xs text-muted-foreground">out of 100</div>
          </div>
          {latest.grade && (
            <span className={`inline-flex h-12 w-12 items-center justify-center rounded-lg border text-xl font-bold ${gradeColor(latest.grade)}`}>
              {latest.grade}
            </span>
          )}
        </div>
      </div>

      {previous && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          {delta > 0 ? (
            <TrendingUp className="h-4 w-4 text-success" />
          ) : delta < 0 ? (
            <TrendingDown className="h-4 w-4 text-destructive" />
          ) : (
            <Minus className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={delta > 0 ? 'text-success' : delta < 0 ? 'text-destructive' : 'text-muted-foreground'}>
            {delta > 0 ? '+' : ''}{delta} from previous score
          </span>
          <span className="text-muted-foreground">
            · {new Date(latest.scored_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
      )}

      <div className="mt-5 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.5rem',
                color: 'hsl(var(--popover-foreground))',
              }}
            />
            <ReferenceLine y={75} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: 'Target', position: 'right', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <Line
              type="monotone"
              dataKey="score"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              dot={{ r: 4, fill: 'hsl(var(--primary))' }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {(strengths.length > 0 || weaknesses.length > 0) && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {strengths.length > 0 && (
            <div className="rounded-lg border border-success/20 bg-success/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-success">
                <CheckCircle2 className="h-4 w-4" />
                Strengths
              </div>
              <ul className="space-y-1 text-sm text-foreground">
                {strengths.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-success">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {weaknesses.length > 0 && (
            <div className="rounded-lg border border-warning/20 bg-warning/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-warning">
                <AlertTriangle className="h-4 w-4" />
                Areas to Improve
              </div>
              <ul className="space-y-1 text-sm text-foreground">
                {weaknesses.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-warning">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {latest.recommendation && (
        <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-primary">Recommendation</div>
          <p className="mt-1 text-sm text-foreground">{latest.recommendation}</p>
        </div>
      )}
    </div>
  );
}
