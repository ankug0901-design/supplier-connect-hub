import { Link } from 'react-router-dom';
import { Eye, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PurchaseOrder } from '@/types/supplier';
import { cn } from '@/lib/utils';

interface RecentPOTableProps {
  orders: PurchaseOrder[];
}

const statusStyles = {
  pending: 'bg-warning/10 text-warning border-warning/20',
  invoiced: 'bg-info/10 text-info border-info/20',
  partial: 'bg-accent/10 text-accent border-accent/20',
  completed: 'bg-success/10 text-success border-success/20',
};

export function RecentPOTable({ orders }: RecentPOTableProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h3 className="font-semibold text-card-foreground">Recent Purchase Orders</h3>
        <Link to="/purchase-orders">
          <Button variant="ghost" size="sm">View All</Button>
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                PO Number
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Amount
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((order, index) => (
              <tr 
                key={order.id} 
                className="transition-colors hover:bg-muted/50"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <td className="whitespace-nowrap px-4 py-4">
                  <span className="font-medium text-foreground">{order.poNumber}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                  {new Date(order.date).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-foreground">
                  {formatCurrency(order.amount)}
                </td>
                <td className="whitespace-nowrap px-4 py-4">
                  <Badge
                    variant="outline"
                    className={cn('capitalize', statusStyles[order.status])}
                  >
                    {order.status}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link to={`/purchase-orders/${order.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                    {order.status === 'pending' && (
                      <Link to={`/invoices/upload?po=${order.id}`}>
                        <Button variant="accent" size="sm" className="gap-1">
                          <Upload className="h-3 w-3" />
                          Invoice
                        </Button>
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
