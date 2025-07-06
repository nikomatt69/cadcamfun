import React from 'react';
import { GetServerSideProps } from 'next';

import Layout from '@/src/components/layout/Layout';
import { AdminFeatureFlagsPanel } from '@/src/components/admin/AdminFeatureFlagsPanel';
import { isAdminUser } from '@/src/lib/featureFlags/adminUtils';
import { useSession } from '@/src/lib/auth-client';
import { auth } from '@/src/lib/auth';
export default function AdminFeatureFlagsPage() {
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
  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          Feature Flags Administration
        </h1>
        <AdminFeatureFlagsPanel />
      </div>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await auth.api.getSession({
    headers: context.req.headers as any,
  });

  // Check if user is admin
  if (!session || !isAdminUser((session.user as any)?.email)) {
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    };
  }

  return {
    props: {},
  };
};