import Link from 'next/link';
import React, { useState } from 'react';
import { useSubscription } from 'src/contexts/SubscriptionContext';
import { SUBSCRIPTION_PLANS, PLAN_FEATURES } from 'src/lib/stripe';

export default function SubscriptionSettings() {
  const { 
    plan, 
    status, 
    periodEnd, 
    cancelAtPeriodEnd,
    isLoading,
    features,
    createBillingPortalSession,
    cancelSubscription 
  } = useSubscription();
  
  const [isCanceling, setIsCanceling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  
  // Format date for display
  const formattedPeriodEnd = periodEnd 
    ? new Date(periodEnd).toLocaleDateString('en-US', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      })
    : null;
  
  // Check if user has a paid plan
  const hasPaidPlan = plan !== SUBSCRIPTION_PLANS.FREE;
  
  // Handle manage billing button click
  const handleManageBilling = async () => {
    const portalUrl = await createBillingPortalSession();
    if (portalUrl) {
      window.location.href = portalUrl;
    }
  };
  
  // Handle cancel subscription button click
  const handleCancelSubscription = async () => {
    setIsCanceling(true);
    try {
      const success = await cancelSubscription();
      if (success) {
        setShowCancelConfirm(false);
      }
    } finally {
      setIsCanceling(false);
    }
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
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          Subscription
        </h3>
        
        <div className="mt-5 border-t border-gray-200 pt-5">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Current Plan</dt>
              <dd className="mt-1 text-sm text-gray-900">{features.name}</dd>
            </div>
            
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="mt-1 text-sm text-gray-900 capitalize">
                {cancelAtPeriodEnd ? 'Canceled' : status}
              </dd>
            </div>
            
            {hasPaidPlan && (
              <>
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">
                    {cancelAtPeriodEnd ? 'Access Until' : 'Next Billing Date'}
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formattedPeriodEnd || 'N/A'}
                  </dd>
                </div>
                
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">Price</dt>
                  <dd className="mt-1 text-sm text-gray-900">{features.price}/month</dd>
                </div>
              </>
            )}
            
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Features</dt>
              <dd className="mt-1 text-sm text-gray-900">
                <ul className="list-disc pl-5 space-y-1">
                  {features.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </dd>
            </div>
            
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Limits</dt>
              <dd className="mt-1 text-sm text-gray-900">
                <ul className="list-disc pl-5 space-y-1">
                  <li>Projects: {features.limits.maxProjects === -1 ? 'Unlimited' : features.limits.maxProjects}</li>
                  <li>Components: {features.limits.maxComponents === -1 ? 'Unlimited' : features.limits.maxComponents}</li>
                  <li>Storage: {features.limits.maxStorage / 1024} GB</li>
                </ul>
              </dd>
            </div>
          </dl>
        </div>
        
        <div className="mt-8 flex justify-end">
          {hasPaidPlan && (
            <>
              <button
                type="button"
                onClick={handleManageBilling}
                className="mr-4 inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Manage Billing
              </button>
              
              {!cancelAtPeriodEnd && (
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Cancel Subscription
                </button>
              )}
            </>
          )}
              
              {!hasPaidPlan && (
            <Link
              href="/pricing"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Upgrade Plan
            </Link>
          )}
        </div>
      </div>
      
      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            
            <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
              <div>
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                  <svg className="h-6 w-6 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="mt-3 text-center sm:mt-5">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Cancel Subscription?
                  </h3>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      You will lose access to premium features at the end of your billing period on {formattedPeriodEnd}.
                      Your account will automatically downgrade to the free plan. Are you sure you want to cancel?
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                <button
                  type="button"
                  onClick={handleCancelSubscription}
                  disabled={isCanceling}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:col-start-2 sm:text-sm"
                >
                  {isCanceling ? 'Canceling...' : 'Yes, Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:col-start-1 sm:text-sm"
                >
                  Keep Subscription
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}