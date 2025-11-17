'use client';

import { useApiKeys } from '@/contexts/ApiKeysContext';

/**
 * Hook for making API requests with automatic API key injection
 */
export function useApiRequest() {
  const { apiKeys } = useApiKeys();

  const makeRequest = async (url: string, options: RequestInit = {}, model?: string) => {
    // Prepare headers with API keys
    const headers = new Headers(options.headers);

    // Add API keys to headers
    if (model === 'minimax/minimax-m2-official') {
      if (apiKeys.minimax) {
        headers.set('x-minimax-api-key', apiKeys.minimax);
      }
    } else if (apiKeys.openrouter) {
      headers.set('x-openrouter-api-key', apiKeys.openrouter);
    }

    if (apiKeys.e2b) {
      headers.set('x-e2b-api-key', apiKeys.e2b);
    }

    // Make the request with updated headers
    return fetch(url, {
      ...options,
      headers
    });
  };

  const makeRequestWithBody = async (url: string, body: any, options: RequestInit = {}, model?: string) => {
    // Add API keys to the request body as well for compatibility
    const bodyWithKeys: any = {
      ...body,
      e2bApiKey: apiKeys.e2b,
    };

    if (model === 'minimax/minimax-m2-official') {
      bodyWithKeys.minimaxApiKey = apiKeys.minimax;
    } else {
      bodyWithKeys.openrouterApiKey = apiKeys.openrouter;
    }

    return makeRequest(url, {
      ...options,
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(bodyWithKeys)
    }, model);
  };

  return {
    makeRequest,
    makeRequestWithBody,
    hasRequiredKeys: !!((apiKeys.openrouter || apiKeys.minimax) && apiKeys.e2b)
  };
}
