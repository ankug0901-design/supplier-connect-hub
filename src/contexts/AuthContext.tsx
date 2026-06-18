import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Supplier } from '@/types/supplier';

export interface ImpersonatedSupplier extends Supplier {
  user_id: string | null;
  role: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: string | null;
  isLoading: boolean;
  user: User | null;
  supplier: Supplier | null;
  /** Real admin flags (unaffected by impersonation) */
  realIsAdmin: boolean;
  realIsSuperAdmin: boolean;
  /** Real auth user id is `user?.id`; effective id for section-access lookups */
  effectiveUserId: string | null;
  isImpersonating: boolean;
  isReadOnly: boolean;
  impersonatedSupplier: ImpersonatedSupplier | null;
  startImpersonation: (target: ImpersonatedSupplier) => void;
  stopImpersonation: () => void;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
}

const defaultAuthContext: AuthContextType = {
  isAuthenticated: false,
  isAdmin: false,
  isSuperAdmin: false,
  role: null,
  isLoading: true,
  user: null,
  supplier: null,
  realIsAdmin: false,
  realIsSuperAdmin: false,
  effectiveUserId: null,
  isImpersonating: false,
  isReadOnly: false,
  impersonatedSupplier: null,
  startImpersonation: () => {},
  stopImpersonation: () => {},
  login: async () => ({ error: 'Authentication is not ready yet.' }),
  logout: async () => {},
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

const IMPERSONATION_KEY = 'admin.viewAsSupplier';

function loadImpersonationFromStorage(): ImpersonatedSupplier | null {
  try {
    const raw = sessionStorage.getItem(IMPERSONATION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImpersonatedSupplier;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [realSupplier, setRealSupplier] = useState<Supplier | null>(null);
  const [realIsAdmin, setRealIsAdmin] = useState(false);
  const [realIsSuperAdmin, setRealIsSuperAdmin] = useState(false);
  const [realRole, setRealRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [impersonatedSupplier, setImpersonatedSupplier] = useState<ImpersonatedSupplier | null>(
    () => loadImpersonationFromStorage()
  );
  const profileUserIdRef = useRef<string | null>(null);
  const initialSessionResolvedRef = useRef(false);

  async function fetchSupplierProfile(userId: string) {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error || !data) {
      setRealSupplier(null);
      setRealIsAdmin(false);
      setRealIsSuperAdmin(false);
      setRealRole(null);
      return;
    }

    const profile = data as typeof data & { role?: string | null };

    setRealSupplier({
      id: data.id,
      name: data.name,
      email: data.email,
      phone: data.phone || '',
      company: data.company,
      gstNumber: data.gst_number || '',
      address: data.address || '',
      zoho_vendor_id: data.zoho_vendor_id || '',
    });
    const r = profile.role ?? 'supplier';
    setRealRole(r);
    setRealIsSuperAdmin(r === 'admin');
    setRealIsAdmin(r === 'admin' || r === 'super_user' || r === 'user');
  }

  useEffect(() => {
    let cancelled = false;

    const handleSession = async (session: Session | null, forceProfile = false) => {
      if (cancelled) return;
      setUser(session?.user ?? null);

      if (!session?.user) {
        profileUserIdRef.current = null;
        initialSessionResolvedRef.current = true;
        setRealSupplier(null);
        setRealIsAdmin(false);
        setRealIsSuperAdmin(false);
        setRealRole(null);
        // clear impersonation on signout
        setImpersonatedSupplier(null);
        try { sessionStorage.removeItem(IMPERSONATION_KEY); } catch {}
        setIsLoading(false);
        return;
      }

      const userId = session.user.id;
      if (forceProfile || profileUserIdRef.current !== userId) {
        if (!initialSessionResolvedRef.current) setIsLoading(true);
        await fetchSupplierProfile(userId);
        profileUserIdRef.current = userId;
      }

      if (!cancelled) {
        initialSessionResolvedRef.current = true;
        setIsLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'TOKEN_REFRESHED' && session?.user && profileUserIdRef.current === session.user.id) {
          setUser(session.user);
          return;
        }

        setTimeout(() => {
          void handleSession(session, event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED');
        }, 0);
      }
    );
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      console.warn('signOut error (ignored):', err);
    }
    setUser(null);
    setRealSupplier(null);
    setRealIsAdmin(false);
    setRealIsSuperAdmin(false);
    setRealRole(null);
    setImpersonatedSupplier(null);
    try { sessionStorage.removeItem(IMPERSONATION_KEY); } catch {}
  };

  const startImpersonation = useCallback((target: ImpersonatedSupplier) => {
    if (!realIsAdmin) return;
    try { sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify(target)); } catch {}
    setImpersonatedSupplier(target);
  }, [realIsAdmin]);

  const stopImpersonation = useCallback(() => {
    try { sessionStorage.removeItem(IMPERSONATION_KEY); } catch {}
    setImpersonatedSupplier(null);
  }, []);

  // Effective values: only impersonate when the real user is an admin
  const isImpersonating = !!impersonatedSupplier && realIsAdmin;
  const effectiveSupplier: Supplier | null = isImpersonating
    ? {
        id: impersonatedSupplier!.id,
        name: impersonatedSupplier!.name,
        email: impersonatedSupplier!.email,
        phone: impersonatedSupplier!.phone || '',
        company: impersonatedSupplier!.company,
        gstNumber: impersonatedSupplier!.gstNumber || '',
        address: impersonatedSupplier!.address || '',
        zoho_vendor_id: impersonatedSupplier!.zoho_vendor_id || '',
      }
    : realSupplier;
  const effectiveIsAdmin = isImpersonating ? false : realIsAdmin;
  const effectiveIsSuperAdmin = isImpersonating ? false : realIsSuperAdmin;
  const effectiveRole = isImpersonating ? (impersonatedSupplier!.role || 'supplier') : realRole;
  const effectiveUserId = isImpersonating
    ? (impersonatedSupplier!.user_id || user?.id || null)
    : (user?.id || null);

  return (
    <AuthContext.Provider value={{
      isAuthenticated: !!user,
      isAdmin: effectiveIsAdmin,
      isSuperAdmin: effectiveIsSuperAdmin,
      role: effectiveRole,
      isLoading,
      user,
      supplier: effectiveSupplier,
      realIsAdmin,
      realIsSuperAdmin,
      effectiveUserId,
      isImpersonating,
      isReadOnly: isImpersonating,
      impersonatedSupplier,
      startImpersonation,
      stopImpersonation,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Convenience hook: true when the current session is read-only (e.g. admin impersonating a supplier). */
export function useReadOnly() {
  return useContext(AuthContext).isReadOnly;
}
