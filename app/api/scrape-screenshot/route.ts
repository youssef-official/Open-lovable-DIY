import { NextRequest, NextResponse } from 'next/server';
import { getAllApiKeysFromHeaders, getAllApiKeysFromBody } from '@/lib/api-key-utils';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Get Firecrawl API key from headers, body, or environment
    const apiKeysFromHeaders = getAllApiKeysFromHeaders(req);
    const apiKeysFromBody = getAllApiKeysFromBody(body);
    const FIRECRAWL_API_KEY = apiKeysFromHeaders.firecrawl || apiKeysFromBody.firecrawl;

    if (!FIRECRAWL_API_KEY) {
      return NextResponse.json({
        error: 'Firecrawl API key is required. Please provide it in the request headers or configure it in your environment.'
      }, { status: 400 });
    }

    // Use Firecrawl API to capture screenshot
    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url,
        formats: ['screenshot'], // Regular viewport screenshot, not full page
        waitFor: 3000, // Wait for page to fully load
        timeout: 30000,
        blockAds: true,
        actions: [
          {
            type: 'wait',
            milliseconds: 2000 // Additional wait for dynamic content
          }
        ]
      })
    });

    if (!firecrawlResponse.ok) {
      const error = await firecrawlResponse.text();
      throw new Error(`Firecrawl API error: ${error}`);
    }

    const data = await firecrawlResponse.json();
    
    if (!data.success || !data.data?.screenshot) {
      throw new Error('Failed to capture screenshot');
    }

    return NextResponse.json({
      success: true,
      screenshot: data.data.screenshot,
      metadata: data.data.metadata
    });

  } catch (error: any) {
    console.error('Screenshot capture error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to capture screenshot' 
    }, { status: 500 });
  }
}