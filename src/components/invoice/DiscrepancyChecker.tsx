import { useState } from 'react';
import { Sparkles, Loader2, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Issue = { severity: 'info' | 'warning' | 'blocker'; field: string; message: string };

type Props = {
  po: {
    poNumber?: string;
    amount?: number;
    date?: string;
    expectedDelivery?: string;
    expected_delivery?: string;
  } | null;
  poItems: Array<{
    item_name: string;
    po_quantity?: number;
    invoiced_quantity?: number;
    rate: number;
  }>;
  invoice: {
    invoice_number: string;
    invoice_date: string;
    amount: number;
    items: Array<{ item_name: string; quantity: number; rate: number; actual_delivery_date?: string; selected?: boolean }>;
  };
  disabled?: boolean;
};

export function DiscrepancyChecker({ po, poItems, invoice, disabled }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ issues: Issue[]; summary: string; has_blocking: boolean } | null>(null);

  const run = async () => {
    if (!po) {
      toast({ title: 'Select a PO first', variant: 'destructive' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invoice-discrepancy-check`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          po: {
            po_number: po.poNumber,
            amount: Number(po.amount || 0),
            date: po.date,
            expected_delivery: po.expectedDelivery || po.expected_delivery,
            items: poItems.map((i) => ({
              item_name: i.item_name,
              po_quantity: Number(i.po_quantity || 0),
              invoiced_quantity: Number(i.invoiced_quantity || 0),
              rate: Number(i.rate || 0),
            })),
          },
          invoice: {
            invoice_number: invoice.invoice_number,
            invoice_date: invoice.invoice_date,
            amount: Number(invoice.amount || 0),
            items: invoice.items
              .filter((i) => i.selected !== false && i.item_name)
              .map((i) => ({
                item_name: i.item_name,
                quantity: Number(i.quantity || 0),
                rate: Number(i.rate || 0),
                actual_delivery_date: i.actual_delivery_date,
              })),
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Check failed');
      setResult(json.data);
    } catch (e: any) {
      toast({ title: 'Discrepancy check failed', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const sevColor: Record<string, string> = {
    blocker: 'border-destructive/40 bg-destructive/5 text-destructive',
    warning: 'border-orange-400/40 bg-orange-500/5 text-orange-700 dark:text-orange-400',
    info: 'border-blue-400/40 bg-blue-500/5 text-blue-700 dark:text-blue-400',
  };
  const sevIcon: Record<string, JSX.Element> = {
    blocker: <XCircle className="h-4 w-4" />,
    warning: <AlertTriangle className="h-4 w-4" />,
    info: <Info className="h-4 w-4" />,
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-card animate-slide-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Smart Discrepancy Check
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            AI compares your invoice against the PO and flags any qty / rate / amount / date mismatches before you submit.
          </p>
        </div>
        <Button type="button" onClick={run} disabled={loading || disabled} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? 'Checking...' : 'Run check'}
        </Button>
      </div>

      {result && (
        <div className="mt-4 space-y-3">
          <div
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3 text-sm',
              result.has_blocking
                ? 'border-destructive/40 bg-destructive/5'
                : result.issues.length === 0
                ? 'border-success/40 bg-success/5'
                : 'border-orange-400/40 bg-orange-500/5',
            )}
          >
            {result.issues.length === 0 ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : result.has_blocking ? (
              <XCircle className="h-5 w-5 text-destructive" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            )}
            <div className="flex-1">
              <p className="font-medium">{result.summary}</p>
              {result.has_blocking && (
                <p className="mt-1 text-xs">Fix blocker-level issues before submitting.</p>
              )}
            </div>
            <Badge variant="outline" className="shrink-0">{result.issues.length} issue{result.issues.length === 1 ? '' : 's'}</Badge>
          </div>

          {result.issues.length > 0 && (
            <ul className="space-y-2">
              {result.issues.map((it, i) => (
                <li key={i} className={cn('flex items-start gap-2 rounded-md border p-2.5 text-xs', sevColor[it.severity])}>
                  <span className="mt-0.5">{sevIcon[it.severity]}</span>
                  <div className="flex-1">
                    <p className="font-medium uppercase tracking-wide text-[10px]">{it.severity} · {it.field}</p>
                    <p className="mt-0.5 text-foreground">{it.message}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
