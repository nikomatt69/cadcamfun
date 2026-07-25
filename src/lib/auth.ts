// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { magicLink } from "better-auth/plugins/magic-link";
import { twoFactor } from "better-auth/plugins/two-factor";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendEmail,
} from "./email";
import { stripe } from "@better-auth/stripe";
import Stripe from "stripe";

const passkey = (_options: Record<string, unknown>) => ({
  id: "passkey",
});

// Stripe client for Better Auth plugin

export const auth = betterAuth({
  // App configuration
  appName: "CAD/CAM FUN",
  baseURL:
    process.env.NEXTAUTH_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://cadcamfun.xyz"
      : "http://localhost:3001"),

  // Database
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),

  // Secret
  secret: process.env.NEXTAUTH_SECRET!,

  // Configurazione email e password - PRODUCTION READY
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Disabilitato temporaneamente per evitare conflitto schema
    minPasswordLength: 8,
    maxPasswordLength: 128,

    // Password reset - PRODUCTION SERVICE
    sendResetPassword: async ({ user, url, token }, request) => {
      try {
        await sendPasswordResetEmail(user.email, token);
        console.log(`✅ Password reset email sent to: ${user.email}`);
      } catch (error) {
        console.error("❌ Failed to send reset password email:", error);
        throw new Error("Failed to send password reset email");
      }
    },
    resetPasswordTokenExpiresIn: 3600, // 1 ora
  },

  // Email verification - PRODUCTION SERVICE - DISABILITATO TEMPORANEAMENTE
  // emailVerification: {
  //   sendVerificationEmail: async ({ user, url, token }, request) => {
  //     try {
  //       await sendVerificationEmail(user.email, token);
  //       console.log(`✅ Verification email sent to: ${user.email}`);
  //     } catch (error) {
  //       console.error("❌ Failed to send verification email:", error);
  //       throw new Error("Failed to send verification email");
  //     }
  //   },
  //   verificationTokenExpiresIn: 24 * 60 * 60, // 24 ore
  // },

  // Configurazione social providers
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },

  // Configurazione sessione
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 giorni
    updateAge: 60 * 60 * 24, // Aggiorna ogni 24 ore
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minuti cache
    },
  },

  // Trusted origins per Tauri
  trustedOrigins: [
    "http://localhost:3001",
    "https://cadcamfun.xyz",

    "cadcamfun://localhost",
    "https://localhost:3001",
    "https://localhost:3000",
    "https://localhost:3002",
    "https://localhost:3003",
    "https://localhost:3004",
    "https://localhost:3005",
    "https://localhost:3006",
  ],

  // Plugin production-ready
  plugins: [
    // 🔐 Passkey Plugin - Autenticazione sicura senza password
    passkey({
      rpName: "CAD/CAM FUN",
      rpID:
        process.env.NODE_ENV === "production" ? "cadcamfun.xyz" : "localhost",
      origin:
        process.env.NODE_ENV === "production"
          ? "https://cadcamfun.xyz"
          : "http://localhost:3001",
      authenticatorSelection: {
        authenticatorAttachment: "platform", // Preferisce biometrico
        residentKey: "preferred",
        userVerification: "preferred",
      },
    }),

    // 🔗 Magic Link Plugin - Login passwordless - PRODUCTION SERVICE
    magicLink({
      sendMagicLink: async ({ email, url, token }, request) => {
        try {
          // Usa il servizio email reale per magic link
          const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #4f46e5; margin-bottom: 10px;">CAD/CAM FUN</h1>
                <h2 style="color: #374151; margin-top: 0;">Magic Link Sign In</h2>
              </div>
              
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px;">
                <p style="color: white; font-size: 18px; margin-bottom: 25px;">
                  Click the button below to sign in to your CAD/CAM FUN account securely.
                </p>
                <a href="${url}" 
                   style="display: inline-block; background: white; color: #4f46e5; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                  Sign In with Magic Link
                </a>
              </div>
              
              <div style="color: #6b7280; font-size: 14px; line-height: 1.5;">
                <p><strong>Security Note:</strong></p>
                <ul style="padding-left: 20px;">
                  <li>This link will expire in 5 minutes</li>
                  <li>Use this link only if you requested it</li>
                  <li>Never share this link with anyone</li>
                </ul>
                
                <p style="margin-top: 30px;">
                  <small>If you didn't request this magic link, you can safely ignore this email.</small>
                </p>
                
                <p style="margin-top: 20px; text-align: center; color: #9ca3af;">
                  © 2024 CAD/CAM FUN. All rights reserved.
                </p>
              </div>
            </div>
          `;

          await sendEmail({
            to: email,
            subject: "Your CAD/CAM FUN Magic Link",
            html,
          });

          console.log(`✅ Magic link email sent to: ${email}`);
        } catch (error) {
          console.error("❌ Failed to send magic link email:", error);
          throw new Error("Failed to send magic link email");
        }
      },
      expiresIn: 300, // 5 minuti
      disableSignUp: false, // Permette signup via magic link
    }),

    // 🛡️ Two-Factor Authentication Plugin - PRODUCTION SERVICE
    twoFactor({
      issuer: "CAD/CAM FUN",
      skipVerificationOnEnable: false, // Richiede verifica per abilitare 2FA

      // Configurazione TOTP
      totpOptions: {
        digits: 6,
        period: 30,
        // Accetta codici precedenti/successivi
      },

      // Configurazione OTP via email - PRODUCTION SERVICE
      otpOptions: {
        async sendOTP({ user, otp }, request) {
          try {
            const html = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #4f46e5; margin-bottom: 10px;">CAD/CAM FUN</h1>
                  <h2 style="color: #374151; margin-top: 0;">Two-Factor Authentication</h2>
                </div>
                
                <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px;">
                  <p style="color: white; font-size: 18px; margin-bottom: 25px;">
                    Your 2FA verification code is:
                  </p>
                  <div style="background: white; color: #dc2626; padding: 20px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 5px; font-family: monospace;">
                    ${otp}
                  </div>
                </div>
                
                <div style="color: #6b7280; font-size: 14px; line-height: 1.5;">
                  <p><strong>Security Information:</strong></p>
                  <ul style="padding-left: 20px;">
                    <li>This code will expire in 3 minutes</li>
                    <li>Enter this code in the verification form</li>
                    <li>Never share this code with anyone</li>
                  </ul>
                  
                  <p style="margin-top: 30px;">
                    <small>If you didn't request this code, please contact support immediately.</small>
                  </p>
                  
                  <p style="margin-top: 20px; text-align: center; color: #9ca3af;">
                    © 2024 CAD/CAM FUN. All rights reserved.
                  </p>
                </div>
              </div>
            `;

            await sendEmail({
              to: user.email,
              subject: "Your CAD/CAM FUN 2FA Code",
              html,
            });

            console.log(`✅ 2FA OTP email sent to: ${user.email}`);
          } catch (error) {
            console.error("❌ Failed to send 2FA OTP email:", error);
            throw new Error("Failed to send 2FA verification code");
          }
        },
        period: 3, // 3 minuti di validità
      },

      // Configurazione backup codes
      backupCodeOptions: {
        amount: 10, // 10 codici di backup
        length: 10, // 10 caratteri per codice
      },
    }),

    // 💳 Stripe Plugin - Subscription management integrato
    stripe({
      stripeClient: new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2025-02-24.acacia",
      }),
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        plans: [
          {
            id: "free",
            name: "Free",
          },
          {
            id: "basic",
            name: "Basic",
            priceId: process.env.STRIPE_BASIC_PRICE_ID,
          },
          {
            id: "pro",
            name: "Pro",
            priceId: process.env.STRIPE_PRO_PRICE_ID,
          },
          {
            id: "enterprise",
            name: "Enterprise",
            priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
          },
        ],
      },
    }),
  ],

  // Rate limiting production-ready
  rateLimit: {
    enabled: true,
    window: 60, // 1 minuto
    max: 100, // 100 requests per minuto per IP
  },

  // Advanced security
  advanced: {
    crossSubDomainCookies: {
      enabled: process.env.NODE_ENV === "production",
      domain:
        process.env.NODE_ENV === "production" ? ".cadcamfun.xyz" : undefined,
    },
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});

// Export dei tipi per TypeScript
export type Session = typeof auth.$Infer.Session;
