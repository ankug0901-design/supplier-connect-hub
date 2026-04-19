import { useEffect, useState } from 'react';
import { Download, Search, Filter, CreditCard, Clock, CheckCircle, Loader2, AlertTriangle, FileText } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { fetchPayments, fetchInvoices } from '@/services/api';
import { AccountSetupBanner } from '@/components/AccountSetupBanner';
import { cn } from '@/lib/utils';

export default function Payments() {
  const { supplier, isAdmin } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
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
        const [pData, iData] = await Promise.all([
          fetchPayments(supplier.zoho_vendor_id!),
          fetchInvoices(supplier.zoho_vendor_id!),
        ]);
        if (!cancelled) {
          setPayments(pData);
          setInvoices(iData);
        }
      } catch (err) {
        console.error('Failed to load payments/invoices', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supplier?.zoho_vendor_id]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);

  const formatDate = (d: string) =>
    d
      ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '-';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isOpen = (inv: any) => {
    const status = (inv.status || '').toLowerCase();
    return status !== 'paid' && status !== 'closed' && Number(inv.balance ?? inv.amount ?? 0) > 0;
  };

  const openInvoices = invoices.filter(isOpen);
  const overdueInvoices = openInvoices.filter(
    (inv) => inv.dueDate && new Date(inv.dueDate) < today
  );

  const totalReceived = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const dueCount = openInvoices.length;
  const overdueCount = overdueInvoices.length;

  const filteredPayments = payments.filter((payment: any) => {
    const matchesSearch =
      payment.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      payment.paymentNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (payment.transactionId && payment.transactionId.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || (payment.status || '').toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getInvoiceStatus = (inv: any) => {
    if (!inv.dueDate) return { label: 'Pending', cls: 'bg-warning/10 text-warning border-warning/20' };
    const due = new Date(inv.dueDate);
    const diff = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return { label: 'Overdue', cls: 'bg-destructive/10 text-destructive border-destructive/20' };
    if (diff <= 7) return { label: 'Due Soon', cls: 'bg-warning/10 text-warning border-warning/20' };
    return { label: 'Pending', cls: 'bg-muted text-muted-foreground border-border' };
  };

  if (!isAdmin && !supplier?.zoho_vendor_id) {
    return (
      <DashboardLayout title="Payments" subtitle="Track your payment status and history">
        <AccountSetupBanner />
      </DashboardLayout>
    );
  }

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
                <p className="text-sm text-muted-foreground">Pending / Due</p>
                <p className="text-2xl font-bold text-warning">{dueCount}</p>
                <p className="text-xs text-muted-foreground">open invoice{dueCount === 1 ? '' : 's'}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 animate-slide-up" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-destructive/20 p-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-destructive">{overdueCount}</p>
                <p className="text-xs text-muted-foreground">past due date</p>
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
                placeholder="Search by payment, invoice or transaction..."
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
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Statement
          </Button>
        </div>

        {/* Payments Table */}
        {isLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-border bg-card">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
              <div className="border-b border-border px-6 py-4">
                <h3 className="text-lg font-semibold">Payments Received</h3>
                <p className="text-sm text-muted-foreground">All payments credited to your account</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {['Payment #', 'Invoice #', 'Date', 'Amount', 'Payment Mode', 'Account', 'Status'].map((h) => (
                        <th key={h} className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredPayments.map((payment: any, index: number) => (
                      <tr
                        key={payment.id}
                        className="transition-colors hover:bg-muted/50 animate-slide-up"
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-foreground">
                          {payment.paymentNumber || '-'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-foreground">
                          {payment.invoiceNumber || '-'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                          {formatDate(payment.date)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-foreground">
                          {formatCurrency(Number(payment.amount || 0))}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                          {payment.paymentMode || '-'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                          {payment.account || '-'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <Badge variant="outline" className="gap-1 bg-success/10 text-success border-success/20">
                            <CheckCircle className="h-3 w-3" />
                            Completed
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredPayments.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  No payments found matching your criteria.
                </div>
              )}
            </div>

            {/* Outstanding Invoices */}
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Outstanding Invoices
                  </h3>
                  <p className="text-sm text-muted-foreground">Invoices awaiting payment</p>
                </div>
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                  {openInvoices.length} open
                </Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {['Invoice #', 'PO Number', 'Date', 'Due Date', 'Amount', 'Balance Due', 'Status'].map((h) => (
                        <th key={h} className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {openInvoices.map((inv: any, index: number) => {
                      const s = getInvoiceStatus(inv);
                      const balance = Number(inv.balance ?? inv.amount ?? 0);
                      return (
                        <tr
                          key={inv.id || inv.invoiceNumber}
                          className="transition-colors hover:bg-muted/50 animate-slide-up"
                          style={{ animationDelay: `${index * 30}ms` }}
                        >
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-foreground">
                            {inv.invoiceNumber || '-'}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                            {inv.poNumber || inv.po_number || '-'}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                            {formatDate(inv.date)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                            {formatDate(inv.dueDate)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-foreground">
                            {formatCurrency(Number(inv.amount || 0))}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-destructive">
                            {formatCurrency(balance)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <Badge variant="outline" className={cn('gap-1', s.cls)}>
                              {s.label}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {openInvoices.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  No outstanding invoices. You're all caught up! 🎉
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
