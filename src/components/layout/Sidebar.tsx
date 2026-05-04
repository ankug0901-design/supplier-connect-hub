import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  CreditCard,
  Truck,
  Package,
  LogOut,
  User,
  Users,
  ClipboardList,
  FileQuestion,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import embossLogo from '@/assets/emboss-logo.png';

type NavItem = {
  name: string;
  href: string;
  icon: any;
  badgeKey?: 'pending_regs' | 'pending_rfqs' | 'pending_rfqs_all' | null;
};

const supplierNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'RFQ Requests', href: '/rfq-requests', icon: FileQuestion, badgeKey: 'pending_rfqs' },
  { name: 'Purchase Orders', href: '/purchase-orders', icon: FileText },
  { name: 'Invoices', href: '/invoices', icon: Receipt },
  { name: 'Payments', href: '/payments', icon: CreditCard },
  { name: 'Delivery Challan', href: '/delivery-challan', icon: Truck },
  { name: 'Shipments', href: '/shipments', icon: Truck },
];

const adminNavigation: NavItem[] = [
  { name: 'Admin Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'All Suppliers', href: '/admin/suppliers', icon: Users },
  { name: 'Registrations', href: '/admin/registrations', icon: ClipboardList, badgeKey: 'pending_regs' },
  { name: 'RFQ Management', href: '/admin/rfq', icon: FileQuestion, badgeKey: 'pending_rfqs_all' },
];

export function Sidebar() {
  const location = useLocation();
  const { supplier, logout, isAdmin } = useAuth();
  const [pendingRegs, setPendingRegs] = useState(0);
  const [pendingRfqs, setPendingRfqs] = useState(0);
  const [pendingRfqsAll, setPendingRfqsAll] = useState(0);

  useEffect(() => {
    if (isAdmin) {
      const load = async () => {
        const [{ count: regs }, { count: rfqs }] = await Promise.all([
          supabase.from('supplier_registrations').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('rfq_portal_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        ]);
        setPendingRegs(regs ?? 0);
        setPendingRfqsAll(rfqs ?? 0);
      };
      load();
      const channel = supabase
        .channel('admin_sidebar_counts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_registrations' }, () => load())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rfq_portal_requests' }, () => load())
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    } else if (supplier?.email) {
      const email = supplier.email;
      const load = async () => {
        const { count } = await supabase
          .from('rfq_portal_requests')
          .select('*', { count: 'exact', head: true })
          .eq('supplier_email', email)
          .eq('status', 'pending');
        setPendingRfqs(count ?? 0);
      };
      load();
      const channel = supabase
        .channel('supplier_sidebar_counts')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rfq_portal_requests', filter: `supplier_email=eq.${email}` },
          () => load()
        )
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [isAdmin, supplier?.email]);

  const badgeValue = (key?: NavItem['badgeKey']) => {
    if (key === 'pending_regs') return pendingRegs;
    if (key === 'pending_rfqs') return pendingRfqs;
    if (key === 'pending_rfqs_all') return pendingRfqsAll;
    return 0;
  };

  const renderNavItem = (item: NavItem) => {
    const isActive = location.pathname === item.href;
    const count = badgeValue(item.badgeKey);
    const showBadge = !!item.badgeKey && count > 0;
    return (
      <Link
        key={item.name}
        to={item.href}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
        )}
      >
        <item.icon className="h-5 w-5" />
        <span className="flex-1">{item.name}</span>
        {showBadge && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground">
            {count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-full flex-col">
        <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-6">
          <img src={embossLogo} alt="Emboss Marketing" className="h-10 w-auto" />
          <div>
            <h1 className="text-base font-bold leading-tight">Emboss</h1>
            <p className="text-xs text-sidebar-foreground/60">Supplier Portal</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {isAdmin ? (
            <>
              {renderNavItem({ name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard })}
              <div className="pt-4">
                <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                  Admin
                </p>
                <div className="space-y-1">
                  {adminNavigation.map(renderNavItem)}
                </div>
              </div>
            </>
          ) : (
            supplierNavigation.map(renderNavItem)
          )}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-primary/20">
              <User className="h-5 w-5 text-sidebar-primary" />
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{supplier?.name}</p>
                {isAdmin && (
                  <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground">
                    Admin
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-sidebar-foreground/60">{supplier?.company}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}
