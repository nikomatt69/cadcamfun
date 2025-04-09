import { AIHub } from '@/src/components/ai/ai-new';

import Layout from '@/src/components/layout/Layout';
import MetaTags from '@/src/components/layout/Metatags';
import { useSession } from 'next-auth/react';
import router, { useRouter } from 'next/router';


function AIPanelPage() {
  const { data: session, status } = useSession();
  const router = useRouter(); 
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  return (
    <>
    <MetaTags title="AI Hub" />
    <Layout>
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">AI Hub</h1>
      <AIHub className="h-[80vh]" />
     
    </div>
    </Layout>
    </>
  );
}

export default AIPanelPage;