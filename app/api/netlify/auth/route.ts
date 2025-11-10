import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.NETLIFY_CLIENT_ID;
    
    if (!clientId) {
      console.error('[netlify-auth] NETLIFY_CLIENT_ID not configured');
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return NextResponse.redirect(`${appUrl}?netlify_error=not_configured`);
    }
    
    // Get the redirect URI from environment
    const redirectUri = process.env.NETLIFY_REDIRECT_URI || 
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/netlify/callback`;
    
    console.log('[netlify-auth] Starting OAuth flow');
    console.log('[netlify-auth] Client ID:', clientId.substring(0, 10) + '...');
    console.log('[netlify-auth] Redirect URI:', redirectUri);
    
    // Generate a secure random state
    const state = crypto.randomBytes(32).toString('hex');
    
    // Netlify OAuth URL
    const netlifyAuthUrl = new URL('https://app.netlify.com/authorize');
    netlifyAuthUrl.searchParams.append('client_id', clientId);
    netlifyAuthUrl.searchParams.append('response_type', 'code');
    netlifyAuthUrl.searchParams.append('redirect_uri', redirectUri);
    netlifyAuthUrl.searchParams.append('state', state);
    
    console.log('[netlify-auth] Redirecting to:', netlifyAuthUrl.toString());
    
    // Create response with state cookie for verification
    const response = NextResponse.redirect(netlifyAuthUrl.toString());
    response.cookies.set('netlify_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes
      path: '/',
    });
    
    return response;
  } catch (error) {
    console.error('[netlify-auth] Error:', error);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${appUrl}?netlify_error=auth_failed`);
  }
}
