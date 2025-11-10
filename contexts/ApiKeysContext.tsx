'use client';

import { createContext, useContext, useState, useEffect, useMemo } from 'react';

interface ApiKeys {
  openrouter?: string;
  e2b?: string;
  [key: string]: string | undefined;
}

interface ApiKeysContextType {
  apiKeys: ApiKeys;
  setApiKeys: (keys: ApiKeys) => void;
  hasRequiredKeys: boolean;
  missingKeys: string[];
}

const ApiKeysContext = createContext<ApiKeysContextType>({
  apiKeys: {},
  setApiKeys: () => {},
  hasRequiredKeys: false,
  missingKeys: [],
});

export function useApiKeys() {
  return useContext(ApiKeysContext);
}

export function ApiKeysProvider({ children }: { children: React.ReactNode }) {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});

  useEffect(() => {
    // Fetch saved API keys from local storage
    const savedKeys = localStorage.getItem('apiKeys');
    if (savedKeys) {
      const keys = JSON.parse(savedKeys);
      setApiKeys(keys);
      // Expose on window for direct access
      if (typeof window !== 'undefined') {
        (window as any).apiKeys = keys;
      }
    }
  }, []);

  const handleSetApiKeys = (keys: ApiKeys) => {
    setApiKeys(keys);
    localStorage.setItem('apiKeys', JSON.stringify(keys));
    // Also expose on window for direct access
    if (typeof window !== 'undefined') {
      (window as any).apiKeys = keys;
    }
  };

  const { hasRequiredKeys, missingKeys } = useMemo(() => {
    const requiredKeys = ['openrouter', 'e2b'];
    const missingKeys = requiredKeys.filter(key => !apiKeys[key]);
    return {
      hasRequiredKeys: missingKeys.length === 0,
      missingKeys,
    };
  }, [apiKeys]);

  return (
    <ApiKeysContext.Provider value={{ apiKeys, setApiKeys: handleSetApiKeys, hasRequiredKeys, missingKeys }}>
      {children}
    </ApiKeysContext.Provider>
  );
}
