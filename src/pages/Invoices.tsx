import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Download, Search, Filter, Plus, Paperclip, Loader2, CheckCircle2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { fetchInvoices } from '@/services/api';
import { AccountSetupBanner } from '@/components/AccountSetupBanner';
import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  pending: 'bg-warning/10 text-warning border-warning/20',
  approved: 'bg-info/10 text-info border-info/20',
  rejected: 'bg-destructive/10 text-destructive border-destructive/20',
  paid: 'bg-success/10 text-success border-success/20',
};

export default function Invoices() {
  const { supplier, isAdmin } = useAuth();
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
        const data = await fetchInvoices(supplier.zoho_vendor_id!);
        if (!cancelled) setInvoices(data);
      } catch (err) {
        console.error('Failed to load invoices', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supplier?.zoho_vendor_id]);

  const filteredInvoices = invoices.filter((invoice: any) => {
    const matchesSearch =
      invoice.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.poNumber?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const formatDate = (d: string) =>
    d
      ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '-';

  const getDueMeta = (dueDate?: string) => {
    if (!dueDate) return { cls: 'text-muted-foreground', overdue: false, dueSoon: false };
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffDays = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return { cls: 'text-destructive font-semibold', overdue: true, dueSoon: false };
    if (diffDays <= 7) return { cls: 'text-warning font-medium', overdue: false, dueSoon: true };
    return { cls: 'text-foreground', overdue: false, dueSoon: false };
  };

  if (!isAdmin && !supplier?.zoho_vendor_id) {
    return (
      <DashboardLayout title="Invoices" subtitle="Manage your submitted invoices">
        <AccountSetupBanner />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Invoices" subtitle="Manage your submitted invoices">
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
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
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Link to="/invoices/upload">
            <Button variant="accent" className="gap-2">
              <Plus className="h-4 w-4" />
              Upload Invoice
            </Button>
          </Link>
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
                      Invoice Number
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      PO Number
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Date
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Due Date
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Amount
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Balance Due
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Attachment
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
                  {filteredInvoices.map((invoice: any, index: number) => {
                    const dueMeta = getDueMeta(invoice.dueDate);
                    const balance = Number(invoice.balance ?? 0);
                    return (
                      <tr
                        key={invoice.id}
                        className="transition-colors hover:bg-muted/50 animate-slide-up"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="font-medium text-foreground">{invoice.invoiceNumber}</span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                          <Link to={`/purchase-orders/${invoice.poId}`} className="hover:text-primary hover:underline">
                            {invoice.poNumber}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                          {formatDate(invoice.date)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          <div className="flex items-center gap-2">
                            <span className={dueMeta.cls}>{formatDate(invoice.dueDate)}</span>
                            {dueMeta.overdue && (
                              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                                Overdue
                              </Badge>
                            )}
                            {dueMeta.dueSoon && (
                              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                                Due Soon
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-foreground">
                          {formatCurrency(Number(invoice.amount || 0))}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          {balance > 0 ? (
                            <span className="font-semibold text-destructive">{formatCurrency(balance)}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-success">
                              <CheckCircle2 className="h-4 w-4" />
                              Settled
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          {invoice.hasAttachment ? (
                            <a
                              href={invoice.viewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1 text-xs font-medium text-success transition-colors hover:bg-success/20"
                              title={invoice.attachmentName || 'View attachment in Zoho'}
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                              <span className="max-w-[160px] truncate">
                                {invoice.attachmentName || 'View attachment'}
                              </span>
                            </a>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <Badge variant="outline" className={cn('capitalize', statusStyles[invoice.status] || '')}>
                            {invoice.status}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {invoice.viewUrl && (
                              <a href={invoice.viewUrl} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="View in Zoho">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </a>
                            )}
                            {invoice.hasAttachment && (
                              <a href={invoice.viewUrl} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Download attachment">
                                  <Download className="h-4 w-4" />
                                </Button>
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredInvoices.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                No invoices found matching your criteria.
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
