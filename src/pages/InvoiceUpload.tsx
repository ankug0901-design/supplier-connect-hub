import { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, X, CheckCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mockPurchaseOrders } from '@/data/mockData';
import { useToast } from '@/hooks/use-toast';

export default function InvoiceUpload() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const preselectedPO = searchParams.get('po');

  const [selectedPO, setSelectedPO] = useState(preselectedPO || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [amount, setAmount] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [materialReceipts, setMaterialReceipts] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pendingOrders = mockPurchaseOrders.filter((po) => po.status === 'pending');

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
    setIsSubmitting(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    toast({
      title: 'Invoice Submitted Successfully',
      description: `Invoice ${invoiceNumber} has been uploaded for review.`,
    });

    setIsSubmitting(false);
    navigate('/invoices');
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
                    {pendingOrders.map((po) => (
                      <SelectItem key={po.id} value={po.id}>
                        {po.poNumber} - ₹{po.amount.toLocaleString('en-IN')}
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
          </div>

          {/* File Upload Card */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-card animate-slide-up" style={{ animationDelay: '100ms' }}>
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
