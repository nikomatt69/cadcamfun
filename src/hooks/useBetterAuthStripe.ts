import { useState, useCallback } from "react";
import { useSubscription } from "../contexts/SubscriptionContext";
import { FeatureFlag } from "../types/featureFlags";
import { SubscriptionPlan } from "../types/subscription";

export interface BetterAuthSubscriptionData {
  id: string;
  plan: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  source: string;
}

/**
 * Hook dedicato per Better Auth Stripe integration
 * Funziona in parallelo al sistema subscription esistente
 */
export function useBetterAuthStripe() {
  const { betterAuth, isLoading: contextLoading, error: contextError } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get subscription info from Better Auth
  const getSubscription = useCallback(async (): Promise<BetterAuthSubscriptionData | null> => {
    setLoading(true);
    setError(null);
    try {
      const data = await betterAuth.getSubscriptionInfo();
      return data;
    } catch (err: any) {
      setError(err.message || "Failed to get subscription info");
      return null;
    } finally {
      setLoading(false);
    }
  }, [betterAuth]);

  // Create checkout session with Better Auth
  const createCheckout = useCallback(
    async (plan: SubscriptionPlan, options?: { trialDays?: number }) => {
      setLoading(true);
      setError(null);
      try {
        await betterAuth.createCheckoutSessionBA(plan, options);
      } catch (err: any) {
        setError(err.message || "Failed to create checkout session");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [betterAuth]
  );

  // Create billing portal session
  const createBillingPortal = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await betterAuth.createBillingPortalSessionBA();
    } catch (err: any) {
      setError(err.message || "Failed to create billing portal session");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [betterAuth]);

  // Check feature access
  const hasFeature = useCallback(
    async (flag: FeatureFlag): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const result = await betterAuth.hasFeatureBA(flag);
        return result;
      } catch (err: any) {
        setError(err.message || "Failed to check feature access");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [betterAuth]
  );

  // Sync subscription data
  const syncData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await betterAuth.syncSubscriptionData();
    } catch (err: any) {
      setError(err.message || "Failed to sync subscription data");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [betterAuth]);

  // Cancel subscription
  const cancelSubscription = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const result = await betterAuth.cancelSubscription();
      return result;
    } catch (err: any) {
      setError(err.message || "Failed to cancel subscription");
      return false;
    } finally {
      setLoading(false);
    }
  }, [betterAuth]);

  // Update subscription plan
  const updatePlan = useCallback(
    async (newPlan: SubscriptionPlan): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const result = await betterAuth.updateSubscriptionPlan(newPlan);
        return result;
      } catch (err: any) {
        setError(err.message || "Failed to update subscription plan");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [betterAuth]
  );

  return {
    // State
    loading: loading || contextLoading,
    error: error || contextError,

    // Actions
    getSubscription,
    createCheckout,
    createBillingPortal,
    hasFeature,
    syncData,
    cancelSubscription,
    updatePlan,

    // Utils
    clearError: () => setError(null),
  };
}

/**
 * Hook semplificato per controllo feature con Better Auth
 */
export function useBetterAuthFeature(flag: FeatureFlag) {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { betterAuth } = useSubscription();

  const checkFeature = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await betterAuth.hasFeatureBA(flag);
      setHasAccess(result);
      return result;
    } catch (err: any) {
      setError(err.message || "Failed to check feature access");
      setHasAccess(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, [betterAuth, flag]);

  return {
    hasAccess,
    loading,
    error,
    checkFeature,
    refresh: checkFeature,
  };
}

/**
 * Hook per confronto tra sistema legacy e Better Auth
 * Utile per debugging e migration
 */
export function useSubscriptionComparison() {
  const subscription = useSubscription();
  const [betterAuthData, setBetterAuthData] = useState<BetterAuthSubscriptionData | null>(null);
  const [loading, setLoading] = useState(false);

  const compare = useCallback(async () => {
    setLoading(true);
    try {
      const baData = await subscription.betterAuth.getSubscriptionInfo();
      setBetterAuthData(baData);

      return {
        legacy: {
          plan: subscription.plan,
          status: subscription.status,
          periodEnd: subscription.periodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        },
        betterAuth: baData,
        differences: {
          planMismatch: subscription.plan !== baData?.plan,
          statusMismatch: subscription.status !== baData?.status,
          periodMismatch: subscription.periodEnd?.getTime() !== baData?.currentPeriodEnd?.getTime(),
        },
      };
    } catch (error) {
      console.error("Comparison failed:", error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [subscription]);

  return {
    betterAuthData,
    loading,
    compare,
  };
}

export default useBetterAuthStripe;