import { useEffect, useState } from 'react';
import { Upload, Download, FileSpreadsheet, Truck, AlertCircle, Package } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchPurchaseOrders,
  generateChallans,
  saveChallansToSupabase,
  fetchChallans,
} from '@/services/api';
import { AccountSetupBanner } from '@/components/AccountSetupBanner';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type GeneratedChallan = { dc_number: string; deliver_to: string; total: string };

export default function DeliveryChallan() {
  const { toast } = useToast();
  const { supplier, isAdmin } = useAuth();
  const [selectedPO, setSelectedPO] = useState('');
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedChallans, setGeneratedChallans] = useState<GeneratedChallan[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [pastChallans, setPastChallans] = useState<any[]>([]);
  const [logisticsScope, setLogisticsScope] = useState<'client' | 'supplier'>('client');

  useEffect(() => {
    if (!supplier) return;
    if (supplier.zoho_vendor_id) {
      fetchPurchaseOrders(supplier.zoho_vendor_id).then(setPurchaseOrders).catch(console.error);
    }
    fetchChallans(supplier.id).then(setPastChallans).catch(console.error);
  }, [supplier]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        setExcelFile(file);
      } else {
        toast({
          title: 'Invalid file format',
          description: 'Please upload an Excel file (.xlsx, .xls) or CSV file.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleGenerate = async () => {
    if (!excelFile || !supplier) return;
    setIsGenerating(true);
    try {
      const result = await generateChallans(excelFile);
      if (!result.success) throw new Error('Generation failed');
      setGeneratedChallans(result.challans || []);
      if (logisticsScope === 'client' && selectedPO) {
        await saveChallansToSupabase(result.challans, supplier.id, selectedPO, logisticsScope);
      }
      toast({
        title: `${result.total_generated} Challans Generated!`,
        description:
          logisticsScope === 'client'
            ? 'Go to AWB Downloads to manifest shipments.'
            : 'Download PDFs below.',
      });
      if (supplier.id) fetchChallans(supplier.id).then(setPastChallans);
    } catch (err: any) {
      toast({ title: 'Generation Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadTemplate = () => {
    toast({
      title: 'Template Downloaded',
      description: 'Excel template has been downloaded.',
    });
  };

  if (!isAdmin && !supplier?.zoho_vendor_id) {
    return (
      <DashboardLayout title="Delivery Challan" subtitle="Generate delivery challans for multiple shipments">
        <AccountSetupBanner />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Delivery Challan" subtitle="Generate delivery challans for multiple shipments">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload Section */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-card animate-slide-up">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Generate Delivery Challans</h2>
                <p className="text-sm text-muted-foreground">Upload shipment details to create challans</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Logistics Scope Selector */}
              <div className="space-y-2">
                <Label>Logistics Scope</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setLogisticsScope('client')}
                    className={cn(
                      'rounded-lg border p-4 text-left transition-all',
                      logisticsScope === 'client'
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border bg-card hover:bg-muted/50'
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2 font-medium">
                      <Truck className="h-4 w-4 text-primary" /> Client Scope
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Emboss arranges Delhivery pickup — you manifest from AWB tab
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogisticsScope('supplier')}
                    className={cn(
                      'rounded-lg border p-4 text-left transition-all',
                      logisticsScope === 'supplier'
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border bg-card hover:bg-muted/50'
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2 font-medium">
                      <Package className="h-4 w-4 text-primary" /> Supplier Scope
                    </div>
                    <p className="text-xs text-muted-foreground">
                      You arrange own courier — PDF only
                    </p>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Select Purchase Order</Label>
                <Select value={selectedPO} onValueChange={setSelectedPO}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a purchase order" />
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
                <div className="flex items-center justify-between">
                  <Label>Upload Shipment Details</Label>
                  <Button variant="link" size="sm" onClick={downloadTemplate} className="h-auto p-0 text-xs">
                    Download Template
                  </Button>
                </div>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 transition-colors hover:border-primary hover:bg-muted/50">
                  <FileSpreadsheet className="mb-2 h-10 w-10 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {excelFile ? excelFile.name : 'Click to upload Excel file'}
                  </span>
                  <span className="text-xs text-muted-foreground">XLSX, XLS, or CSV</span>
                  <Input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={!excelFile || isGenerating || (logisticsScope === 'client' && !selectedPO)}
                className="w-full gap-2"
                variant="accent"
                size="lg"
              >
                {isGenerating ? (
                  <>Generating Challans...</>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Generate Delivery Challans
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <div className="rounded-xl border border-info/30 bg-info/5 p-4 animate-slide-up" style={{ animationDelay: '100ms' }}>
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-info" />
              <div>
                <h4 className="font-medium text-foreground">Excel Format Requirements</h4>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>• Include columns: Item Description, Quantity, Unit, Vehicle No.</li>
                  <li>• Each row represents one item in the shipment</li>
                  <li>• Separate sheets for multiple challans</li>
                  <li>• Download template for correct format</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Generated + Past Challans */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-card animate-slide-up" style={{ animationDelay: '200ms' }}>
            <h2 className="mb-6 text-lg font-semibold">Generated Challans</h2>

            {generatedChallans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Truck className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <p className="text-muted-foreground">No challans generated yet</p>
                <p className="text-sm text-muted-foreground/70">
                  Upload an Excel file and click generate
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {generatedChallans.map((challan, index) => (
                  <div
                    key={challan.dc_number}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/50 animate-slide-up"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-success/10 p-2">
                        <Truck className="h-4 w-4 text-success" />
                      </div>
                      <div>
                        <p className="font-medium">{challan.dc_number}</p>
                        <p className="text-xs text-muted-foreground">
                          Deliver to: {challan.deliver_to || '—'} · Total: {challan.total || '—'}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Download className="h-4 w-4" />
                      Download PDF
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past Challans */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-card animate-slide-up" style={{ animationDelay: '300ms' }}>
            <h2 className="mb-6 text-lg font-semibold">Past Challans</h2>
            {pastChallans.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No past challans yet.</p>
            ) : (
              <div className="space-y-3">
                {pastChallans.map((c: any) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4"
                  >
                    <div>
                      <p className="font-medium">{c.challan_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(c.date).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {c.logistics_scope || 'client'}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          'capitalize',
                          c.manifest_status === 'manifested'
                            ? 'border-success/30 bg-success/10 text-success'
                            : 'border-warning/30 bg-warning/10 text-warning'
                        )}
                      >
                        {c.manifest_status || 'pending'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
