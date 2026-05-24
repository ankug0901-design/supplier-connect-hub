import { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, X, CheckCircle, Plus, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { fetchPurchaseOrders, fetchPurchaseOrdersFromDb, submitInvoice, fetchInvoicedQuantitiesForPo } from '@/services/api';
import { AccountSetupBanner } from '@/components/AccountSetupBanner';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';

type LineItem = {
  item_name: string;
  hsn?: string;
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
    onChange([...items, { item_name: '', hsn: '', po_quantity: 0, quantity: 1, rate: 0, actual_delivery_date: '', selected: true }]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  const allSelected = items.length > 0 && items.every((it) => it.selected !== false);
  const toggleAll = (checked: boolean) =>
    onChange(items.map((it) => ({ ...it, selected: checked })));

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
      <div className="grid grid-cols-[2rem_repeat(15,minmax(0,1fr))] gap-2 px-1 text-xs font-medium text-muted-foreground">
        <div className="col-span-1 flex items-center">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(v) => toggleAll(!!v)}
            aria-label="Select all line items"
          />
        </div>
        <div className="col-span-3">Item description</div>
        <div className="col-span-2">HSN/SAC</div>
        <div className="col-span-1">PO Qty</div>
        <div className="col-span-2">Already Invoiced</div>
        <div className="col-span-1">Invoice Qty</div>
        <div className="col-span-2">Rate (₹)</div>
        <div className="col-span-2">Actual Delivery Date</div>
        <div className="col-span-2">Variance</div>
      </div>
      <div className="space-y-3">
        {items.map((item, i) => {
          const poQty = Number(item.po_quantity || 0);
          const invoicedQty = Number(item.invoiced_quantity || 0);
          const remaining = Math.max(poQty - invoicedQty, 0);
          const fullyInvoiced = poQty > 0 && remaining <= 0;
          const isSelected = item.selected !== false && !fullyInvoiced;
          return (
            <div key={i} className="space-y-1">
              <div className="grid grid-cols-[2rem_repeat(15,minmax(0,1fr))] gap-2">
                <div className="col-span-1 flex items-center justify-center">
                  <Checkbox
                    checked={isSelected}
                    disabled={fullyInvoiced}
                    onCheckedChange={(v) => update(i, 'selected', !!v)}
                    aria-label={`Select line ${i + 1}`}
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    placeholder="Item description"
                    value={item.item_name}
                    onChange={(e) => update(i, 'item_name', e.target.value)}
                    readOnly={lockDetails}
                    disabled={lockDetails || !isSelected}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    placeholder="HSN"
                    value={item.hsn || ''}
                    onChange={(e) => update(i, 'hsn', e.target.value)}
                    disabled={!isSelected}
                  />
                </div>
                <div className="col-span-1">
                  <Input
                    type="number"
                    min="0"
                    placeholder="PO Qty"
                    value={item.po_quantity ?? ''}
                    onChange={(e) => update(i, 'po_quantity', parseFloat(e.target.value) || 0)}
                    readOnly={lockDetails}
                    disabled={lockDetails || !isSelected}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    value={invoicedQty}
                    readOnly
                    disabled
                    className="bg-muted/40"
                  />
                </div>
                <div className="col-span-1">
                  <Input
                    type="number"
                    min="0"
                    max={poQty > 0 ? remaining : undefined}
                    placeholder={fullyInvoiced ? 'Fully invoiced' : 'Invoice Qty'}
                    value={fullyInvoiced ? 0 : item.quantity}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      const capped = poQty > 0 ? Math.min(v, remaining) : v;
                      update(i, 'quantity', capped);
                    }}
                    disabled={!isSelected || fullyInvoiced}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Rate"
                    value={item.rate}
                    onChange={(e) => update(i, 'rate', parseFloat(e.target.value) || 0)}
                    readOnly={lockDetails}
                    disabled={lockDetails || !isSelected}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    type="date"
                    value={item.actual_delivery_date || ''}
                    onChange={(e) => update(i, 'actual_delivery_date', e.target.value)}
                    disabled={!isSelected}
                    max={new Date().toISOString().slice(0, 10)}
                  />
                </div>
                <div className="col-span-2 flex items-center">
                  {(() => {
                    if (!item.actual_delivery_date || !expectedDelivery) {
                      return <span className="text-xs text-muted-foreground">—</span>;
                    }
                    const actual = new Date(item.actual_delivery_date);
                    const expected = new Date(expectedDelivery);
                    const diff = Math.round(
                      (actual.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24),
                    );
                    if (diff <= 0) {
                      return (
                        <span className="text-xs font-medium text-success">
                          On time{diff < 0 ? ` (${Math.abs(diff)}d early)` : ''}
                        </span>
                      );
                    }
                    return (
                      <span className="text-xs font-medium text-destructive">
                        {diff}d late
                      </span>
                    );
                  })()}
                </div>
              </div>
              {fullyInvoiced && (
                <p className="pl-10 text-xs text-success">
                  Fully invoiced — PO quantity has already been billed.
                </p>
              )}
              {!fullyInvoiced && invoicedQty > 0 && (
                <p className="pl-10 text-xs text-muted-foreground">
                  {remaining} of {poQty} remaining to invoice.
                </p>
              )}
              {!lockDetails && items.length > 1 && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(i)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Remove
                  </Button>
                </div>
              )}
            </div>
          );
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
        setLineItems(
          d.line_items.map((li: any) => ({
            item_name: li.item_name || '',
            quantity: Number(li.quantity) || 0,
            rate: Number(li.rate) || 0,
            selected: true,
          })),
        );
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
          ? await fetchPurchaseOrdersFromDb()
          : await fetchPurchaseOrders(supplier!.zoho_vendor_id!);
        if (!cancelled) setPurchaseOrders(data);
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

      // If the selected PO has no synced line items, fetch the live PO list
      // from Zoho for that supplier's vendor and pick up its items. Works for
      // both admins (no vendor id on their own profile) and suppliers whose
      // DB row wasn't synced with items.
      const vendorIdForLive = po.supplierZohoVendorId || supplier?.zoho_vendor_id;
      if (!items.length && vendorIdForLive) {
        try {
          const livePos = await fetchPurchaseOrders(vendorIdForLive);
          const match = (livePos || []).find(
            (p: any) =>
              p.id === po.id ||
              String(p.id) === String(po.id) ||
              p.poNumber === po.poNumber ||
              p.purchaseorder_number === po.poNumber,
          );
          const liveItems = extractItems(match);
          if (liveItems.length && !cancelled) {
            items = liveItems;
            // Cache + force re-render so poHasItems flips true.
            setPurchaseOrders((prev) =>
              prev.map((p: any) => (p.id === po.id ? { ...p, items: liveItems } : p)),
            );
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
            const name =
              it.item_name ||
              it.name ||
              it.description ||
              it.item_description ||
              it.item ||
              '';
            const invoiced = invoicedMap[name.trim().toLowerCase()] || 0;
            const remaining = Math.max(qty - invoiced, 0);
            return {
              item_name: name,
              hsn: it.hsn || it.hsn_or_sac || it.hsn_sac || it.sac || '',
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
    if (e.target.files) {
      setMaterialReceipts(Array.from(e.target.files));
    }
  };

  const removeInvoiceFile = () => setInvoiceFile(null);

  const removeMaterialReceipt = (index: number) => {
    setMaterialReceipts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplier) return;
    const selectedPOData = purchaseOrders.find((po: any) => po.id === selectedPO);
    if (!selectedPOData) return;
    setIsSubmitting(true);
    try {
      await submitInvoice({
        po_number: selectedPOData.poNumber,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        supplier_name: supplier.company,
        contact_email: supplier.email,
        supplier_id: supplier.id,
        line_items: lineItems.filter((li) => li.selected !== false && li.item_name && Number(li.quantity) > 0),
        pdf_file: invoiceFile || undefined,
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
      <div className="mx-auto max-w-3xl">
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
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
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
              <Label>Material Receiving Copies (Optional)</Label>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 p-6 transition-colors hover:border-primary hover:bg-muted/50">
                <FileText className="mb-2 h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Upload material receipts</span>
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

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <Link to="/invoices">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              variant="accent"
              size="lg"
              disabled={!selectedPO || !invoiceNumber || !invoiceDate || !amount || !invoiceFile || isSubmitting || !lineItems.some((li) => li.selected !== false && li.item_name)}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Invoice'}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
