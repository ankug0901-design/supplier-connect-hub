import { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, X, CheckCircle, Plus, Trash2, Sparkles, Loader2, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useAuth, useReadOnly } from '@/contexts/AuthContext';
import { fetchPurchaseOrders, fetchPurchaseOrdersFromDb, syncAndFetchPurchaseOrdersFromDb, submitInvoice, fetchInvoicedQuantitiesForPo, fetchLivePurchaseOrdersFromZoho } from '@/services/api';
import { preparePodFiles } from '@/lib/pod-files';
import { AccountSetupBanner } from '@/components/AccountSetupBanner';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { DiscrepancyChecker } from '@/components/invoice/DiscrepancyChecker';

type LineItem = {
  line_item_id?: string;
  item_name: string;
  description?: string;
  hsn?: string;
  tax_rate?: number;
  tax_name?: string;
  po_quantity?: number;
  invoiced_quantity?: number;
  quantity: number;
  rate: number;
  actual_delivery_date?: string;
  selected?: boolean;
};

function LineItemsInput({
  items,
  onChange,
  lockDetails = false,
  emptyFromPO = false,
  expectedDelivery,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  /** When true, description / HSN / rate / PO Qty are locked (from PO) but Invoice Qty stays editable. */
  lockDetails?: boolean;
  /** When true, show a hint that the selected PO didn't return any line items. */
  emptyFromPO?: boolean;
  /** PO expected delivery date (YYYY-MM-DD) for variance display. */
  expectedDelivery?: string;
}) {
  const update = (i: number, field: keyof LineItem, value: any) => {
    const u = [...items];
    u[i] = { ...u[i], [field]: value };
    onChange(u);
  };
  const add = () =>
    onChange([
      ...items,
      { item_name: '', hsn: '', po_quantity: 0, quantity: 1, rate: 0, actual_delivery_date: '', selected: true },
    ]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  const allSelected = items.length > 0 && items.every((it) => it.selected !== false);
  const toggleAll = (checked: boolean) =>
    onChange(items.map((it) => ({ ...it, selected: checked })));

  const computeVariance = (actualISO?: string) => {
    if (!actualISO || !expectedDelivery) return null;
    const actual = new Date(actualISO);
    const expected = new Date(expectedDelivery);
    if (isNaN(actual.getTime()) || isNaN(expected.getTime())) return null;
    return Math.round((actual.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Line Items *</Label>
        {lockDetails && (
          <span className="text-xs text-muted-foreground">
            Tick only the items you're invoicing now · Invoice Qty stays editable
          </span>
        )}
      </div>
      {emptyFromPO && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
          This PO didn't return any line items from Zoho Books. Please enter them manually.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table className="min-w-[1100px]">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-10 px-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => toggleAll(!!v)}
                  aria-label="Select all line items"
                />
              </TableHead>
              <TableHead className="min-w-[260px]">Item name &amp; description</TableHead>
              <TableHead className="w-28">HSN/SAC</TableHead>
              <TableHead className="w-20 text-right">PO Qty</TableHead>
              <TableHead className="w-24 text-right">Already Invoiced</TableHead>
              <TableHead className="w-36 text-right">Invoice Qty</TableHead>
              <TableHead className="w-28 text-right">Rate (₹)</TableHead>
              <TableHead className="w-24 text-right">Tax</TableHead>
              <TableHead className="w-44">Actual Delivery Date</TableHead>
              <TableHead className="w-24">Variance</TableHead>
              {!lockDetails && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, i) => {
              const poQty = Number(item.po_quantity || 0);
              const invoicedQty = Number(item.invoiced_quantity || 0);
              const remaining = Math.max(poQty - invoicedQty, 0);
              const fullyInvoiced = poQty > 0 && remaining <= 0;
              const isSelected = item.selected !== false && !fullyInvoiced;
              const variance = computeVariance(item.actual_delivery_date);
              const actualDate = item.actual_delivery_date ? new Date(item.actual_delivery_date) : undefined;

              return (
                <TableRow key={i} className={cn(fullyInvoiced && 'opacity-60')}>
                  <TableCell className="px-2 py-3">
                    <Checkbox
                      checked={isSelected}
                      disabled={fullyInvoiced}
                      onCheckedChange={(v) => update(i, 'selected', !!v)}
                      aria-label={`Select line ${i + 1}`}
                    />
                  </TableCell>
                  <TableCell className="py-3">
                    {lockDetails ? (
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium">{item.item_name || '—'}</div>
                        {item.description && item.description !== item.item_name && (
                          <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                            {item.description}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Input
                          placeholder="Item name"
                          value={item.item_name}
                          onChange={(e) => update(i, 'item_name', e.target.value)}
                          disabled={!isSelected}
                        />
                        <Input
                          placeholder="Description (optional)"
                          value={item.description || ''}
                          onChange={(e) => update(i, 'description', e.target.value)}
                          disabled={!isSelected}
                        />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="py-3">
                    {lockDetails ? (
                      <div className="text-sm text-muted-foreground">{item.hsn || '—'}</div>
                    ) : (
                      <Input
                        placeholder="HSN"
                        value={item.hsn || ''}
                        onChange={(e) => update(i, 'hsn', e.target.value)}
                        disabled={!isSelected}
                      />
                    )}
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    {lockDetails ? (
                      <div className="text-sm font-medium">{poQty || 0}</div>
                    ) : (
                      <Input
                        type="number"
                        min="0"
                        className="text-right"
                        placeholder="0"
                        value={item.po_quantity ?? ''}
                        onChange={(e) => update(i, 'po_quantity', parseFloat(e.target.value) || 0)}
                        disabled={!isSelected}
                      />
                    )}
                  </TableCell>
                  <TableCell className="py-3 text-right text-sm text-muted-foreground">
                    {invoicedQty}
                  </TableCell>
                  <TableCell className="py-3">
                    <Input
                      type="text"
                      inputMode="decimal"
                      className="text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder={fullyInvoiced ? '—' : '0'}
                      value={fullyInvoiced ? 0 : item.quantity}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9.]/g, '');
                        const v = parseFloat(raw) || 0;
                        const capped = poQty > 0 ? Math.min(v, remaining) : v;
                        update(i, 'quantity', capped);
                      }}
                      disabled={!isSelected || fullyInvoiced}
                    />
                  </TableCell>
                  <TableCell className="py-3">
                    {lockDetails ? (
                      <div className="text-right text-sm">{Number(item.rate || 0).toFixed(2)}</div>
                    ) : (
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="text-right"
                        placeholder="0.00"
                        value={item.rate}
                        onChange={(e) => update(i, 'rate', parseFloat(e.target.value) || 0)}
                        disabled={!isSelected}
                      />
                    )}
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    {lockDetails ? (
                      <div className="text-sm">
                        {item.tax_rate != null && !Number.isNaN(item.tax_rate) ? (
                          <>
                            <div className="font-medium">{Number(item.tax_rate).toFixed(2)}%</div>
                            {item.tax_name && (
                              <div className="text-xs text-muted-foreground">{item.tax_name}</div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    ) : (
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="text-right"
                        placeholder="0"
                        value={item.tax_rate ?? ''}
                        onChange={(e) => update(i, 'tax_rate', parseFloat(e.target.value) || 0)}
                        disabled={!isSelected}
                      />
                    )}
                  </TableCell>
                  <TableCell className="py-3">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!isSelected}
                          className={cn(
                            'w-full justify-start gap-2 font-normal',
                            !actualDate && 'text-muted-foreground',
                          )}
                        >
                          <CalendarIcon className="h-4 w-4 shrink-0" />
                          {actualDate ? format(actualDate, 'dd MMM yyyy') : 'Pick date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-50 pointer-events-auto" align="start">
                        <Calendar
                          mode="single"
                          selected={actualDate}
                          onSelect={(d) =>
                            update(i, 'actual_delivery_date', d ? format(d, 'yyyy-MM-dd') : '')
                          }
                          disabled={(d) => d > new Date()}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell className="py-3">
                    {variance === null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : variance <= 0 ? (
                      <span className="text-xs font-medium text-success">
                        On time{variance < 0 ? ` (${Math.abs(variance)}d early)` : ''}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-destructive">{variance}d late</span>
                    )}
                  </TableCell>
                  {!lockDetails && (
                    <TableCell className="py-3">
                      {items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(i)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Per-row hints */}
      <div className="space-y-1">
        {items.map((item, i) => {
          const poQty = Number(item.po_quantity || 0);
          const invoicedQty = Number(item.invoiced_quantity || 0);
          const remaining = Math.max(poQty - invoicedQty, 0);
          const fullyInvoiced = poQty > 0 && remaining <= 0;
          if (fullyInvoiced) {
            return (
              <p key={i} className="text-xs text-success">
                Line {i + 1}: Fully invoiced — PO quantity has already been billed.
              </p>
            );
          }
          if (invoicedQty > 0) {
            return (
              <p key={i} className="text-xs text-muted-foreground">
                Line {i + 1}: {remaining} of {poQty} remaining to invoice.
              </p>
            );
          }
          return null;
        })}
      </div>

      {!lockDetails && (
        <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1">
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      )}
    </div>
  );
}

export default function InvoiceUpload() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { supplier, isAdmin } = useAuth();
  const isReadOnly = useReadOnly();
  const preselectedPO = searchParams.get('po');

  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [selectedPO, setSelectedPO] = useState(preselectedPO || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [amount, setAmount] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [materialReceipts, setMaterialReceipts] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { item_name: '', quantity: 1, rate: 0, selected: true },
  ]);
  const [amountTouched, setAmountTouched] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoadingPOs, setIsLoadingPOs] = useState(false);

  const extractFromInvoiceFile = async (file: File) => {
    setIsExtracting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invoice-ocr`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token ?? ''}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: form,
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Extraction failed');
      const d = json.data || {};
      if (d.invoice_number) setInvoiceNumber(d.invoice_number);
      if (d.invoice_date) setInvoiceDate(d.invoice_date);
      if (d.total_amount) setAmount(String(d.total_amount));
      if (Array.isArray(d.line_items) && d.line_items.length) {
        // Only keep OCR rows with a valid quantity & rate (filters out tax/footer rows).
        const ocrRows = d.line_items
          .map((li: any) => ({
            item_name: String(li.item_name || '').trim(),
            quantity: Number(li.quantity) || 0,
            rate: Number(li.rate) || 0,
          }))
          .filter((li: any) => li.quantity > 0 && li.rate > 0);

        // Merge OCR values INTO the PO-prepopulated rows so item_name / hsn /
        // po_quantity / invoiced_quantity stay aligned with the PO. We match by
        // normalised name first, then fall back to positional mapping.
        setLineItems((prev) => {
          const hasPoContext = prev.some(
            (p) => (p.po_quantity ?? 0) > 0 || (p.invoiced_quantity ?? 0) > 0,
          );
          if (!hasPoContext) {
            // No PO context yet — just load OCR rows as-is (manual entry mode).
            return ocrRows.map((r) => ({ ...r, selected: true }));
          }

          const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
          const usedOcr = new Set<number>();
          return prev.map((row, idx) => {
            // 1. Try fuzzy name match (either side contains the other).
            let matchIdx = ocrRows.findIndex((o, i) => {
              if (usedOcr.has(i)) return false;
              const a = norm(o.item_name);
              const b = norm(row.item_name || '');
              return a && b && (a.includes(b) || b.includes(a));
            });
            // 2. Fall back to same positional index.
            if (matchIdx === -1 && ocrRows[idx] && !usedOcr.has(idx)) matchIdx = idx;
            if (matchIdx === -1) return row;
            usedOcr.add(matchIdx);
            const ocr = ocrRows[matchIdx];
            const poQty = Number(row.po_quantity || 0);
            const invoicedQty = Number(row.invoiced_quantity || 0);
            const remaining = Math.max(poQty - invoicedQty, 0);
            const cappedQty = poQty > 0 ? Math.min(ocr.quantity, remaining) : ocr.quantity;
            return {
              ...row,
              quantity: cappedQty,
              rate: ocr.rate || row.rate,
              selected: cappedQty > 0,
            };
          });
        });
      }
      if (d.po_number) {
        const match = purchaseOrders.find(
          (po: any) => po.poNumber?.toLowerCase() === String(d.po_number).toLowerCase(),
        );
        if (match) setSelectedPO(match.id);
      }
      toast({
        title: 'Extraction complete',
        description: 'Review the fields and submit when ready.',
      });
    } catch (err: any) {
      toast({
        title: 'Extraction failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const extractFromInvoice = async () => {
    if (!invoiceFile) return;
    await extractFromInvoiceFile(invoiceFile);
  };

  useEffect(() => {
    if (!isAdmin && !supplier?.zoho_vendor_id) return;
    let cancelled = false;
    setIsLoadingPOs(true);
    (async () => {
      try {
        const data = isAdmin
          ? await fetchPurchaseOrdersFromDb(false)
          : await fetchPurchaseOrders(supplier!.zoho_vendor_id!);
        if (!cancelled) setPurchaseOrders(data);
        if (isAdmin) {
          syncAndFetchPurchaseOrdersFromDb()
            .then((freshData) => {
              if (!cancelled) setPurchaseOrders(freshData);
            })
            .catch((syncErr) => console.warn('Background PO refresh failed', syncErr));
        }
      } catch (err) {
        console.error('Failed to load POs', err);
      } finally {
        if (!cancelled) setIsLoadingPOs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supplier?.zoho_vendor_id, isAdmin]);

  // Helper: extract a line-items array from a PO object regardless of which
  // field name Zoho/n8n returned (items / line_items / lineItems / purchaseorder_items).
  const extractItems = (po: any): any[] => {
    if (!po) return [];
    const candidates = [po.items, po.line_items, po.lineItems, po.purchaseorder_items, po.purchaseOrderItems];
    for (const c of candidates) if (Array.isArray(c) && c.length) return c;
    return [];
  };

  // Prepopulate line items from the selected PO (from Zoho Books), then subtract
  // any previously-invoiced quantities for the same PO/items.
  useEffect(() => {
    if (!selectedPO) return;
    const po = purchaseOrders.find((p: any) => p.id === selectedPO);
    if (!po) return;
    let cancelled = false;

    (async () => {
      let items: any[] = extractItems(po);

      // Always try to enrich with live Zoho PO data so we get HSN + tax_rate
      // (these aren't persisted to our DB cache). Skip if items already carry
      // tax_percentage/hsn to avoid redundant calls.
      const alreadyEnriched =
        items.length > 0 &&
        items.every(
          (it: any) =>
            (it.hsn || it.hsn_or_sac || it.hsn_sac) &&
            (it.tax_percentage != null || it.tax_rate != null),
        );
      const vendorIdForLive = po.supplierZohoVendorId || supplier?.zoho_vendor_id;
      if (!alreadyEnriched && vendorIdForLive) {
        try {
          const livePos = await fetchLivePurchaseOrdersFromZoho(vendorIdForLive);
          console.debug('[InvoiceUpload] live POs', {
            count: (livePos || []).length,
            sampleKeys: livePos?.[0] ? Object.keys(livePos[0]) : [],
            targetId: po.id,
            targetPoNumber: po.poNumber,
          });
          const match = (livePos || []).find(
            (p: any) =>
              p.id === po.id ||
              String(p.id) === String(po.id) ||
              String(p.purchaseorder_id || '') === String(po.id) ||
              p.poNumber === po.poNumber ||
              p.purchaseorder_number === po.poNumber,
          );
          const liveItems = extractItems(match);
          console.debug('[InvoiceUpload] live match', {
            matched: !!match,
            matchKeys: match ? Object.keys(match) : [],
            liveItemCount: liveItems.length,
            firstItemKeys: liveItems[0] ? Object.keys(liveItems[0]) : [],
            firstItem: liveItems[0],
          });
          if (liveItems.length && !cancelled) {
            // Merge live fields (hsn, tax_*) into existing items by line_item_id then name.
            const liveByLineId: Record<string, any> = {};
            const liveByName: Record<string, any> = {};
            liveItems.forEach((li: any) => {
              const lid = String(li.line_item_id || li.id || '');
              if (lid) liveByLineId[lid] = li;
              const nm = String(li.item_name || li.name || li.description || '').trim().toLowerCase();
              if (nm) liveByName[nm] = li;
            });
            const base = items.length ? items : liveItems;
            items = base.map((it: any) => {
              const lid = String(it.line_item_id || it.zoho_line_item_id || '');
              const nm = String(it.item_name || it.name || it.description || '').trim().toLowerCase();
              const live = (lid && liveByLineId[lid]) || liveByName[nm] || {};
              const hsnVal =
                it.hsn ||
                it.hsn_or_sac ||
                it.hsn_sac ||
                live.hsn ||
                live.hsn_or_sac ||
                live.hsn_sac ||
                live.sac ||
                '';
              return {
                ...live,
                ...it,
                hsn: hsnVal,
                tax_percentage:
                  it.tax_percentage ?? it.tax_rate ?? live.tax_percentage ?? live.tax_rate,
                tax_name: it.tax_name || live.tax_name,
              };
            });
          }
        } catch (err) {
          console.warn('Failed to fetch live PO items', err);
        }
      }
      if (cancelled) return;

      let invoicedMap: Record<string, number> = {};
      const supplierIdForLookup = isAdmin ? po.supplier_id || supplier?.id : supplier?.id;
      if (supplierIdForLookup && po.poNumber) {
        try {
          invoicedMap = await fetchInvoicedQuantitiesForPo(supplierIdForLookup, po.poNumber);
        } catch (err) {
          console.warn('Failed to load prior invoiced qty', err);
        }
      }
      if (cancelled) return;

      if (items.length) {
        setLineItems(
          items.map((it: any) => {
            const qty = Number(it.quantity ?? it.qty ?? 0) || 0;
            // Zoho's product name (e.g. "Branding Elements") — must be echoed
            // back to Zoho on submit, even though the UI shows the description.
            const name = String(
              it.item_name ?? it.name ?? it.description ?? it.item_description ?? it.item ?? '',
            );
            // Zoho's free-text description (e.g. "Event Collaterals ~ Delhi…").
            const description = String(
              it.description ?? it.item_description ?? it.item_name ?? it.name ?? '',
            );
            // Only accept Zoho's real 19-digit line_item_id. DO NOT fall back
            // to local DB row UUIDs — Zoho rejects unknown line ids.
            const zohoLineId = it.line_item_id ?? it.lineItemId ?? it.zoho_line_item_id ?? '';
            const invoiced = invoicedMap[name.trim().toLowerCase()] || 0;
            const remaining = Math.max(qty - invoiced, 0);
            const taxRateRaw = it.tax_percentage ?? it.tax_rate ?? it.taxPercent ?? it.tax_percent;
            const taxRate = taxRateRaw != null && taxRateRaw !== '' ? Number(taxRateRaw) : undefined;
            return {
              line_item_id: zohoLineId ? String(zohoLineId) : undefined,
              item_name: name,
              description,
              hsn: it.hsn || it.hsn_or_sac || it.hsn_sac || it.sac || '',
              tax_rate: taxRate != null && !Number.isNaN(taxRate) ? taxRate : undefined,
              tax_name: it.tax_name || it.taxName || '',
              po_quantity: qty,
              invoiced_quantity: invoiced,
              quantity: remaining,
              rate: Number(it.rate ?? it.unitPrice ?? it.unit_price ?? it.price ?? 0) || 0,
              selected: remaining > 0,
            };
          }),
        );
      }
      setAmountTouched(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPO, purchaseOrders, supplier?.id, supplier?.zoho_vendor_id, isAdmin]);

  // Auto-compute invoice amount from selected line items (qty × rate),
  // unless the user has manually edited the amount.
  useEffect(() => {
    if (amountTouched) return;
    const total = lineItems
      .filter((li) => li.selected !== false)
      .reduce((sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.rate) || 0), 0);
    setAmount(total ? String(Math.round(total * 100) / 100) : '');
  }, [lineItems, amountTouched]);

  const handleInvoiceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setInvoiceFile(file);
      void extractFromInvoiceFile(file);
    }
  };

  const handleMaterialReceiptsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length) {
      const incoming = Array.from(e.target.files);
      setMaterialReceipts((prev) => {
        const key = (f: File) => `${f.name}-${f.size}-${f.lastModified}`;
        const existing = new Set(prev.map(key));
        const merged = [...prev];
        for (const f of incoming) if (!existing.has(key(f))) merged.push(f);
        return merged;
      });
      // Reset the input so selecting the same file again still triggers change
      e.target.value = '';
    }
  };

  const removeInvoiceFile = () => setInvoiceFile(null);

  const removeMaterialReceipt = (index: number) => {
    setMaterialReceipts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      toast({
        title: 'Read-only mode',
        description: 'You are viewing this portal as a supplier. Submitting invoices is disabled.',
        variant: 'destructive',
      });
      return;
    }
    if (!supplier) return;
    const selectedPOData = purchaseOrders.find((po: any) => po.id === selectedPO);
    if (!selectedPOData) return;
    if (!selectedPOData.deliveryDatesConfirmedAt) {
      toast({
        title: 'Delivery dates not confirmed',
        description:
          'Please confirm the delivery date for every line item on this PO before submitting an invoice.',
        variant: 'destructive',
      });
      return;
    }
    if (materialReceipts.length === 0) {
      toast({
        title: 'Proof of Delivery required',
        description:
          'Please upload at least one material receiving copy (proof of delivery) before submitting the invoice.',
        variant: 'destructive',
      });
      return;
    }
    const cleanedLineItems = lineItems
      .filter((li) => li.selected !== false && li.item_name)
      .map((li) => ({
        ...li,
        item_name: String(li.item_name).trim(),
        quantity: Number(li.quantity) || 0,
        rate: Number(li.rate) || 0,
      }))
      .filter((li) => li.item_name && li.quantity > 0 && li.rate > 0);

    if (cleanedLineItems.length === 0) {
      toast({
        title: 'Line items required',
        description:
          'Each selected line item needs an item name, quantity > 0, and a rate > 0 before submitting.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const pod_files = await preparePodFiles(materialReceipts);
      await submitInvoice({
        po_number: selectedPOData.poNumber,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        supplier_name: supplier.company,
        contact_email: supplier.email,
        supplier_id: supplier.id,
        line_items: cleanedLineItems,
        pdf_file: invoiceFile || undefined,
        pod_files,
        notes: '',
      });
      toast({
        title: 'Invoice Submitted!',
        description: 'Successfully submitted to Zoho Books.',
      });
      navigate('/invoices');
    } catch (err: any) {
      toast({
        title: 'Submission Failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAdmin && !supplier?.zoho_vendor_id) {
    return (
      <DashboardLayout title="Upload Invoice" subtitle="Submit invoice against a purchase order">
        <AccountSetupBanner />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Upload Invoice" subtitle="Submit invoice against a purchase order">
      <div className="mx-auto max-w-6xl">
        <Link to="/invoices">
          <Button variant="ghost" className="mb-6 gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Invoices
          </Button>
        </Link>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Invoice Details Card */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-card animate-slide-up">
            <h2 className="mb-6 text-lg font-semibold">Invoice Details</h2>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="po">Purchase Order *</Label>
                <Select value={selectedPO} onValueChange={setSelectedPO} required disabled={isLoadingPOs}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={isLoadingPOs ? 'Loading purchase orders…' : 'Select Purchase Order'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingPOs ? (
                      <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                      </div>
                    ) : purchaseOrders.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground">No purchase orders found.</div>
                    ) : (
                      purchaseOrders.map((po: any) => (
                        <SelectItem key={po.id} value={po.id}>
                          {po.poNumber}
                          {isAdmin && po.supplierName ? ` — ${po.supplierName}` : ''}
                          {!po.deliveryDatesConfirmedAt ? ' · ⚠ delivery dates pending' : ''}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {(() => {
                  const po = purchaseOrders.find((p: any) => p.id === selectedPO);
                  if (po && !po.deliveryDatesConfirmedAt) {
                    return (
                      <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
                        Delivery dates have not been confirmed for this PO yet. Please{' '}
                        <Link to={`/purchase-orders/${po.id}`} className="font-medium text-warning underline">
                          confirm delivery dates on the PO
                        </Link>{' '}
                        before submitting the invoice.
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>


              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">Invoice Number *</Label>
                <Input
                  id="invoiceNumber"
                  placeholder="Enter invoice number"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoiceDate">Invoice Date *</Label>
                <Input
                  id="invoiceDate"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Invoice Amount (₹) *</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Auto-calculated from selected items"
                  value={amount}
                  onChange={(e) => {
                    setAmountTouched(true);
                    setAmount(e.target.value);
                  }}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Auto-calculated from ticked line items. Edit to override.
                </p>
              </div>
            </div>

            <div className="mt-6">
              {(() => {
                const po = purchaseOrders.find((p: any) => p.id === selectedPO);
                const poHasItems = extractItems(po).length > 0;
                return (
                  <LineItemsInput
                    items={lineItems}
                    onChange={setLineItems}
                    lockDetails={!!selectedPO && poHasItems}
                    emptyFromPO={!!selectedPO && !poHasItems}
                    expectedDelivery={po?.expectedDelivery || po?.expected_delivery}
                  />
                );
              })()}
            </div>
          </div>

          {/* File Upload Card */}
          <div
            className="rounded-xl border border-border bg-card p-6 shadow-card animate-slide-up"
            style={{ animationDelay: '100ms' }}
          >
            <h2 className="mb-6 text-lg font-semibold">Upload Documents</h2>

            {/* Invoice File */}
            <div className="mb-6 space-y-2">
              <Label>Invoice Document *</Label>
              {!invoiceFile ? (
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 transition-colors hover:border-primary hover:bg-muted/50">
                  <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Click to upload invoice</span>
                  <span className="text-xs text-muted-foreground">PDF, JPG, PNG (Max 10MB)</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleInvoiceFileChange}
                  />
                </label>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/5 p-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-success" />
                      <div>
                        <p className="text-sm font-medium">{invoiceFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(invoiceFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={removeInvoiceFile}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={extractFromInvoice}
                    disabled={isExtracting}
                    className="w-full gap-2"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Extracting invoice fields...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Extract fields with AI
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Material Receipts */}
            <div className="space-y-2">
              <Label>Material Receiving Copy / Proof of Delivery *</Label>
              <p className="text-xs text-muted-foreground">
                Required — invoice cannot be submitted without proof of delivery. Upload one or more files
                (PDF / JPG / PNG).
              </p>
              <label
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors hover:border-primary hover:bg-muted/50',
                  materialReceipts.length === 0
                    ? 'border-destructive/40 bg-destructive/5'
                    : 'border-border bg-muted/30',
                )}
              >
                <FileText
                  className={cn(
                    'mb-2 h-6 w-6',
                    materialReceipts.length === 0 ? 'text-destructive' : 'text-muted-foreground',
                  )}
                />
                <span className="text-sm font-medium text-foreground">
                  {materialReceipts.length === 0
                    ? 'Upload proof of delivery (required)'
                    : 'Add more proof of delivery files'}
                </span>
                <span className="text-xs text-muted-foreground">Multiple files allowed</span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple
                  onChange={handleMaterialReceiptsChange}
                />
              </label>

              {materialReceipts.length > 0 && (
                <div className="mt-4 space-y-2">
                  {materialReceipts.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{file.name}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMaterialReceipt(index)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Smart Discrepancy Check */}
          {selectedPO && (() => {
            const po = purchaseOrders.find((p: any) => p.id === selectedPO);
            return (
              <DiscrepancyChecker
                po={po}
                poItems={lineItems}
                invoice={{
                  invoice_number: invoiceNumber,
                  invoice_date: invoiceDate,
                  amount: Number(amount || 0),
                  items: lineItems,
                }}
              />
            );
          })()}

          {/* Submit Button */}
          {(() => {
            const hasLine = lineItems.some((li) => li.selected !== false && li.item_name);
            const missing: string[] = [];
            if (!selectedPO) missing.push('Purchase Order');
            if (!invoiceNumber) missing.push('Invoice Number');
            if (!invoiceDate) missing.push('Invoice Date');
            if (!amount || Number(amount) <= 0) missing.push('Invoice Amount');
            if (!invoiceFile) missing.push('Invoice Document');
            if (materialReceipts.length === 0) missing.push('Proof of Delivery');
            if (!hasLine) missing.push('At least one selected line item');
            const selectedPoData = purchaseOrders.find((p: any) => p.id === selectedPO);
            const deliveryPending = !!selectedPoData && !selectedPoData.deliveryDatesConfirmedAt;
            if (deliveryPending) missing.push('Confirmed delivery dates on the PO');
            const disabled = missing.length > 0 || isSubmitting || isReadOnly;
            return (
              <div className="flex flex-col items-end gap-3">
                {isReadOnly && (
                  <p className="text-xs text-warning">
                    Read-only mode (viewing as supplier) — submission is disabled.
                  </p>
                )}
                {!isReadOnly && missing.length > 0 && (
                  <p className="text-xs text-destructive">
                    Missing: {missing.join(', ')}
                  </p>
                )}
                <div className="flex justify-end gap-4">
                  <Link to="/invoices">
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </Link>
                  <Button type="submit" variant="accent" size="lg" disabled={disabled} title={isReadOnly ? 'Read-only: exit "View as" to submit' : undefined}>
                    {isSubmitting ? 'Submitting...' : 'Submit Invoice'}
                  </Button>
                </div>
              </div>
            );
          })()}
        </form>
      </div>
    </DashboardLayout>
  );
}
