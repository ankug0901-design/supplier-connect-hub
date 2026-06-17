import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sparkles, Loader2, ShieldCheck, TrendingUp, BarChart3, AlertTriangle, CheckCircle2, XCircle, Bell, Mail, Copy, Send, Inbox, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function fmtINR(n: number) {
  if (!n) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

async function runOperation(operation: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ai-insights`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ operation }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

function InvoiceValidation() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const data = await runOperation('validate_invoices');
      setResults(data.results || []);
      toast({ title: 'Scan complete', description: `Reviewed ${data.results?.length || 0} pending invoices.` });
    } catch (e: any) {
      toast({ title: 'Scan failed', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const riskColor: Record<string, string> = {
    high: 'bg-destructive/10 text-destructive border-destructive/30',
    medium: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
    low: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  };
  const recIcon: Record<string, JSX.Element> = {
    approve: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
    review: <AlertTriangle className="h-4 w-4 text-orange-600" />,
    reject: <XCircle className="h-4 w-4 text-destructive" />,
  };

  const counts = results
    ? results.reduce(
        (acc, r) => ({ ...acc, [r.risk]: (acc[r.risk] || 0) + 1 }),
        {} as Record<string, number>,
      )
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Bulk Invoice Validation
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            AI scans pending invoices for duplicates, PO mismatches, GST issues, and amount anomalies.
          </p>
        </div>
        <Button onClick={run} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? 'Scanning...' : 'Scan pending invoices'}
        </Button>
      </CardHeader>
      <CardContent>
        {counts && (
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge variant="outline" className={riskColor.high}>High risk: {counts.high || 0}</Badge>
            <Badge variant="outline" className={riskColor.medium}>Medium: {counts.medium || 0}</Badge>
            <Badge variant="outline" className={riskColor.low}>Low: {counts.low || 0}</Badge>
          </div>
        )}
        {!results && !loading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Click "Scan pending invoices" to run validation.
          </p>
        )}
        {loading && (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            Analyzing invoices...
          </div>
        )}
        {results && results.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No pending invoices to validate.</p>
        )}
        {results && results.length > 0 && (
          <div className="space-y-3">
            {results.map((r) => (
              <div
                key={r.invoice_id}
                className={cn('rounded-lg border p-4', riskColor[r.risk] || 'border-border')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {recIcon[r.recommendation]}
                      <span className="font-semibold">{r.invoice_number}</span>
                      <span className="text-sm text-muted-foreground">· {r.supplier}</span>
                    </div>
                    <p className="mt-1 text-sm">{r.summary}</p>
                    {r.issues?.length > 0 && (
                      <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs">
                        {r.issues.map((i: string, idx: number) => <li key={idx}>{i}</li>)}
                      </ul>
                    )}
                  </div>
                  <Badge variant="outline" className="shrink-0 uppercase">{r.recommendation}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VendorScoring() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [vendors, setVendors] = useState<any[] | null>(null);
  const [lastScoredAt, setLastScoredAt] = useState<string | null>(null);

  // Load latest persisted scores on mount
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('vendor_scores')
        .select('*')
        .order('scored_at', { ascending: false })
        .limit(200);
      if (!error && data && data.length) {
        // Keep only the latest score per supplier
        const seen = new Set<string>();
        const latest: any[] = [];
        for (const row of data) {
          if (seen.has(row.supplier_id)) continue;
          seen.add(row.supplier_id);
          latest.push(row);
        }
        latest.sort((a, b) => b.score - a.score);
        setVendors(latest);
        setLastScoredAt(data[0].scored_at);
      }
      setLoadingHistory(false);
    })();
  }, []);

  const run = async () => {
    setLoading(true);
    try {
      const data = await runOperation('score_vendors');
      setVendors((data.vendors || []).sort((a: any, b: any) => b.score - a.score));
      setLastScoredAt(data.scored_at || new Date().toISOString());
      const syncWarn = (data.sync_errors || []).length
        ? ` (${data.sync_errors.length} Zoho sync warning${data.sync_errors.length === 1 ? '' : 's'})`
        : '';
      toast({
        title: 'Scoring complete',
        description: `Synced from Zoho and scored ${data.vendors?.length || 0} vendors${syncWarn}.`,
      });
    } catch (e: any) {
      toast({ title: 'Scoring failed', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const gradeColor: Record<string, string> = {
    A: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
    B: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
    C: 'bg-orange-500/15 text-orange-700 border-orange-500/30',
    D: 'bg-destructive/15 text-destructive border-destructive/30',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Vendor Performance Scoring
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Pulls latest PO, invoice, payment, and shipment data from Zoho, then scores supplier performance.
          </p>
          {lastScoredAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Last scored: {new Date(lastScoredAt).toLocaleString()}
            </p>
          )}
        </div>
        <Button onClick={run} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? 'Syncing & scoring...' : 'Sync from Zoho & score'}
        </Button>
      </CardHeader>
      <CardContent>
        {(loadingHistory || (!vendors && !loading)) && !loading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {loadingHistory ? 'Loading latest scores...' : 'No scores yet. Click "Sync from Zoho & score" to begin.'}
          </p>
        )}
        {loading && (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            Pulling fresh data from Zoho and scoring vendors...
          </div>
        )}
        {!loading && vendors && vendors.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No vendor activity to score yet.</p>
        )}
        {vendors && vendors.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {vendors.map((v) => (
              <div key={v.supplier_id} className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{v.company}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold tabular-nums">{v.score}</span>
                    <Badge variant="outline" className={cn('text-base font-bold', gradeColor[v.grade])}>
                      {v.grade}
                    </Badge>
                  </div>
                </div>
                {v.strengths?.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-emerald-700">Strengths</p>
                    <ul className="ml-4 list-disc text-xs text-muted-foreground">
                      {v.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {v.weaknesses?.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-orange-700">Areas to improve</p>
                    <ul className="ml-4 list-disc text-xs text-muted-foreground">
                      {v.weaknesses.map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs italic">{v.recommendation}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DemandForecast() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [forecast, setForecast] = useState<any | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const data = await runOperation('forecast_demand');
      setForecast(data);
      toast({ title: 'Forecast generated', description: 'Based on the last 12 months of PO history.' });
    } catch (e: any) {
      toast({ title: 'Forecast failed', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const trendColor: Record<string, string> = {
    growing: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
    stable: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
    declining: 'bg-destructive/15 text-destructive border-destructive/30',
    volatile: 'bg-orange-500/15 text-orange-700 border-orange-500/30',
  };
  const urgencyColor: Record<string, string> = {
    high: 'bg-destructive/10 text-destructive border-destructive/30',
    medium: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
    low: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Demand Forecast
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            AI projects upcoming demand from 12 months of PO history.
          </p>
        </div>
        <Button onClick={run} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? 'Forecasting...' : 'Generate forecast'}
        </Button>
      </CardHeader>
      <CardContent>
        {!forecast && !loading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Click "Generate forecast" to project demand.
          </p>
        )}
        {loading && (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            Analyzing historical PO data...
          </div>
        )}
        {forecast && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Trend</p>
                <Badge variant="outline" className={cn('mt-2 text-sm capitalize', trendColor[forecast.trend])}>
                  {forecast.trend}
                </Badge>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Next month</p>
                <p className="mt-1 text-2xl font-bold">{fmtINR(forecast.next_month_forecast_inr)}</p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Next quarter</p>
                <p className="mt-1 text-2xl font-bold">{fmtINR(forecast.next_quarter_forecast_inr)}</p>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm">{forecast.summary}</p>
            </div>

            {forecast.top_categories?.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Top categories</h4>
                <div className="space-y-2">
                  {forecast.top_categories.map((c: any, i: number) => (
                    <div key={i} className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{c.category}</p>
                        <p className="text-xs text-muted-foreground">{c.reasoning}</p>
                      </div>
                      <span className="shrink-0 font-semibold">{fmtINR(c.projected_inr)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {forecast.reorder_alerts?.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Reorder alerts</h4>
                <div className="space-y-2">
                  {forecast.reorder_alerts.map((a: any, i: number) => (
                    <div key={i} className={cn('rounded-lg border p-3', urgencyColor[a.urgency])}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{a.item_or_supplier}</span>
                        <Badge variant="outline" className="uppercase">{a.urgency}</Badge>
                      </div>
                      <p className="mt-1 text-xs">{a.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {forecast.risks?.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Risks to watch</h4>
                <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
                  {forecast.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SupplierNudges() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [nudges, setNudges] = useState<any[] | null>(null);
  const [sentIdx, setSentIdx] = useState<Set<number>>(new Set());

  // Preview modal state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewNudge, setPreviewNudge] = useState<any | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const run = async () => {
    setLoading(true);
    setSentIdx(new Set());
    try {
      const data = await runOperation('generate_nudges');
      setNudges(data.nudges || []);
      toast({ title: 'Nudges ready', description: `Drafted ${data.nudges?.length || 0} reminder messages.` });
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const priorityColor: Record<string, string> = {
    high: 'bg-destructive/10 text-destructive border-destructive/30',
    medium: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
    low: 'bg-muted text-muted-foreground border-border',
  };

  const copy = (n: any) => {
    const text = `Subject: ${n.subject}\n\n${n.body}`;
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  const openPreview = async (n: any, idx: number) => {
    if (!n.supplier_email) return;
    setPreviewNudge(n);
    setPreviewIdx(idx);
    setPreviewHtml('');
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-supplier-nudge', {
        body: {
          recipientEmail: n.supplier_email,
          recipientName: n.supplier_name,
          subject: n.subject,
          body: n.body,
          callToAction: n.call_to_action,
          supplierId: n.supplier_id,
          preview: true,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setPreviewHtml((data as any).html || '');
    } catch (e: any) {
      toast({ title: 'Preview failed', description: e.message, variant: 'destructive' });
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmSend = async () => {
    if (!previewNudge) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-supplier-nudge', {
        body: {
          recipientEmail: previewNudge.supplier_email,
          recipientName: previewNudge.supplier_name,
          subject: previewNudge.subject,
          body: previewNudge.body,
          callToAction: previewNudge.call_to_action,
          supplierId: previewNudge.supplier_id,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if (previewIdx !== null) setSentIdx((prev) => new Set(prev).add(previewIdx));
      toast({ title: 'Email sent', description: `Reminder sent to ${previewNudge.supplier_email}.` });
      setPreviewOpen(false);
    } catch (e: any) {
      toast({ title: 'Send failed', description: e.message || 'Unable to send email', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              AI-Generated Supplier Nudges
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Identifies suppliers with pending invoices, delayed deliveries, low performance scores, pending RFQ quotes or stale registrations, and drafts personalised reminder emails.
            </p>
          </div>
          <Button onClick={run} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Generating...' : 'Generate nudges'}
          </Button>
        </CardHeader>
        <CardContent>
          {!nudges && !loading && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Click "Generate nudges" to scan suppliers and draft reminder messages.
            </p>
          )}
          {loading && (
            <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              Scanning suppliers and drafting messages...
            </div>
          )}
          {nudges && nudges.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No suppliers currently need a nudge — well done!</p>
          )}
          {nudges && nudges.length > 0 && (
            <div className="space-y-3">
              {nudges.map((n, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{n.supplier_name}</p>
                      {n.supplier_email && <p className="text-xs text-muted-foreground">{n.supplier_email}</p>}
                    </div>
                    <Badge variant="outline" className={cn('uppercase', priorityColor[n.priority] || '')}>
                      {n.priority}
                    </Badge>
                  </div>

                  {n.triggers?.length > 0 && (
                    <ul className="mb-3 ml-4 list-disc text-xs text-muted-foreground">
                      {n.triggers.map((t: any, j: number) => <li key={j}>{t.detail}</li>)}
                    </ul>
                  )}

                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-sm font-medium">{n.subject}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
                    {n.call_to_action && (
                      <p className="mt-2 text-xs italic text-primary">→ {n.call_to_action}</p>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => copy(n)} className="gap-1">
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                    {n.supplier_email && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => openPreview(n, i)}
                        disabled={sentIdx.has(i)}
                        className="gap-1"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {sentIdx.has(i) ? 'Sent' : 'Preview & send'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Email preview</DialogTitle>
            <DialogDescription asChild>
              {previewNudge ? (
                <div>
                  <div><span className="font-medium text-foreground">To:</span> {previewNudge.supplier_email}</div>
                  <div><span className="font-medium text-foreground">Subject:</span> {previewNudge.subject}</div>
                </div>
              ) : <div />}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-white">
            {previewLoading ? (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rendering preview...
              </div>
            ) : (
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                sandbox=""
                className="h-[460px] w-full rounded-md"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={confirmSend} disabled={sending || previewLoading} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Sending...' : 'Confirm & send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SentNudgeEmails() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_send_log')
        .select('id,message_id,recipient_email,status,error_message,created_at,template_name')
        .eq('template_name', 'supplier-nudge')
        .order('created_at', { ascending: false })
        .limit(400);
      if (error) throw error;
      const seen = new Map<string, any>();
      for (const r of data || []) {
        if (!r.message_id) continue;
        if (!seen.has(r.message_id)) seen.set(r.message_id, r);
      }
      setRows(Array.from(seen.values()));
    } catch (e: any) {
      toast({ title: 'Failed to load', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      sent: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
      pending: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
      failed: 'bg-orange-500/15 text-orange-700 border-orange-500/30',
      dlq: 'bg-destructive/15 text-destructive border-destructive/30',
      suppressed: 'bg-muted text-muted-foreground border-border',
    };
    return <Badge variant="outline" className={cn('uppercase', map[s] || '')}>{s}</Badge>;
  };

  const counts = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-primary" /> Sent Nudge Emails
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Delivery history for AI-generated supplier nudges (latest status per email).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge variant="outline">Total: {rows.length}</Badge>
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">Sent: {counts.sent || 0}</Badge>
          <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30">Pending: {counts.pending || 0}</Badge>
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Failed/DLQ: {(counts.failed || 0) + (counts.dlq || 0)}</Badge>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No nudge emails sent yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="p-2 font-medium">Recipient</th>
                  <th className="p-2 font-medium">Status</th>
                  <th className="p-2 font-medium">Sent at</th>
                  <th className="p-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{r.recipient_email}</td>
                    <td className="p-2">{statusBadge(r.status)}</td>
                    <td className="p-2 whitespace-nowrap text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="p-2 text-xs text-destructive">{r.error_message || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


export default function AdminAiInsights() {
  return (
    <DashboardLayout title="AI Insights" subtitle="AI-powered analysis across the procurement portal">
      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices" className="gap-2">
            <ShieldCheck className="h-4 w-4" /> Invoice Validation
          </TabsTrigger>
          <TabsTrigger value="vendors" className="gap-2">
            <TrendingUp className="h-4 w-4" /> Vendor Scoring
          </TabsTrigger>
          <TabsTrigger value="forecast" className="gap-2">
            <BarChart3 className="h-4 w-4" /> Demand Forecast
          </TabsTrigger>
          <TabsTrigger value="nudges" className="gap-2">
            <Bell className="h-4 w-4" /> Supplier Nudges
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-2">
            <Inbox className="h-4 w-4" /> Sent Emails
          </TabsTrigger>
        </TabsList>
        <TabsContent value="invoices"><InvoiceValidation /></TabsContent>
        <TabsContent value="vendors"><VendorScoring /></TabsContent>
        <TabsContent value="forecast"><DemandForecast /></TabsContent>
        <TabsContent value="nudges"><SupplierNudges /></TabsContent>
        <TabsContent value="sent"><SentNudgeEmails /></TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}

