import React from 'react';
import { useSession } from 'next-auth/react';
import { useSubscription } from 'src/contexts/SubscriptionContext';
import { SUBSCRIPTION_PLANS, PLAN_FEATURES } from 'src/lib/stripe';

export default function PricingPlans() {
  const { data: session } = useSession();
  const { plan: currentPlan, createCheckoutSession, isLoading } = useSubscription();
  
  // Handle subscription button click
  const handleSubscribe = async (priceId: string) => {
    if (!session) {
      // Redirect to login page if not logged in
      window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(window.location.href)}`;
      return;
    }
    
    const checkoutUrl = await createCheckoutSession(priceId);
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    }
  };
  
  // Get plan keys excluding FREE
  const planKeys = Object.keys(SUBSCRIPTION_PLANS).filter(key => key !== 'FREE');
  
  return (
    <div className="bg-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">Subscription Plans</h2>
          <p className="mt-4 text-xl text-gray-600">
            Choose the right plan for your needs
          </p>
        </div>
        
        <div className="mt-12 space-y-12 lg:space-y-0 lg:grid lg:grid-cols-4 lg:gap-x-8">
          {/* Free plan */}
          <div className="relative p-8 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col">
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-900">{PLAN_FEATURES[SUBSCRIPTION_PLANS.FREE].name}</h3>
              <p className="mt-4 flex items-baseline text-gray-900">
                <span className="text-5xl font-extrabold tracking-tight">{PLAN_FEATURES[SUBSCRIPTION_PLANS.FREE].price}</span>
                <span className="ml-1 text-xl font-semibold">/month</span>
              </p>
              <p className="mt-6 text-gray-500">Get started with basic CAD functionality for free</p>
              
              <ul className="mt-6 space-y-4">
                {PLAN_FEATURES[SUBSCRIPTION_PLANS.FREE].features.map((feature) => (
                  <li key={feature} className="flex">
                    <svg className="flex-shrink-0 h-6 w-6 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="ml-3 text-gray-500">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <button
              disabled={currentPlan === SUBSCRIPTION_PLANS.FREE || isLoading}
              className={`mt-8 block w-full py-3 px-6 border border-transparent rounded-md shadow text-center text-white bg-gray-800 hover:bg-gray-900 ${(currentPlan === SUBSCRIPTION_PLANS.FREE || isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {currentPlan === SUBSCRIPTION_PLANS.FREE ? 'Current Plan' : 'Free Plan'}
            </button>
          </div>
          
          {/* Paid plans */}
          {planKeys.map((planKey) => {
            const planId = SUBSCRIPTION_PLANS[planKey as keyof typeof SUBSCRIPTION_PLANS];
            const planFeatures = PLAN_FEATURES[planId];
            const isCurrentPlan = currentPlan === planId;
            
            if (!planFeatures) return null;
            
            return (
              <div 
                key={planKey} 
                className={`relative p-8 bg-white border rounded-2xl shadow-sm flex flex-col ${
                  isCurrentPlan ? 'border-blue-500 ring-2 ring-blue-500' : 'border-gray-200'
                }`}
              >
                {isCurrentPlan && (
                  <div className="absolute top-0 right-0 bg-blue-500 text-white px-4 py-1 rounded-bl-2xl rounded-tr-2xl text-sm font-medium">
                    Current Plan
                  </div>
                )}
                
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900">{planFeatures.name}</h3>
                  <p className="mt-4 flex items-baseline text-gray-900">
                    <span className="text-5xl font-extrabold tracking-tight">{planFeatures.price}</span>
                    <span className="ml-1 text-xl font-semibold">/month</span>
                  </p>
                  <p className="mt-6 text-gray-500">
                    Perfect for {planKey === 'BASIC' ? 'individuals' : planKey === 'PRO' ? 'professionals' : 'teams'}
                  </p>
                  
                  <ul className="mt-6 space-y-4">
                    {planFeatures.features.map((feature: string) => (
                      <li key={feature} className="flex">
                        <svg className="flex-shrink-0 h-6 w-6 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="ml-3 text-gray-500">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <button
                  onClick={() => handleSubscribe(planId)}
                  disabled={isCurrentPlan || isLoading}
                  className={`mt-8 block w-full py-3 px-6 border border-transparent rounded-md shadow text-center text-white 
                    ${planKey === 'BASIC' ? 'bg-blue-600 hover:bg-blue-700' : 
                      planKey === 'PRO' ? 'bg-indigo-600 hover:bg-indigo-700' : 
                      'bg-purple-600 hover:bg-purple-700'} 
                    ${(isCurrentPlan || isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isCurrentPlan ? 'Current Plan' : 'Subscribe'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}