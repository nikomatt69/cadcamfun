import React from 'react';
import { useRouter } from 'next/router';
import Layout from '@/src/components/layout/Layout';
import { SellerDashboard } from '@/src/components/marketplace/SellerDashboard';
import { useSession } from '@/src/lib/auth-client';
export default function SellerDashboardPage() {

  const router = useRouter();
  const { data: session } = useSession();
  if (!session) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  if (!session) {
    router.push('/auth/signin');
    return null;
  }

  return (
    <Layout>
      <SellerDashboard />
    </Layout>
  );
} 