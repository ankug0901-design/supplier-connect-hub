import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, MapPin, Calendar, Loader2, Lock } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { fetchPurchaseOrders, fetchPurchaseOrdersFromDb, syncAndFetchPurchaseOrdersFromDb, fetchInvoicedQuantitiesForPo } from '@/services/api';
import { AccountSetupBanner } from '@/components/AccountSetupBanner';
import { DeliveryDateConfirmation } from '@/components/po/DeliveryDateConfirmation';
import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  pending: 'bg-warning/10 text-warning border-warning/20',
  invoiced: 'bg-info/10 text-info border-info/20',
  partial: 'bg-accent/10 text-accent border-accent/20',
  completed: 'bg-success/10 text-success border-success/20',
};

const extractItems = (po: any): any[] => {
  if (!po) return [];
  const candidates = [po.items, po.line_items, po.lineItems, po.purchaseorder_items, po.purchaseOrderItems];
  for (const c of candidates) if (Array.isArray(c) && c.length) return c;
  return [];
};

const formatAddress = (addr: any): string => {
  if (!addr) return '';
  if (typeof addr === 'string') {
    const trimmed = addr.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return formatAddress(JSON.parse(trimmed));
      } catch {
        return addr;
      }
    }
    return addr;
  }
  if (typeof addr !== 'object') return String(addr);
  const parts = [
    addr.attention,
    addr.address || addr.street1 || addr.street,
    addr.street2,
    [addr.city, addr.state, addr.zip || addr.zipcode || addr.postal_code].filter(Boolean).join(', '),
    addr.country,
    addr.phone ? `Phone: ${addr.phone}` : '',
  ].filter(Boolean);
  return parts.join('\n');
};


export default function PODetail() {
  const { id } = useParams();
  const { supplier, isAdmin } = useAuth();
  const [order, setOrder] = useState<any | null>(null);
  const [invoicedMap, setInvoicedMap] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

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
        const target = String(id);
        let found =
          data.find(
            (po: any) =>
              String(po.id) === target ||
              String(po.zoho_id ?? '') === target ||
              String(po.poNumber ?? '') === target,
          ) || null;

        // If items / delivery address are missing, fetch the live PO list
        // from Zoho for this supplier's vendor and merge richer fields.
        if (found) {
          const needsEnrichment = !extractItems(found).length || !found.deliveryAddress;
          const vendorId = found.supplierZohoVendorId || supplier?.zoho_vendor_id;
          if (needsEnrichment && vendorId) {
            try {
              const livePos = await fetchPurchaseOrders(vendorId);
              const match = (livePos || []).find(
                (p: any) =>
                  String(p.id) === String(found!.id) ||
                  p.poNumber === found!.poNumber ||
                  p.purchaseorder_number === found!.poNumber,
              );
              if (match) {
                const liveItems = extractItems(match);
                found = {
                  ...found,
                  items: liveItems.length ? liveItems : found.items,
                  deliveryAddress:
                    found.deliveryAddress ||
                    match.deliveryAddress ||
                    match.delivery_address ||
                    match.delivery_customer_address ||
                    '',
                };
              }
            } catch (err) {
              console.warn('Live PO enrichment failed', err);
            }
          }

          // Pull invoiced quantities for this PO
          const supplierIdForLookup = isAdmin ? found.supplier_id || supplier?.id : supplier?.id;
          if (supplierIdForLookup && found.poNumber) {
            try {
              const map = await fetchInvoicedQuantitiesForPo(supplierIdForLookup, found.poNumber);
              if (!cancelled) setInvoicedMap(map);
            } catch (err) {
              console.warn('Failed to load invoiced quantities', err);
            }
          }
        }

        if (!cancelled) setOrder(found);
        if (isAdmin) {
          syncAndFetchPurchaseOrdersFromDb()
            .then((freshData) => {
              if (cancelled) return;
              const refreshed = freshData.find(
                (po: any) =>
                  String(po.id) === target ||
                  String(po.dbId ?? '') === target ||
                  String(po.poNumber ?? '') === target,
              );
              if (refreshed) setOrder(refreshed);
            })
            .catch((syncErr) => console.warn('Background PO detail refresh failed', syncErr));
        }
      } catch (err) {
        console.error('Failed to load purchase order', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supplier?.zoho_vendor_id, supplier?.id, isAdmin, id]);

  if (!isAdmin && !supplier?.zoho_vendor_id) {
    return (
      <DashboardLayout title="Purchase Order">
        <AccountSetupBanner />
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout title="Purchase Order">
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!order) {
    return (
      <DashboardLayout title="Purchase Order Not Found">
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">The requested purchase order could not be found.</p>
          <Link to="/purchase-orders">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Purchase Orders
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const formatCurrency = (amount: number, opts?: { decimals?: number }) => {
    const decimals = opts?.decimals ?? 2;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  };

  return (
    <DashboardLayout title={order.poNumber} subtitle="Purchase Order Details">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <Link to="/purchase-orders">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          {order.status === 'pending' && (
            <Link to={`/invoices/upload?po=${order.id}`}>
              <Button variant="accent" className="gap-2">
                <Upload className="h-4 w-4" />
                Upload Invoice
              </Button>
            </Link>
          )}
        </div>

        {/* Order Info Cards */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 shadow-card animate-slide-up">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-semibold">{order.poNumber}</h2>
                  </div>
                  <Badge variant="outline" className={cn('mt-2 capitalize', statusStyles[order.status])}>
                    {order.status}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(order.amount)}</p>
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="rounded-xl border border-border bg-card shadow-card animate-slide-up" style={{ animationDelay: '100ms' }}>
              <div className="border-b border-border p-4">
                <h3 className="font-semibold">Order Items</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">HSN/SAC</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">PO Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Invoiced</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Pending</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Unit Price</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(order.items || []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No line items available for this purchase order.
                        </td>
                      </tr>
                    )}
                    {(order.items || []).map((item: any, idx: number) => {
                      const name = item.item_name || item.name || item.description || item.item_description || '';
                      const hsn = item.hsn || item.hsn_or_sac || item.hsn_sac || item.sac || '—';
                      const qty = Number(item.quantity ?? item.qty ?? 0) || 0;
                      const rate = Number(item.unitPrice ?? item.rate ?? item.unit_price ?? item.price ?? 0) || 0;
                      const isFullyBilled = ['closed', 'billed', 'completed'].includes(String(order.status || '').toLowerCase());
                      const tracked = invoicedMap[String(name).trim().toLowerCase()] || 0;
                      const invoiced = isFullyBilled ? qty : tracked;
                      const pending = Math.max(qty - invoiced, 0);
                      const total = Number(item.total ?? qty * rate);
                      return (
                        <tr key={item.id ?? idx}>
                          <td className="px-4 py-4 text-sm">{name || '—'}</td>
                          <td className="px-4 py-4 text-sm text-muted-foreground">{hsn}</td>
                          <td className="px-4 py-4 text-right text-sm">{qty}</td>
                          <td className="px-4 py-4 text-right text-sm">{invoiced}</td>
                          <td className="px-4 py-4 text-right text-sm font-medium">{pending}</td>
                          <td className="px-4 py-4 text-right text-sm">{formatCurrency(rate)}</td>
                          <td className="px-4 py-4 text-right text-sm font-medium">{formatCurrency(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/50">
                      <td colSpan={6} className="px-4 py-4 text-right font-semibold">Grand Total</td>
                      <td className="px-4 py-4 text-right font-bold text-primary">{formatCurrency(order.amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* Side Info */}
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 shadow-card animate-slide-up" style={{ animationDelay: '200ms' }}>
              <h3 className="mb-4 font-semibold">Order Details</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Order Date</p>
                    <p className="text-sm font-medium">
                      {new Date(order.date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Expected Delivery</p>
                    <p className="text-sm font-medium">
                      {order.expectedDelivery
                        ? new Date(order.expectedDelivery).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })
                        : '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Delivery Address</p>
                    <p className="whitespace-pre-line text-sm font-medium">
                      {formatAddress(order.deliveryAddress) || '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
