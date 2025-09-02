'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  ApiKeys,
  getStoredApiKeys,
  storeApiKeys,
  clearStoredApiKeys,
  hasRequiredApiKeys,
  getMissingRequiredApiKeys,
  validateGroqApiKey,
  validateE2bApiKey,
  ApiKeyValidationResult
} from '@/lib/api-keys';

interface ApiKeysContextType {
  apiKeys: ApiKeys;
  setApiKey: (provider: keyof ApiKeys, key: string) => void;
  removeApiKey: (provider: keyof ApiKeys) => void;
  clearAllApiKeys: () => void;
  hasRequiredKeys: boolean;
  missingKeys: string[];
  validateApiKey: (provider: keyof ApiKeys, key: string) => Promise<ApiKeyValidationResult>;
  isValidating: boolean;
}

const ApiKeysContext = createContext<ApiKeysContextType | undefined>(undefined);

export function useApiKeys() {
  const context = useContext(ApiKeysContext);
  if (context === undefined) {
    throw new Error('useApiKeys must be used within an ApiKeysProvider');
  }
  return context;
}

interface ApiKeysProviderProps {
  children: ReactNode;
}

export function ApiKeysProvider({ children }: ApiKeysProviderProps) {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [hasRequiredKeys, setHasRequiredKeys] = useState(false);
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  // Load API keys from localStorage on mount
  useEffect(() => {
    const storedKeys = getStoredApiKeys();
    setApiKeys(storedKeys);
    updateRequiredKeysStatus(storedKeys);
  }, []);

  const updateRequiredKeysStatus = (keys: ApiKeys) => {
    const hasRequired = !!(keys.groq && keys.e2b);
    const missing = getMissingRequiredApiKeys();

    setHasRequiredKeys(hasRequired);
    setMissingKeys(missing);
  };

  const setApiKey = (provider: keyof ApiKeys, key: string) => {
    const updatedKeys = { ...apiKeys, [provider]: key };
    setApiKeys(updatedKeys);
    storeApiKeys(updatedKeys);
    updateRequiredKeysStatus(updatedKeys);
  };

  const removeApiKey = (provider: keyof ApiKeys) => {
    const updatedKeys = { ...apiKeys };
    delete updatedKeys[provider];
    setApiKeys(updatedKeys);
    storeApiKeys(updatedKeys);
    updateRequiredKeysStatus(updatedKeys);
  };

  const clearAllApiKeys = () => {
    setApiKeys({});
    clearStoredApiKeys();
    updateRequiredKeysStatus({});
  };

  const validateApiKey = async (provider: keyof ApiKeys, key: string): Promise<ApiKeyValidationResult> => {
    setIsValidating(true);
    
    try {
      let result: ApiKeyValidationResult;
      
      switch (provider) {
        case 'groq':
          result = await validateGroqApiKey(key);
          break;
        case 'e2b':
          result = await validateE2bApiKey(key);
          break;
        default:
          result = { isValid: true }; // For optional keys, assume valid if provided
      }
      
      return result;
    } finally {
      setIsValidating(false);
    }
  };

  const value: ApiKeysContextType = {
    apiKeys,
    setApiKey,
    removeApiKey,
    clearAllApiKeys,
    hasRequiredKeys,
    missingKeys,
    validateApiKey,
    isValidating
  };

  return (
    <ApiKeysContext.Provider value={value}>
      {children}
    </ApiKeysContext.Provider>
  );
}
