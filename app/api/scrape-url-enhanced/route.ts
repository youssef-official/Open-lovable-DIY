import { NextRequest, NextResponse } from 'next/server';
import { getApiKey, getAllApiKeysFromHeaders, getAllApiKeysFromBody } from '@/lib/api-key-utils';

// Function to sanitize smart quotes and other problematic characters
function sanitizeQuotes(text: string): string {
  return text
    // Replace smart single quotes
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    // Replace smart double quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    // Replace other quote-like characters
    .replace(/[\u00AB\u00BB]/g, '"') // Guillemets
    .replace(/[\u2039\u203A]/g, "'") // Single guillemets
    // Replace other problematic characters
    .replace(/[\u2013\u2014]/g, '-') // En dash and em dash
    .replace(/[\u2026]/g, '...') // Ellipsis
    .replace(/[\u00A0]/g, ' '); // Non-breaking space
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({
        success: false,
        error: 'URL is required'
      }, { status: 400 });
    }

    console.log('[scrape-url-enhanced] Scraping with Firecrawl:', url);

    // Get Firecrawl API key from headers, body, or environment
    const apiKeysFromHeaders = getAllApiKeysFromHeaders(request);
    const apiKeysFromBody = getAllApiKeysFromBody(body);
    const FIRECRAWL_API_KEY = apiKeysFromHeaders.firecrawl || apiKeysFromBody.firecrawl;

    if (!FIRECRAWL_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'Firecrawl API key is required. Please provide it in the request headers or configure it in your environment.'
      }, { status: 400 });
    }
    
    // Make request to Firecrawl API with optimized settings
    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        waitFor: 1000, // Reduced wait time
        timeout: 60000, // Increased timeout to 60 seconds
        blockAds: true,
        maxAge: 3600000, // Use cached data if less than 1 hour old (500% faster!)
        actions: [
          {
            type: 'wait',
            milliseconds: 1000 // Reduced wait time
          }
        ]
      })
    });
    
    let data;

    if (!firecrawlResponse.ok) {
      const error = await firecrawlResponse.text();
      console.error('[scrape-url-enhanced] Firecrawl API error:', error);

      // Check if it's a timeout error and try with simpler settings
      if (error.includes('SCRAPE_TIMEOUT') || error.includes('timeout')) {
        console.log('[scrape-url-enhanced] Timeout detected, retrying with simpler settings...');

        const retryResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
            timeout: 90000, // Extended timeout
            blockAds: false, // Disable ad blocking for faster loading
            maxAge: 3600000
          })
        });

        if (retryResponse.ok) {
          data = await retryResponse.json();
          if (!data.success || !data.data) {
            throw new Error('Failed to scrape content after retry');
          }
          console.log('[scrape-url-enhanced] Retry successful');
        } else {
          throw new Error(`Firecrawl API error after retry: ${await retryResponse.text()}`);
        }
      } else {
        throw new Error(`Firecrawl API error: ${error}`);
      }
    } else {
      data = await firecrawlResponse.json();

      if (!data.success || !data.data) {
        throw new Error('Failed to scrape content');
      }
    }
    
    const { markdown, html, metadata } = data.data;
    
    // Sanitize the markdown content
    const sanitizedMarkdown = sanitizeQuotes(markdown || '');
    
    // Extract structured data from the response
    const title = metadata?.title || '';
    const description = metadata?.description || '';
    
    // Format content for AI
    const formattedContent = `
Title: ${sanitizeQuotes(title)}
Description: ${sanitizeQuotes(description)}
URL: ${url}

Main Content:
${sanitizedMarkdown}
    `.trim();
    
    return NextResponse.json({
      success: true,
      url,
      content: formattedContent,
      structured: {
        title: sanitizeQuotes(title),
        description: sanitizeQuotes(description),
        content: sanitizedMarkdown,
        url
      },
      metadata: {
        scraper: 'firecrawl-enhanced',
        timestamp: new Date().toISOString(),
        contentLength: formattedContent.length,
        cached: data.data.cached || false, // Indicates if data came from cache
        ...metadata
      },
      message: 'URL scraped successfully with Firecrawl (with caching for 500% faster performance)'
    });
    
  } catch (error) {
    console.error('[scrape-url-enhanced] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}