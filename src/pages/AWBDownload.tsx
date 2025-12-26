import { useState } from 'react';
import { Download, Search, Package, Truck, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { mockAWBs } from '@/data/mockData';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const statusStyles = {
  generated: 'bg-muted text-muted-foreground border-border',
  dispatched: 'bg-info/10 text-info border-info/20',
  'in-transit': 'bg-warning/10 text-warning border-warning/20',
  delivered: 'bg-success/10 text-success border-success/20',
};

const statusIcons = {
  generated: Package,
  dispatched: Truck,
  'in-transit': Truck,
  delivered: CheckCircle,
};

export default function AWBDownload() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAWBs = mockAWBs.filter(
    (awb) =>
      awb.awbNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      awb.poNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const downloadableCount = mockAWBs.filter((awb) => awb.isDownloadable).length;

  const handleDownload = (awbNumber: string) => {
    toast({
      title: 'Download Started',
      description: `Downloading AWB ${awbNumber}`,
    });
  };

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
                Emboss Marketing. The download button will be activated once Emboss Marketing enables it for your
                shipment.
              </p>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-6 shadow-card animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total AWBs</p>
                <p className="text-2xl font-bold">{mockAWBs.length}</p>
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
                <p className="text-2xl font-bold text-warning">{mockAWBs.length - downloadableCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by AWB or PO number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* AWB List */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAWBs.map((awb, index) => {
            const StatusIcon = statusIcons[awb.status];
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
                      awb.isDownloadable ? 'bg-success/10' : 'bg-muted'
                    )}>
                      <StatusIcon className={cn(
                        'h-5 w-5',
                        awb.isDownloadable ? 'text-success' : 'text-muted-foreground'
                      )} />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{awb.awbNumber}</p>
                      <p className="text-sm text-muted-foreground">{awb.carrier}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={cn('capitalize', statusStyles[awb.status])}>
                    {awb.status}
                  </Badge>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PO Number</span>
                    <span className="font-medium">{awb.poNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-medium">
                      {new Date(awb.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  {awb.isDownloadable ? (
                    <Button
                      variant="accent"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => handleDownload(awb.awbNumber)}
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
            <p className="text-muted-foreground">No AWBs found matching your search.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
