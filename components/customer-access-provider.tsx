'use client';

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

const CUSTOMER_API_TOKEN_STORAGE_KEY = 'wpm-customer-api-token';

type CustomerAccessContextValue = {
  token: string;
  hasToken: boolean;
  isReady: boolean;
  setToken: (value: string) => void;
  clearToken: () => void;
};

const CustomerAccessContext = createContext<CustomerAccessContextValue | null>(null);

function normalizeToken(value: string): string {
  return value.trim();
}

export function CustomerAccessProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [token, setTokenState] = useState('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(CUSTOMER_API_TOKEN_STORAGE_KEY) || '';
    setTokenState(normalizeToken(storedValue));
    setIsReady(true);
  }, []);

  const setToken = (value: string) => {
    const normalized = normalizeToken(value);
    setTokenState(normalized);
    if (typeof window !== 'undefined') {
      if (normalized) {
        window.localStorage.setItem(CUSTOMER_API_TOKEN_STORAGE_KEY, normalized);
      } else {
        window.localStorage.removeItem(CUSTOMER_API_TOKEN_STORAGE_KEY);
      }
    }
  };

  const clearToken = () => {
    setToken('');
  };

  const contextValue = useMemo<CustomerAccessContextValue>(() => ({
    token,
    hasToken: token.length > 0,
    isReady,
    setToken,
    clearToken,
  }), [token, isReady]);

  return (
    <CustomerAccessContext.Provider value={contextValue}>
      {children}
    </CustomerAccessContext.Provider>
  );
}

export function useCustomerAccess(): CustomerAccessContextValue {
  const context = useContext(CustomerAccessContext);
  if (!context) {
    throw new Error('useCustomerAccess must be used inside CustomerAccessProvider');
  }
  return context;
}
