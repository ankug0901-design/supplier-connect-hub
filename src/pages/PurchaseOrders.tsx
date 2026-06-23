import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Upload, Search, Filter, Download, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { fetchPurchaseOrders, fetchPurchaseOrdersFromDb, syncAndFetchPurchaseOrdersFromDb, downloadPurchaseOrder } from '@/services/api';
import { exportToCsv } from '@/lib/exportCsv';
import { AccountSetupBanner } from '@/components/AccountSetupBanner';
import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  pending: 'bg-warning/10 text-warning border-warning/20',
  partial: 'bg-accent/10 text-accent border-accent/20',
  rejected: 'bg-destructive text-destructive-foreground border-destructive',
  cancelled: 'bg-muted text-muted-foreground border-muted',
  on_hold: 'bg-warning text-warning-foreground border-warning',
  invoiced: 'bg-success text-success-foreground border-success',
  draft: 'bg-secondary text-secondary-foreground border-secondary',
  closed: 'bg-foreground text-background border-foreground',
  completed: 'bg-success/10 text-success border-success/20',
};

export default function PurchaseOrders() {
  const { supplier, isAdmin } = useAuth();
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadPO = async (poId: string, poNumber: string, rowVendorId?: string, deliveryConfirmed?: boolean) => {
    if (!deliveryConfirmed) {
      toast.error('Please confirm delivery dates for this PO before downloading.');
      return;
    }
    const vendorId = supplier?.zoho_vendor_id || rowVendorId;
    if (!vendorId) {
      toast.error('Vendor ID not found for this purchase order.');
      return;
    }
    setDownloadingId(poId);
    try {
      await downloadPurchaseOrder(vendorId, poId, poNumber);
    } catch (err: any) {
      console.error('Download PO failed', err);
      toast.error(err?.message || 'Failed to download purchase order.');
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    if (!isAdmin && !supplier?.zoho_vendor_id) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
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
            .catch((syncErr) => console.warn('Background purchase order refresh failed', syncErr));
        }
      } catch (err) {
        console.error('Failed to load purchase orders', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supplier?.zoho_vendor_id, isAdmin]);

  const availableStatuses = Array.from(
    new Set(purchaseOrders.map((o: any) => (o.status || '').toString().toLowerCase()).filter(Boolean)),
  ).sort();

  const filteredOrders = purchaseOrders.filter((order: any) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      order.poNumber?.toLowerCase().includes(q) ||
      order.supplierName?.toLowerCase().includes(q) ||
      (order.items || []).some((it: any) =>
        (it.item_name || '').toLowerCase().includes(q) ||
        (it.description || '').toLowerCase().includes(q),
      );
    const orderStatus = (order.status || '').toString().toLowerCase();
    const matchesStatus = statusFilter === 'all' || orderStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (!isAdmin && !supplier?.zoho_vendor_id) {
    return (
      <DashboardLayout title="Purchase Orders" subtitle="View and manage all your purchase orders">
        <AccountSetupBanner />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Purchase Orders" subtitle="View and manage all your purchase orders">
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={isAdmin ? "Search by PO #, supplier, or item..." : "Search by PO # or item..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {availableStatuses.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            disabled={filteredOrders.length === 0}
            onClick={() => {
              const rows = filteredOrders.map((o: any) => ({
                poNumber: o.poNumber,
                supplier: o.supplierName || '',
                date: o.date ? new Date(o.date).toLocaleDateString('en-IN') : '',
                expectedDelivery: o.expectedDelivery ? new Date(o.expectedDelivery).toLocaleDateString('en-IN') : '',
                amount: Number(o.amount || 0),
                items: o.items?.length ?? 0,
                status: o.status,
              }));
              exportToCsv(`purchase-orders-${new Date().toISOString().slice(0,10)}.csv`, rows, [
                { key: 'poNumber', header: 'PO #' },
                { key: 'supplier', header: 'Supplier' },
                { key: 'date', header: 'PO Date' },
                { key: 'expectedDelivery', header: 'Expected Delivery' },
                { key: 'amount', header: 'Amount (INR)' },
                { key: 'items', header: 'Items' },
                { key: 'status', header: 'Status' },
              ]);
              toast.success(`Exported ${rows.length} purchase orders.`);
            }}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-border bg-card">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      PO Number
                    </th>
                    {isAdmin && (
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Supplier
                      </th>
                    )}
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Date
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Expected Delivery
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Amount
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Items
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredOrders.map((order: any, index: number) => (
                    <tr
                      key={order.id}
                      className="transition-colors hover:bg-muted/50 animate-slide-up"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="font-medium text-foreground">{order.poNumber}</span>
                      </td>
                      {isAdmin && (
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-foreground">
                          {order.supplierName || '—'}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                        {new Date(order.date).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                        {order.expectedDelivery
                          ? new Date(order.expectedDelivery).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-foreground">
                        {formatCurrency(Number(order.amount || 0))}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs">
                        {(() => {
                          const rows = (order.items || [])
                            .map((it: any) => ({
                              name: (it.item_name || '').trim(),
                              description: (it.description || '').trim(),
                            }))
                            .filter((r: any) => r.name || r.description);
                          if (rows.length === 0) return <span>—</span>;
                          const shown = rows.slice(0, 2);
                          const extra = rows.length - shown.length;
                          const tooltip = rows
                            .map((r: any) =>
                              r.description && r.description !== r.name
                                ? `${r.name || r.description}\n  ${r.description}`
                                : r.name || r.description,
                            )
                            .join('\n');
                          return (
                            <div className="flex flex-col gap-1" title={tooltip}>
                              {shown.map((r: any, i: number) => (
                                <div key={i} className="leading-tight">
                                  <div className="truncate text-foreground">
                                    {r.name || r.description}
                                  </div>
                                  {r.description && r.description !== r.name && (
                                    <div className="truncate text-xs text-muted-foreground">
                                      {r.description}
                                    </div>
                                  )}
                                </div>
                              ))}
                              {extra > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  +{extra} more
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className={cn('capitalize w-fit', statusStyles[order.status] || '')}>
                            {order.status}
                          </Badge>
                          {order.needsDeliveryConfirmation && !order.exceptionApprovedAt && (
                            <Link
                              to={`/purchase-orders/${order.id}`}
                              className="text-xs font-medium text-warning hover:underline"
                            >
                              {order.exceptionPending
                                ? 'Exception requested'
                                : order.needsExceptionRequest
                                  ? 'Request exception'
                                  : 'Confirm delivery dates'}
                            </Link>
                          )}
                          {order.exceptionApprovedAt && !order.deliveryDatesConfirmedAt && (
                            <span className="text-xs font-medium text-success">Exception approved</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              handleDownloadPO(
                                order.id,
                                order.poNumber,
                                order.supplierZohoVendorId,
                                !!order.unlockedForActions,
                              )
                            }
                            disabled={downloadingId === order.id || !order.unlockedForActions}
                            title={
                              order.unlockedForActions
                                ? 'Download PO'
                                : 'Confirm delivery dates or get exception approval first'
                            }
                          >
                            {downloadingId === order.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : order.unlockedForActions ? (
                              <Download className="h-4 w-4" />
                            ) : (
                              <Lock className="h-4 w-4" />
                            )}
                          </Button>
                          <Link to={`/purchase-orders/${order.id}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          {(order.status === 'pending' || order.status === 'partial') &&
                            (order.unlockedForActions ? (
                              <Link to={`/invoices/upload?po=${order.id}`}>
                                <Button variant="accent" size="sm" className="gap-1">
                                  <Upload className="h-3 w-3" />
                                  Upload Invoice
                                </Button>
                              </Link>
                            ) : (
                              <Button variant="accent" size="sm" className="gap-1" disabled title="Confirm delivery dates or get exception approval first">
                                <Lock className="h-3 w-3" />
                                Upload Invoice
                              </Button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredOrders.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                No purchase orders found matching your criteria.
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
