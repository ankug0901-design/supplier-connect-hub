import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Supplier } from '@/types/supplier';

interface AuthContextType {
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  user: User | null;
  supplier: Supplier | null;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
}

const defaultAuthContext: AuthContextType = {
  isAuthenticated: false,
  isAdmin: false,
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
  const [isLoading, setIsLoading] = useState(true);
  const profileUserIdRef = useRef<string | null>(null);

  async function fetchSupplierProfile(userId: string) {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error || !data) {
      setSupplier(null);
      setIsAdmin(false);
      return;
    }

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
    setIsAdmin((data as any).role === 'admin');
  }

  useEffect(() => {
    let cancelled = false;

    const handleSession = async (session: Session | null, forceProfile = false) => {
      if (cancelled) return;
      setUser(session?.user ?? null);

      if (!session?.user) {
        profileUserIdRef.current = null;
        setSupplier(null);
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      const userId = session.user.id;
      if (forceProfile || profileUserIdRef.current !== userId) {
        setIsLoading(true);
        await fetchSupplierProfile(userId);
        profileUserIdRef.current = userId;
      }

      if (!cancelled) setIsLoading(false);
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
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated: !!user,
      isAdmin,
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
