import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  
  if (error) {
    console.error('[netlify-callback] OAuth error:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}?netlify_error=${error}`);
  }
  
  if (!code) {
    return NextResponse.json({ error: 'No authorization code received' }, { status: 400 });
  }
  
  const clientId = process.env.NETLIFY_CLIENT_ID;
  const clientSecret = process.env.NETLIFY_CLIENT_SECRET;
  const redirectUri = process.env.NETLIFY_REDIRECT_URI || 
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/netlify/callback`;
  
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Netlify credentials not configured' }, { status: 500 });
  }
  
  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://api.netlify.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[netlify-callback] Token exchange failed:', errorText);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}?netlify_error=token_exchange_failed`);
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    // Store the token in a cookie (or return it to the client)
    const response = NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}?netlify_connected=true`);
    response.cookies.set('netlify_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });
    
    return response;
  } catch (error) {
    console.error('[netlify-callback] Error:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}?netlify_error=server_error`);
  }
}
