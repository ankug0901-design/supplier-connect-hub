import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  sectionKey: string;
  children: React.ReactNode;
}

/**
 * Blocks access when the section is disabled for the user's role,
 * unless a per-user override (supplier_section_access) re-allows it.
 * Super admins (role='admin') always pass.
 */
export function SupplierSectionGuard({ sectionKey, children }: Props) {
  const { isSuperAdmin, isAuthenticated, isLoading: authLoading, role, user } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (isSuperAdmin || !isAuthenticated) {
      setEnabled(true);
      return;
    }
    if (!role || !user?.id) return;
    let cancelled = false;
    (async () => {
      // Per-user override wins if set
      const { data: override } = await supabase
        .from('supplier_section_access')
        .select('enabled')
        .eq('user_id', user.id)
        .eq('section_key', sectionKey)
        .maybeSingle();
      if (cancelled) return;
      if (override) {
        setEnabled(!!override.enabled);
        return;
      }
      const { data } = await supabase
        .from('role_section_access')
        .select('enabled')
        .eq('role', role)
        .eq('section_key', sectionKey)
        .maybeSingle();
      if (cancelled) return;
      setEnabled(data ? !!data.enabled : true);
    })();
    return () => { cancelled = true; };
  }, [isSuperAdmin, isAuthenticated, role, sectionKey, user?.id]);

  if (authLoading || enabled === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
        <h1 className="text-2xl font-bold mb-2">Access restricted</h1>
        <p className="text-muted-foreground max-w-md">
          Your role does not have access to this page. Please contact an administrator if you believe this is a mistake.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
