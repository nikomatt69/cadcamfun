// src/pages/analytics/history.tsx
import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Layout from '@/src/components/layout/Layout';
import { ArrowLeft } from 'react-feather';
import Loading from '@/src/components/ui/Loading';
import Metatags from '@/src/components/layout/Metatags';
import { UserHistory } from '@/src/components/analytics/UserHistory';

export default function UserHistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading />
      </div>
    );
  }
  
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  
  return (
    <>
      <Metatags title="Your Activity History" />
      
      <Layout>
        <div className="px-4 py-6">
          <div className="flex items-center mb-6">
            <button
              onClick={() => router.back()}
              className="mr-4 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Your Complete Activity History
            </h1>
          </div>
          
          <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow rounded-lg p-6">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              This page shows all your activity across the platform. Use the filters to narrow down specific actions or time periods.
            </p>
            
            <UserHistory limit={50} />
          </div>
        </div>
      </Layout>
    </>
  );
}