import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { UserDatabase } from "./database"

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email) {
        try {
          const dbUser = await UserDatabase.upsertUser({
            google_id: user.id,
            email: user.email,
            name: user.name || undefined,
            image: user.image || undefined,
          });

          (user as any).dbUserId = dbUser.id;
          return true;
        } catch (error) {
          console.error('Error storing user in database:', error);
          return true;
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }

      if (user && (user as any).dbUserId) {
        token.dbUserId = (user as any).dbUserId as string;
      } else if (!token.dbUserId && token.sub) {
        try {
          const existingUser = await UserDatabase.getUserByGoogleId(token.sub);
          if (existingUser) {
            token.dbUserId = existingUser.id;
          }
        } catch (error) {
          console.error('Error loading user by Google ID:', error);
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      if (session.user) {
        session.user.id = (token.dbUserId as string | undefined) || undefined;
        session.user.googleId = (token.sub as string | undefined) || undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
}
