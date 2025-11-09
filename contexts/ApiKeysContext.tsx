'use client';

import { createContext, useContext, useState, useEffect } from 'react';

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
}

const ApiKeysContext = createContext<ApiKeysContextType>({
  apiKeys: {},
  setApiKeys: () => {},
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

  return (
    <ApiKeysContext.Provider value={{ apiKeys, setApiKeys: handleSetApiKeys }}>
      {children}
    </ApiKeysContext.Provider>
  );
}
