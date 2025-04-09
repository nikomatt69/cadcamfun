import React, { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { SubscriptionProvider } from 'src/contexts/SubscriptionContext';
import SubscriptionSettings from 'src/components/subscription/SubscriptionSettings';
import Navbar from 'src/components/layout/Navbar';
import Footer from 'src/components/ui/Footer';
import { useToast } from 'src/contexts/ToastContext';

export default function SubscriptionSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { showToast } = useToast();
  
  // Check if user is authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin?callbackUrl=/settings/subscription');
    }
  }, [status, router]);
  
  // Handle URL parameters
  useEffect(() => {
    const { canceled, success } = router.query;
    
    if (canceled === 'true') {
      showToast('Subscription update canceled', 'info');
    }
    
    if (success === 'true') {
      showToast('Subscription updated successfully', 'success');
    }
  }, [router.query, showToast]);
  
  // Show loading state while session is loading
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  // Redirect if not authenticated
  if (status === 'unauthenticated') {
    return null;
  }
  
  return (
    <SubscriptionProvider>
      <div className="min-h-screen flex flex-col">
        <Head>
          <title>Subscription Settings | CAD/CAM FUN</title>
          <meta name="description" content="Manage your subscription settings" />
        </Head>
        
        <Navbar />
        
        <main className="flex-grow py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="md:flex md:items-center md:justify-between md:space-x-5">
              <div className="flex items-start space-x-5">
                <div className="pt-1.5">
                  <h1 className="text-2xl font-bold text-gray-900">Subscription Settings</h1>
                  <p className="text-sm font-medium text-gray-500">
                    Manage your subscription plan and billing details
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse justify-stretch space-y-4 space-y-reverse sm:flex-row-reverse sm:justify-end sm:space-x-reverse sm:space-y-0 sm:space-x-3 md:mt-0 md:flex-row md:space-x-3">
                <a
                  href="/pricing"
                  className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  View Plans
                </a>
              </div>
            </div>
            
            <div className="mt-8 max-w-3xl mx-auto grid grid-cols-1 gap-6 sm:px-6 lg:max-w-7xl lg:grid-flow-col-dense lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-3">
                <SubscriptionSettings />
                
                <div className="bg-white shadow sm:rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      Need help with your subscription?
                    </h3>
                    <div className="mt-2 max-w-xl text-sm text-gray-500">
                      <p>
                        If you have any questions or need assistance with your subscription,
                        please contact our support team.
                      </p>
                    </div>
                    <div className="mt-5">
                      <a
                        href="mailto:support@cadcamfun.com"
                        className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        Contact Support
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
        
        <Footer />
      </div>
    </SubscriptionProvider>
  );
}