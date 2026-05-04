import { useEffect, useMemo, useState } from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const N8N_QUOTE_ACCEPTED = 'https://n8n.srv1141999.hstgr.cloud/webhook/rfq-quote-accepted';

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

export default function AdminRfq() {
  const [rows, setRows] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'awaiting' | 'compare' | 'decided'>('all');
  const [rejectTarget, setRejectTarget] = useState<Rfq | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = async () => {
    const { data } = await supabase
      .from('rfq_portal_requests')
      .select('*')
      .order('created_at', { ascending: false });
    setRows(data || []);
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
      if (filter === 'awaiting') return submitted.length === 0;
      if (filter === 'compare') return submitted.length >= 2 && !items.some((r) => r.status === 'accepted');
      if (filter === 'decided') return decided;
      return true;
    });
  }, [groups, filter]);

  const accept = async (r: Rfq) => {
    try {
      await fetch(N8N_QUOTE_ACCEPTED, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfq_id: r.rfq_id,
          supplier_email: r.supplier_email,
          supplier_name: r.supplier_email,
          product_name: r.product_name,
          quantity: r.quantity,
          quoted_unit_price: r.quoted_unit_price,
          quoted_gst_percent: r.quoted_gst_percent,
          lead_time_days: r.lead_time_days,
          payment_terms: r.payment_terms,
          emboss_notes: '',
        }),
      });
      toast.success('Quote accepted! Supplier notified by email.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    const { error } = await supabase
      .from('rfq_portal_requests')
      .update({
        emboss_decision: 'rejected',
        status: 'rejected',
        emboss_notes: rejectReason || null,
        decided_at: new Date().toISOString(),
      })
      .eq('id', rejectTarget.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Supplier marked as rejected');
    setRejectTarget(null);
    setRejectReason('');
    load();
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
            const submitted = items.filter((r) => ['quote_submitted', 'accepted'].includes(r.status));
            const pending = items.filter((r) => r.status === 'pending');
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
                        Client: {first.client_name} · Required by: {fmtDate(first.required_by_date)}
                      </p>
                    </div>
                    <Badge variant="outline">{submitted.length} of {items.length} suppliers responded</Badge>
                  </div>

                  {submitted.length >= 1 && (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr className="text-left">
                            <th className="p-2">Supplier</th>
                            <th className="p-2">Unit Price</th>
                            <th className="p-2">GST</th>
                            <th className="p-2">Total/unit</th>
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
                            const perUnit = up + (up * gst / 100);
                            const isAccepted = r.status === 'accepted';
                            const isRejected = r.status === 'rejected';
                            return (
                              <tr key={r.id} className={`border-t ${isAccepted ? 'bg-green-50' : ''}`}>
                                <td className="p-2">{r.supplier_email}</td>
                                <td className="p-2">₹{up.toFixed(2)}</td>
                                <td className="p-2">{gst}%</td>
                                <td className="p-2 font-medium">₹{perUnit.toFixed(2)}</td>
                                <td className="p-2">{r.lead_time_days ?? '—'}d</td>
                                <td className="p-2">{r.payment_terms || '—'}</td>
                                <td className="p-2">{r.validity_days ?? '—'}d</td>
                                <td className="p-2">₹{r.setup_charges ?? 0}</td>
                                <td className="p-2 text-xs">{fmtDateTime(r.quote_submitted_at)}</td>
                                <td className="p-2">
                                  <div className="flex justify-end gap-2">
                                    {!isAccepted && !isRejected && (
                                      <>
                                        <Button size="sm" onClick={() => accept(r)}>
                                          <CheckCircle2 className="mr-1 h-4 w-4" /> Accept
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => setRejectTarget(r)}>
                                          <XCircle className="mr-1 h-4 w-4" /> Reject
                                        </Button>
                                      </>
                                    )}
                                    {isAccepted && <Badge className="bg-green-100 text-green-800">Accepted</Badge>}
                                    {isRejected && <Badge variant="secondary">Rejected</Badge>}
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
                            <span>{r.supplier_email}</span>
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
