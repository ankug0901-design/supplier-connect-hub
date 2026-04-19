import { useEffect, useState } from 'react';
import { Download, Search, Filter, CreditCard, Clock, CheckCircle, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { fetchPayments } from '@/services/api';
import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  pending: 'bg-warning/10 text-warning border-warning/20',
  processing: 'bg-info/10 text-info border-info/20',
  completed: 'bg-success/10 text-success border-success/20',
};

const statusIcons: Record<string, any> = {
  pending: Clock,
  processing: CreditCard,
  completed: CheckCircle,
};

export default function Payments() {
  const { supplier } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (!supplier?.zoho_vendor_id) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const data = await fetchPayments(supplier.zoho_vendor_id!);
        if (!cancelled) setPayments(data);
      } catch (err) {
        console.error('Failed to load payments', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supplier?.zoho_vendor_id]);

  const filteredPayments = payments.filter((payment: any) => {
    const matchesSearch =
      payment.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (payment.transactionId && payment.transactionId.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalReceived = payments
    .filter((p: any) => p.status === 'completed')
    .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

  const totalPending = payments
    .filter((p: any) => p.status !== 'completed')
    .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <DashboardLayout title="Payments" subtitle="Track your payment status and history">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-success/20 bg-success/5 p-6 animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-success/20 p-2">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Received</p>
                <p className="text-2xl font-bold text-success">{formatCurrency(totalReceived)}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-warning/20 p-2">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Amount</p>
                <p className="text-2xl font-bold text-warning">{formatCurrency(totalPending)}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 animate-slide-up" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Transactions</p>
                <p className="text-2xl font-bold">{mockPayments.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by invoice or transaction ID..."
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
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Statement
          </Button>
        </div>

        {/* Payments Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Invoice
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Date
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Amount
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Transaction ID
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
                {filteredPayments.map((payment, index) => {
                  const StatusIcon = statusIcons[payment.status];
                  return (
                    <tr
                      key={payment.id}
                      className="transition-colors hover:bg-muted/50 animate-slide-up"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="font-medium text-foreground">{payment.invoiceNumber}</span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                        {new Date(payment.date).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-foreground">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                        {payment.transactionId || '-'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <Badge variant="outline" className={cn('capitalize gap-1', statusStyles[payment.status])}>
                          <StatusIcon className="h-3 w-3" />
                          {payment.status}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        {payment.status === 'completed' && (
                          <Button variant="ghost" size="sm" className="gap-1">
                            <Download className="h-3 w-3" />
                            Receipt
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredPayments.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              No payments found matching your criteria.
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
