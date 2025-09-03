import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { UserDatabase } from '@/lib/database';

// Admin emails
const ADMIN_EMAILS = [
  'zainulabedeen0002@gmail.com',
];

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated and admin
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check environment variables
    const envStatus = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
      NEXTAUTH_URL: !!process.env.NEXTAUTH_URL,
    };

    // Test database connection
    const dbConnected = await UserDatabase.testConnection();

    return NextResponse.json({
      environment: envStatus,
      database: {
        connected: dbConnected,
        url_configured: !!process.env.DATABASE_URL,
      },
      session: {
        user: session.user.email,
        isAdmin: ADMIN_EMAILS.includes(session.user.email),
      },
    });

  } catch (error) {
    console.error('Error checking admin status:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
