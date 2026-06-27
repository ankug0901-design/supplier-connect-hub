import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, Search, Filter, Plus, Loader2, Download } from 'lucide-react';
import { exportToCsv } from '@/lib/exportCsv';
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
import { fetchInvoices, fetchInvoicesFromDb, downloadBillAttachment, type BillAttachment } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';
import { AccountSetupBanner } from '@/components/AccountSetupBanner';
import { PdfViewer } from '@/components/PdfViewer';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; className: string }> = {
  paid: { label: 'Closed', className: 'bg-success/10 text-success border-success/20' },
  closed: { label: 'Closed', className: 'bg-success/10 text-success border-success/20' },
  overdue: { label: 'Overdue', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  due_soon: { label: 'Due Soon', className: 'bg-warning/10 text-warning border-warning/20' },
  pending: { label: 'Pending', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  partially_paid: { label: 'Partial Billed', className: 'bg-info/10 text-info border-info/20' },
  partial: { label: 'Partial Billed', className: 'bg-info/10 text-info border-info/20' },
  void: { label: 'Void', className: 'bg-muted text-muted-foreground border-border' },
};

const PAID = new Set(['paid', 'closed']);
const TERMINAL = new Set(['paid', 'closed', 'void', 'partially_paid', 'partial']);

function deriveStatusAndDays(inv: any): { status: string; daysInfo: string } {
  const raw = (inv.status || 'pending').toString().toLowerCase();
  const dueDate = inv.dueDate || inv.due_date;
  const paymentDate = inv.paymentDate || inv.payment_date;
  const dayMs = 1000 * 60 * 60 * 24;
  if (PAID.has(raw)) {
    if (paymentDate) {
      const days = Math.round((Date.now() - new Date(paymentDate).getTime()) / dayMs);
      return { status: raw, daysInfo: days <= 0 ? 'Paid today' : `Paid ${days} day${days === 1 ? '' : 's'} ago` };
    }
    return { status: raw, daysInfo: 'Paid' };
  }
  if (!dueDate) return { status: raw, daysInfo: '' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / dayMs);
  let status = raw;
  let daysInfo = '';
  if (diff < 0) {
    daysInfo = `${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'} overdue`;
    if (!TERMINAL.has(raw)) status = 'overdue';
  } else if (diff === 0) {
    daysInfo = 'Due today';
    if (!TERMINAL.has(raw)) status = 'due_soon';
  } else if (diff <= 7) {
    daysInfo = `Due in ${diff} day${diff === 1 ? '' : 's'}`;
    if (!TERMINAL.has(raw)) status = 'due_soon';
  } else {
    daysInfo = `Due in ${diff} days`;
  }
  return { status, daysInfo };
}

const PAGE_SIZE = 20;

export default function Invoices() {
  const { supplier, isAdmin } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<BillAttachment | null>(null);
  const [attachmentInvoice, setAttachmentInvoice] = useState<any | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [page, setPage] = useState(1);


  const closeAttachment = () => {
    setAttachment(null);
    setAttachmentInvoice(null);
    setAttachmentError(null);
  };

  const handleViewAttachment = async (invoice: any) => {
    const vendorId = isAdmin ? invoice.supplierZohoVendorId : supplier?.zoho_vendor_id;
    if (!vendorId) {
      toast({ title: 'Cannot open attachment', description: 'Missing supplier Zoho vendor ID.', variant: 'destructive' });
      return;
    }
    setDownloadingId(invoice.id);
    setAttachmentInvoice(invoice);
    setAttachmentError(null);
    setAttachment(null);
    try {
      const result = await downloadBillAttachment(
        vendorId,
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
    if (!isAdmin && !supplier?.zoho_vendor_id) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const data = isAdmin
          ? await fetchInvoicesFromDb()
          : await fetchInvoices(supplier!.zoho_vendor_id!);

        // First paint: show invoices immediately (with derived status), so the
        // first 15 rows render right away.
        const baseEnriched = (data || []).map((i: any) => {
          const derived = deriveStatusAndDays(i);
          return {
            ...i,
            status: derived.status,
            daysInfo: i.daysInfo || derived.daysInfo,
            submittedAt: null as string | null,
          };
        });
        if (cancelled) return;
        setInvoices(baseEnriched);
        setIsLoading(false);

        // Background: fetch supplier submission timestamps from invoice_line_items
        // and merge them in once available. This does not block the first paint.
        const invoiceNumbers = Array.from(
          new Set(baseEnriched.map((i: any) => i.invoiceNumber).filter(Boolean)),
        ) as string[];
        if (!invoiceNumbers.length) return;
        setEnriching(true);
        try {
          const { data: liData } = await supabase
            .from('invoice_line_items')
            .select('invoice_number, created_at')
            .in('invoice_number', invoiceNumbers);
          if (cancelled) return;
          const submissionByNumber: Record<string, string> = {};
          (liData || []).forEach((row: any) => {
            const k = row.invoice_number;
            if (!k) return;
            if (!submissionByNumber[k] || row.created_at < submissionByNumber[k]) {
              submissionByNumber[k] = row.created_at;
            }
          });
          if (cancelled) return;
          setInvoices((prev) =>
            prev.map((i: any) => ({
              ...i,
              submittedAt: submissionByNumber[i.invoiceNumber] || i.submittedAt || null,
            })),
          );
        } finally {
          if (!cancelled) setEnriching(false);
        }
      } catch (err) {
        console.error('Failed to load invoices', err);
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supplier?.zoho_vendor_id, isAdmin]);


  const filteredInvoices = invoices.filter((invoice: any) => {
    const matchesSearch =
      invoice.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.poNumber?.toLowerCase().includes(searchQuery.toLowerCase());
    const invStatus = (invoice.status || '').toString().toLowerCase();
    const matchesStatus = statusFilter === 'all' || invStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pagedInvoices = filteredInvoices.slice(pageStart, pageStart + PAGE_SIZE);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter]);

  const availableInvoiceStatuses = Array.from(
    new Set(invoices.map((i: any) => (i.status || '').toString().toLowerCase()).filter(Boolean)),
  ).sort();


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
                {availableInvoiceStatuses.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {statusConfig[s]?.label || s.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2"
              disabled={filteredInvoices.length === 0}
              onClick={() => {
                const rows = filteredInvoices.map((i: any) => ({
                  invoiceNumber: i.invoiceNumber || '',
                  supplier: i.supplierName || '',
                  poNumber: i.poNumber || '',
                  invoiceDate: i.date ? new Date(i.date).toLocaleDateString('en-IN') : '',
                  submittedOn: i.submittedOn ? new Date(i.submittedOn).toLocaleDateString('en-IN') : '',
                  amount: Number(i.amount || 0),
                  status: i.status || '',
                }));
                exportToCsv(`invoices-${new Date().toISOString().slice(0,10)}.csv`, rows, [
                  { key: 'invoiceNumber', header: 'Invoice #' },
                  { key: 'supplier', header: 'Supplier' },
                  { key: 'poNumber', header: 'PO #' },
                  { key: 'invoiceDate', header: 'Invoice Date' },
                  { key: 'submittedOn', header: 'Submitted On' },
                  { key: 'amount', header: 'Amount (INR)' },
                  { key: 'status', header: 'Status' },
                ]);
                toast({ title: 'Exported', description: `${rows.length} invoices downloaded.` });
              }}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Link to="/invoices/upload">
              <Button variant="accent" className="gap-2">
                <Plus className="h-4 w-4" />
                Upload Invoice
              </Button>
            </Link>
          </div>
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
                    {isAdmin && (
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Supplier</th>
                    )}
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">PO Number</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Invoice Date</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Submitted On</th>
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
                  {pagedInvoices.map((invoice: any, index: number) => {
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
                        {isAdmin && (
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                            {invoice.supplierName || '—'}
                          </td>
                        )}
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                          <Link to={`/purchase-orders/${invoice.poId}`} className="hover:text-primary hover:underline">
                            {invoice.poNumber}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                          {formatDate(invoice.date)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                          {invoice.submittedAt ? formatDate(invoice.submittedAt) : '—'}
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
            {filteredInvoices.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>
                    Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredInvoices.length)} of {filteredInvoices.length}
                  </span>
                  {enriching && (
                    <span className="flex items-center gap-1 text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading details…
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
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
