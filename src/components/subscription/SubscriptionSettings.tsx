import Link from "next/link";
import React from "react";
import { useSubscription } from "@/src/contexts/SubscriptionContext";
import { SUBSCRIPTION_PLANS } from "@/src/lib/stripe";
import { Clock, Shield, Star } from "react-feather";
import { Crown, AlertTriangle } from "lucide-react";

export default function SubscriptionSettings() {
  const {
    plan,
    status,
    periodEnd,
    cancelAtPeriodEnd,
    isLoading,
    features,
    isOnTrial,
    trialDaysLeft,
    trialEndDate,
    createBillingPortalSession
  } = useSubscription();

  // Format date for display
  const formattedPeriodEnd = periodEnd
    ? new Date(periodEnd).toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric"
    })
    : null;

  const formattedTrialEnd = trialEndDate
    ? new Date(trialEndDate).toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric"
    })
    : null;

  // New logic for button visibility
  const isOnActualFreePlan = plan === SUBSCRIPTION_PLANS.FREE && !isOnTrial;
  const showUpgradeLink = isOnActualFreePlan || isOnTrial;
  const showManageBillingButton = plan !== SUBSCRIPTION_PLANS.FREE && !isOnTrial;

  // Get plan icon
  const getPlanIcon = () => {
    if (plan === SUBSCRIPTION_PLANS.FREE) return Shield;
    if (plan === SUBSCRIPTION_PLANS.BASIC) return Shield;
    if (plan === SUBSCRIPTION_PLANS.PRO) return Star;
    if (plan === SUBSCRIPTION_PLANS.ENTERPRISE) return Crown;
    return Shield;
  };

  const PlanIcon = getPlanIcon();

  // Handle manage billing button click
  const handleManageBilling = async () => {
    await createBillingPortalSession();
  };

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center space-x-3 mb-6">
          <PlanIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">Subscription</h3>
        </div>

        {/* Trial Warning Banner */}
        {isOnTrial && trialDaysLeft !== null && trialDaysLeft <= 3 && (
          <div className="mb-6 p-4 rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Your trial expires in {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''}
              </p>
            </div>
            <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
              Upgrade now to continue enjoying Pro features.
            </p>
          </div>
        )}

        <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Current Plan</dt>
              <dd className="mt-1 flex items-center space-x-2">
                <span className="text-sm text-gray-900 dark:text-white font-medium">{features?.name || "Free"}</span>
                {isOnTrial && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                    <Clock className="w-3 h-3 mr-1" />
                    Trial
                  </span>
                )}
              </dd>
            </div>

            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
              <dd className="mt-1 text-sm text-gray-900 capitalize dark:text-gray-400">
                {cancelAtPeriodEnd ? "Cancelled" : status}
              </dd>
            </div>

            {isOnTrial && trialEndDate && (
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Trial Ends</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-400">
                  {formattedTrialEnd} ({trialDaysLeft} days left)
                </dd>
              </div>
            )}

            {!isOnTrial && plan !== SUBSCRIPTION_PLANS.FREE && periodEnd && (
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Next Billing</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-400">{formattedPeriodEnd}</dd>
              </div>
            )}

            {plan !== SUBSCRIPTION_PLANS.FREE && features?.price && (
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Price</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-400">{features.price}/month</dd>
              </div>
            )}

            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Features</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-400">
                <ul className="list-disc pl-5 space-y-1">
                  {features.features.map(feature => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Limits</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-400">
                <ul className="list-disc pl-5 space-y-1">
                  <li>Projects: {features.limits.maxProjects === -1 ? "Unlimited" : features.limits.maxProjects}</li>
                  <li>
                    Components: {features.limits.maxComponents === -1 ? "Unlimited" : features.limits.maxComponents}
                  </li>
                  <li>Storage: {features.limits.maxStorage / 1024} GB</li>
                </ul>
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row sm:justify-end space-y-3 sm:space-y-0 sm:space-x-3">
          {showManageBillingButton && (
            <button
              type="button"
              onClick={handleManageBilling}
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-700 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Manage Billing
            </button>
          )}

          {showUpgradeLink && (
            <Link
              href="/pricing"
              className={`inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${isOnTrial
                  ? "bg-green-600 hover:bg-green-700 focus:ring-green-500"
                  : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
                }`}
            >
              {isOnTrial ? "Upgrade Now" : "Upgrade Plan"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
