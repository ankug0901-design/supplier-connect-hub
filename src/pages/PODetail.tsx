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

const formatDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';


export default function PODetail() {
  const { id } = useParams();
  const { supplier, isAdmin } = useAuth();
  const [order, setOrder] = useState<any | null>(null);
  const [invoicedMap, setInvoicedMap] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  const loadOrder = useCallback(async () => {
    if (!isAdmin && !supplier?.zoho_vendor_id) {
      setIsLoading(false);
      return;
    }
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

      if (found) {
        const vendorId = found.supplierZohoVendorId || supplier?.zoho_vendor_id;
        if (vendorId) {
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
              const existingItems = extractItems(found);
              // Merge live Zoho item fields (HSN, tax, etc.) into our DB items,
              // matched by zoho line_item_id first, then by item name.
              const liveByLineId: Record<string, any> = {};
              const liveByName: Record<string, any> = {};
              liveItems.forEach((li: any) => {
                const lid = String(li.line_item_id || li.id || '');
                if (lid) liveByLineId[lid] = li;
                const nm = String(li.item_name || li.name || li.description || '').trim().toLowerCase();
                if (nm) liveByName[nm] = li;
              });
              const baseItems = existingItems.length ? existingItems : liveItems;
              const mergedItems = baseItems.map((it: any) => {
                const lid = String(it.line_item_id || it.zoho_line_item_id || '');
                const nm = String(it.item_name || it.name || it.description || '').trim().toLowerCase();
                const live = (lid && liveByLineId[lid]) || liveByName[nm] || {};
                return {
                  ...live,
                  ...it,
                  hsn: it.hsn || live.hsn || live.hsn_or_sac || live.hsn_sac || live.sac,
                  tax_percentage: it.tax_percentage ?? live.tax_percentage ?? live.tax_rate,
                  tax_name: it.tax_name || live.tax_name,
                  item_tax_amount: it.item_tax_amount ?? live.item_tax_amount ?? live.tax_amount,
                };
              });
              found = {
                ...found,
                items: mergedItems,
                taxTotal:
                  match.taxTotal ?? match.tax_total ?? match.tax_amount ?? (found as any).taxTotal,
                subTotal: match.subTotal ?? match.sub_total ?? (found as any).subTotal,
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

        const supplierIdForLookup = isAdmin ? found.supplier_id || supplier?.id : supplier?.id;
        if (supplierIdForLookup && found.poNumber) {
          try {
            const map = await fetchInvoicedQuantitiesForPo(supplierIdForLookup, found.poNumber);
            setInvoicedMap(map);
          } catch (err) {
            console.warn('Failed to load invoiced quantities', err);
          }
        }
      }

      setOrder(found);
    } catch (err) {
      console.error('Failed to load purchase order', err);
    } finally {
      setIsLoading(false);
    }
  }, [supplier?.zoho_vendor_id, supplier?.id, isAdmin, id]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

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

  // Aggregate confirmed delivery dates across items for summary in the sidebar
  const confirmedDates: string[] = (order.items || [])
    .map((it: any) => it.confirmedDeliveryDate || it.confirmed_delivery_date)
    .filter(Boolean);
  const earliestConfirmed = confirmedDates.length
    ? confirmedDates.reduce((a, b) => (new Date(a) < new Date(b) ? a : b))
    : null;
  const latestConfirmed = confirmedDates.length
    ? confirmedDates.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
    : null;

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
          {order.status === 'pending' &&
            (order.deliveryDatesConfirmedAt ? (
              <Link to={`/invoices/upload?po=${order.id}`}>
                <Button variant="accent" className="gap-2">
                  <Upload className="h-4 w-4" />
                  Upload Invoice
                </Button>
              </Link>
            ) : (
              <Button variant="accent" className="gap-2" disabled title="Confirm delivery dates first">
                <Lock className="h-4 w-4" />
                Upload Invoice
              </Button>
            ))}
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
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Tax</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Delivery Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Dispatch Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(order.items || []).length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-sm text-muted-foreground">
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
                      const taxPct = item.tax_percentage ?? item.tax_rate;
                      const taxName = item.tax_name;
                      const taxLabel =
                        taxPct != null && taxPct !== ''
                          ? `${Number(taxPct)}%${taxName ? ` (${taxName})` : ''}`
                          : taxName || '—';
                      const confirmed = item.confirmedDeliveryDate || item.confirmed_delivery_date;
                      const dispatchStatus = (() => {
                        if (invoiced >= qty && qty > 0) {
                          return { label: 'Dispatched', cls: 'bg-success/10 text-success border-success/20' };
                        }
                        if (!order.deliveryDatesConfirmedAt || !confirmed) {
                          return { label: 'Awaiting confirmation', cls: 'bg-muted text-muted-foreground border-border' };
                        }
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const due = new Date(confirmed);
                        due.setHours(0, 0, 0, 0);
                        const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
                        if (invoiced > 0 && invoiced < qty) {
                          return { label: 'Partially dispatched', cls: 'bg-accent/10 text-accent border-accent/20' };
                        }
                        if (diff < 0) return { label: `Overdue by ${Math.abs(diff)}d`, cls: 'bg-destructive/10 text-destructive border-destructive/20' };
                        if (diff === 0) return { label: 'Due today', cls: 'bg-warning/10 text-warning border-warning/20' };
                        if (diff <= 3) return { label: `Due in ${diff}d`, cls: 'bg-warning/10 text-warning border-warning/20' };
                        return { label: `Scheduled (${diff}d)`, cls: 'bg-info/10 text-info border-info/20' };
                      })();
                      return (
                        <tr key={item.id ?? idx}>
                          <td className="px-4 py-4 text-sm">{name || '—'}</td>
                          <td className="px-4 py-4 text-sm text-muted-foreground">{hsn}</td>
                          <td className="px-4 py-4 text-right text-sm">{qty}</td>
                          <td className="px-4 py-4 text-right text-sm">{invoiced}</td>
                          <td className="px-4 py-4 text-right text-sm font-medium">{pending}</td>
                          <td className="px-4 py-4 text-right text-sm">{formatCurrency(rate)}</td>
                          <td className="px-4 py-4 text-right text-sm text-muted-foreground">{taxLabel}</td>
                          <td className="px-4 py-4 text-sm text-muted-foreground">{formatDate(confirmed)}</td>
                          <td className="px-4 py-4 text-sm">
                            <Badge variant="outline" className={cn('font-medium', dispatchStatus.cls)}>
                              {dispatchStatus.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 text-right text-sm font-medium">{formatCurrency(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(order.subTotal != null || order.taxTotal != null) && (
                      <>
                        {order.subTotal != null && (
                          <tr>
                            <td colSpan={8} className="px-4 py-2 text-right text-sm text-muted-foreground">Sub Total</td>
                            <td className="px-4 py-2 text-right text-sm">{formatCurrency(Number(order.subTotal || 0))}</td>
                          </tr>
                        )}
                        {order.taxTotal != null && (
                          <tr>
                            <td colSpan={8} className="px-4 py-2 text-right text-sm text-muted-foreground">Total Tax</td>
                            <td className="px-4 py-2 text-right text-sm">{formatCurrency(Number(order.taxTotal || 0))}</td>
                          </tr>
                        )}
                      </>
                    )}
                    <tr className="bg-muted/50">
                      <td colSpan={8} className="px-4 py-4 text-right font-semibold">Grand Total</td>
                      <td className="px-4 py-4 text-right font-bold text-primary">{formatCurrency(order.amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Delivery Date Confirmation */}
            <DeliveryDateConfirmation
              poDbId={order.dbId || order.id}
              items={(order.items || []) as any}
              deliveryDatesConfirmedAt={order.deliveryDatesConfirmedAt || null}
              expectedDelivery={order.expectedDelivery}
              onSaved={() => void loadOrder()}
            />
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
                    <p className="text-sm font-medium">{formatDate(order.date)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Expected Delivery</p>
                    <p className="text-sm font-medium">{formatDate(order.expectedDelivery)}</p>
                  </div>
                </div>
                {order.deliveryDatesConfirmedAt && earliestConfirmed && (
                  <div className="flex items-start gap-3">
                    <Calendar className="mt-0.5 h-4 w-4 text-success" />
                    <div>
                      <p className="text-xs text-muted-foreground">Confirmed Delivery</p>
                      <p className="text-sm font-medium">
                        {earliestConfirmed === latestConfirmed
                          ? formatDate(earliestConfirmed)
                          : `${formatDate(earliestConfirmed)} – ${formatDate(latestConfirmed)}`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Confirmed on {formatDate(order.deliveryDatesConfirmedAt)}
                      </p>
                    </div>
                  </div>
                )}
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
