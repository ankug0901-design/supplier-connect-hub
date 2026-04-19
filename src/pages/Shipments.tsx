import { useEffect, useState } from 'react';
import {
  Download, Truck, Upload, Loader2, FileSpreadsheet, Package, CheckCircle, AlertCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAWBs } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';
import { AccountSetupBanner } from '@/components/AccountSetupBanner';
import { cn } from '@/lib/utils';

const N8N_BULK_URL = 'https://n8n.srv1141999.hstgr.cloud/webhook/delhivery-b2b-master';

const TEMPLATE_COLUMNS = [
  'Consignee Name *','Receiver Contact No. *','Receiver Address *','Receiver City *',
  'Receiver State *','Receiver Pincode *','Total Weight(in Grams) *','Box Count *',
  'Length of each Box (in CentiMetre) *','Breadth of each Box (in CentiMetre) *',
  'Height of each Box (in CentiMetre) *','Quantity Ordered','Description *',
  'Order No *','Invoice No. *','Payment Mode (Prepaid or COD) *','Need pickup? (Y/N) *',
  'Invoice Amount(in Rs.) *',
];

const statusStyles: Record<string, string> = {
  generated: 'bg-muted text-muted-foreground border-border',
  dispatched: 'bg-info/10 text-info border-info/20',
  'in-transit': 'bg-warning/10 text-warning border-warning/20',
  delivered: 'bg-success/10 text-success border-success/20',
};

export default function Shipments() {
  const { toast } = useToast();
  const { supplier, isAdmin } = useAuth();
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [awbs, setAWBs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAWBs = async () => {
    if (!supplier?.id) return;
    try {
      const data = await fetchAWBs(supplier.id);
      setAWBs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAWBs();
    if (!supplier?.id) return;
    const channel = supabase
      .channel('awb_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'awb' }, () => loadAWBs())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier?.id]);

  const acceptFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast({ title: 'Invalid file', description: 'Please upload an .xlsx file.', variant: 'destructive' });
      return;
    }
    setExcelFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0]);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const downloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/shipment-template.xlsx';
    link.download = 'Shipment_creation_Template.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Template downloaded', description: 'Fill in your shipments and upload the file.' });
  };

  const handleCreate = async () => {
    if (!excelFile) return;
    setCreating(true);
    setResults([]);
    try {
      const fd = new FormData();
      fd.append('file', excelFile);
      fd.append('operation_mode', 'bulk_excel');
      fd.append('check_manifestation', 'true');
      fd.append('check_labels', 'true');
      fd.append('check_pickup', 'true');
      fd.append('origin_pin', '122001');
      fd.append('need_pickup', 'Y');

      const res = await fetch(N8N_BULK_URL, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const shipments: any[] = data.shipments || data.results || data.orders || [];
      setResults(shipments);
      toast({
        title: '✅ Shipments Created',
        description: `${shipments.length || data.total || 0} shipments processed successfully.`,
      });
      loadAWBs();
    } catch (err: any) {
      toast({
        title: 'Shipment Creation Failed',
        description: err.message || 'Could not reach the shipment service.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const downloadAllLabels = () => {
    results
      .map((r) => r.label_url || r.labelUrl || (r.labels && r.labels[0]))
      .filter(Boolean)
      .forEach((url, i) => setTimeout(() => window.open(url, '_blank'), i * 200));
  };

  if (!isAdmin && !supplier?.zoho_vendor_id) {
    return (
      <DashboardLayout title="Shipments" subtitle="Create shipments, download labels and track dispatches">
        <AccountSetupBanner />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Shipments"
      subtitle="Create shipments, download labels and track dispatches"
    >
      <div className="space-y-6">
        {/* SECTION A — Create New Shipment */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-card animate-slide-up">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Truck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Create New Shipment</h2>
              <p className="text-sm text-muted-foreground">
                Bulk-create shipments via Delhivery using an Excel upload
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Template */}
            <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium text-foreground">Shipment Template</h3>
                  <p className="text-xs text-muted-foreground">
                    Download the template, fill in your shipments, then upload it back.
                  </p>
                </div>
                <Button onClick={downloadTemplate} variant="outline" size="sm" className="gap-2 shrink-0">
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>

            {/* Upload */}
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-foreground">Upload Filled Template</h3>
                <p className="text-xs text-muted-foreground">Only .xlsx files are accepted</p>
              </div>
              <label
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-muted/30 hover:border-primary hover:bg-muted/50'
                )}
              >
                <FileSpreadsheet className="mb-2 h-10 w-10 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {excelFile ? excelFile.name : 'Click to upload .xlsx'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {excelFile ? `${(excelFile.size / 1024).toFixed(1)} KB` : 'Max 10 MB'}
                </span>
                <Input type="file" className="hidden" accept=".xlsx" onChange={handleFileChange} />
              </label>

              <Button
                onClick={handleCreate}
                disabled={!excelFile || creating}
                className="w-full gap-2"
                variant="accent"
                size="lg"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating shipments...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Create Shipments
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="mt-6 rounded-lg border border-success/20 bg-success/5 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-success" />
                  <h4 className="font-semibold text-foreground">
                    {results.length} shipment{results.length === 1 ? '' : 's'} created
                  </h4>
                </div>
                <Button onClick={downloadAllLabels} variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  Download Labels
                </Button>
              </div>
              <div className="overflow-hidden rounded-md border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {['Order No', 'Consignee', 'LR Number', 'Status'].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {results.map((r: any, i: number) => {
                      const lr = r.lrn || r.lr_number || r.waybill || (r.waybills && r.waybills[0]) || '-';
                      const status = (r.status || 'generated').toString().toLowerCase();
                      return (
                        <tr key={i}>
                          <td className="px-4 py-2 font-medium">{r.order_id || r.orderNo || '-'}</td>
                          <td className="px-4 py-2 text-muted-foreground">{r.consignee_name || r.consignee || '-'}</td>
                          <td className="px-4 py-2 font-mono text-xs">{lr}</td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className={cn('capitalize', statusStyles[status] || statusStyles.generated)}>
                              {status}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* SECTION B — Past Shipments */}
        <section className="rounded-xl border border-border bg-card shadow-card animate-slide-up">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Past Shipments</h2>
                <p className="text-sm text-muted-foreground">All AWBs created from your account</p>
              </div>
            </div>
            <Badge variant="outline">{awbs.length} total</Badge>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : awbs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">No shipments yet.</p>
              <p className="text-sm text-muted-foreground/70">
                Upload the template above to create your first batch.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {['AWB Number', 'LR Number', 'Date', 'Status', 'Label'].map((h, i) => (
                      <th
                        key={h}
                        className={cn(
                          'px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground',
                          i === 4 ? 'text-right' : 'text-left'
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {awbs.map((awb: any) => (
                    <tr key={awb.id} className="transition-colors hover:bg-muted/50">
                      <td className="px-6 py-3 font-medium text-foreground">{awb.awb_number}</td>
                      <td className="px-6 py-3 font-mono text-sm text-muted-foreground">
                        {awb.lr_number || '-'}
                      </td>
                      <td className="px-6 py-3 text-sm text-muted-foreground">
                        {new Date(awb.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-3">
                        <Badge
                          variant="outline"
                          className={cn('capitalize', statusStyles[awb.status] || statusStyles.generated)}
                        >
                          {awb.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-right">
                        {awb.label_url ? (
                          <a href={awb.label_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" className="gap-1">
                              <Download className="h-4 w-4" />
                              Label
                            </Button>
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Awaiting label
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
