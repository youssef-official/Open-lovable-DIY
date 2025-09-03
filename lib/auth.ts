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
    async signIn({ user, account, profile }) {
      // Store user in database when they sign in
      if (account?.provider === 'google' && user.email) {
        try {
          await UserDatabase.upsertUser({
            google_id: user.id,
            email: user.email,
            name: user.name || undefined,
            image: user.image || undefined,
          });
          return true;
        } catch (error) {
          console.error('Error storing user in database:', error);
          // Still allow sign in even if database storage fails
          return true;
        }
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      // Persist the OAuth access_token and or the user id to the token right after signin
      if (account) {
        token.accessToken = account.access_token
      }
      return token
    },
    async session({ session, token }) {
      // Send properties to the client, like an access_token and user id from a provider.
      session.accessToken = token.accessToken
      return session
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
