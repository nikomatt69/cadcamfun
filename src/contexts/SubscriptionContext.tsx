import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useSession } from "@/src/lib/auth-client";
import { PLAN_FEATURES, SUBSCRIPTION_PLANS, hasAccess } from "@/src/lib/stripe";
import { FeatureFlag, SubscriptionFeatures } from "@/src/types/featureFlags";
import { featureFlagService } from "@/src/lib/featureFlags/featureFlagService";
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

  // Load subscription data when session is available
  useEffect(() => {
    async function loadSubscriptionData() {
      if (isPending) return;
      if (!session) {
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
        const { data } = await axios.get("/api/subscriptions");
        setPlan(data.plan);
        setStatus(data.status);
        setPeriodEnd(data.periodEnd ? new Date(data.periodEnd) : null);
        setCancelAtPeriodEnd(data.cancelAtPeriodEnd);

        // Handle trial end date
        if (data.status === 'trialing' && data.periodEnd) {
          setTrialEndDate(new Date(data.periodEnd));
        } else {
          setTrialEndDate(null);
        }
      } catch (err: any) {
        console.error("Failed to load subscription data:", err);
        setError(err.response?.data?.message || err.message || "Failed to load subscription data");
        setPlan(SUBSCRIPTION_PLANS.FREE);
        setStatus("active");
        setTrialEndDate(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadSubscriptionData();
  }, [session, isPending]);

  // Check if user can access a feature based on their plan
  const canAccess = (featureLevelPriceId: string) => {
    return hasAccess(plan, featureLevelPriceId);
  };

  // Create a Stripe checkout session
  const createCheckoutSession = async (priceId: string): Promise<void> => {
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
  };

  // Create a Stripe billing portal session
  const createBillingPortalSession = async (): Promise<void> => {
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
  };

  // Feature flag methods
  const hasFeature = (flag: FeatureFlag): boolean => {
    const result = featureFlagService.hasFeatureAccess(
      plan,
      flag,
      session?.user?.id,
      status,
      session?.user?.email || ""
    );
    return result.hasAccess;
  };

  const checkFeature = (flag: FeatureFlag) => {
    return featureFlagService.hasFeatureAccess(
      plan,
      flag,
      session?.user?.id,
      status,
      session?.user?.email || ""
    );
  };

  // Trial-related computed values
  const isOnTrial = status === 'trialing';
  const trialDaysLeft = trialEndDate ? Math.max(0, Math.ceil((trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;

  // Start trial method
  const startTrial = async (): Promise<void> => {
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
  };

  // Get features for current plan
  const features = PLAN_FEATURES[plan] || PLAN_FEATURES[SUBSCRIPTION_PLANS.FREE];

  return (
    <SubscriptionContext.Provider
      value={{
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
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}
