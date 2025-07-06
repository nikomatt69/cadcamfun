// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { passkey } from "better-auth/plugins/passkey";
import { magicLink } from "better-auth/plugins/magic-link";

export const auth = betterAuth({
  // Base URL configuration
  baseURL: process.env.NEXTAUTH_URL || (process.env.NODE_ENV === "production"
    ? "https://cadcamfun.xyz"
    : "https://localhost:3000"),

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
      redirectURI: process.env.NODE_ENV === "production" 
        ? "https://cadcamfun.xyz/api/auth/callback/github"
        : "https://localhost:3000/api/auth/callback/github",
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
    // Passkeys - Perfect for desktop apps
    passkey({
      rpName: "CAD/CAM FUN",
      rpID: process.env.NODE_ENV === "production" ? "cadcamfun.xyz" : "localhost",
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
          const response = await fetch(`${process.env.NEXTAUTH_URL || 'https://localhost:3000'}/api/auth/magic-link/store`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, url }),
          });
          
          console.log(`Magic link stored for UI display`);
        } catch (error) {
          console.log('Fallback: Magic link available in console only');
        }
      },
    }),
  ],

  // Logging
  logger: {
    enabled: process.env.NODE_ENV === "development",
    level: "debug",
  },
});

// Export types for TypeScript
export type Session = typeof auth.$Infer.Session;