// Better Auth client setup for subscription management
import { createAuthClient } from "better-auth/react";
import { stripeClient } from "@better-auth/stripe/client";

// Better Auth client configuration
export const authClient = createAuthClient({
  baseURL: process.env.NEXTAUTH_URL || (process.env.NODE_ENV === "production"
    ? "https://cadcamfun.xyz"
    : "http://localhost:3001"),
  plugins: [
    stripeClient(),
    // Add Stripe client plugin for subscription management
  ],
});

// Export the session hook from Better Auth
export const { useSession, signIn, signOut, signUp } = authClient;

// Export specific client for subscription management
export const betterAuthClient = authClient;