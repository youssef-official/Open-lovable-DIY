import { NextRequest } from 'next/server';

/**
 * Utility functions for handling API keys in API routes
 */

export interface ApiKeyHeaders {
  'x-groq-api-key'?: string;
  'x-e2b-api-key'?: string;
  'x-firecrawl-api-key'?: string;
  'x-anthropic-api-key'?: string;
  'x-openai-api-key'?: string;
  'x-gemini-api-key'?: string;
}

/**
 * Get API key from request headers or environment variables
 */
export function getApiKey(
  request: NextRequest,
  provider: 'groq' | 'e2b' | 'anthropic' | 'openai' | 'gemini'
): string | undefined {
  // First try to get from headers
  const headerKey = `x-${provider}-api-key`;
  const fromHeader = request.headers.get(headerKey);
  
  if (fromHeader) {
    return fromHeader;
  }

  // Fallback to environment variables
  const envKey = `${provider.toUpperCase()}_API_KEY`;
  return process.env[envKey];
}

/**
 * Get API key from request body or environment variables
 */
export function getApiKeyFromBody(
  body: any,
  provider: 'groq' | 'e2b' | 'anthropic' | 'openai' | 'gemini'
): string | undefined {
  // First try to get from body
  const bodyKey = `${provider}ApiKey`;
  if (body[bodyKey]) {
    return body[bodyKey];
  }

  // Fallback to environment variables
  const envKey = `${provider.toUpperCase()}_API_KEY`;
  return process.env[envKey];
}

/**
 * Get all API keys from request headers
 */
export function getAllApiKeysFromHeaders(request: NextRequest): {
  groq?: string;
  e2b?: string;
  anthropic?: string;
  openai?: string;
  gemini?: string;
} {
  return {
    groq: getApiKey(request, 'groq'),
    e2b: getApiKey(request, 'e2b'),
    anthropic: getApiKey(request, 'anthropic'),
    openai: getApiKey(request, 'openai'),
    gemini: getApiKey(request, 'gemini'),
  };
}

/**
 * Get all API keys from request body
 */
export function getAllApiKeysFromBody(body: any): {
  groq?: string;
  e2b?: string;
  anthropic?: string;
  openai?: string;
  gemini?: string;
} {
  return {
    groq: getApiKeyFromBody(body, 'groq'),
    e2b: getApiKeyFromBody(body, 'e2b'),
    anthropic: getApiKeyFromBody(body, 'anthropic'),
    openai: getApiKeyFromBody(body, 'openai'),
    gemini: getApiKeyFromBody(body, 'gemini'),
  };
}

/**
 * Validate that required API keys are present
 */
export function validateRequiredApiKeys(keys: {
  groq?: string;
  e2b?: string;
}): { isValid: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!keys.groq) missing.push('Groq');
  if (!keys.e2b) missing.push('E2B');

  return {
    isValid: missing.length === 0,
    missing
  };
}
