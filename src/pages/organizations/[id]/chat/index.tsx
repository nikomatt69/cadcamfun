// src/pages/organizations/[id]/chat/index.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import Layout from '@/src/components/layout/Layout';
import Metatags from '@/src/components/layout/Metatags';
import ConversationList from '@/src/components/chat/ConversationList';
import ConversationDetail from '@/src/components/chat/ConversationDetail';
import useChatStore from '@/src/store/chatStore';

const OrganizationChatPage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { id: organizationId } = router.query;
  const [isMobileView, setIsMobileView] = useState(false);
  const [showConversationList, setShowConversationList] = useState(true);
  const { clearActiveConversation } = useChatStore();
  
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
  
  useEffect(() => {
    // Clear active conversation when navigating away
    return () => {
      clearActiveConversation();
    };
  }, [clearActiveConversation]);
  
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
  
  return (
    <Layout>
      <Metatags title="Chat dell'organizzazione" />
      
      <div className="p-4 h-[calc(100vh-74px)]">
        <div className="flex items-center mb-4">
          <MessageCircle className="h-6 w-6 mr-2 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Chat dell&apos;organizzazione</h1>
        </div>
        
        <div className="flex h-[calc(100%-3rem)] gap-4">
          {/* Conversation List */}
          {(!isMobileView || showConversationList) && (
            <div className={`${isMobileView ? 'w-full' : 'w-1/3'}`}>
              <ConversationList organizationId={organizationId} />
            </div>
          )}
          
          {/* Conversation Detail */}
          {(!isMobileView || !showConversationList) && (
            <div className={`${isMobileView ? 'w-full' : 'w-2/3'}`}>
              <div className="h-full bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4" />
                  <h2 className="text-xl font-medium mb-2">Seleziona una conversazione</h2>
                  <p className="text-sm">
                    Scegli una chat dall&apos;elenco o inizia una nuova conversazione
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default OrganizationChatPage;

// Add missing icon
const MessageCircle = (props: any) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);