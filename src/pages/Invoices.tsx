import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Search, Filter, Plus, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { fetchInvoices, downloadBillAttachment, type BillAttachment } from '@/services/api';
import { AccountSetupBanner } from '@/components/AccountSetupBanner';
import { PdfViewer } from '@/components/PdfViewer';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'bg-success/10 text-success border-success/20' },
  overdue: { label: 'Overdue', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  due_soon: { label: 'Due Soon', className: 'bg-warning/10 text-warning border-warning/20' },
  pending: { label: 'Pending', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  partially_paid: { label: 'Partial', className: 'bg-info/10 text-info border-info/20' },
  void: { label: 'Void', className: 'bg-muted text-muted-foreground border-border' },
};

export default function Invoices() {
  const { supplier, isAdmin } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<BillAttachment | null>(null);
  const [attachmentInvoice, setAttachmentInvoice] = useState<any | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const closeAttachment = () => {
    setAttachment(null);
    setAttachmentInvoice(null);
    setAttachmentError(null);
  };

  const handleViewAttachment = async (invoice: any) => {
    if (!supplier?.zoho_vendor_id) return;
    setDownloadingId(invoice.id);
    setAttachmentInvoice(invoice);
    setAttachmentError(null);
    setAttachment(null);
    try {
      const result = await downloadBillAttachment(
        supplier.zoho_vendor_id,
        invoice.id,
        invoice.invoiceNumber
      );
      setAttachment(result);
    } catch (err: any) {
      const message = err?.message || 'Failed to fetch attachment';
      setAttachmentError(message);
      toast({
        title: 'Could not open attachment',
        description: message,
        variant: 'destructive',
      });
      setAttachmentInvoice(null);
    } finally {
      setDownloadingId(null);
    }
  };

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

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);

  const formatDate = (d?: string) =>
    d
      ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '-';

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
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="due_soon">Due Soon</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partially_paid">Partial</SelectItem>
                <SelectItem value="void">Void</SelectItem>
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
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Invoice #</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">PO Number</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Due Date</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Payment Date</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Amount</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Balance Due</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Attachment</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredInvoices.map((invoice: any, index: number) => {
                    const balance = Number(invoice.balance ?? 0);
                    const status = invoice.status || 'pending';
                    const cfg = statusConfig[status] || { label: status, className: 'bg-muted text-muted-foreground border-border' };
                    const isOverdue = status === 'overdue';
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
                          <div className="flex flex-col">
                            <span className={cn(isOverdue && 'text-destructive font-semibold', !isOverdue && 'text-foreground')}>
                              {formatDate(invoice.dueDate)}
                            </span>
                            {invoice.daysInfo && (
                              <span className="text-xs text-muted-foreground mt-0.5">{invoice.daysInfo}</span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                          {invoice.paymentDate ? formatDate(invoice.paymentDate) : '—'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-foreground">
                          {formatCurrency(Number(invoice.amount || 0))}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          {status === 'paid' ? (
                            <span className="text-foreground">₹0</span>
                          ) : isOverdue ? (
                            <span className="font-semibold text-destructive">{formatCurrency(balance)}</span>
                          ) : (
                            <span className="text-foreground">{formatCurrency(balance)}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          {invoice.hasAttachment ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-success hover:bg-success/10 hover:text-success"
                              title={invoice.attachmentName || 'View attachment'}
                              disabled={downloadingId === invoice.id}
                              onClick={() => handleViewAttachment(invoice)}
                            >
                              {downloadingId === invoice.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <Badge variant="outline" className={cn('capitalize', cfg.className)}>
                            {cfg.label}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="View invoice details"
                              onClick={() => setSelectedInvoice(invoice)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
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

      {/* Invoice Details Modal */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
            <DialogDescription>
              {selectedInvoice?.invoiceNumber}
            </DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Invoice Number</p>
                  <p className="font-medium">{selectedInvoice.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">PO Number</p>
                  <p className="font-medium">{selectedInvoice.poNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(selectedInvoice.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className="font-medium">{formatDate(selectedInvoice.dueDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-medium">{formatCurrency(Number(selectedInvoice.amount || 0))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p className="font-medium">{formatCurrency(Number(selectedInvoice.balance || 0))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="outline" className={cn('capitalize mt-1', statusConfig[selectedInvoice.status]?.className)}>
                    {statusConfig[selectedInvoice.status]?.label || selectedInvoice.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Days Info</p>
                  <p className="font-medium">{selectedInvoice.daysInfo || '—'}</p>
                </div>
                {selectedInvoice.paymentDate && (
                  <div>
                    <p className="text-xs text-muted-foreground">Payment Date</p>
                    <p className="font-medium">{formatDate(selectedInvoice.paymentDate)}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Attachment PDF Viewer (PDF.js) */}
      {attachment && attachmentInvoice && (
        <PdfViewer
          base64Data={attachment.base64}
          filename={attachment.filename}
          title="Supplier Invoice"
          onClose={closeAttachment}
        />
      )}
    </DashboardLayout>
  );
}
