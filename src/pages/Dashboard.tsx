import { FileText, Receipt, CreditCard, Clock, TrendingUp, AlertCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentPOTable } from '@/components/dashboard/RecentPOTable';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { mockPurchaseOrders, mockInvoices, mockPayments } from '@/data/mockData';

export default function Dashboard() {
  const pendingPOs = mockPurchaseOrders.filter(po => po.status === 'pending').length;
  const pendingInvoices = mockInvoices.filter(inv => inv.status === 'pending').length;
  const totalPayments = mockPayments
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);
  const pendingPayments = mockPayments
    .filter(p => p.status === 'processing' || p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0);

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

  return (
    <DashboardLayout title="Dashboard" subtitle="Welcome back! Here's your business overview.">
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="animate-slide-up" style={{ animationDelay: '0ms' }}>
            <StatCard
              title="Total Purchase Orders"
              value={mockPurchaseOrders.length}
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
            <RecentPOTable orders={mockPurchaseOrders.slice(0, 5)} />
          </div>
          <div className="animate-slide-up" style={{ animationDelay: '500ms' }}>
            <QuickActions />
          </div>
        </div>

        {/* Alerts Section */}
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
      </div>
    </DashboardLayout>
  );
}
