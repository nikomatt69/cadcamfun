// src/pages/organizations/[id]/chat/new.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import Layout from '@/src/components/layout/Layout';
import Metatags from '@/src/components/layout/Metatags';
import ConversationList from '@/src/components/chat/ConversationList';
import NewConversation from '@/src/components/chat/NewConversation';

const NewDirectMessagePage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { id: organizationId } = router.query;
  const [isMobileView, setIsMobileView] = useState(false);
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  if (status === 'loading') {
    return (
      <Layout>
        <div className="flex h-screen items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </Layout>
    );
  }
  
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  
  if (!organizationId || typeof organizationId !== 'string') {
    return (
      <Layout>
        <div className="p-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Organizzazione non trovata</h1>
          <p className="text-gray-600 mb-6">L&apos;organizzazione che stai cercando non esiste o non hai accesso a essa.</p>
          <button
            onClick={() => router.push('/organizations')}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Torna alle organizzazioni
          </button>
        </div>
      </Layout>
    );
  }
  
  const handleBack = () => {
    router.push(`/organizations/${organizationId}/chat`);
  };
  
  return (
    <Layout>
      <Metatags title="Nuovo messaggio diretto" />
      
      <div className="p-4 h-[calc(100vh-64px)]">
        <div className="flex h-full gap-4">
          {/* Conversation List - Hidden on mobile */}
          {!isMobileView && (
            <div className="w-1/3">
              <ConversationList organizationId={organizationId} />
            </div>
          )}
          
          {/* New Conversation Form */}
          <div className={`${isMobileView ? 'w-full' : 'w-2/3'}`}>
            <NewConversation 
              organizationId={organizationId}
              isGroupChat={false}
              onBack={handleBack}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default NewDirectMessagePage;