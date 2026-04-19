import { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, X, CheckCircle, Plus, Trash2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { fetchPurchaseOrders, submitInvoice } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

type LineItem = { item_name: string; quantity: number; rate: number };

function LineItemsInput({
  items,
  onChange,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
}) {
  const update = (i: number, field: keyof LineItem, value: any) => {
    const u = [...items];
    u[i] = { ...u[i], [field]: value };
    onChange(u);
  };
  const add = () => onChange([...items, { item_name: '', quantity: 1, rate: 0 }]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      <Label>Line Items *</Label>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <div className="col-span-6">
              <Input
                placeholder="Item description"
                value={item.item_name}
                onChange={(e) => update(i, 'item_name', e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Input
                type="number"
                min="0"
                placeholder="Qty"
                value={item.quantity}
                onChange={(e) => update(i, 'quantity', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="col-span-3">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Rate"
                value={item.rate}
                onChange={(e) => update(i, 'rate', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="col-span-1 flex items-center justify-center">
              {items.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(i)}
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1">
        <Plus className="h-4 w-4" />
        Add Item
      </Button>
    </div>
  );
}

export default function InvoiceUpload() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { supplier } = useAuth();
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
    { item_name: '', quantity: 1, rate: 0 },
  ]);

  useEffect(() => {
    if (!supplier?.zoho_vendor_id) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPurchaseOrders(supplier.zoho_vendor_id!);
        if (!cancelled) setPurchaseOrders(data);
      } catch (err) {
        console.error('Failed to load POs', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supplier?.zoho_vendor_id]);

  const handleInvoiceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setInvoiceFile(e.target.files[0]);
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
        line_items: lineItems.filter((li) => li.item_name),
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
                <Select value={selectedPO} onValueChange={setSelectedPO} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Purchase Order" />
                  </SelectTrigger>
                  <SelectContent>
                    {purchaseOrders.map((po: any) => (
                      <SelectItem key={po.id} value={po.id}>
                        {po.poNumber}
                      </SelectItem>
                    ))}
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
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="mt-6">
              <LineItemsInput items={lineItems} onChange={setLineItems} />
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
              disabled={!selectedPO || !invoiceNumber || !invoiceDate || !amount || !invoiceFile || isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Invoice'}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
