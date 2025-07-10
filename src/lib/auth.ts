// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { passkey } from "better-auth/plugins/passkey";
import { magicLink } from "better-auth/plugins/magic-link";
import { oAuthProxy } from "better-auth/plugins";
const { tauri } = require("@daveyplate/better-auth-tauri/plugin");
export const auth = betterAuth({
  // Base URL configuration
  baseURL: process.env.NEXTAUTH_URL || (process.env.NODE_ENV === "production"
    ? "https://cadcamfun.xyz"
    : "http://localhost:3001"),

  // Database adapter
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // Secret
  secret: process.env.NEXTAUTH_SECRET!,

  // Email configuration
  emailAndPassword: {
    enabled: true,
    name: true,
    autoSignIn: false,
    requireEmailVerification: false, // Simplified for now
  },

  // Social providers configuration
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      redirectURI: `${process.env.NEXTAUTH_URL}/api/auth/callback/github`,
      scopes: ["user:email"],
      schema: {
        name: {
          type: "string",
          required: true,
        },
      },
    },
  },

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  },

  // Enhanced plugins for Tauri compatibility
  plugins: [
    // OAuth Proxy - MUST BE FIRST
    oAuthProxy({
      productionURL: "https://cadcamfun.xyz",
      currentURL: "http://localhost:3001",
    }),
    tauri({
      scheme: "cadcamfun", // Your app's deep link scheme
      callbackURL: "/", // Optional: Where to redirect after auth (default: "/")
      successText: "Authentication successful! You can close this window.", // Optional
      // Optional: Custom success page URL that will receive a ?tauriRedirect search parameter
      debugLogs: false, // Optional: Enable debug logs
    }),

    // Passkeys - Perfect for desktop apps
    passkey({
      rpName: "CAD/CAM FUN",
      rpID: process.env.NODE_ENV === "production" ? "https://cadcamfun.xyz" : "http://localhost:3001",
    }),

    // Magic Links - Email-based auth without redirects
    magicLink({
      // Local magic link - shows URL in console and UI (no email needed)
      sendMagicLink: async ({ email, url }) => {
        console.log(`\n🔗 MAGIC LINK for ${email}:`);
        console.log(`${url}`);
        console.log(`Copy this link to sign in\n`);

        // Store in database for UI retrieval
        try {
          const user = await prisma.user.findUnique({ where: { email } });
          if (user) {
            const urlObject = new URL(url);
            const token = urlObject.searchParams.get('token');

            if (token) {
              await prisma.token.create({
                data: {
                  userId: user.id,
                  type: 'MAGIC_LINK',
                  token: token,
                  expiresAt: new Date(Date.now() + 20 * 60 * 1000), // 20 minutes
                },
              });
              console.log(`Magic link token stored for UI display`);
            }
          }
        } catch (error) {
          console.error('Failed to store magic link token:', error);
        }
      },
    }),
  ],

  // Trusted origins for OAuth flows

  // Logging
  logger: {
    enabled: process.env.NODE_ENV === "development",
    level: "debug",
  },
});

// Export types for TypeScript
export type Session = typeof auth.$Infer.Session;