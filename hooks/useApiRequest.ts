'use client';

import { useApiKeys } from '@/contexts/ApiKeysContext';

/**
 * Hook for making API requests with automatic API key injection
 */
export function useApiRequest() {
  const { apiKeys } = useApiKeys();

  const makeRequest = async (url: string, options: RequestInit = {}) => {
    // Prepare headers with API keys
    const headers = new Headers(options.headers);

    // Add API keys to headers
    if (apiKeys.groq) {
      headers.set('x-groq-api-key', apiKeys.groq);
    }
    if (apiKeys.e2b) {
      headers.set('x-e2b-api-key', apiKeys.e2b);
    }
    if (apiKeys.anthropic) {
      headers.set('x-anthropic-api-key', apiKeys.anthropic);
    }
    if (apiKeys.openai) {
      headers.set('x-openai-api-key', apiKeys.openai);
    }
    if (apiKeys.gemini) {
      headers.set('x-gemini-api-key', apiKeys.gemini);
    }

    // Make the request with updated headers
    return fetch(url, {
      ...options,
      headers
    });
  };

  const makeRequestWithBody = async (url: string, body: any, options: RequestInit = {}) => {
    // Add API keys to the request body as well for compatibility
    const bodyWithKeys = {
      ...body,
      groqApiKey: apiKeys.groq,
      e2bApiKey: apiKeys.e2b,
      anthropicApiKey: apiKeys.anthropic,
      openaiApiKey: apiKeys.openai,
      geminiApiKey: apiKeys.gemini,
    };

    return makeRequest(url, {
      ...options,
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(bodyWithKeys)
    });
  };

  return {
    makeRequest,
    makeRequestWithBody,
    hasRequiredKeys: !!(apiKeys.groq && apiKeys.e2b)
  };
}
