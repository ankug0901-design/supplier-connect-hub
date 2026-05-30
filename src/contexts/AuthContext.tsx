import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Supplier } from '@/types/supplier';

interface AuthContextType {
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: string | null;
  isLoading: boolean;
  user: User | null;
  supplier: Supplier | null;
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
  login: async () => ({ error: 'Authentication is not ready yet.' }),
  logout: async () => {},
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const profileUserIdRef = useRef<string | null>(null);
  const initialSessionResolvedRef = useRef(false);

  async function fetchSupplierProfile(userId: string) {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error || !data) {
      setSupplier(null);
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setRole(null);
      return;
    }

    const profile = data as typeof data & { role?: string | null };

    setSupplier({
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
    setRole(r);
    setIsSuperAdmin(r === 'admin');
    // isAdmin = full admin UI access (admin OR super_user)
    setIsAdmin(r === 'admin' || r === 'super_user');
  }

  useEffect(() => {
    let cancelled = false;

    const handleSession = async (session: Session | null, forceProfile = false) => {
      if (cancelled) return;
      setUser(session?.user ?? null);

      if (!session?.user) {
        profileUserIdRef.current = null;
        initialSessionResolvedRef.current = true;
        setSupplier(null);
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setRole(null);
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
    setSupplier(null);
    setIsAdmin(false);
    setIsSuperAdmin(false);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated: !!user,
      isAdmin,
      isSuperAdmin,
      role,
      isLoading,
      user,
      supplier,
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
