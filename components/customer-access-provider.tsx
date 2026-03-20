'use client';

import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

type CustomerAccessContextValue = {
  hasToken: boolean;
  isReady: boolean;
  apiConfigured: boolean;
  authError: string | null;
  savePending: boolean;
  saveToken: (value: string) => Promise<boolean>;
  clearToken: () => Promise<void>;
  refreshAccess: () => Promise<void>;
};

type AccessStatusResponse = {
  apiConfigured?: boolean;
  hasToken?: boolean;
  error?: string;
};

const CustomerAccessContext = createContext<CustomerAccessContextValue | null>(null);

async function readAccessStatus(): Promise<AccessStatusResponse> {
  const response = await fetch('/api/customer-access', {
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return (await response.json()) as AccessStatusResponse;
}

export function CustomerAccessProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [hasToken, setHasToken] = useState(false);
  const [apiConfigured, setApiConfigured] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);

  const refreshAccess = async () => {
    try {
      const payload = await readAccessStatus();
      setHasToken(Boolean(payload.hasToken));
      setApiConfigured(Boolean(payload.apiConfigured));
      setAuthError(payload.error || null);
    } catch (error: unknown) {
      setHasToken(false);
      setApiConfigured(false);
      setAuthError(error instanceof Error ? error.message : 'Failed to read customer access status.');
    } finally {
      setIsReady(true);
    }
  };

  useEffect(() => {
    void refreshAccess();
  }, []);

  const saveToken = async (value: string): Promise<boolean> => {
    const token = value.trim();
    if (!token) {
      setAuthError('A customer token is required.');
      return false;
    }

    setSavePending(true);
    setAuthError(null);

    try {
      const response = await fetch('/api/customer-access', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const payload = (await response.json().catch(() => null)) as AccessStatusResponse | null;
      setApiConfigured(Boolean(payload?.apiConfigured));
      setHasToken(Boolean(payload?.hasToken) && response.ok);

      if (!response.ok) {
        setAuthError(payload?.error || `${response.status} ${response.statusText}`);
        return false;
      }

      setAuthError(null);
      return true;
    } catch (error: unknown) {
      setHasToken(false);
      setAuthError(error instanceof Error ? error.message : 'Failed to save customer token.');
      return false;
    } finally {
      setSavePending(false);
      setIsReady(true);
    }
  };

  const clearToken = async (): Promise<void> => {
    setSavePending(true);
    try {
      await fetch('/api/customer-access', {
        method: 'DELETE',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      setHasToken(false);
      setAuthError(null);
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : 'Failed to clear customer session.');
    } finally {
      setSavePending(false);
      setIsReady(true);
    }
  };

  return (
    <CustomerAccessContext.Provider
      value={{
        hasToken,
        isReady,
        apiConfigured,
        authError,
        savePending,
        saveToken,
        clearToken,
        refreshAccess,
      }}
    >
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
