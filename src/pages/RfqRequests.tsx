import { useEffect, useMemo, useState } from 'react';
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
import { n8nPost } from '@/lib/n8n';

type RfqRow = any;
type RfqItem = any;
type ItemQuote = any;

type ItemPriceInput = {
  unit_price: string;
  gst_percent: string;
  lead_time_days: string;
  setup_charges: string;
  quote_notes: string;
};

const emptyPrice = (): ItemPriceInput => ({
  unit_price: '',
  gst_percent: '18',
  lead_time_days: '',
  setup_charges: '0',
  quote_notes: '',
});

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

function deadlineCutoff(d?: string | null): Date | null {
  if (!d) return null;
  const datePart = d.length >= 10 ? d.slice(0, 10) : d;
  return new Date(`${datePart}T17:00:00+05:30`);
}

function formatDeadline(d?: string | null) {
  if (!d) return '—';
  return `${formatDate(d)} at 5:00 PM IST`;
}

function daysUntil(d?: string | null) {
  const t = deadlineCutoff(d);
  if (!t) return null;
  const ms = t.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function isDeadlinePassed(d?: string | null) {
  const t = deadlineCutoff(d);
  if (!t) return false;
  return Date.now() > t.getTime();
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
                    {r.is_multi_item && r.item_count > 1 && (
                      <Badge variant="secondary" className="mt-1">{r.item_count} items</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[r.quantity, r.material, r.print_process, r.finish].filter(Boolean).join(' · ') || '—'}
                  </div>
                  <div className={`flex items-center gap-1.5 text-sm ${urgent ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                    {urgent && <AlertTriangle className="h-4 w-4" />}
                    <span>
                      Closes: {formatDeadline(r.response_deadline)}
                      {days !== null && days >= 0 && ` (${days}d left)`}
                      {days !== null && days < 0 && ` (closed)`}
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
        supplierEmail={supplier?.email}
        onClose={() => setSelected(null)}
        onSubmitted={() => { setSelected(null); load(); }}
        onNavigatePOs={() => navigate('/purchase-orders')}
      />
    </DashboardLayout>
  );
}

function RfqDetailSheet({
  rfq, supplierName, supplierEmail, onClose, onSubmitted, onNavigatePOs,
}: { rfq: RfqRow | null; supplierName?: string; supplierEmail?: string; onClose: () => void; onSubmitted: () => void; onNavigatePOs: () => void }) {
  // Legacy single-item form state
  const [unitPrice, setUnitPrice] = useState('');
  const [gstPercent, setGstPercent] = useState('18');
  const [leadTime, setLeadTime] = useState('');
  // Common per-quote fields (used both flows)
  const [paymentTerms, setPaymentTerms] = useState('30 days net');
  const [validity, setValidity] = useState('30');
  const [setupCharges, setSetupCharges] = useState('0');
  const [notes, setNotes] = useState('');
  // Multi-item state
  const [items, setItems] = useState<RfqItem[]>([]);
  const [existingQuotes, setExistingQuotes] = useState<ItemQuote[]>([]);
  const [itemPrices, setItemPrices] = useState<Record<number, ItemPriceInput>>({});
  const [itemsLoading, setItemsLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [reviseMode, setReviseMode] = useState(false);
  const [totalSuppliers, setTotalSuppliers] = useState<number | null>(null);

  const isMulti = !!(rfq?.is_multi_item && (rfq?.item_count ?? 1) > 1);

  // Load supplier count + items when rfq changes
  useEffect(() => {
    if (!rfq?.rfq_id) { setTotalSuppliers(null); setItems([]); setExistingQuotes([]); return; }
    supabase
      .from('rfq_portal_requests')
      .select('id', { count: 'exact', head: true })
      .eq('rfq_id', rfq.rfq_id)
      .then(({ count }) => setTotalSuppliers(count ?? null));

    setItemsLoading(true);
    (async () => {
      const [{ data: itemsData }, { data: quotesData }] = await Promise.all([
        supabase.from('rfq_items').select('*').eq('rfq_id', rfq.rfq_id).order('item_number'),
        supabase
          .from('rfq_item_quotes')
          .select('*')
          .eq('rfq_id', rfq.rfq_id)
          .eq('supplier_email', supplierEmail || ''),
      ]);
      setItems(itemsData || []);
      setExistingQuotes(quotesData || []);
      setItemsLoading(false);
    })();
  }, [rfq?.rfq_id, supplierEmail]);

  const closed = isDeadlinePassed(rfq?.response_deadline);

  // Initialize form state whenever rfq / items / quotes change
  useEffect(() => {
    if (!rfq) return;
    setReviseMode(false);
    // Common fields
    if (rfq.status === 'pending') {
      setPaymentTerms('30 days net'); setValidity('30'); setNotes('');
    } else {
      setPaymentTerms(rfq.payment_terms || '30 days net');
      setValidity(rfq.validity_days?.toString() || '30');
      setNotes(rfq.supplier_notes || '');
    }

    if (isMulti) {
      // Seed per-item price inputs from existing quotes (revise) or blanks
      const seeded: Record<number, ItemPriceInput> = {};
      items.forEach((it: RfqItem) => {
        const q = existingQuotes.find((eq) => eq.item_number === it.item_number);
        seeded[it.item_number] = q
          ? {
              unit_price: q.quoted_unit_price?.toString() || '',
              gst_percent: q.quoted_gst_percent?.toString() || '18',
              lead_time_days: q.lead_time_days?.toString() || '',
              setup_charges: q.setup_charges?.toString() || '0',
              quote_notes: q.quote_notes || '',
            }
          : emptyPrice();
      });
      setItemPrices(seeded);
    } else {
      // Legacy single-item
      if (rfq.status === 'pending') {
        setUnitPrice(''); setGstPercent('18'); setLeadTime(''); setSetupCharges('0');
      } else {
        setUnitPrice(rfq.quoted_unit_price?.toString() || '');
        setGstPercent(rfq.quoted_gst_percent?.toString() || '18');
        setLeadTime(rfq.lead_time_days?.toString() || '');
        setSetupCharges(rfq.setup_charges?.toString() || '0');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfq?.id, isMulti, items.length, existingQuotes.length]);

  const setItemPrice = (n: number, patch: Partial<ItemPriceInput>) => {
    setItemPrices((prev) => ({ ...prev, [n]: { ...(prev[n] || emptyPrice()), ...patch } }));
  };

  // ---- Totals for multi-item ----
  const multiTotals = useMemo(() => {
    if (!isMulti) return { grandTotal: 0, maxLead: 0, valid: false };
    let grand = 0;
    let maxLead = 0;
    let valid = true;
    for (const it of items) {
      const p = itemPrices[it.item_number] || emptyPrice();
      const qty = Number(it.quantity) || 0;
      const up = Number(p.unit_price);
      const gst = Number(p.gst_percent) || 0;
      const setup = Number(p.setup_charges) || 0;
      const lead = Number(p.lead_time_days) || 0;
      if (!p.unit_price || !p.lead_time_days) valid = false;
      const perUnit = up * (1 + gst / 100);
      grand += perUnit * qty + setup;
      if (lead > maxLead) maxLead = lead;
    }
    return { grandTotal: grand, maxLead, valid };
  }, [isMulti, items, itemPrices]);

  if (!rfq) return null;

  // Single-item computations
  const qty = Number(rfq.quantity) || 0;
  const up = Number(unitPrice) || 0;
  const gstPct = Number(gstPercent) || 0;
  const gstAmt = up * gstPct / 100;
  const perUnit = up + gstAmt;
  const totalForQty = perUnit * qty;

  const deadlineDays = daysUntil(rfq.response_deadline);
  const overdue = deadlineDays !== null && deadlineDays < 0;
  const isRevision = rfq.status === 'quote_submitted';

  const submitSingle = async () => {
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
      const { error } = await supabase.from('rfq_portal_requests').update(update).eq('id', rfq.id);
      if (error) throw error;

      // Also mirror into rfq_item_quotes (item 1) so the item-level table stays authoritative
      await supabase.from('rfq_item_quotes').upsert(
        {
          rfq_id: rfq.rfq_id,
          item_number: 1,
          supplier_email: (supplierEmail || rfq.supplier_email || '').toLowerCase(),
          quoted_unit_price: up,
          quoted_gst_percent: gstPct,
          total_price: perUnit,
          lead_time_days: Number(leadTime),
          setup_charges: Number(setupCharges) || 0,
          quote_notes: notes,
          quote_source: 'portal',
        },
        { onConflict: 'rfq_id,item_number,supplier_email' }
      );

      n8nPost('rfq-quote-received', {
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
      }).catch(() => {});

      toast.success(isRevision ? 'Quote revised successfully!' : 'Quote submitted! Emboss Marketing will review and get back to you.');
      onSubmitted();
    } catch (e: any) {
      toast.error(e.message || 'Failed to submit quote');
    } finally {
      setSubmitting(false);
    }
  };

  const submitMulti = async () => {
    // Validation
    for (const it of items) {
      const p = itemPrices[it.item_number] || emptyPrice();
      if (!p.unit_price || !p.lead_time_days) {
        toast.error(`Item ${it.item_number} (${it.product_name}): unit price and lead time are required`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const email = (supplierEmail || rfq.supplier_email || '').toLowerCase();
      const nowIso = new Date().toISOString();

      // 1. Upsert per-item quotes
      const rows = items.map((it) => {
        const p = itemPrices[it.item_number] || emptyPrice();
        const upn = Number(p.unit_price) || 0;
        const gstN = Number(p.gst_percent) || 0;
        const perUnitN = upn * (1 + gstN / 100);
        return {
          rfq_id: rfq.rfq_id,
          item_number: it.item_number,
          supplier_email: email,
          quoted_unit_price: upn,
          quoted_gst_percent: gstN,
          total_price: perUnitN,
          lead_time_days: Number(p.lead_time_days) || 0,
          setup_charges: Number(p.setup_charges) || 0,
          quote_notes: p.quote_notes || null,
          quote_source: 'portal',
        };
      });
      const { error: qErr } = await supabase
        .from('rfq_item_quotes')
        .upsert(rows, { onConflict: 'rfq_id,item_number,supplier_email' });
      if (qErr) throw qErr;

      // 2. Update rfq_portal_requests with grand-total summary for backward compat
      // quoted_unit_price = grand total (across all items, incl GST + setup) — used
      // by existing comparison logic and ranking. This matches the previous meaning
      // of "total quote from this supplier for this RFQ".
      const update: any = {
        quoted_unit_price: Number(multiTotals.grandTotal.toFixed(2)),
        total_price: Number(multiTotals.grandTotal.toFixed(2)),
        lead_time_days: multiTotals.maxLead,
        payment_terms: paymentTerms,
        validity_days: Number(validity) || 30,
        supplier_notes: notes,
        status: 'quote_submitted',
        quote_submitted_at: nowIso,
      };
      if (isRevision) {
        update.revision_count = (Number(rfq.revision_count) || 0) + 1;
        update.last_revised_at = nowIso;
      }
      const { error: uErr } = await supabase.from('rfq_portal_requests').update(update).eq('id', rfq.id);
      if (uErr) throw uErr;

      n8nPost('rfq-quote-received', {
        rfq_id: rfq.rfq_id,
        supplier_email: rfq.supplier_email,
        supplier_name: supplierName || rfq.supplier_email,
        submitted_by_name: rfq.submitted_by_name,
        submitted_by_email: rfq.submitted_by_email,
        is_revision: isRevision,
        is_multi_item: true,
        item_count: items.length,
        grand_total: Number(multiTotals.grandTotal.toFixed(2)),
        max_lead_time_days: multiTotals.maxLead,
        payment_terms: paymentTerms,
        validity_days: Number(validity) || 30,
        supplier_notes: notes,
        items: rows,
      }).catch(() => {});

      toast.success(isRevision ? 'Quote revised successfully!' : 'Quote submitted! Emboss Marketing will review and get back to you.');
      onSubmitted();
    } catch (e: any) {
      toast.error(e.message || 'Failed to submit quote');
    } finally {
      setSubmitting(false);
    }
  };

  const submit = () => (isMulti ? submitMulti() : submitSingle());

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
            {isMulti && <Badge variant="secondary">{items.length} items</Badge>}
          </SheetTitle>
          <SheetDescription>{rfq.client_name}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* LEFT — specs */}
          <div className="space-y-6">
            <section>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {isMulti ? `Items (${items.length})` : 'Product Specification'}
              </h4>
              {isMulti ? (
                <div className="space-y-3">
                  {itemsLoading && <div className="text-sm text-muted-foreground">Loading items…</div>}
                  {items.map((it) => (
                    <div key={it.id} className="rounded-lg border p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h5 className="font-semibold">
                          Item {it.item_number}: {it.product_name}
                        </h5>
                        {it.product_category && (
                          <Badge variant="outline">{it.product_category}</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <Spec label="Quantity" value={it.quantity} />
                        <Spec label="Dimensions" value={it.dimensions} />
                        <Spec label="Material" value={it.material} />
                        <Spec label="Print Process" value={it.print_process} />
                        <Spec label="Finish" value={it.finish} />
                        <Spec label="Colours" value={it.colours} />
                        <Spec label="Artwork" value={it.artwork_status} />
                        {it.extra_specs && (
                          <div className="col-span-2">
                            <Spec label="Specs" value={it.extra_specs} />
                          </div>
                        )}
                      </div>
                      {it.attachment_url && (
                        <a href={it.attachment_url} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                          <Button variant="outline" size="sm">
                            <ExternalLink className="mr-1 h-3 w-3" /> {it.attachment_name || 'Attachment'}
                          </Button>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
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
              )}
            </section>

            <section>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h4>
              <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                <Spec label="Client Required By" value={formatDate(rfq.required_by_date)} />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Quote Deadline</p>
                  <p className={`text-sm font-medium ${overdue ? 'text-destructive' : ''}`}>
                    {formatDeadline(rfq.response_deadline)}
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

            {!isMulti && rfq.artwork_drive_url && (
              <a href={rfq.artwork_drive_url} target="_blank" rel="noreferrer">
                <Button variant="outline" className="w-full">
                  <ExternalLink className="mr-2 h-4 w-4" /> View Artwork Files
                </Button>
              </a>
            )}
          </div>

          {/* RIGHT — quote / status */}
          <div className="space-y-4">
            {showForm && (
              <>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {isRevision ? 'Revise Your Quote' : 'Submit Your Quote'}
                </h4>
                {isRevision && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                    Closes: {formatDeadline(rfq.response_deadline)} — quote can be revised until then
                  </div>
                )}

                {isMulti ? (
                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="pb-2">Item</th>
                            <th className="pb-2">Unit ₹*</th>
                            <th className="pb-2">GST%*</th>
                            <th className="pb-2">Lead*</th>
                            <th className="pb-2">Setup ₹</th>
                            <th className="pb-2 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it) => {
                            const p = itemPrices[it.item_number] || emptyPrice();
                            const qtyN = Number(it.quantity) || 0;
                            const upn = Number(p.unit_price) || 0;
                            const gstN = Number(p.gst_percent) || 0;
                            const perUnitN = upn * (1 + gstN / 100);
                            const line = perUnitN * qtyN + (Number(p.setup_charges) || 0);
                            return (
                              <tr key={it.id} className="border-t align-top">
                                <td className="py-2 pr-2">
                                  <div className="font-medium">{it.item_number}. {it.product_name}</div>
                                  <div className="text-xs text-muted-foreground">{it.quantity}</div>
                                </td>
                                <td className="py-2 pr-2">
                                  <Input
                                    type="number"
                                    className="w-24"
                                    value={p.unit_price}
                                    onChange={(e) => setItemPrice(it.item_number, { unit_price: e.target.value })}
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <Select
                                    value={p.gst_percent}
                                    onValueChange={(v) => setItemPrice(it.item_number, { gst_percent: v })}
                                  >
                                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {['0', '5', '12', '18', '28'].map((v) => (
                                        <SelectItem key={v} value={v}>{v}%</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="py-2 pr-2">
                                  <Input
                                    type="number"
                                    className="w-20"
                                    placeholder="days"
                                    value={p.lead_time_days}
                                    onChange={(e) => setItemPrice(it.item_number, { lead_time_days: e.target.value })}
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <Input
                                    type="number"
                                    className="w-20"
                                    value={p.setup_charges}
                                    onChange={(e) => setItemPrice(it.item_number, { setup_charges: e.target.value })}
                                  />
                                </td>
                                <td className="py-2 pl-2 text-right font-semibold">
                                  ₹{line.toFixed(2)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 text-green-700">
                            <td colSpan={5} className="py-2 text-right font-bold">Grand Total</td>
                            <td className="py-2 pl-2 text-right font-bold">
                              ₹{multiTotals.grandTotal.toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Payment Terms *</Label>
                        <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
                      </div>
                      <div>
                        <Label>Quote Validity (days) *</Label>
                        <Input type="number" value={validity} onChange={(e) => setValidity(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <Label>Additional Notes</Label>
                      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
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
                ) : (
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
                )}
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
                {rfq.price_rank && totalSuppliers && (
                  <div className="rounded-md border bg-muted/50 p-3 text-sm">
                    Your current rank: <span className="font-bold">#{rfq.price_rank}</span> of {totalSuppliers} suppliers
                  </div>
                )}
                {isMulti ? (
                  <SubmittedItemQuotes items={items} quotes={existingQuotes} rfq={rfq} />
                ) : (
                  <SubmittedQuote rfq={rfq} />
                )}
                {closed ? (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-4 font-semibold text-red-800">
                    RFQ Closed — No further revisions accepted
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Closes: {formatDeadline(rfq.response_deadline)} — quote can be revised until then
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
                {isMulti ? (
                  <SubmittedItemQuotes items={items} quotes={existingQuotes} rfq={rfq} />
                ) : (
                  <SubmittedQuote rfq={rfq} />
                )}
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

function SubmittedItemQuotes({ items, quotes, rfq }: { items: RfqItem[]; quotes: ItemQuote[]; rfq: RfqRow }) {
  const total = quotes.reduce((sum, q) => {
    const it = items.find((i) => i.item_number === q.item_number);
    const qty = Number(it?.quantity) || 0;
    const perUnit = Number(q.total_price) || 0;
    return sum + perUnit * qty + (Number(q.setup_charges) || 0);
  }, 0);
  return (
    <div className="rounded-lg border p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="pb-2">Item</th>
            <th className="pb-2 text-right">Unit ₹</th>
            <th className="pb-2 text-right">GST</th>
            <th className="pb-2 text-right">Lead</th>
            <th className="pb-2 text-right">Line ₹</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const q = quotes.find((x) => x.item_number === it.item_number);
            const qty = Number(it.quantity) || 0;
            const perUnit = Number(q?.total_price) || 0;
            const line = perUnit * qty + (Number(q?.setup_charges) || 0);
            return (
              <tr key={it.id} className="border-t">
                <td className="py-1">{it.item_number}. {it.product_name}</td>
                <td className="py-1 text-right">{q?.quoted_unit_price != null ? `₹${q.quoted_unit_price}` : '—'}</td>
                <td className="py-1 text-right">{q?.quoted_gst_percent != null ? `${q.quoted_gst_percent}%` : '—'}</td>
                <td className="py-1 text-right">{q?.lead_time_days ?? '—'}d</td>
                <td className="py-1 text-right font-semibold">₹{line.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 text-green-700">
            <td colSpan={4} className="py-1 text-right font-bold">Grand Total</td>
            <td className="py-1 text-right font-bold">₹{total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      {rfq.payment_terms && (
        <div className="mt-3 border-t pt-2 text-sm">
          <span className="text-muted-foreground">Payment: </span>{rfq.payment_terms}
          {rfq.validity_days && <span className="ml-3 text-muted-foreground">Valid: {rfq.validity_days} days</span>}
        </div>
      )}
      {rfq.supplier_notes && (
        <div className="mt-2 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Your Notes</p>
          <p>{rfq.supplier_notes}</p>
        </div>
      )}
    </div>
  );
}
