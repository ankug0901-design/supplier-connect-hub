import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Mail, MailCheck, MailWarning, RefreshCw, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { EMAIL_PAGE_SIZE, EMAIL_STATUSES, EMPTY_EMAIL_FILTERS, emailOutcomesQuery, emailStatusLabel, emailTimestamp, type EmailFilters } from '@/lib/emailOutcomes';

const metrics = [
  { label: 'All outcomes', icon: Mail, statuses: undefined, tone: 'text-foreground' },
  { label: 'Sent / accepted', icon: CheckCircle2, statuses: ['sent'], tone: 'text-info' },
  { label: 'Delivered', icon: MailCheck, statuses: ['delivered'], tone: 'text-success' },
  { label: 'Bounced', icon: MailWarning, statuses: ['bounced'], tone: 'text-warning' },
  { label: 'Failed', icon: AlertCircle, statuses: ['failed', 'dlq'], tone: 'text-destructive' },
];

function statusClass(status: string) {
  if (status === 'delivered') return 'border-success/30 bg-success/10 text-success';
  if (status === 'sent') return 'border-info/30 bg-info/10 text-info';
  if (['failed', 'dlq', 'complained'].includes(status)) return 'border-destructive/30 bg-destructive/10 text-destructive';
  if (['bounced', 'suppressed'].includes(status)) return 'border-warning/30 bg-warning/10 text-warning';
  return 'text-muted-foreground';
}

export default function AdminEmailOutcomes() {
  const [draft, setDraft] = useState<EmailFilters>(EMPTY_EMAIL_FILTERS);
  const [filters, setFilters] = useState<EmailFilters>(EMPTY_EMAIL_FILTERS);
  const [page, setPage] = useState(0);
  const invalidDates = Boolean(draft.from && draft.to && draft.from > draft.to);
  const results = useQuery({
    queryKey: ['admin-email-outcomes', filters, page],
    queryFn: async () => {
      const { data, count, error } = await emailOutcomesQuery(supabase, filters, { page });
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
    refetchInterval: 60_000,
  });
  const totals = useQuery({
    queryKey: ['admin-email-outcome-totals', filters],
    queryFn: async () => Promise.all(metrics.map(async (metric) => {
      const { count, error } = await emailOutcomesQuery(supabase, filters, { countOnly: true, statuses: metric.statuses });
      if (error) throw error;
      return count ?? 0;
    })),
    refetchInterval: 60_000,
  });
  const count = results.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / EMAIL_PAGE_SIZE));
  useEffect(() => { if (results.data && page >= pages) setPage(pages - 1); }, [results.data, page, pages]);
  const update = (key: keyof EmailFilters, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const refresh = () => { void results.refetch(); void totals.refetch(); };

  return (
    <DashboardLayout title="Email Outcomes" actions={
      <Button variant="outline" size="sm" onClick={refresh} disabled={results.isFetching || totals.isFetching}>
        <RefreshCw className={`mr-2 h-4 w-4 ${results.isFetching ? 'animate-spin' : ''}`} />Refresh
      </Button>
    }>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
          {metrics.map((metric, index) => (
            <div key={metric.label} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{metric.label}</span><metric.icon className={`h-4 w-4 shrink-0 ${metric.tone}`} /></div>
              <p className={`mt-3 text-3xl font-semibold tabular-nums ${metric.tone}`}>{totals.isPending ? '—' : totals.isError ? '—' : totals.data?.[index]?.toLocaleString('en-IN')}</p>
            </div>
          ))}
        </div>

        <form className="grid items-end gap-4 border-y py-5 sm:grid-cols-2 xl:grid-cols-6" onSubmit={(event) => { event.preventDefault(); if (invalidDates) return; setPage(0); setFilters({ ...draft }); }}>
          <div className="space-y-2"><Label htmlFor="email-recipient">Recipient</Label><Input id="email-recipient" placeholder="Email address" value={draft.recipient} onChange={(event) => update('recipient', event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="email-template">Template</Label><Input id="email-template" placeholder="All templates" value={draft.template} onChange={(event) => update('template', event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="email-status">Outcome</Label><Select value={draft.status} onValueChange={(value) => update('status', value)}><SelectTrigger id="email-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All outcomes</SelectItem>{EMAIL_STATUSES.map((status) => <SelectItem key={status} value={status}>{emailStatusLabel(status)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="email-from">From (UTC)</Label><Input className="min-w-0" id="email-from" type="date" value={draft.from} onChange={(event) => update('from', event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="email-to">To (UTC)</Label><Input className="min-w-0" id="email-to" type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => update('to', event.target.value)} /></div>
          <div className="flex gap-2"><Button type="submit" disabled={invalidDates}><Search className="mr-2 h-4 w-4" />Apply</Button><Button type="button" variant="ghost" onClick={() => { setDraft(EMPTY_EMAIL_FILTERS); setFilters(EMPTY_EMAIL_FILTERS); setPage(0); }}>Reset</Button></div>
          {invalidDates && <p role="alert" className="text-sm text-destructive sm:col-span-2 xl:col-span-6">End date must be on or after start date.</p>}
        </form>

        {(results.isError || totals.isError) && <div role="alert" className="flex items-center justify-between gap-4 border-l-2 border-destructive bg-destructive/10 p-4 text-sm"><span>Email outcomes could not be loaded.</span><Button variant="outline" size="sm" onClick={refresh}>Try again</Button></div>}
        <section className="space-y-3" aria-label="Email history">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Outcome history</h2><span className="text-xs text-muted-foreground">{count.toLocaleString('en-IN')} records · Recorded time in UTC</span></div>
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Recipient</TableHead><TableHead>Template</TableHead><TableHead>Outcome</TableHead><TableHead className="whitespace-nowrap">Recorded at (UTC)</TableHead><TableHead>Failure / reason</TableHead></TableRow></TableHeader>
              <TableBody>
                {results.isPending ? <TableRow><TableCell colSpan={5} className="h-48 text-center"><Loader2 aria-label="Loading email outcomes" className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
                  : results.isError ? <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">History unavailable</TableCell></TableRow>
                  : results.data?.rows.length === 0 ? <TableRow><TableCell colSpan={5} className="h-48 text-center text-muted-foreground"><Mail className="mx-auto mb-3 h-7 w-7" />No email outcomes match these filters.</TableCell></TableRow>
                  : results.data?.rows.map((row) => <TableRow key={row.id}>
                    <TableCell className="max-w-[260px] break-words font-medium">{row.recipient_email}</TableCell>
                    <TableCell className="max-w-[180px] break-words text-muted-foreground">{row.template_name}</TableCell>
                    <TableCell><Badge variant="outline" className={`whitespace-nowrap ${statusClass(row.status)}`}>{emailStatusLabel(row.status)}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground"><time dateTime={row.created_at}>{emailTimestamp(row.created_at)}</time></TableCell>
                    <TableCell className="min-w-[160px] max-w-sm whitespace-pre-wrap break-words text-sm text-muted-foreground">{row.error_message || '—'}</TableCell>
                  </TableRow>)}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{count > 0 ? `${page * EMAIL_PAGE_SIZE + 1}–${Math.min((page + 1) * EMAIL_PAGE_SIZE, count)} of ${count.toLocaleString('en-IN')}` : '0 records'}</span>
            <div className="flex items-center gap-3"><Button variant="outline" size="icon" aria-label="Previous page" disabled={page === 0 || results.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft className="h-4 w-4" /></Button><span>Page {page + 1} of {pages}</span><Button variant="outline" size="icon" aria-label="Next page" disabled={page + 1 >= pages || results.isFetching} onClick={() => setPage((current) => current + 1)}><ChevronRight className="h-4 w-4" /></Button></div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}