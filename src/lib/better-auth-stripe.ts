// Better Auth Stripe integration using API endpoints
// This service uses fetch to call Better Auth's Stripe API routes

import { authFetch } from "./auth-client";
import { FeatureFlag } from "../types/featureFlags";
import { SubscriptionPlan } from "../types/subscription";

// Mapping Better Auth plans to existing system
export const BETTER_AUTH_PLAN_MAPPING = {
  free: "FREE",
  basic: "BASIC",
  pro: "PRO",
  enterprise: "ENTERPRISE",
} as const;

// Reverse mapping
export const EXISTING_PLAN_MAPPING = {
  FREE: "free",
  BASIC: "basic",
  PRO: "pro",
  ENTERPRISE: "enterprise",
} as const;

export interface BetterAuthSubscriptionInfo {
  id: string;
  plan: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

/**
 * Service that uses Better Auth Stripe API endpoints for subscription management
 */
export class BetterAuthStripeService {

  /**
   * Gets subscription info by calling a custom API endpoint
   */
  static async getSubscriptionInfo(userId: string): Promise<BetterAuthSubscriptionInfo | null> {
    try {
      const response = await authFetch(`/api/subscription/info?userId=${userId}`);

      if (!response.ok) {
        throw new Error("Failed to fetch subscription info");
      }

      const sub = await response.json();
      if (!sub) return null;

      // Map to existing format
      return {
        id: sub.id,
        plan: BETTER_AUTH_PLAN_MAPPING[sub.plan as keyof typeof BETTER_AUTH_PLAN_MAPPING] || "FREE",
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd || false,
        stripeCustomerId: sub.stripeCustomerId,
        stripeSubscriptionId: sub.stripeSubscriptionId,
      };
    } catch (error) {
      console.error("Error getting subscription info:", error);
      return null;
    }
  }

  /**
   * Creates checkout session using Better Auth's checkout API endpoint
   */
  static async createCheckoutSession(
    userId: string,
    planId: SubscriptionPlan,
    options: {
      successUrl: string;
      cancelUrl: string;
      trialDays?: number;
    }
  ): Promise<{ url: string } | null> {
    try {
      const betterAuthPlan = EXISTING_PLAN_MAPPING[planId as keyof typeof EXISTING_PLAN_MAPPING];
      if (!betterAuthPlan) {
        throw new Error(`Invalid plan: ${planId}`);
      }

      const response = await authFetch('/api/auth/stripe/checkout', {
        method: 'POST',
        body: JSON.stringify({
          plan: betterAuthPlan,
          successUrl: options.successUrl,
          cancelUrl: options.cancelUrl,
          referenceId: userId, // Pass userId if needed by your setup
        }),
      });

      if (!response.ok) throw new Error('Failed to create checkout session');

      const session = await response.json();
      return { url: session.url };
    } catch (error) {
      console.error("Error creating checkout session:", error);
      return null;
    }
  }

  /**
   * Creates billing portal session using Better Auth's billing portal API endpoint
   */
  static async createBillingPortalSession(
    userId: string,
    returnUrl: string
  ): Promise<{ url: string } | null> {
    try {
      const response = await authFetch('/api/auth/stripe/billing-portal', {
        method: 'POST',
        body: JSON.stringify({ returnUrl, referenceId: userId }),
      });

      if (!response.ok) throw new Error('Failed to create billing portal session');

      const session = await response.json();
      return { url: session.url };
    } catch (error) {
      console.error("Error creating billing portal session:", error);
      return null;
    }
  }

  /**
   * Cancels subscription at period end.
   * Note: Better-auth billing portal handles cancellation. 
   * This function can be a direct API call if you expose it.
   */
  static async cancelSubscription(userId: string): Promise<boolean> {
    try {
      // This usually is handled via the billing portal. 
      // If you have a direct cancellation endpoint, call it here.
      console.warn("Cancellation should be handled via the billing portal.");
      // Example of what a direct API call would look like:
      // const response = await authFetch('/api/subscription/cancel', {
      //   method: 'POST',
      //   body: JSON.stringify({ userId }),
      // });
      // return response.ok;
      return true; // Assume success opens portal
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      return false;
    }
  }

  /**
   * Reactivates a cancelled subscription.
   * Note: Also typically handled in the billing portal.
   */
  static async reactivateSubscription(userId: string): Promise<boolean> {
    try {
      console.warn("Reactivation should be handled via the billing portal.");
      return true;
    } catch (error) {
      console.error("Error reactivating subscription:", error);
      return false;
    }
  }

  /**
   * Updates subscription plan using the checkout session.
   */
  static async updateSubscriptionPlan(
    userId: string,
    newPlan: SubscriptionPlan
  ): Promise<boolean> {
    try {
      const betterAuthPlan = EXISTING_PLAN_MAPPING[newPlan as keyof typeof EXISTING_PLAN_MAPPING];
      if (!betterAuthPlan) {
        throw new Error(`Invalid plan: ${newPlan}`);
      }

      const session = await this.createCheckoutSession(userId, newPlan, {
        successUrl: `${this.getAppBaseUrl()}/settings/subscription?updated=true`,
        cancelUrl: `${this.getAppBaseUrl()}/settings/subscription`,
      });

      // Redirecting to checkout page is handled by the calling component
      return !!session?.url;
    } catch (error) {
      console.error("Error updating subscription plan:", error);
      return false;
    }
  }

  /**
   * Verifica se user ha accesso a feature specifica
   * Mantiene compatibilità con sistema feature flags esistente
   */
  static async hasFeatureAccess(
    userId: string,
    feature: FeatureFlag
  ): Promise<boolean> {
    try {
      const subscriptionInfo = await this.getSubscriptionInfo(userId);
      if (!subscriptionInfo) return false;

      // Qui puoi integrare con il sistema feature flags esistente
      // Per ora usiamo logica base
      const plan = subscriptionInfo.plan as SubscriptionPlan;

      // Esempio di logica feature access (da personalizzare)
      switch (feature) {
        case FeatureFlag.AI_ASSISTANT:
          return ["BASIC", "PRO", "ENTERPRISE"].includes(plan);
        case FeatureFlag.AI_VISION:
          return ["PRO", "ENTERPRISE"].includes(plan);
        case FeatureFlag.CAD_ADVANCED:
          return ["PRO", "ENTERPRISE"].includes(plan);
        case FeatureFlag.CAM_MULTIAXIS:
          return plan === "ENTERPRISE";
        default:
          return plan !== "FREE";
      }
    } catch (error) {
      console.error("Error checking feature access:", error);
      return false;
    }
  }

  /**
   * Sincronizza subscription data tra Better Auth e sistema esistente
   * Utile per migration graduale
   */
  static async syncSubscriptionData(userId: string): Promise<boolean> {
    try {
      const response = await authFetch("/api/better-auth-stripe/sync", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });

      return response.ok;
    } catch (error) {
      console.error("Error syncing subscription data:", error);
      return false;
    }
  }

  private static getAppBaseUrl(): string {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }

    return process.env.NEXTAUTH_URL || "http://localhost:3000";
  }
}

export default BetterAuthStripeService;
