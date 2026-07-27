import type { NextAuthConfig } from "next-auth";

// Edge-safe config: no providers that touch Prisma/bcrypt here, so this
// can be imported from middleware.ts (edge runtime). The Credentials
// provider (which needs the Node-only Prisma client) is added on top of
// this config in lib/auth.ts, used only from API routes/server components.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) token.id = (user as { id: string }).id;
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
