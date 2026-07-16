import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye, Upload, Search, Download, Loader2, Lock, Bell, IndianRupee, Package,
  FileUp, Truck, ChevronDown, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchPurchaseOrders, fetchPurchaseOrdersFromDb, syncAndFetchPurchaseOrdersFromDb,
  downloadPurchaseOrder,
} from '@/services/api';
import { exportToCsv } from '@/lib/exportCsv';
import { AccountSetupBanner } from '@/components/AccountSetupBanner';
import { cn } from '@/lib/utils';
import { StickyHorizontalScrollbar } from '@/components/StickyHorizontalScrollbar';

// ── status pill palette (per spec) ────────────────────────────────────────
const STATUS_PILL: Record<string, { bg: string; text: string; label?: string }> = {
  pending:   { bg: '#FEF3C7', text: '#92400E' },
  partial:   { bg: '#FED7AA', text: '#9A3412' },
  invoiced:  { bg: '#D1FAE5', text: '#065F46' },
  completed: { bg: '#D1FAE5', text: '#065F46' },
  closed:    { bg: '#111827', text: '#FFFFFF' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
  rejected:  { bg: '#FEE2E2', text: '#991B1B' },
  on_hold:   { bg: '#FEF3C7', text: '#92400E' },
  draft:     { bg: '#F3F4F6', text: '#374151' },
};

function StatusPill({ status }: { status: string }) {
  const key = (status || '').toLowerCase();
  const p = STATUS_PILL[key] || { bg: '#F3F4F6', text: '#374151' };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize"
      style={{ background: p.bg, color: p.text }}
    >
      {key.replace(/_/g, ' ') || 'unknown'}
    </span>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────
function KpiCard({
  label, value, subline, icon, from, to, border, iconBg, iconColor, children,
}: {
  label: string; value: string; subline?: React.ReactNode; icon: React.ReactNode;
  from: string; to: string; border: string; iconBg: string; iconColor: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4 sm:p-5"
      style={{
        background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
        border: `0.5px solid ${border}`,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div
            className="text-[10px] font-semibold uppercase"
            style={{ color: '#6B7280', letterSpacing: '1.2px' }}
          >
            {label}
          </div>
          <div className="mt-2 text-2xl font-semibold" style={{ color: '#111827' }}>
            {value}
          </div>
        </div>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </div>
      </div>
      {children && <div className="mt-3">{children}</div>}
      {subline && (
        <div className="mt-2 text-[11px]" style={{ color: '#6B7280' }}>{subline}</div>
      )}
    </div>
  );
}

// ── filter chip ───────────────────────────────────────────────────────────
function Chip({
  active, onClick, children, count,
}: { active?: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
        active
          ? 'border-transparent text-white'
          : 'border-[#E5E7EB] bg-white text-[#374151] hover:bg-[#F9FAFB]',
      )}
      style={active ? { background: '#10B981' } : undefined}
    >
      <span>{children}</span>
      {typeof count === 'number' && (
        <span
          className={cn(
            'rounded-full px-1.5 text-[10px] font-semibold',
            active ? 'bg-white/25' : 'bg-[#F3F4F6] text-[#6B7280]',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ── skeleton row ──────────────────────────────────────────────────────────
function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 w-3/4 animate-pulse rounded bg-[#F3F4F6]" />
        </td>
      ))}
    </tr>
  );
}

const PAGE_SIZE = 20;

export default function PurchaseOrders() {
  const { supplier, isAdmin, isImpersonating } = useAuth();
  const adminMode = isAdmin && !isImpersonating;
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const handleDownloadPO = async (
    poId: string, poNumber: string, rowVendorId?: string, deliveryConfirmed?: boolean,
  ) => {
    if (!deliveryConfirmed) {
      toast.error('Please confirm delivery dates for this PO before downloading.');
      return;
    }
    const vendorId = supplier?.zoho_vendor_id || rowVendorId;
    if (!vendorId) { toast.error('Vendor ID not found for this purchase order.'); return; }
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
    if (!adminMode && !supplier?.zoho_vendor_id) { setIsLoading(false); return; }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const data = adminMode
          ? await fetchPurchaseOrdersFromDb(false)
          : await fetchPurchaseOrders(supplier!.zoho_vendor_id!, supplier!.id);
        if (!cancelled) setPurchaseOrders(data);
        if (adminMode) {
          syncAndFetchPurchaseOrdersFromDb()
            .then((fresh) => { if (!cancelled) setPurchaseOrders(fresh); })
            .catch((e) => console.warn('Background PO refresh failed', e));
        }
      } catch (err) {
        console.error('Failed to load purchase orders', err);
      } finally { if (!cancelled) setIsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [supplier?.zoho_vendor_id, supplier?.id, adminMode]);

  const availableStatuses = useMemo(
    () => Array.from(new Set(
      purchaseOrders.map((o: any) => (o.status || '').toString().toLowerCase()).filter(Boolean),
    )).sort(),
    [purchaseOrders],
  );

  const availableSuppliers = useMemo(
    () => Array.from(new Set(
      purchaseOrders.map((o: any) => o.supplierName).filter(Boolean),
    )).sort() as string[],
    [purchaseOrders],
  );

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: purchaseOrders.length };
    purchaseOrders.forEach((o: any) => {
      const s = (o.status || '').toLowerCase();
      c[s] = (c[s] || 0) + 1;
    });
    return c;
  }, [purchaseOrders]);

  const awaitingCount = useMemo(
    () => purchaseOrders.filter((o: any) => o.needsDeliveryConfirmation && !o.exceptionApprovedAt).length,
    [purchaseOrders],
  );

  const filteredOrders = useMemo(() => purchaseOrders.filter((order: any) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q
      || order.poNumber?.toLowerCase().includes(q)
      || order.supplierName?.toLowerCase().includes(q)
      || (order.items || []).some((it: any) =>
        (it.item_name || '').toLowerCase().includes(q)
        || (it.description || '').toLowerCase().includes(q));
    const orderStatus = (order.status || '').toString().toLowerCase();
    const matchesStatus = statusFilter === 'all' || orderStatus === statusFilter;
    const matchesSupplier = supplierFilter === 'all' || order.supplierName === supplierFilter;
    const matchesAwaiting = !awaitingOnly || (order.needsDeliveryConfirmation && !order.exceptionApprovedAt);
    return matchesSearch && matchesStatus && matchesSupplier && matchesAwaiting;
  }), [purchaseOrders, searchQuery, statusFilter, supplierFilter, awaitingOnly]);

  // KPIs (from what we have)
  const kpis = useMemo(() => {
    const totalValue = purchaseOrders.reduce((s, o: any) => s + Number(o.amount || 0), 0);
    const suppliersCount = new Set(purchaseOrders.map((o: any) => o.supplierName).filter(Boolean)).size;
    const openStatuses = new Set(['pending', 'partial']);
    const openOrders = purchaseOrders.filter((o: any) => openStatuses.has((o.status || '').toLowerCase()));
    const openValue = openOrders.reduce((s, o: any) => s + Number(o.amount || 0), 0);
    const pendingN = purchaseOrders.filter((o: any) => (o.status || '').toLowerCase() === 'pending').length;
    const partialN = purchaseOrders.filter((o: any) => (o.status || '').toLowerCase() === 'partial').length;
    const issuedN = purchaseOrders.filter((o: any) => ['invoiced','completed'].includes((o.status || '').toLowerCase())).length;
    const awaitingInvoiceOrders = purchaseOrders.filter(
      (o: any) => (o.status || '').toLowerCase() === 'pending',
    );
    const awaitingInvoiceValue = awaitingInvoiceOrders.reduce((s, o: any) => s + Number(o.amount || 0), 0);
    // avg fulfillment days from date → expectedDelivery
    const fulfillmentDays: number[] = purchaseOrders
      .filter((o: any) => o.date && o.expectedDelivery)
      .map((o: any) => {
        const d = (new Date(o.expectedDelivery).getTime() - new Date(o.date).getTime()) / 86400000;
        return Math.max(0, Math.round(d));
      });
    const avgFulfill = fulfillmentDays.length
      ? Math.round(fulfillmentDays.reduce((a, b) => a + b, 0) / fulfillmentDays.length)
      : 0;
    return {
      totalValueLakh: totalValue / 100000,
      suppliersCount,
      openCount: openOrders.length,
      openValueLakh: openValue / 100000,
      pendingN, partialN, issuedN,
      awaitingInvoiceCount: awaitingInvoiceOrders.length,
      awaitingInvoiceValueLakh: awaitingInvoiceValue / 100000,
      avgFulfill,
    };
  }, [purchaseOrders]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  const fmtLakh = (v: number) => `₹${v.toFixed(v >= 10 ? 1 : 2)} L`;

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filteredOrders.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, supplierFilter, awaitingOnly]);

  if (!adminMode && !supplier?.zoho_vendor_id) {
    return (
      <DashboardLayout title="Purchase Orders" subtitle="View and manage all your purchase orders">
        <AccountSetupBanner />
      </DashboardLayout>
    );
  }

  const subtitle = (
    <span>
      View and manage all your purchase orders
      <span className="mx-1.5 text-[#D1D5DB]">·</span>
      <span className="font-medium text-[#111827]">{purchaseOrders.length}</span> POs
      <span className="mx-1.5 text-[#D1D5DB]">·</span>
      <span className="font-medium text-[#111827]">{fmtLakh(kpis.totalValueLakh)}</span> raised
      <span className="mx-1.5 text-[#D1D5DB]">·</span>
      <span className="font-medium text-[#111827]">{kpis.openCount}</span> open
    </span>
  );

  const doExport = () => {
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
  };

  const resetFilters = () => {
    setSearchQuery(''); setStatusFilter('all'); setSupplierFilter('all'); setAwaitingOnly(false);
  };

  const openStackTotal = Math.max(1, kpis.pendingN + kpis.partialN + kpis.issuedN);

  // ── delivery hint ───────────────────────────────────────────────────────
  const deliveryHint = (o: any) => {
    if (!o.expectedDelivery) return null;
    const days = Math.round((new Date(o.expectedDelivery).getTime() - Date.now()) / 86400000);
    if (days < 0) return <div className="text-[11px] font-medium" style={{ color: '#991B1B' }}>{Math.abs(days)}d overdue</div>;
    if (days <= 3) return <div className="text-[11px] font-medium" style={{ color: '#92400E' }}>in {days}d</div>;
    return null;
  };

  const columnCount = adminMode ? 8 : 7;

  return (
    <DashboardLayout title="Purchase Orders" subtitle={subtitle as any}>
      <div className="space-y-5">
        {/* ── Header controls row ─────────────────────────────────────── */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
            <Input
              placeholder={adminMode ? 'Search by PO #, supplier, or item…' : 'Search by PO # or item…'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 border-[#E5E7EB] bg-white pl-9 text-[13px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 border-[#E5E7EB] bg-white text-[#374151]"
              disabled={filteredOrders.length === 0}
              onClick={doExport}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F9FAFB]"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── KPI row ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Total PO Value"
            value={fmtLakh(kpis.totalValueLakh)}
            icon={<IndianRupee className="h-4 w-4" />}
            from="#ECFDF5" to="#D1FAE5" border="#A7F3D0"
            iconBg="rgba(16,185,129,.18)" iconColor="#047857"
            subline={<>Across <span className="font-medium text-[#111827]">{kpis.suppliersCount}</span> suppliers</>}
          />
          <KpiCard
            label="Open POs"
            value={String(kpis.openCount)}
            icon={<Package className="h-4 w-4" />}
            from="#FFF7ED" to="#FED7AA" border="#FDBA74"
            iconBg="rgba(234,88,12,.18)" iconColor="#9A3412"
            subline={<><span className="font-medium text-[#111827]">{fmtLakh(kpis.openValueLakh)}</span> locked in open POs</>}
          >
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/50">
              <div style={{ width: `${(kpis.pendingN / openStackTotal) * 100}%`, background: '#F59E0B' }} />
              <div style={{ width: `${(kpis.partialN / openStackTotal) * 100}%`, background: '#EA580C' }} />
              <div style={{ width: `${(kpis.issuedN / openStackTotal) * 100}%`, background: '#10B981' }} />
            </div>
            <div className="mt-1.5 flex gap-3 text-[10px] font-medium text-[#6B7280]">
              <span><span className="inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: '#F59E0B' }} /> Pending {kpis.pendingN}</span>
              <span><span className="inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: '#EA580C' }} /> Partial {kpis.partialN}</span>
              <span><span className="inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: '#10B981' }} /> Issued {kpis.issuedN}</span>
            </div>
          </KpiCard>
          <KpiCard
            label="Awaiting Invoice"
            value={String(kpis.awaitingInvoiceCount)}
            icon={<FileUp className="h-4 w-4" />}
            from="#FEF2F2" to="#FECACA" border="#FCA5A5"
            iconBg="rgba(239,68,68,.18)" iconColor="#991B1B"
            subline={<><span className="font-medium text-[#111827]">{fmtLakh(kpis.awaitingInvoiceValueLakh)}</span> pending action</>}
          >
            {awaitingCount > 0 && (
              <button
                onClick={() => { setAwaitingOnly(true); setStatusFilter('all'); }}
                className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-[#991B1B] hover:bg-white"
              >
                Confirm delivery dates ({awaitingCount})
              </button>
            )}
          </KpiCard>
          <KpiCard
            label="Avg Fulfillment"
            value={`${kpis.avgFulfill} days`}
            icon={<Truck className="h-4 w-4" />}
            from="#EFF6FF" to="#DBEAFE" border="#93C5FD"
            iconBg="rgba(37,99,235,.15)" iconColor="#1D4ED8"
            subline="PO date → expected delivery"
          />
        </div>

        {/* ── Filter chip row ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} count={statusCounts.all || 0}>All</Chip>
          {['pending', 'partial', 'closed', 'cancelled'].filter(s => availableStatuses.includes(s)).map(s => (
            <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} count={statusCounts[s] || 0}>
              <span className="capitalize">{s}</span>
            </Chip>
          ))}
          {availableStatuses.filter(s => !['pending','partial','closed','cancelled'].includes(s)).map(s => (
            <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} count={statusCounts[s] || 0}>
              <span className="capitalize">{s.replace(/_/g, ' ')}</span>
            </Chip>
          ))}
          <div className="mx-1 h-5 w-px bg-[#E5E7EB]" />
          {adminMode && availableSuppliers.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-white px-3 py-1 text-[12px] font-medium text-[#374151] hover:bg-[#F9FAFB]">
                  {supplierFilter === 'all' ? 'All suppliers' : supplierFilter}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                <DropdownMenuItem onClick={() => setSupplierFilter('all')}>All suppliers</DropdownMenuItem>
                {availableSuppliers.map(s => (
                  <DropdownMenuItem key={s} onClick={() => setSupplierFilter(s)}>{s}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            onClick={() => setAwaitingOnly(v => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
              awaitingOnly
                ? 'border-transparent bg-[#FEF3C7] text-[#92400E]'
                : 'border-[#E5E7EB] bg-white text-[#374151] hover:bg-[#F9FAFB]',
            )}
          >
            Awaiting delivery confirm
            {awaitingCount > 0 && (
              <span className={cn(
                'rounded-full px-1.5 text-[10px] font-semibold',
                awaitingOnly ? 'bg-white/60' : 'bg-[#FEF3C7] text-[#92400E]',
              )}>{awaitingCount}</span>
            )}
          </button>
          <button
            onClick={resetFilters}
            className="ml-auto text-[12px] font-medium text-[#6B7280] hover:text-[#111827]"
          >
            Reset filters
          </button>
        </div>

        {/* ── Data table card ─────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
          {/* Desktop table */}
          <div
            ref={tableScrollRef}
            className="hidden overflow-x-auto md:block"
            onWheel={(e) => {
              const el = e.currentTarget;
              if (el.scrollWidth > el.clientWidth && e.deltaY !== 0 && e.deltaX === 0) {
                el.scrollLeft += e.deltaY;
              }
            }}
          >
            <table className="w-full min-w-[1100px]">
              <thead className="sticky top-0" style={{ background: '#F9FAFB' }}>
                <tr>
                  {['PO Number', ...(adminMode ? ['Supplier'] : []), 'Date', 'Expected Delivery', 'Amount', 'Items', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-semibold uppercase"
                      style={{ color: '#6B7280', letterSpacing: '1.2px' }}
                    >
                      {h}
                    </th>
                  ))}
                  <th
                    className="px-4 py-3 text-right text-[10px] font-semibold uppercase"
                    style={{ color: '#6B7280', letterSpacing: '1.2px' }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="text-[12.5px]">
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={columnCount} />)
                  : pageRows.map((order: any) => (
                    <tr
                      key={order.id}
                      className="border-t border-[#F3F4F6] transition-colors hover:bg-[#F9FAFB]"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          to={`/purchase-orders/${order.id}`}
                          className="font-mono font-medium text-[#111827] hover:underline"
                        >
                          {order.poNumber}
                        </Link>
                      </td>
                      {adminMode && (
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="font-medium text-[#111827]">{order.supplierName || '—'}</div>
                          {order.supplierZohoVendorId && (
                            <div className="text-[11px] text-[#9CA3AF]">VEN-{String(order.supplierZohoVendorId).slice(-6)}</div>
                          )}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3 text-[#6B7280]">
                        {new Date(order.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#6B7280]">
                        {order.expectedDelivery
                          ? new Date(order.expectedDelivery).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—'}
                        {deliveryHint(order)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-[#111827]">
                        {formatCurrency(Number(order.amount || 0))}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-[#6B7280]">
                        {(() => {
                          const rows = (order.items || [])
                            .map((it: any) => ({ name: (it.item_name || '').trim(), description: (it.description || '').trim() }))
                            .filter((r: any) => r.name || r.description);
                          if (rows.length === 0) return <span>—</span>;
                          const shown = rows.slice(0, 1);
                          const extra = rows.length - shown.length;
                          const tooltip = rows.map((r: any) =>
                            r.description && r.description !== r.name
                              ? `${r.name || r.description}\n  ${r.description}`
                              : r.name || r.description).join('\n');
                          return (
                            <div className="flex flex-col gap-0.5" title={tooltip}>
                              {shown.map((r: any, i: number) => (
                                <div key={i} className="leading-tight">
                                  <div className="truncate text-[#111827]">{r.name || r.description}</div>
                                  {r.description && r.description !== r.name && (
                                    <div className="truncate text-[11px] text-[#9CA3AF]">{r.description}</div>
                                  )}
                                </div>
                              ))}
                              {extra > 0 && (
                                <div className="text-[11px] text-[#9CA3AF]">+{extra} more</div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <StatusPill status={order.status} />
                          {order.needsDeliveryConfirmation && !order.exceptionApprovedAt && (
                            <Link to={`/purchase-orders/${order.id}`} className="text-[11px] font-medium hover:underline" style={{ color: '#B45309' }}>
                              {order.exceptionPending
                                ? 'Exception requested'
                                : order.needsExceptionRequest ? 'Request exception' : 'Confirm delivery dates'}
                            </Link>
                          )}
                          {order.exceptionApprovedAt && !order.deliveryDatesConfirmedAt && (
                            <span className="text-[11px] font-medium" style={{ color: '#065F46' }}>Exception approved</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {order.status !== 'cancelled' && (
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-[#6B7280]"
                              onClick={() => handleDownloadPO(order.id, order.poNumber, order.supplierZohoVendorId, !!order.unlockedForActions)}
                              disabled={downloadingId === order.id || !order.unlockedForActions}
                              title={order.unlockedForActions ? 'Download PO' : 'Confirm delivery dates or get exception approval first'}
                            >
                              {downloadingId === order.id ? <Loader2 className="h-4 w-4 animate-spin" />
                                : order.unlockedForActions ? <Download className="h-4 w-4" />
                                : <Lock className="h-4 w-4" style={{ color: '#B45309' }} />}
                            </Button>
                          )}
                          <Link to={`/purchase-orders/${order.id}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B7280]">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          {(order.status === 'pending' || order.status === 'partial') && (
                            order.unlockedForActions ? (
                              <Link to={`/invoices/upload?po=${order.id}`}>
                                <Button size="sm" className="h-8 gap-1 text-white" style={{ background: '#EF4444' }}>
                                  <Upload className="h-3 w-3" /> Upload Invoice
                                </Button>
                              </Link>
                            ) : (
                              <Button
                                size="sm" disabled
                                className="h-8 gap-1 text-white opacity-90"
                                style={{ background: '#FCA5A5' }}
                                title="Confirm delivery dates or get exception approval first"
                              >
                                <Lock className="h-3 w-3" /> Upload Invoice
                              </Button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="divide-y divide-[#F3F4F6] md:hidden">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2 p-4">
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[#F3F4F6]" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-[#F3F4F6]" />
                </div>
              ))
              : pageRows.map((order: any) => (
                <div key={order.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <Link to={`/purchase-orders/${order.id}`} className="font-mono text-[13px] font-medium text-[#111827] hover:underline">
                        {order.poNumber}
                      </Link>
                      {adminMode && order.supplierName && (
                        <div className="text-[12px] text-[#6B7280]">{order.supplierName}</div>
                      )}
                    </div>
                    <StatusPill status={order.status} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] text-[#6B7280]">
                    <div>Date: <span className="text-[#111827]">{new Date(order.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span></div>
                    <div>Exp: <span className="text-[#111827]">{order.expectedDelivery ? new Date(order.expectedDelivery).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</span></div>
                    <div className="col-span-2 font-medium text-[#111827]">{formatCurrency(Number(order.amount || 0))}</div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Link to={`/purchase-orders/${order.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="h-8 w-full">View</Button>
                    </Link>
                    {(order.status === 'pending' || order.status === 'partial') && (
                      order.unlockedForActions ? (
                        <Link to={`/invoices/upload?po=${order.id}`} className="flex-1">
                          <Button size="sm" className="h-8 w-full gap-1 text-white" style={{ background: '#EF4444' }}>
                            <Upload className="h-3 w-3" /> Upload Invoice
                          </Button>
                        </Link>
                      ) : (
                        <Button size="sm" disabled className="h-8 flex-1 gap-1 text-white" style={{ background: '#FCA5A5' }}>
                          <Lock className="h-3 w-3" /> Upload Invoice
                        </Button>
                      )
                    )}
                  </div>
                </div>
              ))}
          </div>

          {!isLoading && filteredOrders.length === 0 && (
            <div className="py-12 text-center text-[13px] text-[#6B7280]">
              No purchase orders found matching your criteria.
            </div>
          )}

          {/* Pagination */}
          {!isLoading && filteredOrders.length > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-[#F3F4F6] px-4 py-3 sm:flex-row">
              <div className="text-[12px] text-[#6B7280]">
                Showing <span className="font-medium text-[#111827]">{pageStart + 1}</span>–
                <span className="font-medium text-[#111827]">{Math.min(pageStart + PAGE_SIZE, filteredOrders.length)}</span>{' '}
                of <span className="font-medium text-[#111827]">{filteredOrders.length}</span> POs
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="sm"
                  className="h-8 border-[#E5E7EB] px-2"
                  disabled={currentPage === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }).slice(0, 5).map((_, i) => {
                  const p = i + 1;
                  const active = p === currentPage;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={cn(
                        'h-8 min-w-8 rounded-md px-2 text-[12px] font-medium',
                        active ? 'text-white' : 'border border-[#E5E7EB] bg-white text-[#374151] hover:bg-[#F9FAFB]',
                      )}
                      style={active ? { background: '#10B981' } : undefined}
                    >
                      {p}
                    </button>
                  );
                })}
                {totalPages > 5 && <span className="px-1 text-[12px] text-[#9CA3AF]">…</span>}
                <Button
                  variant="outline" size="sm"
                  className="h-8 border-[#E5E7EB] px-2"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      <StickyHorizontalScrollbar targetRef={tableScrollRef} />
    </DashboardLayout>
  );
}
