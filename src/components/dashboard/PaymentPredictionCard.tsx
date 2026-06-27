import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Calendar, TrendingUp, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

type Prediction = {
  invoice_id: string;
  invoice_number: string;
  amount: number;
  balance: number;
  invoice_date: string;
  due_date: string | null;
  predicted_payment_date: string;
  earliest_date: string;
  latest_date: string;
  days_until_predicted: number;
  overdue: boolean;
};

type Data = {
  stats: {
    historical_invoices_analyzed: number;
    avg_days_to_pay: number;
    median_days_to_pay: number;
    p90_days_to_pay: number;
    pending_invoice_count: number;
    total_pending_amount_inr: number;
  };
  predictions: Prediction[];
  narrative: string;
};

function fmtINR(n: number) {
  if (!n) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PaymentPredictionCard() {
  const { toast } = useToast();
  const { isImpersonating, impersonatedSupplier } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Data | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const body: Record<string, unknown> = {};
      if (isImpersonating && impersonatedSupplier?.id) {
        body.supplier_id = impersonatedSupplier.id;
      }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-prediction`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setData(json.data);
    } catch (e: any) {
      toast({ title: 'Could not load payment predictions', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
     
  }, [isImpersonating, impersonatedSupplier?.id]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary" />
            Payment Date Prediction
            <span className="rounded-[5px] bg-[#F5F3FF] px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wider text-[#7C3AED]">AI</span>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            AI-predicted payment dates for your pending invoices based on client's payment history.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Analyzing payment patterns...
          </div>
        )}
        {!loading && data && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">{data.narrative}</div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="Avg days to pay" value={`${data.stats.avg_days_to_pay}d`} />
              <Stat label="Median" value={`${data.stats.median_days_to_pay}d`} />
              <Stat label="Pending invoices" value={String(data.stats.pending_invoice_count)} />
              <Stat label="Total pending" value={fmtINR(data.stats.total_pending_amount_inr)} />
            </div>

            {data.predictions.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                No pending invoices to predict.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Upcoming predicted payments
                </p>
                {data.predictions.slice(0, 5).map((p) => (
                  <div
                    key={p.invoice_id}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm',
                      p.overdue ? 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]' : 'border-border bg-card',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{p.invoice_number}</span>
                        {p.overdue && <Badge variant="outline" className="border-[#FECACA] bg-white text-[#991B1B] text-[10px]">Overdue</Badge>}
                      </div>
                      <p className={cn('text-xs', p.overdue ? 'text-[#991B1B]/80' : 'text-muted-foreground')}>
                        Invoiced {fmtDate(p.invoice_date)} · {fmtINR(p.balance)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1.5 text-sm font-medium">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        {fmtDate(p.predicted_payment_date)}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {p.days_until_predicted >= 0 ? `in ${p.days_until_predicted}d` : `${Math.abs(p.days_until_predicted)}d late`}
                      </p>
                    </div>
                  </div>
                ))}
                {data.predictions.length > 5 && (
                  <p className="text-center text-xs text-muted-foreground">
                    + {data.predictions.length - 5} more pending invoices
                  </p>
                )}
              </div>
            )}

            {data.stats.historical_invoices_analyzed < 3 && (
              <div className="flex items-start gap-2 rounded-md border border-orange-400/30 bg-orange-500/5 p-2.5 text-xs text-orange-700 dark:text-orange-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Predictions improve as more invoices are paid. Currently based on {data.stats.historical_invoices_analyzed} paid invoice{data.stats.historical_invoices_analyzed === 1 ? '' : 's'}.</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums">{value}</p>
    </div>
  );
}
