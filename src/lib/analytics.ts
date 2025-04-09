// src/lib/analytics.ts
import ReactGA from 'react-ga4';

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';

export const initGA = () => {
  if (GA_MEASUREMENT_ID && typeof window !== 'undefined') {
    ReactGA.initialize(GA_MEASUREMENT_ID, {
      gtagOptions: {
        send_page_view: false // We'll handle this manually for better control
      }
    });
  }
};

export const logPageView = (path: string) => {
  if (typeof window !== 'undefined') {
    ReactGA.send({
      hitType: 'pageview',
      page: path
    });
  }
};

export const logEvent = (category: string, action: string, label?: string, value?: number) => {
  if (typeof window !== 'undefined') {
    ReactGA.event({
      category,
      action,
      label,
      value
    });
  }
};

export const logSubscriptionEvent = (action: string, planName: string, value?: number) => {
  logEvent('Subscription', action, planName, value);
};

export const logFeatureUsage = (featureName: string, metadata?: Record<string, any>) => {
  logEvent('Feature', 'Use', featureName);
  
  // Send additional metadata as custom dimensions if available
  if (metadata) {
    ReactGA.gtag('event', 'feature_use', {
      feature_name: featureName,
      ...metadata
    });
  }
};