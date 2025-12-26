import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Supplier } from '@/types/supplier';
import { mockSupplier } from '@/data/mockData';

interface AuthContextType {
  isAuthenticated: boolean;
  supplier: Supplier | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [supplier, setSupplier] = useState<Supplier | null>(null);

  const login = async (email: string, password: string): Promise<boolean> => {
    // Mock authentication - in production, this would call an API
    if (email && password) {
      setIsAuthenticated(true);
      setSupplier(mockSupplier);
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    setSupplier(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, supplier, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
