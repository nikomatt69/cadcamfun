import React from "react";
import { useSession } from "@/src/lib/auth-client";
import { useSubscription } from "@/src/contexts/SubscriptionContext";
import { SUBSCRIPTION_PLANS, PLAN_FEATURES } from "@/src/lib/stripe";
import { useRouter } from "next/router";
import { Clock, Shield, Star } from "react-feather";
import { Crown } from "lucide-react";


export default function PricingPlans() {
  const { data: session } = useSession();
  const {
    plan: currentPlan,
    status: subscriptionStatus,
    isOnTrial,
    trialDaysLeft,
    trialEndDate,
    createCheckoutSession,
    isLoading,
    startTrial,
    betterAuth
  } = useSubscription();
  const router = useRouter();
  const [processingPlan, setProcessingPlan] = React.useState<string | null>(null);

  // Handle subscription button click
  const handleSubscribe = async (priceId: string, useTrial: boolean = false) => {
    if (!session) {
      // Redirect to login page if not logged in
      window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(window.location.href)}`;
      return;
    }

    try {
      setProcessingPlan(priceId);

      if (useTrial) {
        // Use Better Auth Stripe service for trial - with 14 day trial for Pro plan
        await betterAuth.createCheckoutSessionBA(priceId, { trialDays: 14 });
      } else {
        // Use Better Auth Stripe service for regular checkout
        await betterAuth.createCheckoutSessionBA(priceId);
      }
    } catch (error) {
      console.error("Error handling subscription:", error);
      alert("An error occurred. Please try again later.");
    } finally {
      setProcessingPlan(null);
    }
  };

  // Helper function to get current plan status
  const getCurrentPlanStatus = (planPriceId: string) => {
    const isCurrentPlan = currentPlan === planPriceId;
    const isCurrentTrialPlan = isOnTrial && currentPlan === planPriceId;

    return {
      isCurrentPlan,
      isCurrentTrialPlan,
      label: isCurrentTrialPlan
        ? `Trial (${trialDaysLeft} days left)`
        : isCurrentPlan
          ? 'Current Plan'
          : null
    };
  };

  // Check if user can start trial (not already trialed or currently on trial)
  const canStartTrial = !isOnTrial && subscriptionStatus !== 'expired' && currentPlan === SUBSCRIPTION_PLANS.FREE;

  // Define paid plans manually to ensure they always display
  const paidPlans = [
    { key: "BASIC", priceId: SUBSCRIPTION_PLANS.BASIC, color: "blue", showTrial: false, icon: Shield },
    { key: "PRO", priceId: SUBSCRIPTION_PLANS.PRO, color: "indigo", showTrial: canStartTrial, icon: Star },
    { key: "ENTERPRISE", priceId: SUBSCRIPTION_PLANS.ENTERPRISE, color: "purple", showTrial: false, icon: Crown }
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">Subscription Plans</h2>
          <p className="mt-4 text-xl text-gray-600 dark:text-gray-400">Choose the right plan for your needs</p>

          {/* Current Plan Status */}
          {session && (
            <div className="mt-6 inline-flex items-center px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
              <div className="flex items-center space-x-2">
                {isOnTrial ? (
                  <>
                    <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      Trial: {PLAN_FEATURES[currentPlan]?.name} ({trialDaysLeft} days left)
                    </span>
                  </>
                ) : (
                  <>
                    <Star className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      Current: {PLAN_FEATURES[currentPlan]?.name || 'Free'}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-12 space-y-12 lg:space-y-0 lg:grid lg:grid-cols-4 lg:gap-x-8">
          {/* Free plan */}
          <div className={`relative p-8 bg-white dark:bg-gray-800 border rounded-2xl shadow-sm flex flex-col ${currentPlan === SUBSCRIPTION_PLANS.FREE && !isOnTrial
            ? "border-blue-500 ring-2 ring-blue-500"
            : "border-gray-200 dark:border-gray-700"
            }`}>
            {currentPlan === SUBSCRIPTION_PLANS.FREE && !isOnTrial && (
              <div className="absolute top-0 right-0 bg-blue-500 text-white px-4 py-1 rounded-bl-2xl rounded-tr-2xl text-sm font-medium">
                Current Plan
              </div>
            )}

            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {PLAN_FEATURES[SUBSCRIPTION_PLANS.FREE]?.name}
                </h3>
              </div>
              <p className="mt-4 flex items-baseline text-gray-900 dark:text-white">
                <span className="text-5xl font-extrabold tracking-tight">
                  {PLAN_FEATURES[SUBSCRIPTION_PLANS.FREE]?.price}
                </span>
                <span className="ml-1 text-xl font-semibold">/month</span>
              </p>
              <p className="mt-6 text-gray-500 dark:text-gray-400">Get started with basic CAD functionality for free</p>

              <ul className="mt-6 space-y-4">
                {PLAN_FEATURES[SUBSCRIPTION_PLANS.FREE]?.features.map((feature: string) => (
                  <li key={feature} className="flex">
                    <svg
                      className="flex-shrink-0 h-6 w-6 text-green-500"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="ml-3 text-gray-500 dark:text-gray-400">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              disabled={currentPlan === SUBSCRIPTION_PLANS.FREE && !isOnTrial}
              className={`mt-8 block w-full py-3 px-6 border border-transparent rounded-md shadow text-center text-white bg-gray-800 hover:bg-gray-900 ${(currentPlan === SUBSCRIPTION_PLANS.FREE && !isOnTrial) || isLoading
                ? "opacity-50 cursor-not-allowed"
                : ""
                }`}
            >
              {currentPlan === SUBSCRIPTION_PLANS.FREE && !isOnTrial ? "Current Plan" : "Free Plan"}
            </button>
          </div>

          {/* Paid plans */}
          {paidPlans.map(({ key, priceId, color, showTrial, icon: Icon }) => {
            if (!priceId) return null;

            const planFeatures = PLAN_FEATURES[priceId];
            const planStatus = getCurrentPlanStatus(priceId);
            const isProcessing = processingPlan === priceId;

            if (!planFeatures) return null;

            const buttonColorClass =
              color === "blue"
                ? "bg-blue-600 hover:bg-blue-700"
                : color === "indigo"
                  ? "bg-indigo-600 hover:bg-indigo-700"
                  : "bg-purple-600 hover:bg-purple-700";

            const isDisabled = planStatus.isCurrentPlan || isLoading || isProcessing;

            return (
              <div
                key={key}
                className={`relative p-8 bg-white dark:bg-gray-800 border rounded-2xl shadow-sm flex flex-col ${planStatus.isCurrentPlan || planStatus.isCurrentTrialPlan
                  ? "border-blue-500 ring-2 ring-blue-500"
                  : "border-gray-200 dark:border-gray-700"
                  }`}
              >
                {planStatus.label && (
                  <div className={`absolute top-0 right-0 px-4 py-1 rounded-bl-2xl rounded-tr-2xl text-sm font-medium text-white ${planStatus.isCurrentTrialPlan ? "bg-green-500" : "bg-blue-500"
                    }`}>
                    {planStatus.label}
                  </div>
                )}

                {showTrial && !planStatus.isCurrentPlan && (
                  <div className="absolute top-0 left-0 bg-green-500 text-white px-4 py-1 rounded-br-2xl rounded-tl-2xl text-sm font-medium">
                    7-Day Free Trial
                  </div>
                )}

                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <Icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{planFeatures.name}</h3>
                  </div>
                  <p className="mt-4 flex items-baseline text-gray-900 dark:text-white">
                    <span className="text-2xl font-extrabold tracking-tight">{planFeatures.price}</span>
                    <span className="ml-1 text-xl font-semibold">/month</span>
                  </p>
                  <p className="mt-6 text-gray-500 dark:text-gray-400">
                    Perfect for {key === "BASIC" ? "individuals" : key === "PRO" ? "professionals" : "teams"}
                    {showTrial && !planStatus.isCurrentPlan && (
                      <span className="block mt-1 text-green-500 font-medium">Start with a 7-day free trial</span>
                    )}
                  </p>

                  <ul className="mt-6 space-y-4">
                    {planFeatures.features.map((feature: string) => (
                      <li key={feature} className="flex">
                        <svg
                          className="flex-shrink-0 h-6 w-6 text-green-500"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="ml-3 text-gray-500 dark:text-gray-400">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => handleSubscribe(priceId, showTrial)}
                  disabled={isDisabled}
                  className={`mt-8 block w-full py-3 px-6 border border-transparent rounded-md shadow text-center text-white 
                    ${buttonColorClass}
                    ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {planStatus.isCurrentPlan || planStatus.isCurrentTrialPlan
                    ? planStatus.label
                    : isProcessing
                      ? "Processing..."
                      : showTrial
                        ? "Start Free Trial"
                        : "Subscribe"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
