# Google OAuth Setup Guide

This guide explains how to set up Google OAuth authentication for Open Lovable DIY.

## Prerequisites

1. Google Cloud Console project
2. Domain configured (https://www.openlovable.diy)

## Google Cloud Console Configuration

### 1. Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth 2.0 Client IDs**
5. Choose **Web application**
6. Configure the following:

**Authorized JavaScript origins:**
```
https://www.openlovable.diy
http://localhost:3000 (for development)
```

**Authorized redirect URIs:**
```
https://www.openlovable.diy/api/auth/callback/google
http://localhost:3000/api/auth/callback/google (for development)
```

### 2. Configuration Example

**Client ID:** `your-google-client-id.apps.googleusercontent.com`
**Client Secret:** `GOCSPX-your-google-client-secret`
**Authorized Redirect URI:** `https://www.openlovable.diy/`

## Environment Variables

Add these to your `.env.local` file:

```env
# Google OAuth Authentication
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-google-client-secret

# NextAuth.js configuration
NEXTAUTH_SECRET=your-super-secret-nextauth-key-change-this-in-production
NEXTAUTH_URL=https://www.openlovable.diy
```

## Features Implemented

### 🔐 Authentication System
- **Google OAuth Integration** - Secure sign-in with Google accounts
- **Session Management** - Persistent user sessions with NextAuth.js
- **Custom Sign-in Page** - Beautiful branded authentication interface
- **User Profile Management** - User dropdown with profile information

### 🎨 UI Components
- **UserButton Component** - Replaces API Keys button with user authentication
- **Responsive Design** - Works on mobile and desktop
- **Dropdown Menu** - Access to API Keys settings and sign out
- **Loading States** - Smooth loading animations

### 🛡️ Security Features
- **Secure Token Handling** - JWT-based session management
- **Protected Routes** - Middleware for route protection (configurable)
- **Error Handling** - Custom error pages for authentication issues

## Usage

### For Users
1. Click the **Sign In** button in the top right corner
2. Authenticate with your Google account
3. Access API Keys settings through the user dropdown
4. Sign out when finished

### For Developers
```tsx
import { useSession, signIn, signOut } from "next-auth/react"

function MyComponent() {
  const { data: session, status } = useSession()
  
  if (status === "loading") return <p>Loading...</p>
  
  if (session) {
    return (
      <>
        <p>Signed in as {session.user.email}</p>
        <button onClick={() => signOut()}>Sign out</button>
      </>
    )
  }
  
  return (
    <>
      <p>Not signed in</p>
      <button onClick={() => signIn('google')}>Sign in with Google</button>
    </>
  )
}
```

## File Structure

```
├── app/
│   ├── api/auth/[...nextauth]/route.ts    # NextAuth.js API routes
│   ├── auth/signin/page.tsx               # Custom sign-in page
│   └── auth/error/page.tsx                # Authentication error page
├── components/
│   └── UserButton.tsx                     # User authentication button
├── contexts/
│   └── AuthContext.tsx                    # Authentication provider
├── lib/
│   └── auth.ts                           # NextAuth.js configuration
├── types/
│   └── next-auth.d.ts                    # TypeScript definitions
└── middleware.ts                         # Route protection middleware
```

## Testing

1. Start the development server: `npm run dev`
2. Navigate to `http://localhost:3000`
3. Click the **Sign In** button
4. Complete Google OAuth flow
5. Verify user dropdown functionality

## Production Deployment

1. Update `NEXTAUTH_URL` to your production domain
2. Ensure Google OAuth redirect URIs include your production domain
3. Use a secure `NEXTAUTH_SECRET` in production
4. Deploy to your hosting platform

## Troubleshooting

### Common Issues

1. **Redirect URI Mismatch**
   - Ensure redirect URIs in Google Console match your domain exactly
   - Include both development and production URLs

2. **Invalid Client Error**
   - Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
   - Check environment variables are loaded properly

3. **Session Issues**
   - Ensure `NEXTAUTH_SECRET` is set and secure
   - Clear browser cookies and try again

### Debug Mode

Enable debug logging by adding to `.env.local`:
```env
NEXTAUTH_DEBUG=true
```

## Security Notes

- Never commit `.env.local` to version control
- Use strong, unique `NEXTAUTH_SECRET` in production
- Regularly rotate OAuth credentials
- Monitor authentication logs for suspicious activity
