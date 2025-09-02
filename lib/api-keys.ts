/**
 * API Key Management System
 * Handles storage, validation, and management of user-provided API keys
 */

export interface ApiKeys {
  groq?: string;
  e2b?: string;
  anthropic?: string;
  openai?: string;
  gemini?: string;
}

export interface ApiKeyValidationResult {
  isValid: boolean;
  error?: string;
}

const API_KEYS_STORAGE_KEY = 'open-lovable-api-keys';

/**
 * Get API keys from localStorage
 */
export function getStoredApiKeys(): ApiKeys {
  if (typeof window === 'undefined') return {};
  
  try {
    const stored = localStorage.getItem(API_KEYS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Failed to parse stored API keys:', error);
    return {};
  }
}

/**
 * Store API keys in localStorage
 */
export function storeApiKeys(keys: ApiKeys): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys));
  } catch (error) {
    console.error('Failed to store API keys:', error);
  }
}

/**
 * Clear all stored API keys
 */
export function clearStoredApiKeys(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(API_KEYS_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear stored API keys:', error);
  }
}

/**
 * Validate Groq API key
 */
export async function validateGroqApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
  if (!apiKey || !apiKey.startsWith('gsk_')) {
    return { isValid: false, error: 'Groq API key should start with "gsk_"' };
  }

  try {
    const response = await fetch('/api/validate-api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'groq', apiKey })
    });

    if (!response.ok) {
      console.error('Groq validation request failed:', response.status);
      // If validation endpoint fails, assume valid if format is correct
      return { isValid: true };
    }

    const result = await response.json();
    return { isValid: result.valid, error: result.error };
  } catch (error) {
    console.error('Groq validation error:', error);
    // If validation fails due to network/other issues, assume valid if format is correct
    return { isValid: true };
  }
}

/**
 * Validate E2B API key
 */
export async function validateE2bApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
  if (!apiKey || !apiKey.startsWith('e2b_')) {
    return { isValid: false, error: 'E2B API key should start with "e2b_"' };
  }

  try {
    const response = await fetch('/api/validate-api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'e2b', apiKey })
    });

    if (!response.ok) {
      console.error('E2B validation request failed:', response.status);
      // If validation endpoint fails, assume valid if format is correct
      return { isValid: true };
    }

    const result = await response.json();
    return { isValid: result.valid, error: result.error };
  } catch (error) {
    console.error('E2B validation error:', error);
    // If validation fails due to network/other issues, assume valid if format is correct
    return { isValid: true };
  }
}



/**
 * Get API key for a specific provider (from storage or environment)
 */
export function getApiKey(provider: keyof ApiKeys): string | undefined {
  const storedKeys = getStoredApiKeys();
  return storedKeys[provider];
}

/**
 * Check if all required API keys are available
 */
export function hasRequiredApiKeys(): boolean {
  const keys = getStoredApiKeys();
  return !!(keys.groq && keys.e2b);
}

/**
 * Get missing required API keys
 */
export function getMissingRequiredApiKeys(): string[] {
  const keys = getStoredApiKeys();
  const missing: string[] = [];

  if (!keys.groq) missing.push('Groq');
  if (!keys.e2b) missing.push('E2B');

  return missing;
}
