import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  try {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    
    console.log('[netlify-callback] Received callback');
    console.log('[netlify-callback] Code present:', !!code);
    console.log('[netlify-callback] State:', state);
    
    if (error) {
      console.error('[netlify-callback] OAuth error:', error, errorDescription);
      return NextResponse.redirect(`${appUrl}?netlify_error=${error}`);
    }
    
    if (!code) {
      console.error('[netlify-callback] No authorization code received');
      return NextResponse.redirect(`${appUrl}?netlify_error=no_code`);
    }
    
    // Verify state (optional but recommended)
    const storedState = request.cookies.get('netlify_oauth_state')?.value;
    if (storedState && state !== storedState) {
      console.error('[netlify-callback] State mismatch');
      return NextResponse.redirect(`${appUrl}?netlify_error=state_mismatch`);
    }
    
    const clientId = process.env.NETLIFY_CLIENT_ID;
    const clientSecret = process.env.NETLIFY_CLIENT_SECRET;
    const redirectUri = process.env.NETLIFY_REDIRECT_URI || `${appUrl}/api/netlify/callback`;
    
    if (!clientId || !clientSecret) {
      console.error('[netlify-callback] Credentials not configured');
      return NextResponse.redirect(`${appUrl}?netlify_error=not_configured`);
    }
    
    console.log('[netlify-callback] Exchanging code for token...');
    console.log('[netlify-callback] Redirect URI:', redirectUri);
    
    // Exchange code for access token
    const tokenPayload = {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    };
    
    console.log('[netlify-callback] Token request payload:', {
      ...tokenPayload,
      client_secret: '***',
      code: code.substring(0, 10) + '...',
    });
    
    const tokenResponse = await fetch('https://api.netlify.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tokenPayload),
    });
    
    console.log('[netlify-callback] Token response status:', tokenResponse.status);
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[netlify-callback] Token exchange failed:', errorText);
      return NextResponse.redirect(`${appUrl}?netlify_error=token_failed&details=${encodeURIComponent(errorText)}`);
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    if (!accessToken) {
      console.error('[netlify-callback] No access token in response');
      return NextResponse.redirect(`${appUrl}?netlify_error=no_token`);
    }
    
    console.log('[netlify-callback] Successfully obtained access token');
    
    // Store the token in a cookie
    const response = NextResponse.redirect(`${appUrl}?netlify_connected=true`);
    response.cookies.set('netlify_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });
    
    // Clear the state cookie
    response.cookies.delete('netlify_oauth_state');
    
    return response;
  } catch (error) {
    console.error('[netlify-callback] Unexpected error:', error);
    return NextResponse.redirect(`${appUrl}?netlify_error=server_error&details=${encodeURIComponent(String(error))}`);
  }
}
