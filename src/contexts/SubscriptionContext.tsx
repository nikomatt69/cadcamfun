import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { PLAN_FEATURES, SUBSCRIPTION_PLANS } from 'src/lib/stripe';
import axios from 'axios';

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
  canAccess: (featureLevel: string) => boolean;
  createCheckoutSession: (priceId: string) => Promise<string | null>;
  createBillingPortalSession: () => Promise<string | null>;
  cancelSubscription: () => Promise<boolean>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const [plan, setPlan] = useState<string>(SUBSCRIPTION_PLANS.FREE);
  const [status, setStatus] = useState<string>('active');
  const [periodEnd, setPeriodEnd] = useState<Date | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load subscription data when session is available
  useEffect(() => {
    async function loadSubscriptionData() {
      if (sessionStatus === 'loading') return;
      if (!session) {
        setPlan(SUBSCRIPTION_PLANS.FREE);
        setStatus('active');
        setPeriodEnd(null);
        setCancelAtPeriodEnd(false);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const { data } = await axios.get('/api/subscriptions');
        setPlan(data.plan);
        setStatus(data.status);
        setPeriodEnd(data.periodEnd ? new Date(data.periodEnd) : null);
        setCancelAtPeriodEnd(data.cancelAtPeriodEnd);
      } catch (err: any) {
        setError(err.message || 'Failed to load subscription data');
        // Default to free plan on error
        setPlan(SUBSCRIPTION_PLANS.FREE);
      } finally {
        setIsLoading(false);
      }
    }

    loadSubscriptionData();
  }, [session, sessionStatus]);

  // Check if user can access a feature based on their plan
  const canAccess = (featureLevel: string) => {
    const plans = Object.keys(SUBSCRIPTION_PLANS);
    const userPlanIndex = plans.indexOf(plan);
    const featurePlanIndex = plans.indexOf(featureLevel);
    
    return userPlanIndex >= featurePlanIndex;
  };

  // Create a checkout session
  const createCheckoutSession = async (priceId: string): Promise<string | null> => {
    try {
      const { data } = await axios.post('/api/subscriptions', {
        priceId,
        successUrl: `${window.location.origin}/dashboard?subscription=success`,
        cancelUrl: `${window.location.origin}/settings/subscription?canceled=true`,
      });
      return data.url;
    } catch (err) {
      setError('Failed to create checkout session');
      return null;
    }
  };

  // Create a billing portal session
  const createBillingPortalSession = async (): Promise<string | null> => {
    try {
      const { data } = await axios.post('/api/subscriptions/portal', {
        returnUrl: `${window.location.origin}/settings/subscription`,
      });
      return data.url;
    } catch (err) {
      setError('Failed to create billing portal session');
      return null;
    }
  };

  // Cancel subscription
  const cancelSubscription = async (): Promise<boolean> => {
    try {
      await axios.delete('/api/subscriptions');
      setStatus('canceled');
      setCancelAtPeriodEnd(true);
      return true;
    } catch (err) {
      setError('Failed to cancel subscription');
      return false;
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
        canAccess,
        createCheckoutSession,
        createBillingPortalSession,
        cancelSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}