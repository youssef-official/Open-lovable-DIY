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
  openrouter?: string;
}

export interface ApiKeyValidationResult {
  isValid: boolean;
  error?: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  pricing: {
    prompt: number;
    completion: number;
  };
  isFree: boolean;
}

export const OPENROUTER_FREE_MODELS: OpenRouterModel[] = [
  {
    id: 'qwen/qwen3-coder:free',
    name: 'Qwen 3 Coder',
    description: 'Specialized for code generation and programming tasks',
    contextLength: 32768,
    pricing: { prompt: 0, completion: 0 },
    isFree: true
  },
  {
    id: 'z-ai/glm-4.5-air:free',
    name: 'GLM 4.5 Air',
    description: 'Balanced model for general tasks and conversations',
    contextLength: 128000,
    pricing: { prompt: 0, completion: 0 },
    isFree: true
  },
  {
    id: 'openai/gpt-oss-20b:free',
    name: 'GPT OSS 20B',
    description: 'Open-source GPT model for various applications',
    contextLength: 4096,
    pricing: { prompt: 0, completion: 0 },
    isFree: true
  }
];

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
 * Validate OpenRouter API key
 */
export async function validateOpenRouterApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
  if (!apiKey || !apiKey.startsWith('sk-or-')) {
    return { isValid: false, error: 'OpenRouter API key should start with "sk-or-"' };
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return { isValid: false, error: 'Invalid OpenRouter API key' };
    }

    return { isValid: true };
  } catch (error) {
    console.error('OpenRouter validation error:', error);
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

/**
 * Get OpenRouter free models
 */
export function getOpenRouterFreeModels(): OpenRouterModel[] {
  return OPENROUTER_FREE_MODELS;
}

/**
 * Get OpenRouter model by ID
 */
export function getOpenRouterModelById(modelId: string): OpenRouterModel | undefined {
  return OPENROUTER_FREE_MODELS.find(m => m.id === modelId);
}

