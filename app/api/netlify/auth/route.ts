import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  
  // Get the redirect URI from environment or construct it
  const redirectUri = process.env.NETLIFY_REDIRECT_URI || 
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/netlify/callback`;
  
  const clientId = process.env.NETLIFY_CLIENT_ID;
  
  if (!clientId) {
    return NextResponse.json({ error: 'Netlify Client ID not configured' }, { status: 500 });
  }
  
  // Netlify OAuth URL
  const netlifyAuthUrl = new URL('https://app.netlify.com/authorize');
  netlifyAuthUrl.searchParams.append('client_id', clientId);
  netlifyAuthUrl.searchParams.append('response_type', 'code');
  netlifyAuthUrl.searchParams.append('redirect_uri', redirectUri);
  netlifyAuthUrl.searchParams.append('state', 'random-state-string'); // You should generate a random state
  
  // Redirect to Netlify OAuth
  return NextResponse.redirect(netlifyAuthUrl.toString());
}
