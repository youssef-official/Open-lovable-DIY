import { NextRequest, NextResponse } from 'next/server';
import { createGroq } from '@ai-sdk/groq';

export async function POST(request: NextRequest) {
  try {
    const { provider, apiKey } = await request.json();

    console.log(`[validate-api-key] Validating ${provider} API key`);

    if (!provider || !apiKey) {
      return NextResponse.json({
        valid: false,
        error: 'Provider and API key are required'
      }, { status: 400 });
    }

    let isValid = false;
    let error = '';

    switch (provider) {
      case 'groq':
        try {
          // Test Groq API key by checking models endpoint first (simpler)
          const response = await fetch('https://api.groq.com/openai/v1/models', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            }
          });

          console.log(`[validate-api-key] Groq response status: ${response.status}`);

          if (response.ok) {
            isValid = true;
          } else if (response.status === 401 || response.status === 403) {
            error = 'Invalid Groq API key';
          } else {
            // Try a simple completion as fallback
            const completionResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                messages: [{ role: 'user', content: 'hi' }],
                model: 'llama-3.1-8b-instant',
                max_tokens: 1
              })
            });

            if (completionResponse.ok) {
              isValid = true;
            } else if (completionResponse.status === 401 || completionResponse.status === 403) {
              error = 'Invalid Groq API key';
            } else {
              error = `Failed to validate Groq API key (HTTP ${response.status})`;
            }
          }
        } catch (err: any) {
          console.error('[validate-api-key] Groq error:', err);
          error = err.message || 'Failed to validate Groq API key';
        }
        break;

      case 'e2b':
        try {
          console.log(`[validate-api-key] Testing E2B API key...`);

          // Test E2B API key using the correct X-API-KEY header (not Bearer token)
          const response = await fetch('https://api.e2b.dev/sandboxes', {
            method: 'GET',
            headers: {
              'X-API-KEY': apiKey,
              'Content-Type': 'application/json'
            }
          });

          console.log(`[validate-api-key] E2B response status: ${response.status}`);

          if (response.ok || response.status === 404) {
            // 404 is OK - means no sandboxes but API key is valid
            isValid = true;
          } else if (response.status === 401 || response.status === 403) {
            error = 'Invalid E2B API key';
          } else {
            // For other status codes, try alternative endpoint
            console.log(`[validate-api-key] E2B primary endpoint returned ${response.status}, trying alternatives...`);

            try {
              const altResponse = await fetch('https://api.e2b.dev/templates', {
                method: 'GET',
                headers: {
                  'X-API-KEY': apiKey,
                  'Content-Type': 'application/json'
                }
              });

              console.log(`[validate-api-key] E2B templates response status: ${altResponse.status}`);

              if (altResponse.ok || altResponse.status === 404) {
                isValid = true;
              } else if (altResponse.status === 401 || altResponse.status === 403) {
                error = 'Invalid E2B API key';
              } else {
                // If both fail but not with auth errors, assume valid
                isValid = true;
                console.log(`[validate-api-key] E2B validation inconclusive, assuming valid`);
              }
            } catch (altErr) {
              // If alternative also fails, be lenient
              isValid = true;
              console.log(`[validate-api-key] E2B alternative validation failed, assuming valid`);
            }
          }
        } catch (err: any) {
          console.error('[validate-api-key] E2B error:', err);
          // Be lenient with network errors
          isValid = true;
          console.log(`[validate-api-key] E2B validation error, assuming valid: ${err.message}`);
        }
        break;



      case 'anthropic':
        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'test' }]
            })
          });
          
          if (response.ok) {
            isValid = true;
          } else if (response.status === 401) {
            error = 'Invalid Anthropic API key';
          } else {
            error = 'Failed to validate Anthropic API key';
          }
        } catch (err: any) {
          error = err.message || 'Failed to validate Anthropic API key';
        }
        break;

      case 'openai':
        try {
          const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            isValid = true;
          } else if (response.status === 401) {
            error = 'Invalid OpenAI API key';
          } else {
            error = 'Failed to validate OpenAI API key';
          }
        } catch (err: any) {
          error = err.message || 'Failed to validate OpenAI API key';
        }
        break;

      case 'gemini':
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
            method: 'GET'
          });
          
          if (response.ok) {
            isValid = true;
          } else if (response.status === 400 || response.status === 403) {
            error = 'Invalid Gemini API key';
          } else {
            error = 'Failed to validate Gemini API key';
          }
        } catch (err: any) {
          error = err.message || 'Failed to validate Gemini API key';
        }
        break;

      default:
        return NextResponse.json({
          valid: false,
          error: 'Unsupported provider'
        }, { status: 400 });
    }

    console.log(`[validate-api-key] ${provider} validation result:`, { isValid, error });

    return NextResponse.json({
      valid: isValid,
      error: isValid ? undefined : error
    });

  } catch (error: any) {
    console.error('API key validation error:', error);
    return NextResponse.json({
      valid: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
