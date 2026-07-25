import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from "react";
import { useSession } from "@/src/lib/auth-client";
import { PLAN_FEATURES, SUBSCRIPTION_PLANS, hasAccess } from "@/src/lib/stripe";
import { FeatureFlag } from "@/src/types/featureFlags";
import { featureFlagService } from "@/src/lib/featureFlags/featureFlagService";
import { BetterAuthStripeService } from "@/src/lib/better-auth-stripe";
import { SubscriptionPlan } from "@/src/types/subscription";
import axios from "axios";

interface SubscriptionContextType {
  plan: string;
  status: string;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  isLoading: boolean;
  error: string | null;
  features: {
    name: string;
    price: string;
    features: string[];
    limits: {
      maxProjects: number;
      maxComponents: number;
      maxStorage: number;
    };
  };
  // Legacy feature access
  canAccess: (featureLevelPriceId: string) => boolean;
  // New feature flag methods
  hasFeature: (flag: FeatureFlag) => boolean;
  checkFeature: (flag: FeatureFlag) => any;
  // Trial information
  isOnTrial: boolean;
  trialDaysLeft: number | null;
  trialEndDate: Date | null;
  // Actions
  createCheckoutSession: (priceId: string) => Promise<void>;
  createBillingPortalSession: () => Promise<void>;
  startTrial: () => Promise<void>;
  
  // Better Auth Stripe Methods (NEW - NON-DESTRUCTIVE)
  betterAuth: {
    // Subscription info
    getSubscriptionInfo: () => Promise<any>;
    // Checkout with Better Auth
    createCheckoutSessionBA: (plan: string, options?: { trialDays?: number }) => Promise<void>;
    // Billing portal with Better Auth  
    createBillingPortalSessionBA: () => Promise<void>;
    // Feature access check with Better Auth
    hasFeatureBA: (flag: FeatureFlag) => Promise<boolean>;
    // Sync data between systems
    syncSubscriptionData: () => Promise<void>;
    // Cancel subscription
    cancelSubscription: () => Promise<boolean>;
    // Update subscription plan
    updateSubscriptionPlan: (newPlan: string) => Promise<boolean>;
  };
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return context;
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  // Better Auth session
  const { data: session, isPending } = useSession();

  const [plan, setPlan] = useState<string>(SUBSCRIPTION_PLANS.FREE);
  const [status, setStatus] = useState<string>("active");
  const [periodEnd, setPeriodEnd] = useState<Date | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [trialEndDate, setTrialEndDate] = useState<Date | null>(null);
  const sessionUserId = session?.user?.id;
  const sessionUserEmail = session?.user?.email || "";

  // Load subscription data when session is available - Using Better Auth Plugin
  useEffect(() => {
    async function loadSubscriptionData() {
      if (isPending) return;
      if (!sessionUserId) {
        setPlan(SUBSCRIPTION_PLANS.FREE);
        setStatus("active");
        setPeriodEnd(null);
        setCancelAtPeriodEnd(false);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        
        // Use Better Auth Stripe service directly
        const subscriptionInfo = await BetterAuthStripeService.getSubscriptionInfo(sessionUserId);
        
        if (subscriptionInfo) {
          setPlan(subscriptionInfo.plan);
          setStatus(subscriptionInfo.status);
          setPeriodEnd(subscriptionInfo.currentPeriodEnd);
          setCancelAtPeriodEnd(subscriptionInfo.cancelAtPeriodEnd);

          // Handle trial end date
          if (subscriptionInfo.status === 'trialing' && subscriptionInfo.currentPeriodEnd) {
            setTrialEndDate(subscriptionInfo.currentPeriodEnd);
          } else {
            setTrialEndDate(null);
          }
        } else {
          // No subscription found, set to free plan
          setPlan(SUBSCRIPTION_PLANS.FREE);
          setStatus("active");
          setPeriodEnd(null);
          setCancelAtPeriodEnd(false);
          setTrialEndDate(null);
        }
      } catch (err: any) {
        console.error("Failed to load subscription data from Better Auth:", err);
        setError(err.message || "Failed to load subscription data");
        setPlan(SUBSCRIPTION_PLANS.FREE);
        setStatus("active");
        setTrialEndDate(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadSubscriptionData();
  }, [sessionUserId, isPending]);

  // Check if user can access a feature based on their plan
  const canAccess = useCallback((featureLevelPriceId: string) => {
    return hasAccess(plan, featureLevelPriceId);
  }, [plan]);

  // Create a Stripe checkout session
  const createCheckoutSession = useCallback(async (priceId: string): Promise<void> => {
    console.log("Creating Stripe checkout for priceId:", priceId);
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ priceId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create checkout session");
      }

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (err: any) {
      console.error("Checkout session creation failed:", err);
      setError(err.message || "Failed to initiate checkout");
      setIsLoading(false);
    }
  }, []);

  // Create a Stripe billing portal session
  const createBillingPortalSession = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/subscriptions/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/settings/subscription`
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create billing portal session");
      }

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No portal URL received");
      }
    } catch (err: any) {
      console.error("Billing portal session creation failed:", err);
      setError(err.message || "Failed to access billing portal");
      setIsLoading(false);
    }
  }, []);

  // Feature flag methods
  const hasFeature = useCallback((flag: FeatureFlag): boolean => {
    const result = featureFlagService.hasFeatureAccess(
      plan,
      flag,
      sessionUserId,
      status,
      sessionUserEmail
    );
    return result.hasAccess;
  }, [plan, sessionUserEmail, sessionUserId, status]);

  const checkFeature = useCallback((flag: FeatureFlag) => {
    return featureFlagService.hasFeatureAccess(
      plan,
      flag,
      sessionUserId,
      status,
      sessionUserEmail
    );
  }, [plan, sessionUserEmail, sessionUserId, status]);

  // Trial-related computed values
  const isOnTrial = status === 'trialing';
  const trialDaysLeft = useMemo(
    () => trialEndDate ? Math.max(0, Math.ceil((trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null,
    [trialEndDate]
  );

  // Start trial method
  const startTrial = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          priceId: SUBSCRIPTION_PLANS.PRO,
          startTrial: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to start trial");
      }

      const data = await response.json();

      if (data.success) {
        // Reload subscription data
        const { data: subData } = await axios.get("/api/subscriptions");
        setPlan(subData.plan);
        setStatus(subData.status);
        setPeriodEnd(subData.periodEnd ? new Date(subData.periodEnd) : null);
        setTrialEndDate(subData.periodEnd ? new Date(subData.periodEnd) : null);
      }
    } catch (err: any) {
      console.error("Trial start failed:", err);
      setError(err.message || "Failed to start trial");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Better Auth Stripe Methods - Direct Integration with Plugin
  const getSubscriptionInfo = useCallback(async () => {
    try {
      return await BetterAuthStripeService.getSubscriptionInfo(sessionUserId || "");
    } catch (error) {
      console.error("Better Auth subscription info error:", error);
      throw error;
    }
  }, [sessionUserId]);

  const createCheckoutSessionBA = useCallback(async (plan: string, options?: { trialDays?: number }) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!sessionUserId) {
        throw new Error("User not authenticated");
      }

      const result = await BetterAuthStripeService.createCheckoutSession(
        sessionUserId,
        plan as SubscriptionPlan,
        {
          successUrl: `${window.location.origin}/settings/subscription?success=true`,
          cancelUrl: `${window.location.origin}/pricing?cancelled=true`,
          trialDays: options?.trialDays,
        }
      );

      if (result?.url) {
        window.location.href = result.url;
      } else {
        throw new Error("No checkout URL received from Better Auth");
      }
    } catch (err: any) {
      console.error("Better Auth checkout session creation failed:", err);
      setError(err.message || "Failed to create Better Auth checkout");
      setIsLoading(false);
    }
  }, [sessionUserId]);

  const createBillingPortalSessionBA = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!sessionUserId) {
        throw new Error("User not authenticated");
      }

      const result = await BetterAuthStripeService.createBillingPortalSession(
        sessionUserId,
        `${window.location.origin}/settings/subscription`
      );

      if (result?.url) {
        window.location.href = result.url;
      } else {
        throw new Error("No portal URL received from Better Auth");
      }
    } catch (err: any) {
      console.error("Better Auth billing portal session creation failed:", err);
      setError(err.message || "Failed to access Better Auth billing portal");
      setIsLoading(false);
    }
  }, [sessionUserId]);

  const hasFeatureBA = useCallback(async (flag: FeatureFlag): Promise<boolean> => {
    try {
      if (!sessionUserId) return false;
      return await BetterAuthStripeService.hasFeatureAccess(sessionUserId, flag);
    } catch (error) {
      console.error("Better Auth feature access check error:", error);
      return false;
    }
  }, [sessionUserId]);

  const syncSubscriptionData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!sessionUserId) {
        throw new Error("User not authenticated");
      }

      const syncResult = await BetterAuthStripeService.syncSubscriptionData(sessionUserId);

      if (syncResult) {
        // Reload subscription data from Better Auth
        const subscriptionInfo = await BetterAuthStripeService.getSubscriptionInfo(sessionUserId);
        if (subscriptionInfo) {
          setPlan(subscriptionInfo.plan);
          setStatus(subscriptionInfo.status);
          setPeriodEnd(subscriptionInfo.currentPeriodEnd);
          setCancelAtPeriodEnd(subscriptionInfo.cancelAtPeriodEnd);
        }
      }
    } catch (err: any) {
      console.error("Better Auth sync failed:", err);
      setError(err.message || "Failed to sync subscription data");
    } finally {
      setIsLoading(false);
    }
  }, [sessionUserId]);

  const cancelSubscription = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      if (!sessionUserId) {
        throw new Error("User not authenticated");
      }

      const result = await BetterAuthStripeService.cancelSubscription(sessionUserId);

      if (result) {
        // Refresh subscription data
        await syncSubscriptionData();
        return true;
      }
      return false;
    } catch (err: any) {
      console.error("Better Auth subscription cancellation failed:", err);
      setError(err.message || "Failed to cancel subscription");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [sessionUserId, syncSubscriptionData]);

  const updateSubscriptionPlan = useCallback(async (newPlan: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      if (!sessionUserId) {
        throw new Error("User not authenticated");
      }

      const result = await BetterAuthStripeService.updateSubscriptionPlan(
        sessionUserId,
        newPlan as SubscriptionPlan
      );

      if (result) {
        // Refresh subscription data
        await syncSubscriptionData();
        return true;
      }
      return false;
    } catch (err: any) {
      console.error("Better Auth subscription update failed:", err);
      setError(err.message || "Failed to update subscription");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [sessionUserId, syncSubscriptionData]);

  const betterAuthMethods = useMemo(() => ({
    getSubscriptionInfo,
    createCheckoutSessionBA,
    createBillingPortalSessionBA,
    hasFeatureBA,
    syncSubscriptionData,
    cancelSubscription,
    updateSubscriptionPlan,
  }), [
    getSubscriptionInfo,
    createCheckoutSessionBA,
    createBillingPortalSessionBA,
    hasFeatureBA,
    syncSubscriptionData,
    cancelSubscription,
    updateSubscriptionPlan,
  ]);

  // Get features for current plan
  const features = useMemo(
    () => PLAN_FEATURES[plan] || PLAN_FEATURES[SUBSCRIPTION_PLANS.FREE],
    [plan]
  );

  const value = useMemo<SubscriptionContextType>(() => ({
    plan,
    status,
    periodEnd,
    cancelAtPeriodEnd,
    isLoading,
    error,
    features,
    // Legacy feature access
    canAccess,
    // New feature flag methods
    hasFeature,
    checkFeature,
    // Trial information
    isOnTrial,
    trialDaysLeft,
    trialEndDate,
    // Actions
    createCheckoutSession,
    createBillingPortalSession,
    startTrial,

    // Better Auth Stripe Methods
    betterAuth: betterAuthMethods,
  }), [
    plan,
    status,
    periodEnd,
    cancelAtPeriodEnd,
    isLoading,
    error,
    features,
    canAccess,
    hasFeature,
    checkFeature,
    isOnTrial,
    trialDaysLeft,
    trialEndDate,
    createCheckoutSession,
    createBillingPortalSession,
    startTrial,
    betterAuthMethods,
  ]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}
