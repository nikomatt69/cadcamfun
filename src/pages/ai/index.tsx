import { useEffect } from 'react';
// Enterprise imports
import { logger, metrics } from '@/src/lib';
import { ErrorBoundary } from '@/src/components/ui/ErrorBoundary';
import { AIHub } from '@/src/components/ai/ai-new';

import Layout from '@/src/components/layout/Layout';
import MetaTags from '@/src/components/layout/Metatags';
import { useSession } from 'next-auth/react';
import router, { useRouter } from 'next/router';

// Enterprise imports
import { logger, metrics } from '@/src/lib';
import { ErrorBoundary } from '@/src/components/ui/ErrorBoundary';


function AIPanelPage() {
  const { data: session, status } = useSession();
  const router = useRouter(); 
  
  // Enterprise: Track AI page usage
  useEffect(() => {
    logger.info('AI Hub accessed', { 
      timestamp: new Date().toISOString() 
    });
    metrics.increment('page.views.ai');
  }, []);

  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  
  return (
    <>
    <MetaTags title="AI Hub" />
    <ErrorBoundary title="Something went wrong in AI Hub">
      <Layout>
        <div className="container mx-auto p-4">
          <h1 className="text-2xl font-bold mb-4">AI Hub</h1>
          <AIHub className="h-[80vh]" />
        </div>
      </Layout>
    </ErrorBoundary>
    </>
  );
}

export default AIPanelPage;
