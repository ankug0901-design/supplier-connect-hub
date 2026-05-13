import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, FileQuestion, Loader2, ExternalLink, Trophy } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const N8N_QUOTE_RECEIVED = 'https://n8n.srv1141999.hstgr.cloud/webhook/rfq-quote-received';

type RfqRow = any;

const statusStyles: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  quote_submitted: 'bg-blue-100 text-blue-800 border-blue-300',
  accepted: 'bg-green-100 text-green-800 border-green-300',
  rejected: 'bg-gray-200 text-gray-700 border-gray-300',
  expired: 'bg-red-100 text-red-800 border-red-300',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  quote_submitted: 'Quote Submitted',
  accepted: 'Accepted',
  rejected: 'Rejected',
  expired: 'Expired',
};

function formatDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysUntil(d?: string | null) {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function isDeadlinePassed(d?: string | null) {
  if (!d) return false;
  // treat 5 PM IST on the deadline date as cutoff
  const deadline = new Date(d);
  deadline.setHours(17, 0, 0, 0);
  return Date.now() > deadline.getTime();
}

function RankBadge({ rank }: { rank?: number | null }) {
  if (!rank) return null;
  if (rank === 1) {
    return (
      <Badge className="border-green-300 bg-green-100 text-green-800 hover:bg-green-100">
        <Trophy className="mr-1 h-3 w-3" /> Rank #1
      </Badge>
    );
  }
  if (rank === 2) {
    return <Badge className="border-orange-300 bg-orange-100 text-orange-800 hover:bg-orange-100">Rank #2</Badge>;
  }
  return <Badge variant="secondary">Rank #{rank}</Badge>;
}

export default function RfqRequests() {
  const { supplier } = useAuth();
  const navigate = useNavigate();
  const [rfqs, setRfqs] = useState<RfqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RfqRow | null>(null);

  const load = async () => {
    if (!supplier?.email) return;
    const { data } = await supabase
      .from('rfq_portal_requests')
      .select('*')
      .eq('supplier_email', supplier.email)
      .order('created_at', { ascending: false });
    setRfqs(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!supplier?.email) return;
    const channel = supabase
      .channel('rfq_supplier')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rfq_portal_requests', filter: `supplier_email=eq.${supplier.email}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier?.email]);

  // Keep the selected row in sync with refreshed list
  useEffect(() => {
    if (selected) {
      const fresh = rfqs.find((r) => r.id === selected.id);
      if (fresh) setSelected(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqs]);

  return (
    <DashboardLayout title="RFQ Requests" subtitle="Quote requests from Emboss Marketing">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : rfqs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileQuestion className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No RFQ requests yet</p>
            <p className="text-sm text-muted-foreground">
              Requests from Emboss Marketing will appear here automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rfqs.map((r) => {
            const days = daysUntil(r.response_deadline);
            const urgent = days !== null && days <= 2;
            const locked = ['accepted', 'rejected', 'expired'].includes(r.status);
            return (
              <Card key={r.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <Badge className={`${statusStyles[r.status] || ''} border`} variant="outline">
                      {statusLabels[r.status] || r.status}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{r.rfq_id}</span>
                  </div>
                  {r.price_rank && (
                    <div><RankBadge rank={r.price_rank} /></div>
                  )}
                  <div>
                    <h3 className="text-base font-bold leading-tight">{r.product_name}</h3>
                    {r.product_category && (
                      <p className="text-sm text-muted-foreground">{r.product_category}</p>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[r.quantity, r.material, r.print_process, r.finish].filter(Boolean).join(' · ') || '—'}
                  </div>
                  <div className={`flex items-center gap-1.5 text-sm ${urgent ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                    {urgent && <AlertTriangle className="h-4 w-4" />}
                    <span>
                      Response Deadline: {formatDate(r.response_deadline)}
                      {days !== null && days >= 0 && ` (${days}d left)`}
                      {days !== null && days < 0 && ` (overdue)`}
                    </span>
                  </div>
                  <div className="mt-auto pt-2">
                    <Button
                      className="w-full"
                      disabled={locked}
                      onClick={() => setSelected(r)}
                    >
                      View {r.status === 'quote_submitted' ? '& Revise' : '& Quote'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <RfqDetailSheet
        rfq={selected}
        supplierName={supplier?.name}
        onClose={() => setSelected(null)}
        onSubmitted={() => { setSelected(null); load(); }}
        onNavigatePOs={() => navigate('/purchase-orders')}
      />
    </DashboardLayout>
  );
}

function RfqDetailSheet({
  rfq, supplierName, onClose, onSubmitted, onNavigatePOs,
}: { rfq: RfqRow | null; supplierName?: string; onClose: () => void; onSubmitted: () => void; onNavigatePOs: () => void }) {
  const [unitPrice, setUnitPrice] = useState('');
  const [gstPercent, setGstPercent] = useState('18');
  const [leadTime, setLeadTime] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('30 days net');
  const [validity, setValidity] = useState('30');
  const [setupCharges, setSetupCharges] = useState('0');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviseMode, setReviseMode] = useState(false);

  const closed = isDeadlinePassed(rfq?.response_deadline);

  useEffect(() => {
    setReviseMode(false);
    if (rfq?.status === 'pending') {
      setUnitPrice(''); setGstPercent('18'); setLeadTime('');
      setPaymentTerms('30 days net'); setValidity('30');
      setSetupCharges('0'); setNotes('');
    } else {
      setUnitPrice(rfq?.quoted_unit_price?.toString() || '');
      setGstPercent(rfq?.quoted_gst_percent?.toString() || '18');
      setLeadTime(rfq?.lead_time_days?.toString() || '');
      setPaymentTerms(rfq?.payment_terms || '30 days net');
      setValidity(rfq?.validity_days?.toString() || '30');
      setSetupCharges(rfq?.setup_charges?.toString() || '0');
      setNotes(rfq?.supplier_notes || '');
    }
  }, [rfq?.id]);

  if (!rfq) return null;

  const qty = Number(rfq.quantity) || 0;
  const up = Number(unitPrice) || 0;
  const gstPct = Number(gstPercent) || 0;
  const gstAmt = up * gstPct / 100;
  const perUnit = up + gstAmt;
  const totalForQty = perUnit * qty;

  const deadlineDays = daysUntil(rfq.response_deadline);
  const overdue = deadlineDays !== null && deadlineDays < 0;
  const isRevision = rfq.status === 'quote_submitted';

  const submit = async () => {
    if (!unitPrice || !leadTime) {
      toast.error('Unit price and lead time are required');
      return;
    }
    setSubmitting(true);
    try {
      const update: any = {
        quoted_unit_price: up,
        quoted_gst_percent: gstPct,
        lead_time_days: Number(leadTime),
        payment_terms: paymentTerms,
        validity_days: Number(validity) || 30,
        setup_charges: Number(setupCharges) || 0,
        supplier_notes: notes,
        total_price: perUnit,
        status: 'quote_submitted',
        quote_submitted_at: new Date().toISOString(),
      };
      if (isRevision) {
        update.revision_count = (Number(rfq.revision_count) || 0) + 1;
        update.last_revised_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('rfq_portal_requests')
        .update(update)
        .eq('id', rfq.id);
      if (error) throw error;

      await fetch(N8N_QUOTE_RECEIVED, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfq_id: rfq.rfq_id,
          supplier_email: rfq.supplier_email,
          supplier_name: supplierName || rfq.supplier_email,
          submitted_by_name: rfq.submitted_by_name,
          submitted_by_email: rfq.submitted_by_email,
          is_revision: isRevision,
          quoted_unit_price: up,
          quoted_gst_percent: gstPct,
          lead_time_days: Number(leadTime),
          payment_terms: paymentTerms,
          validity_days: Number(validity) || 30,
          setup_charges: Number(setupCharges) || 0,
          supplier_notes: notes,
        }),
      }).catch(() => {});

      toast.success(isRevision ? 'Quote revised successfully!' : 'Quote submitted! Emboss Marketing will review and get back to you.');
      onSubmitted();
    } catch (e: any) {
      toast.error(e.message || 'Failed to submit quote');
    } finally {
      setSubmitting(false);
    }
  };

  const Spec = ({ label, value }: { label: string; value?: string | number | null }) => (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '—'}</p>
    </div>
  );

  const showForm = rfq.status === 'pending' || (reviseMode && isRevision && !closed);

  return (
    <Sheet open={!!rfq} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-5xl">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-3">
            <span>{rfq.product_name}</span>
            <span className="font-mono text-sm text-muted-foreground">{rfq.rfq_id}</span>
            <RankBadge rank={rfq.price_rank} />
          </SheetTitle>
          <SheetDescription>{rfq.client_name}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* LEFT */}
          <div className="space-y-6">
            <section>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Product Specification
              </h4>
              <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                <Spec label="Category" value={rfq.product_category} />
                <Spec label="Product Name" value={rfq.product_name} />
                <Spec label="Quantity" value={rfq.quantity} />
                <Spec label="Dimensions" value={rfq.dimensions} />
                <Spec label="Material" value={rfq.material} />
                <Spec label="Print Process" value={rfq.print_process} />
                <Spec label="Finish" value={rfq.finish} />
                <Spec label="Colours" value={rfq.colours} />
                <Spec label="Artwork Status" value={rfq.artwork_status} />
                <Spec label="Item Specs" value={rfq.item_specs} />
                <div className="col-span-2">
                  <Spec label="Additional Specs" value={rfq.extra_specs} />
                </div>
              </div>
            </section>

            <section>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h4>
              <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                <Spec label="Client Required By" value={formatDate(rfq.required_by_date)} />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Quote Deadline</p>
                  <p className={`text-sm font-medium ${overdue ? 'text-destructive' : ''}`}>
                    {formatDate(rfq.response_deadline)}
                  </p>
                </div>
                <Spec label="RFQ Received" value={formatDate(rfq.created_at)} />
              </div>
            </section>

            <section>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Budget & Instructions
              </h4>
              <div className="space-y-3 rounded-lg border p-4">
                <Spec label="Client Budget" value={rfq.client_budget || 'Not disclosed'} />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Special Instructions</p>
                  <p className="whitespace-pre-wrap text-sm">{rfq.special_instructions || '—'}</p>
                </div>
              </div>
            </section>

            {rfq.artwork_drive_url && (
              <a href={rfq.artwork_drive_url} target="_blank" rel="noreferrer">
                <Button variant="outline" className="w-full">
                  <ExternalLink className="mr-2 h-4 w-4" /> View Artwork Files
                </Button>
              </a>
            )}
          </div>

          {/* RIGHT */}
          <div className="space-y-4">
            {showForm && (
              <>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {isRevision ? 'Revise Your Quote' : 'Submit Your Quote'}
                </h4>
                {isRevision && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                    Quotes can be revised until {formatDate(rfq.response_deadline)} at 5:00 PM IST
                  </div>
                )}
                <div className="space-y-4 rounded-lg border p-4">
                  <div>
                    <Label>Unit Price (₹, ex-GST) *</Label>
                    <Input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
                  </div>
                  <div>
                    <Label>GST % *</Label>
                    <Select value={gstPercent} onValueChange={setGstPercent}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['0', '5', '12', '18', '28'].map((v) => (
                          <SelectItem key={v} value={v}>{v}%</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Lead Time (days) *</Label>
                    <Input type="number" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} />
                  </div>
                  <div>
                    <Label>Payment Terms</Label>
                    <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
                  </div>
                  <div>
                    <Label>Validity (days)</Label>
                    <Input type="number" value={validity} onChange={(e) => setValidity(e.target.value)} />
                  </div>
                  <div>
                    <Label>Setup / Plate Charges (₹)</Label>
                    <Input type="number" value={setupCharges} onChange={(e) => setSetupCharges(e.target.value)} />
                  </div>
                  <div>
                    <Label>Notes / Remarks</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>

                  <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
                    <div className="flex justify-between"><span>Unit Price:</span><span>₹{up.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>GST ({gstPct}%):</span><span>₹{gstAmt.toFixed(2)}</span></div>
                    <div className="my-1 border-t" />
                    <div className="flex justify-between font-bold"><span>Total per unit:</span><span>₹{perUnit.toFixed(2)}</span></div>
                    <div className="flex justify-between font-bold text-green-700">
                      <span>Total for {qty}:</span><span>₹{totalForQty.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {isRevision && (
                      <Button variant="outline" onClick={() => setReviseMode(false)} disabled={submitting}>
                        Cancel
                      </Button>
                    )}
                    <Button className="flex-1" onClick={submit} disabled={submitting}>
                      {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isRevision ? 'Submit Revised Quote' : 'Submit Quote to Emboss Marketing'}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {!showForm && rfq.status === 'quote_submitted' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-blue-300 bg-blue-50 p-4 font-semibold text-blue-800">
                  Quote Submitted
                  {rfq.revision_count > 0 && (
                    <span className="ml-2 text-xs font-normal">(Revised {rfq.revision_count}x)</span>
                  )}
                </div>
                <SubmittedQuote rfq={rfq} />
                {closed ? (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-4 font-semibold text-red-800">
                    RFQ Closed — No further revisions accepted
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Quotes can be revised until {formatDate(rfq.response_deadline)} at 5:00 PM IST
                    </p>
                    <Button onClick={() => setReviseMode(true)} variant="outline" className="w-full">
                      Revise Your Quote
                    </Button>
                  </>
                )}
                <p className="text-sm text-muted-foreground">Awaiting Emboss Marketing decision...</p>
              </div>
            )}

            {rfq.status === 'accepted' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-green-300 bg-green-50 p-4 font-semibold text-green-800">
                  Your Quote Was Accepted!
                </div>
                <SubmittedQuote rfq={rfq} />
                {rfq.emboss_notes && (
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes from Emboss</p>
                    <p>{rfq.emboss_notes}</p>
                  </div>
                )}
                <Button onClick={onNavigatePOs}>View Purchase Orders</Button>
              </div>
            )}

            {rfq.status === 'rejected' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-gray-300 bg-gray-100 p-4 font-semibold text-gray-700">
                  Not Selected This Time
                </div>
                {rfq.emboss_notes && (
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes from Emboss</p>
                    <p>{rfq.emboss_notes}</p>
                  </div>
                )}
              </div>
            )}

            {rfq.status === 'expired' && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-4 font-semibold text-red-800">
                RFQ Expired — deadline has passed
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SubmittedQuote({ rfq }: { rfq: RfqRow }) {
  const Row = ({ k, v }: { k: string; v: any }) => (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v ?? '—'}</span>
    </div>
  );
  return (
    <div className="rounded-lg border p-4">
      <Row k="Unit Price" v={rfq.quoted_unit_price ? `₹${rfq.quoted_unit_price}` : null} />
      <Row k="GST %" v={rfq.quoted_gst_percent != null ? `${rfq.quoted_gst_percent}%` : null} />
      <Row k="Lead Time" v={rfq.lead_time_days ? `${rfq.lead_time_days} days` : null} />
      <Row k="Payment Terms" v={rfq.payment_terms} />
      <Row k="Validity" v={rfq.validity_days ? `${rfq.validity_days} days` : null} />
      <Row k="Setup Charges" v={rfq.setup_charges != null ? `₹${rfq.setup_charges}` : null} />
      <Row k="Submitted At" v={rfq.quote_submitted_at ? new Date(rfq.quote_submitted_at).toLocaleString('en-IN') : null} />
      {rfq.last_revised_at && (
        <Row k="Last Revised" v={new Date(rfq.last_revised_at).toLocaleString('en-IN')} />
      )}
      {rfq.supplier_notes && (
        <div className="mt-2 border-t pt-2 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Your Notes</p>
          <p>{rfq.supplier_notes}</p>
        </div>
      )}
    </div>
  );
}
