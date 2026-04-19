import { useState, useEffect } from 'react';
import { Download, Search, Package, Truck, CheckCircle, Clock, AlertTriangle, Loader2, Send } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAWBs, fetchChallans, saveAWBToSupabase, manifestShipment } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';

const statusStyles: Record<string, string> = {
  generated: 'bg-muted text-muted-foreground border-border',
  dispatched: 'bg-info/10 text-info border-info/20',
  'in-transit': 'bg-warning/10 text-warning border-warning/20',
  delivered: 'bg-success/10 text-success border-success/20',
};

const statusIcons: Record<string, any> = {
  generated: Package,
  dispatched: Truck,
  'in-transit': Truck,
  delivered: CheckCircle,
};

export default function AWBDownload() {
  const { toast } = useToast();
  const { supplier } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [awbs, setAWBs] = useState<any[]>([]);
  const [pendingChallans, setPendingChallans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [manifestingId, setManifestingId] = useState<string | null>(null);
  const [manifestForm, setManifestForm] = useState<any>({
    consignee_name: '',
    consignee_address: '',
    consignee_city: '',
    consignee_state: '',
    consignee_phone: '',
    destination_pin: '',
    weight_g: 1000,
    num_pieces: 1,
    invoice_value: 0,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedChallan, setSelectedChallan] = useState<any>(null);

  const loadData = async () => {
    if (!supplier) return;
    try {
      const [awbData, challanData] = await Promise.all([
        fetchAWBs(supplier.id),
        fetchChallans(supplier.id),
      ]);
      setAWBs(awbData);
      setPendingChallans(
        challanData.filter(
          (c: any) => c.logistics_scope === 'client' && c.manifest_status === 'pending'
        )
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (!supplier?.id) return;
    const channel = supabase
      .channel('awb_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'awb' }, () => loadData())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier?.id]);

  const openManifestDialog = (challan: any) => {
    setSelectedChallan(challan);
    setManifestForm({
      consignee_name: '',
      consignee_address: challan.delivery_address || '',
      consignee_city: '',
      consignee_state: '',
      consignee_phone: '',
      destination_pin: '',
      weight_g: 1000,
      num_pieces: 1,
      invoice_value: 0,
    });
    setDialogOpen(true);
  };

  const handleManifest = async () => {
    if (!supplier || !selectedChallan) return;
    setManifestingId(selectedChallan.id);
    try {
      const result = await manifestShipment({
        challan_number: selectedChallan.challan_number,
        ...manifestForm,
      });
      await saveAWBToSupabase({
        supplier_id: supplier.id,
        po_id: selectedChallan.po_id,
        awb_number: result.waybills?.[0] || result.lrn,
        lr_number: result.lrn,
        label_url: result.labels?.[0] || '',
        challan_number: selectedChallan.challan_number,
      });
      toast({ title: '✅ Manifest Created!', description: `LR Number: ${result.lrn}` });
      setDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast({ title: 'Manifest Failed', description: err.message, variant: 'destructive' });
    } finally {
      setManifestingId(null);
    }
  };

  const filteredAWBs = awbs.filter(
    (awb) =>
      (awb.awb_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (awb.po_id || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const downloadableCount = awbs.filter((awb) => awb.is_downloadable).length;

  const handleDownload = (awb: any) => {
    if (awb.label_url) {
      window.open(awb.label_url, '_blank');
      return;
    }
    toast({
      title: 'Download Started',
      description: `Downloading AWB ${awb.awb_number}`,
    });
  };

  if (loading) {
    return (
      <DashboardLayout title="AWB Downloads" subtitle="Loading...">
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="AWB Downloads"
      subtitle="Download Air Waybill numbers for shipments organized by Emboss Marketing"
    >
      <div className="space-y-6">
        {/* Info Banner */}
        <div className="rounded-xl border border-info/30 bg-info/5 p-4 animate-slide-up">
          <div className="flex items-start gap-3">
            <Package className="mt-0.5 h-5 w-5 text-info" />
            <div>
              <h4 className="font-medium text-foreground">About AWB Downloads</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                AWB (Air Waybill) numbers are available for download only when the shipment is being organized by
                Emboss Marketing. Manifest pending challans below to generate AWBs via Delhivery.
              </p>
            </div>
          </div>
        </div>

        {/* Pending Manifests */}
        {pendingChallans.length > 0 && (
          <div className="rounded-xl border border-warning/30 bg-card shadow-card animate-slide-up">
            <div className="border-b border-border px-6 py-4">
              <h3 className="font-semibold text-foreground">
                Pending Manifests ({pendingChallans.length})
              </h3>
              <p className="text-sm text-muted-foreground">
                Client-scope challans awaiting Delhivery manifestation
              </p>
            </div>
            <div className="divide-y divide-border">
              {pendingChallans.map((challan) => (
                <div
                  key={challan.id}
                  className="flex items-center justify-between gap-4 px-6 py-4"
                >
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{challan.challan_number}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(challan.date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {challan.delivery_address ? ` • ${challan.delivery_address}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => openManifestDialog(challan)}
                    disabled={manifestingId === challan.id}
                    className="gap-2"
                  >
                    {manifestingId === challan.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Manifest Shipment
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-6 shadow-card animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total AWBs</p>
                <p className="text-2xl font-bold">{awbs.length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-success/20 bg-success/5 p-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-success/20 p-2">
                <Download className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ready to Download</p>
                <p className="text-2xl font-bold text-success">{downloadableCount}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-6 animate-slide-up" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-warning/20 p-2">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Activation</p>
                <p className="text-2xl font-bold text-warning">{awbs.length - downloadableCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by AWB number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* AWB List */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAWBs.map((awb, index) => {
            const StatusIcon = statusIcons[awb.status] || Package;
            return (
              <div
                key={awb.id}
                className="rounded-xl border border-border bg-card p-6 shadow-card transition-all duration-200 hover:shadow-card-hover animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'rounded-lg p-2',
                      awb.is_downloadable ? 'bg-success/10' : 'bg-muted'
                    )}>
                      <StatusIcon className={cn(
                        'h-5 w-5',
                        awb.is_downloadable ? 'text-success' : 'text-muted-foreground'
                      )} />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{awb.awb_number}</p>
                      <p className="text-sm text-muted-foreground">{awb.carrier}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={cn('capitalize', statusStyles[awb.status] || statusStyles.generated)}>
                    {awb.status}
                  </Badge>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  {awb.lr_number && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">LR Number</span>
                      <span className="font-medium">{awb.lr_number}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-medium">
                      {new Date(awb.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  {awb.is_downloadable ? (
                    <Button
                      variant="accent"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => handleDownload(awb)}
                    >
                      <Download className="h-4 w-4" />
                      Download AWB
                    </Button>
                  ) : (
                    <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 py-2 text-sm text-muted-foreground">
                      <AlertTriangle className="h-4 w-4" />
                      Awaiting Activation
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredAWBs.length === 0 && (
          <div className="rounded-xl border border-border bg-card py-12 text-center">
            <Package className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">No AWBs found.</p>
          </div>
        )}
      </div>

      {/* Manifest Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manifest Shipment</DialogTitle>
            <DialogDescription>
              {selectedChallan?.challan_number} — Enter consignee details for Delhivery pickup
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="consignee_name">Consignee Name *</Label>
              <Input
                id="consignee_name"
                value={manifestForm.consignee_name}
                onChange={(e) => setManifestForm({ ...manifestForm, consignee_name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="consignee_address">Address *</Label>
              <Input
                id="consignee_address"
                value={manifestForm.consignee_address}
                onChange={(e) => setManifestForm({ ...manifestForm, consignee_address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="consignee_city">City *</Label>
                <Input
                  id="consignee_city"
                  value={manifestForm.consignee_city}
                  onChange={(e) => setManifestForm({ ...manifestForm, consignee_city: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="consignee_state">State *</Label>
                <Input
                  id="consignee_state"
                  value={manifestForm.consignee_state}
                  onChange={(e) => setManifestForm({ ...manifestForm, consignee_state: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="consignee_phone">Phone *</Label>
                <Input
                  id="consignee_phone"
                  value={manifestForm.consignee_phone}
                  onChange={(e) => setManifestForm({ ...manifestForm, consignee_phone: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="destination_pin">PIN Code *</Label>
                <Input
                  id="destination_pin"
                  value={manifestForm.destination_pin}
                  onChange={(e) => setManifestForm({ ...manifestForm, destination_pin: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="weight_g">Weight (g) *</Label>
                <Input
                  id="weight_g"
                  type="number"
                  value={manifestForm.weight_g}
                  onChange={(e) => setManifestForm({ ...manifestForm, weight_g: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="num_pieces">Pieces *</Label>
                <Input
                  id="num_pieces"
                  type="number"
                  value={manifestForm.num_pieces}
                  onChange={(e) => setManifestForm({ ...manifestForm, num_pieces: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="invoice_value">Invoice ₹ *</Label>
                <Input
                  id="invoice_value"
                  type="number"
                  value={manifestForm.invoice_value}
                  onChange={(e) => setManifestForm({ ...manifestForm, invoice_value: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleManifest}
              disabled={manifestingId !== null}
              className="gap-2"
            >
              {manifestingId !== null ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit Manifest
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
