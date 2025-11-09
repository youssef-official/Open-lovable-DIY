'use client';

import { createContext, useContext, useState, useEffect, useMemo } from 'react';

interface ApiKeys {
  groq?: string;
  e2b?: string;
  anthropic?: string;
  openai?: string;
  gemini?: string;
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
      setApiKeys(JSON.parse(savedKeys));
    }
  }, []);

  const handleSetApiKeys = (keys: ApiKeys) => {
    setApiKeys(keys);
    localStorage.setItem('apiKeys', JSON.stringify(keys));
  };

  const { hasRequiredKeys, missingKeys } = useMemo(() => {
    const requiredKeys = ['groq', 'e2b'];
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
