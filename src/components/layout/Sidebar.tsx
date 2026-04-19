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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Purchase Orders', href: '/purchase-orders', icon: FileText },
  { name: 'Invoices', href: '/invoices', icon: Receipt },
  { name: 'Payments', href: '/payments', icon: CreditCard },
  { name: 'Delivery Challan', href: '/delivery-challan', icon: Truck },
  { name: 'AWB Downloads', href: '/awb', icon: Package },
];

const adminNavigation = [
  { name: 'Admin Dashboard', href: '/admin', icon: LayoutDashboard, badgeKey: null as null | 'pending' },
  { name: 'All Suppliers', href: '/admin/suppliers', icon: Users, badgeKey: null },
  { name: 'Registrations', href: '/admin/registrations', icon: ClipboardList, badgeKey: 'pending' as const },
];

export function Sidebar() {
  const location = useLocation();
  const { supplier, logout, isAdmin } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const load = async () => {
      const { count } = await supabase
        .from('supplier_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (!cancelled) setPendingCount(count ?? 0);
    };
    load();
    const channel = supabase
      .channel('admin_pending_regs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_registrations' }, () => load())
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  const renderNavItem = (item: { name: string; href: string; icon: any; badgeKey?: 'pending' | null }) => {
    const isActive = location.pathname === item.href;
    const showBadge = item.badgeKey === 'pending' && pendingCount > 0;
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
            {pendingCount}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar text-sidebar-foreground">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
            <Package className="h-6 w-6 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Emboss</h1>
            <p className="text-xs text-sidebar-foreground/70">Supplier Portal</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navigation.map(renderNavItem)}

          {isAdmin && (
            <div className="pt-4">
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                Admin
              </p>
              <div className="space-y-1">
                {adminNavigation.map(renderNavItem)}
              </div>
            </div>
          )}
        </nav>

        {/* User section */}
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
