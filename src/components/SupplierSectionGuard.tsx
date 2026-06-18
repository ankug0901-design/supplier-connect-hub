import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  sectionKey: string;
  children: React.ReactNode;
}

/**
 * Blocks the current user from accessing a page when that section is disabled
 * for their role in role_section_access. Super admins (role='admin') always pass.
 */
export function SupplierSectionGuard({ sectionKey, children }: Props) {
  const { isSuperAdmin, isAuthenticated, isLoading: authLoading, role } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (isSuperAdmin || !isAuthenticated) {
      setEnabled(true);
      return;
    }
    if (!role) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('role_section_access')
        .select('enabled')
        .eq('role', role)
        .eq('section_key', sectionKey)
        .maybeSingle();
      if (cancelled) return;
      // default-allow if no row exists
      setEnabled(data ? !!data.enabled : true);
    })();
    return () => { cancelled = true; };
  }, [isSuperAdmin, isAuthenticated, role, sectionKey]);

  if (authLoading || enabled === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (!enabled) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
