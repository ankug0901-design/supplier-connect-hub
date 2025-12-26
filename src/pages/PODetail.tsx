import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, MapPin, Calendar } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { mockPurchaseOrders } from '@/data/mockData';
import { cn } from '@/lib/utils';

const statusStyles = {
  pending: 'bg-warning/10 text-warning border-warning/20',
  invoiced: 'bg-info/10 text-info border-info/20',
  partial: 'bg-accent/10 text-accent border-accent/20',
  completed: 'bg-success/10 text-success border-success/20',
};

export default function PODetail() {
  const { id } = useParams();
  const order = mockPurchaseOrders.find((po) => po.id === id);

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
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
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Description
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Quantity
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Unit Price
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {order.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-4 text-sm">{item.description}</td>
                        <td className="px-4 py-4 text-right text-sm">{item.quantity}</td>
                        <td className="px-4 py-4 text-right text-sm">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-4 py-4 text-right text-sm font-medium">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/50">
                      <td colSpan={3} className="px-4 py-4 text-right font-semibold">Grand Total</td>
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
                      {new Date(order.expectedDelivery).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Delivery Address</p>
                    <p className="text-sm font-medium">{order.deliveryAddress}</p>
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
