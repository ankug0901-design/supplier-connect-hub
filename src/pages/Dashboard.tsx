import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Receipt, CreditCard, Clock, AlertCircle, Users, ClipboardList, Truck, Package } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentPOTable } from '@/components/dashboard/RecentPOTable';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { fetchPurchaseOrders, fetchInvoices, fetchPayments } from '@/services/api';

export default function Dashboard() {
  const { supplier, isAdmin } = useAuth();
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adminStats, setAdminStats] = useState({
    suppliers: 0,
    pendingRegs: 0,
    challans: 0,
    awbs: 0,
  });

  useEffect(() => {
    if (isAdmin) {
      let cancelled = false;
      (async () => {
        setIsLoading(true);
        try {
          const [s, r, c, a] = await Promise.all([
            supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('role', 'supplier'),
            supabase.from('supplier_registrations').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            supabase.from('delivery_challans').select('*', { count: 'exact', head: true }),
            supabase.from('awb').select('*', { count: 'exact', head: true }),
          ]);
          if (cancelled) return;
          setAdminStats({
            suppliers: s.count ?? 0,
            pendingRegs: r.count ?? 0,
            challans: c.count ?? 0,
            awbs: a.count ?? 0,
          });
        } catch (err) {
          console.error('Failed to load admin stats', err);
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

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
  }, [supplier?.zoho_vendor_id, isAdmin]);

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

  // Admin view
  if (isAdmin) {
    if (isLoading) {
      return (
        <DashboardLayout title="Admin Dashboard" subtitle="Emboss Marketing — Admin Panel">
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        </DashboardLayout>
      );
    }
    return (
      <DashboardLayout title="Admin Dashboard" subtitle="Emboss Marketing — Admin Panel">
        <div className="space-y-6">
          <div className="rounded-xl border bg-gradient-primary p-6 text-primary-foreground shadow-card">
            <h2 className="text-2xl font-bold">Welcome, {supplier?.name || 'Ankur'}!</h2>
            <p className="mt-1 text-primary-foreground/80">You are logged in as Emboss Marketing Admin.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Suppliers"
              value={adminStats.suppliers}
              subtitle="Active suppliers"
              icon={<Users className="h-6 w-6" />}
              variant="primary"
            />
            <StatCard
              title="Pending Registrations"
              value={adminStats.pendingRegs}
              subtitle="Awaiting review"
              icon={<ClipboardList className="h-6 w-6" />}
              variant="warning"
            />
            <StatCard
              title="Total Challans"
              value={adminStats.challans}
              subtitle="Generated"
              icon={<Truck className="h-6 w-6" />}
              variant="success"
            />
            <StatCard
              title="Total AWBs"
              value={adminStats.awbs}
              subtitle="Created"
              icon={<Package className="h-6 w-6" />}
              variant="default"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="default">
              <Link to="/admin/suppliers">Manage Suppliers</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/registrations">View Registrations</Link>
            </Button>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">
                To view supplier-specific data (POs, invoices, payments), use the Admin panel to select a supplier.
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

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
