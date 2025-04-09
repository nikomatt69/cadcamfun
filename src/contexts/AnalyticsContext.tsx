// src/contexts/AnalyticsContext.tsx
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/router';
import { initGA, logPageView, logEvent, logSubscriptionEvent, logFeatureUsage } from 'src/lib/analytics';
import { useSession } from 'next-auth/react';
import ReactGA from 'react-ga4';

interface AnalyticsContextType {
  logEvent: (category: string, action: string, label?: string, value?: number) => void;
  logSubscriptionEvent: (action: string, planName: string, value?: number) => void;
  logFeatureUsage: (featureName: string, metadata?: Record<string, any>) => void;
  consentGiven: boolean;
  setConsentGiven: (consent: boolean) => void;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [consentGiven, setConsentGiven] = useState<boolean>(false);

  // Initialize GA when the component mounts
  useEffect(() => {
    // Check for previously saved consent
    const savedConsent = localStorage.getItem('analytics-consent');
    if (savedConsent === 'true') {
      setConsentGiven(true);
    }
  }, []);

  // Setup GA when consent is given
  useEffect(() => {
    if (consentGiven) {
      localStorage.setItem('analytics-consent', 'true');
      initGA();
      
      // Set initial page view
      logPageView(router.pathname);

      // Set user ID for authenticated users (anonymous by default)
      if (session?.user?.id) {
        ReactGA.gtag('config', process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!, {
          user_id: session.user.id,
        });
      }
    }
  }, [consentGiven, session]);

  // Track route changes
  useEffect(() => {
    if (!consentGiven) return;

    const handleRouteChange = (url: string) => {
      logPageView(url);
    };

    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router, consentGiven]);

  return (
    <AnalyticsContext.Provider
      value={{
        logEvent,
        logSubscriptionEvent,
        logFeatureUsage,
        consentGiven,
        setConsentGiven
      }}
    >
      {children}
    </AnalyticsContext.Provider>
  );
}