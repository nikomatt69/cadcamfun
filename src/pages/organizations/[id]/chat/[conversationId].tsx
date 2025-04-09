// src/pages/organizations/[id]/chat/[conversationId].tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import Layout from '@/src/components/layout/Layout';
import Metatags from '@/src/components/layout/Metatags';
import ConversationList from 'src/components/chat/ConversationList';
import ConversationDetail from 'src/components/chat/ConversationDetail';
import useChatStore from '@/src/store/chatStore';

const ConversationPage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { id: organizationId, conversationId } = router.query;
  const [isMobileView, setIsMobileView] = useState(false);
  const [showConversationList, setShowConversationList] = useState(false);
  const { activeConversation } = useChatStore();
  
  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      setIsMobileView(isMobile);
      setShowConversationList(!isMobile);
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
  
  if (!organizationId || typeof organizationId !== 'string' || 
      !conversationId || typeof conversationId !== 'string') {
    return (
      <Layout>
        <div className="p-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Conversazione non trovata</h1>
          <p className="text-gray-600 mb-6">La conversazione che stai cercando non esiste o non hai accesso a essa.</p>
          <button
            onClick={() => router.push(`/organizations/${organizationId}/chat`)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Torna alla chat
          </button>
        </div>
      </Layout>
    );
  }
  
  const handleBackToList = () => {
    if (isMobileView) {
      router.push(`/organizations/${organizationId}/chat`);
    } else {
      setShowConversationList(true);
    }
  };
  
  return (
    <Layout>
      <Metatags title={activeConversation?.name || 'Chat della conversazione'} />
      
      <div className="p-4 h-[calc(100vh-84px)]">
        <div className="flex h-full gap-4">
          {/* Conversation List - Hidden on mobile when viewing a conversation */}
          {(!isMobileView || showConversationList) && (
            <div className={`${isMobileView ? 'w-full' : 'w-1/3'}`}>
              <ConversationList organizationId={organizationId} />
            </div>
          )}
          
          {/* Conversation Detail */}
          {(!isMobileView || !showConversationList) && (
            <div className={`${isMobileView ? 'w-full' : 'w-2/3'}`}>
              <ConversationDetail 
                conversationId={conversationId}
                organizationId={organizationId}
                onBack={handleBackToList}
              />
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default ConversationPage;