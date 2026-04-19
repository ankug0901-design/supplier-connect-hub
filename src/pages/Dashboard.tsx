import { useEffect, useState } from 'react';
import { FileText, Receipt, CreditCard, Clock, AlertCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentPOTable } from '@/components/dashboard/RecentPOTable';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { useAuth } from '@/contexts/AuthContext';
import { fetchPurchaseOrders, fetchInvoices, fetchPayments } from '@/services/api';

export default function Dashboard() {
  const { supplier } = useAuth();
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supplier?.zoho_vendor_id) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const [pos, invs, pays] = await Promise.all([
          fetchPurchaseOrders(supplier.zoho_vendor_id!),
          fetchInvoices(supplier.zoho_vendor_id!),
          fetchPayments(supplier.zoho_vendor_id!),
        ]);
        if (cancelled) return;
        setPurchaseOrders(pos);
        setInvoices(invs);
        setPayments(pays);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supplier?.zoho_vendor_id]);

  const pendingPOs = purchaseOrders.filter((po: any) => po.status === 'pending').length;
  const pendingInvoices = invoices.filter((inv: any) => inv.status === 'pending').length;
  const totalPayments = payments
    .filter((p: any) => p.status === 'completed' || p.status === 'paid')
    .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const pendingPayments = payments
    .filter((p: any) => p.status === 'processing' || p.status === 'pending')
    .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

  const formatCurrency = (amount: number) => {
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(1)}L`;
    }
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (!supplier?.zoho_vendor_id) {
    return (
      <DashboardLayout title="Dashboard" subtitle="Welcome back! Here's your business overview.">
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-warning" />
            <div>
              <h4 className="font-medium text-foreground">Account setup pending</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Your account is not yet linked to our accounting system. Please contact{' '}
                <a href="mailto:accounts@embossmarketing.in" className="font-medium text-primary hover:underline">
                  accounts@embossmarketing.in
                </a>{' '}
                to complete setup.
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout title="Dashboard" subtitle="Welcome back! Here's your business overview.">
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Dashboard" subtitle="Welcome back! Here's your business overview.">
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="animate-slide-up" style={{ animationDelay: '0ms' }}>
            <StatCard
              title="Total Purchase Orders"
              value={purchaseOrders.length}
              subtitle={`${pendingPOs} pending action`}
              icon={<FileText className="h-6 w-6" />}
              variant="primary"
            />
          </div>
          <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
            <StatCard
              title="Pending Invoices"
              value={pendingInvoices}
              subtitle="Awaiting approval"
              icon={<Receipt className="h-6 w-6" />}
              variant="warning"
            />
          </div>
          <div className="animate-slide-up" style={{ animationDelay: '200ms' }}>
            <StatCard
              title="Payments Received"
              value={formatCurrency(totalPayments)}
              subtitle="This month"
              icon={<CreditCard className="h-6 w-6" />}
              variant="success"
              trend={{ value: 12, isPositive: true }}
            />
          </div>
          <div className="animate-slide-up" style={{ animationDelay: '300ms' }}>
            <StatCard
              title="Pending Payments"
              value={formatCurrency(pendingPayments)}
              subtitle="In processing"
              icon={<Clock className="h-6 w-6" />}
              variant="default"
            />
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 animate-slide-up" style={{ animationDelay: '400ms' }}>
            <RecentPOTable orders={purchaseOrders.slice(0, 5) as any} />
          </div>
          <div className="animate-slide-up" style={{ animationDelay: '500ms' }}>
            <QuickActions />
          </div>
        </div>

        {/* Alerts Section */}
        {pendingPOs > 0 && (
          <div className="animate-slide-up" style={{ animationDelay: '600ms' }}>
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-warning" />
                <div>
                  <h4 className="font-medium text-foreground">Action Required</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You have {pendingPOs} purchase orders pending invoice submission. Please upload invoices to avoid delays in payment processing.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
