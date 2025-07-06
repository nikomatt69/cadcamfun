import { NextApiRequest, NextApiResponse } from "next";

// Check if we're in desktop mode (Tauri) or development
const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP === 'true';
const isDevelopment = process.env.NODE_ENV === 'development';
const isExport = process.env.NEXT_EXPORT === 'true';

// Provide fallback values for desktop/development builds
const fallbackPriceId = 'price_fallback_desktop';

export const config = {
  stripe: {
    freePlanId: process.env.NEXT_PUBLIC_STRIPE_FREE_PRICE_ID || (isDesktop || isDevelopment || isExport ? fallbackPriceId : undefined),
    basicPlanId: process.env.NEXT_PUBLIC_STRIPE_BASIC_PRICE_ID || (isDesktop || isDevelopment || isExport ? fallbackPriceId : undefined),
    proPlanId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || (isDesktop || isDevelopment || isExport ? fallbackPriceId : undefined),
    enterprisePlanId: process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID || (isDesktop || isDevelopment || isExport ? fallbackPriceId : undefined),
  },
} as const;

// Only validate Stripe configuration in production web builds
const shouldValidateStripe = !isDesktop && !isDevelopment && !isExport && process.env.NODE_ENV === 'production';

if (shouldValidateStripe) {
  if (!config.stripe.freePlanId) {
    throw new Error(
      "Stripe Free Price ID is not defined. Please set NEXT_PUBLIC_STRIPE_FREE_PRICE_ID in your environment variables."
    );
  }
  if (!config.stripe.basicPlanId) {
    throw new Error(
      "Stripe Basic Price ID is not defined. Please set NEXT_PUBLIC_STRIPE_BASIC_PRICE_ID in your environment variables."
    );
  }
  if (!config.stripe.proPlanId) {
    throw new Error(
      "Stripe Pro Price ID is not defined. Please set NEXT_PUBLIC_STRIPE_PRO_PRICE_ID in your environment variables."
    );
  }
  if (!config.stripe.enterprisePlanId) {
    throw new Error(
      "Stripe Enterprise Price ID is not defined. Please set NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID in your environment variables."
    );
  }
} else {
  console.log('ℹ️ Stripe validation skipped for desktop/development build');
}

// Price IDs for your subscription plans - Use PUBLIC Price IDs here for client-side reference if needed
export const SUBSCRIPTION_PLANS = {
  FREE: config.stripe.freePlanId!,
  BASIC: config.stripe.basicPlanId!,
  PRO: config.stripe.proPlanId!,
  ENTERPRISE: config.stripe.enterprisePlanId!,
};

// Features available in each plan
export const PLAN_FEATURES = {
  [SUBSCRIPTION_PLANS.FREE]: {
    name: "Free",
    price: "$0",
    features: [
      "Basic CAD functionality",
      "2 projects",
      "Limited components",
      "Community support",
    ],
    limits: {
      maxProjects: 2,
      maxComponents: 10,
      maxStorage: 100, // MB
    },
  },
  [SUBSCRIPTION_PLANS.BASIC]: {
    name: "Basic",
    price: "$9.99",
    features: [
      "Full CAD functionality",
      "10 projects",
      "Unlimited components",
      "Email support",
      "1GB storage",
    ],
    limits: {
      maxProjects: 10,
      maxComponents: 100,
      maxStorage: 1024, // MB
    },
  },
  [SUBSCRIPTION_PLANS.PRO]: {
    name: "Professional",
    price: "$49.99",
    features: [
      "Full CAD/CAM functionality",
      "Unlimited projects",
      "Advanced AI assistance",
      "Priority support",
      "10GB storage",
    ],
    limits: {
      maxProjects: 50,
      maxComponents: 1000,
      maxStorage: 5120, // MB
    },
  },
  [SUBSCRIPTION_PLANS.ENTERPRISE]: {
    name: "Enterprise",
    price: "$100.00",
    features: [
      "Full CAD/CAM functionality",
      "Unlimited projects",
      "Advanced AI assistance",
      "Priority support",
      "10GB storage",
    ],
    limits: {
      maxProjects: 100,
      maxComponents: 5000,
      maxStorage: 10240, // MB
    },
  },
};

// Helper function to get plan by price ID
export function getPlanByPriceId(priceId: string) {
  const entry = Object.entries(SUBSCRIPTION_PLANS).find(
    ([_, id]) => id === priceId
  );
  return entry ? entry[0] : null;
}

// Helper function to check if user has access to a feature
export function hasAccess(userPlan: string, featureLevel: string) {
  const plans = Object.keys(SUBSCRIPTION_PLANS);
  const userPlanIndex = plans.indexOf(userPlan);
  const featurePlanIndex = plans.indexOf(featureLevel);

  return userPlanIndex >= featurePlanIndex;
}
