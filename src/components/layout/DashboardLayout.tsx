import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SupplierAssistant } from '@/components/SupplierAssistant';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { useAuth } from '@/contexts/AuthContext';

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function DashboardLayout({ children, title, subtitle, actions }: DashboardLayoutProps) {
  const { isAdmin, isAuthenticated } = useAuth();
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-64">
        <ImpersonationBanner />
        <Header title={title} subtitle={subtitle} actions={actions} />
        <main className="p-6">
          {children}
        </main>
      </div>
      {isAuthenticated && !isAdmin && <SupplierAssistant />}
    </div>
  );
}


