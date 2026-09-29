import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import authConfig from "@/auth.config";
import { env } from "@/lib/env";
import { upsertCustomerFromGoogleProfile } from "@/modules/auth/google-profile";
import { authorizeAdmin } from "@/modules/auth/admin-credentials";

const providers = [
  ...(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET
    ? [
        Google({
          clientId: env.AUTH_GOOGLE_ID,
          clientSecret: env.AUTH_GOOGLE_SECRET,
        }),
      ]
    : []),
  Credentials({
    id: "credentials",
    name: "Admin Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    authorize: authorizeAdmin,
  }),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: env.AUTH_SECRET,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;

      const customer = await upsertCustomerFromGoogleProfile(profile);

      if (!customer) return false;

      user.id = customer.id;
      user.role = "CUSTOMER";
      return true;
    },
    async redirect({ url, baseUrl }) {
      const base = new URL(baseUrl);
      const target = new URL(url, base);
      const safeTarget = target.origin === base.origin ? target : base;

      return safeTarget.toString();
    },
  },
});
