import { useEffect, useMemo, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, Crown, Medal, Award, Clock, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const N8N_QUOTE_ACCEPTED = 'https://n8n.srv1141999.hstgr.cloud/webhook/rfq-quote-accepted';
const N8N_RFQ_MANAGE = 'https://n8n.srv1141999.hstgr.cloud/webhook/rfq-manage';

type Rfq = any;

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN');
}

function daysSince(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
}

function deadlineCutoff(d?: string | null): Date | null {
  if (!d) return null;
  const datePart = d.length >= 10 ? d.slice(0, 10) : d;
  return new Date(`${datePart}T17:00:00+05:30`);
}

function fmtDeadline(d?: string | null) {
  if (!d) return '—';
  return `${fmtDate(d)} at 5:00 PM IST`;
}

function closingCountdown(deadline?: string | null): { label: string; tone: 'red' | 'orange' | 'gray' | 'expired' } | null {
  const target = deadlineCutoff(deadline);
  if (!target) return null;
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return { label: 'Closed', tone: 'expired' };
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const days = h / 24;
  const tone = days < 1 ? 'red' : days < 2 ? 'orange' : 'gray';
  const label = h >= 24
    ? `Closes in ${Math.floor(h / 24)}d ${h % 24}h`
    : `Closes in ${h}h ${m}m`;
  return { label, tone };
}

function RankCell({ rank }: { rank?: number | null }) {
  if (!rank) return <span className="text-muted-foreground">—</span>;
  if (rank === 1) return (
    <span className="inline-flex items-center gap-1 font-semibold text-yellow-700">
      <Crown className="h-4 w-4 fill-yellow-400 text-yellow-500" /> #1
    </span>
  );
  if (rank === 2) return (
    <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
      <Medal className="h-4 w-4 text-slate-400" /> #2
    </span>
  );
  if (rank === 3) return (
    <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
      <Award className="h-4 w-4 text-amber-600" /> #3
    </span>
  );
  return <span className="font-medium">#{rank}</span>;
}

export default function AdminRfq() {
  const [rows, setRows] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'awaiting' | 'compare' | 'decided'>('all');
  const [rejectTarget, setRejectTarget] = useState<Rfq | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [forceCloseTarget, setForceCloseTarget] = useState<string | null>(null);
  const [forceCloseReason, setForceCloseReason] = useState('');
  const [reopenTarget, setReopenTarget] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenDate, setReopenDate] = useState<Date | undefined>(undefined);

  const load = async () => {
    const { data } = await supabase
      .from('rfq_portal_requests')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: sups } = await supabase
      .from('suppliers')
      .select('email,company')
      .limit(5000);

    const companyByEmail: Record<string, string> = {};
    (sups || []).forEach((s: any) => {
      const emailKey = String(s.email || '').trim().toLowerCase();
      if (emailKey && s.company) companyByEmail[emailKey] = s.company;
    });

    setRows((data || []).map((r: any) => ({
      ...r,
      supplier_company: companyByEmail[String(r.supplier_email || '').trim().toLowerCase()] || null,
    })));
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('rfq_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rfq_portal_requests' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const groups = useMemo(() => {
    const m = new Map<string, Rfq[]>();
    rows.forEach((r) => {
      if (!m.has(r.rfq_id)) m.set(r.rfq_id, []);
      m.get(r.rfq_id)!.push(r);
    });
    return Array.from(m.entries()).map(([rfq_id, items]) => ({ rfq_id, items }));
  }, [rows]);

  const filtered = useMemo(() => {
    return groups.filter(({ items }) => {
      const submitted = items.filter((r) => ['quote_submitted', 'accepted'].includes(r.status));
      const decided = items.some((r) => r.emboss_decision || ['accepted', 'rejected'].includes(r.status));
      if (filter === 'awaiting') return submitted.length === 0 && !decided;
      if (filter === 'compare') return submitted.length >= 2 && !decided;
      if (filter === 'decided') return decided;
      return true;
    });
  }, [groups, filter]);

  const patchLocal = (id: string, patch: Partial<Rfq>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const accept = async (r: Rfq) => {
    setBusyId(r.id);
    const prev = rows;
    // optimistic
    patchLocal(r.id, { status: 'accepted', emboss_decision: 'accepted', decided_at: new Date().toISOString() });
    const supplierName = r.supplier_company || r.supplier_email;
    try {
      const res = await fetch(N8N_QUOTE_ACCEPTED, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfq_id: r.rfq_id,
          supplier_email: r.supplier_email,
          supplier_name: supplierName,
          product_name: r.product_name,
          quantity: r.quantity,
          quoted_unit_price: Number(r.quoted_unit_price) || 0,
          quoted_gst_percent: Number(r.quoted_gst_percent) || 0,
          lead_time_days: Number(r.lead_time_days) || 0,
          payment_terms: r.payment_terms || '',
          emboss_notes: r.emboss_notes || '',
          price_rank: r.__effectiveRank ?? r.price_rank ?? 1,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Quote accepted! Supplier notified by email.');
      await load();
    } catch (e: any) {
      setRows(prev);
      toast.error(`Accept failed: ${e.message || 'Unknown error'}`);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    const target = rejectTarget;
    setBusyId(target.id);
    const prev = rows;
    patchLocal(target.id, {
      status: 'rejected', emboss_decision: 'rejected',
      emboss_notes: rejectReason || null, decided_at: new Date().toISOString(),
    });
    setRejectTarget(null);
    try {
      const { error } = await supabase
        .from('rfq_portal_requests')
        .update({
          emboss_decision: 'rejected',
          status: 'rejected',
          emboss_notes: rejectReason || null,
          decided_at: new Date().toISOString(),
        })
        .eq('id', target.id);
      if (error) throw error;
      toast.success('Quote rejected.');
      setRejectReason('');
      await load();
    } catch (e: any) {
      setRows(prev);
      toast.error(e.message || 'Failed to reject');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout title="RFQ Management" subtitle="All quote requests across suppliers">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="awaiting">Awaiting Quotes</TabsTrigger>
              <TabsTrigger value="compare">Ready to Compare</TabsTrigger>
              <TabsTrigger value="decided">Decision Made</TabsTrigger>
            </TabsList>
          </Tabs>

          {filtered.length === 0 && (
            <Card><CardContent className="py-10 text-center text-muted-foreground">No RFQs in this view.</CardContent></Card>
          )}

          {filtered.map(({ rfq_id, items }) => {
            const first = items[0];
            const decided = items.some((r) => r.emboss_decision || ['accepted', 'rejected'].includes(r.status));
            const isClosed = !!first.rfq_closed_at;
            const submittedRaw = items.filter((r) => ['quote_submitted', 'accepted', 'rejected'].includes(r.status));
            // Compute fallback ranks by total_price ascending for rows missing price_rank
            const totalOf = (r: any) => {
              const up = Number(r.quoted_unit_price) || 0;
              const gst = Number(r.quoted_gst_percent) || 0;
              return Number(r.total_price) || (up + (up * gst / 100));
            };
            const computedOrder = [...submittedRaw].sort((a, b) => totalOf(a) - totalOf(b));
            const computedRankMap = new Map<string, number>();
            computedOrder.forEach((r, i) => computedRankMap.set(r.id, i + 1));
            const effectiveRank = (r: any): number | null => {
              if (r.price_rank != null) return r.price_rank;
              return computedRankMap.get(r.id) ?? null;
            };
            const submitted = [...submittedRaw].sort((a, b) => {
              const ar = effectiveRank(a) ?? 999;
              const br = effectiveRank(b) ?? 999;
              if (ar !== br) return ar - br;
              return totalOf(a) - totalOf(b);
            });
            const pending = items.filter((r) => r.status === 'pending');
            const groupHasAccepted = items.some((r) => r.status === 'accepted');
            const countdown = closingCountdown(first.response_deadline);
            const countdownClass =
              countdown?.tone === 'red' ? 'border-red-300 bg-red-50 text-red-700' :
              countdown?.tone === 'orange' ? 'border-orange-300 bg-orange-50 text-orange-700' :
              countdown?.tone === 'expired' ? 'border-red-400 bg-red-100 text-red-800' :
              'border-muted bg-muted text-muted-foreground';
            return (
              <Card key={rfq_id}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-muted-foreground">{rfq_id}</span>
                        <h3 className="text-lg font-bold">{first.product_name}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Client: {first.client_name} · Required by: {fmtDate(first.required_by_date)} · Closes: {fmtDeadline(first.response_deadline)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {countdown && (
                        <Badge variant="outline" className={`border ${countdownClass}`}>
                          <Clock className="mr-1 h-3 w-3" /> {countdown.label}
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {submitted.length} of {items.length} suppliers responded
                      </Badge>
                      {!decided && !isClosed && (
                        <Button size="sm" variant="destructive" disabled={!!busyId} onClick={() => setForceCloseTarget(rfq_id)}>
                          Force Close
                        </Button>
                      )}
                      {isClosed && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={!!busyId} onClick={() => setReopenTarget(rfq_id)}>
                          Reopen
                        </Button>
                      )}
                    </div>
                  </div>

                  {submitted.length >= 1 && (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr className="text-left">
                            <th className="p-2">Rank</th>
                            <th className="p-2">Supplier</th>
                            <th className="p-2">Unit Price</th>
                            <th className="p-2">GST</th>
                            <th className="p-2">Total/unit (incl. GST)</th>
                            <th className="p-2">Lead Time</th>
                            <th className="p-2">Payment</th>
                            <th className="p-2">Validity</th>
                            <th className="p-2">Setup</th>
                            <th className="p-2">Submitted</th>
                            <th className="p-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {submitted.map((r) => {
                            const up = Number(r.quoted_unit_price) || 0;
                            const gst = Number(r.quoted_gst_percent) || 0;
                            const perUnit = Number(r.total_price) || (up + (up * gst / 100));
                            const isAccepted = r.status === 'accepted';
                            const isRejected = r.status === 'rejected';
                            const isBusy = busyId === r.id;
                            const disabled = isBusy || groupHasAccepted || !!busyId;
                            const sName = r.supplier_company;
                            const rowRank = effectiveRank(r);
                            const isTopRank = rowRank === 1;
                            const revisionCount = Number(r.revision_count) || 0;
                            return (
                              <tr key={r.id} className={`border-t ${isAccepted ? 'bg-green-50' : ''} ${isRejected ? 'bg-muted/30' : ''}`}>
                                <td className="p-2"><RankCell rank={rowRank} /></td>
                                <td className="p-2">
                                  <div className="font-medium">{sName || r.supplier_email}</div>
                                  {sName && <div className="text-xs text-muted-foreground">{r.supplier_email}</div>}
                                  {revisionCount > 0 && (
                                    <Badge variant="secondary" className="mt-1 text-xs">Revised {revisionCount}x</Badge>
                                  )}
                                </td>
                                <td className="p-2">₹{up.toFixed(2)}</td>
                                <td className="p-2">{gst}%</td>
                                <td className={`p-2 font-semibold ${isTopRank ? 'bg-green-100 text-green-800' : ''}`}>
                                  ₹{perUnit.toFixed(2)}
                                </td>
                                <td className="p-2">{r.lead_time_days ?? '—'}d</td>
                                <td className="p-2">{r.payment_terms || '—'}</td>
                                <td className="p-2">{r.validity_days ?? '—'}d</td>
                                <td className="p-2">₹{r.setup_charges ?? 0}</td>
                                <td className="p-2 text-xs">{fmtDateTime(r.quote_submitted_at)}</td>
                                <td className="p-2">
                                  <div className="flex justify-end gap-2">
                                    {isAccepted && (
                                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">✅ Accepted</Badge>
                                    )}
                                    {isRejected && (
                                      <Badge variant="secondary">❌ Rejected</Badge>
                                    )}
                                    {!isAccepted && !isRejected && (
                                      <>
                                        <Button size="sm" disabled={disabled} onClick={() => accept({ ...r, __effectiveRank: rowRank })}>
                                          {isBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                                          Accept
                                        </Button>
                                        <Button size="sm" variant="outline" disabled={disabled} onClick={() => setRejectTarget(r)}>
                                          {isBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <XCircle className="mr-1 h-4 w-4" />}
                                          Reject
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {pending.length > 0 && (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                      <p className="mb-2 font-medium">Awaiting quotes from:</p>
                      <ul className="space-y-1">
                        {pending.map((r) => (
                          <li key={r.id} className="flex justify-between">
                            <span>{r.supplier_company || r.supplier_email}</span>
                            <span className="text-muted-foreground">{daysSince(r.created_at)}d elapsed</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject quote</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Optional reason — shared with supplier in their portal.
          </p>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Price higher than competing quote"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={reject}>Confirm Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
