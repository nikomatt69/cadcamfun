import React from 'react';
import Head from 'next/head';
import { useSession } from 'next-auth/react';
import { SubscriptionProvider } from 'src/contexts/SubscriptionContext';
import PricingPlans from 'src/components/subscription/PricingPlans';
import Navbar from 'src/components/layout/Navbar';
import Footer from 'src/components/ui/Footer';
import { useRouter } from 'next/router';

export default function PricingPage() {
  const { data: session, status } = useSession();
  const router = useRouter(); 
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  
  return (
    <SubscriptionProvider>
      <div className="min-h-screen flex flex-col">
        <Head>
          <title>Pricing Plans | CAD/CAM FUN</title>
         
        </Head>
        
        <Navbar />
        
        <main className="flex-grow">
          <div className="bg-gradient-to-b from-blue-50 to-white py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center">
                <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight lg:text-6xl">
                  Simple, Transparent Pricing
                </h1>
                <p className="mt-5 max-w-xl mx-auto text-xl text-gray-500">
                  Choose the plan thats right for you and get started with CAD/CAM FUN today.
                </p>
              </div>
            </div>
          </div>
          
          <PricingPlans />
          
          <div className="bg-white py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="lg:text-center">
                <h2 className="text-base text-blue-600 font-semibold tracking-wide uppercase">
                  Frequently Asked Questions
                </h2>
                <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                  Common Questions About Our Plans
                </p>
              </div>
              
              <div className="mt-10">
                <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-10">
                  <div>
                    <dt className="text-lg leading-6 font-medium text-gray-900">
                      Can I switch plans?
                    </dt>
                    <dd className="mt-2 text-base text-gray-500">
                      Yes, you can upgrade or downgrade your plan at any time. If you upgrade, you ll be charged the prorated amount for the remainder of your billing cycle. If you downgrade, the change will take effect at the end of your current billing cycle.
                    </dd>
                  </div>
                  
                  <div>
                    <dt className="text-lg leading-6 font-medium text-gray-900">
                      How do project and component limits work?
                    </dt>
                    <dd className="mt-2 text-base text-gray-500">
                      Each plan has a limit on the number of projects and components you can create. Once you reach the limit, you ll need to upgrade your plan or delete existing projects/components to create new ones.
                    </dd>
                  </div>
                  
                  <div>
                    <dt className="text-lg leading-6 font-medium text-gray-900">
                      Is there a free trial?
                    </dt>
                    <dd className="mt-2 text-base text-gray-500">
                      We offer a 14-day free trial of the Pro plan for all new users. After the trial period, you can choose to subscribe to a paid plan or continue with the free plan.
                    </dd>
                  </div>
                  
                  <div>
                    <dt className="text-lg leading-6 font-medium text-gray-900">
                      How can I cancel my subscription?
                    </dt>
                    <dd className="mt-2 text-base text-gray-500">
                      You can cancel your subscription at any time from your account settings. If you cancel, you ll continue to have access to your paid features until the end of your current billing cycle, after which you ll be downgraded to the free plan.
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </main>
        
        <Footer />
      </div>
    </SubscriptionProvider>
  );
}