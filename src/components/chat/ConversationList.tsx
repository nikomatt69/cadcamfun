// src/components/chat/ConversationList.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { 
  Users, MessageCircle, Plus, Search, User, UserPlus
} from 'react-feather';
import useChatStore from '@/src/store/chatStore';
import { formatDistanceToNow } from 'date-fns';

interface ConversationListProps {
  organizationId: string;
}

const ConversationList: React.FC<ConversationListProps> = ({ organizationId }) => {
  const router = useRouter();
  const { data: session } = useSession();
  const { 
    conversations, 
    isLoadingConversations, 
    hasMoreConversations,
    fetchConversations,
    fetchMoreConversations,
    refreshConversations,
    error 
  } = useChatStore();
  
  const listRef = useRef<HTMLDivElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshStartY, setRefreshStartY] = useState(0);
  const [refreshCurrentY, setRefreshCurrentY] = useState(0);
  const [forceUpdate, setForceUpdate] = useState(0); // Per forzare il re-render
  
  useEffect(() => {
    if (organizationId) {
      fetchConversations(organizationId);
    }
  }, [organizationId, fetchConversations]);
  
  // Implementa infinite scroll
  const handleScroll = () => {
    if (listRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = listRef.current;
      
      // Se siamo a 20px dal fondo, carica più conversazioni
      if (scrollHeight - scrollTop - clientHeight < 20 && !isLoadingConversations && hasMoreConversations) {
        fetchMoreConversations(organizationId);
      }
    }
  };
  
  // Implementa pull-to-refresh
  const handleTouchStart = (e: React.TouchEvent) => {
    setRefreshStartY(e.touches[0].clientY);
    setRefreshCurrentY(e.touches[0].clientY);
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    setRefreshCurrentY(e.touches[0].clientY);
    
    // Se l'utente sta trascinando verso il basso e siamo in cima alla lista
    const listElement = listRef.current;
    if (listElement && listElement.scrollTop === 0 && refreshCurrentY > refreshStartY) {
      e.preventDefault(); // Previene lo scroll normale
    }
  };
  
  const handleTouchEnd = async () => {
    // Se l'utente ha trascinato abbastanza verso il basso e siamo in cima alla lista
    const pullDistance = refreshCurrentY - refreshStartY;
    const listElement = listRef.current;
    
    if (listElement && listElement.scrollTop === 0 && pullDistance > 70) {
      setIsRefreshing(true);
      await refreshConversations(organizationId);
      setIsRefreshing(false);
    }
    
    setRefreshStartY(0);
    setRefreshCurrentY(0);
  };
  
  const handleCreateDirectMessage = () => {
    // Naviga a una pagina per selezionare gli utenti o mostra un modale
    router.push(`/organizations/${organizationId}/chat/new`);
  };
  
  const handleCreateGroupChat = () => {
    // Naviga a una pagina per creare una chat di gruppo
    router.push(`/organizations/${organizationId}/chat/new-group`);
  };
  
  const handleSelectConversation = (conversationId: string) => {
    router.push(`/organizations/${organizationId}/chat/${conversationId}`);
  };
  
  const formatLastActive = (date: string) => {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) {
        throw new Error('Invalid date');
      }
      
      return formatDistanceToNow(d, { addSuffix: true });
    } catch (error) {
      return 'Unknown';
    }
  };
  
  const getConversationName = (conversation: any) => {
    if (conversation.name) return conversation.name;
    
    // Per i messaggi diretti, mostra il nome dell'altro partecipante
    const otherParticipants = conversation.participants.filter(
      (p: any) => p.id !== session?.user?.id
    );
    if (otherParticipants.length === 1) {
      return otherParticipants[0].name || 'Unnamed User';
    }
    return otherParticipants.map((p: any) => p.name || 'Unnamed User').join(', ');
  };
  
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
          <MessageCircle className="h-5 w-5 mr-2" />
          Messages
        </h2>
        
        <div className="mt-2 flex">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Cerca conversazioni..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            />
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          </div>
          
          <div className="ml-2 flex">
            <button
              onClick={handleCreateDirectMessage}
              className="p-2 bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-md hover:bg-blue-100 dark:hover:bg-blue-800"
              title="Nuovo messaggio diretto"
            >
              <User className="h-4 w-4" />
            </button>
            <button
              onClick={handleCreateGroupChat}
              className="ml-1 p-2 bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-md hover:bg-blue-100 dark:hover:bg-blue-800"
              title="Nuova chat di gruppo"
            >
              <Users className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Conversations List with Pull-to-refresh */}
      <div 
        ref={listRef}
        className="flex-1 overflow-y-auto p-2"
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull to refresh indicator */}
        {refreshCurrentY - refreshStartY > 30 && (
          <div className="flex justify-center items-center py-3 text-gray-500">
            {isRefreshing ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mr-2"></div>
            ) : (
              <div className="mr-2">↓</div>
            )}
            {isRefreshing ? 'Updating...' : 'Release to refresh'}
          </div>
        )}
        
        {isLoadingConversations && conversations.length === 0 ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
              Nessuna conversazione
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Inizia una nuova conversazione con un membro dell&apos;organizzazione.
            </p>
            <div className="mt-4 flex justify-center space-x-2">
              <button
                onClick={handleCreateDirectMessage}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <User className="h-3.5 w-3.5 mr-1" />
                Nuovo messaggio
              </button>
              <button
                onClick={handleCreateGroupChat}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Users className="h-3.5 w-3.5 mr-1" />
                Nuovo gruppo
              </button>
            </div>
          </div>
        ) : (
          <ul className="space-y-1">
            {conversations.map((conversation) => {
              const hasUnread = new Date(conversation.updatedAt) > (conversation.lastReadAt || new Date(0));
              return (
                <li key={conversation.id}>
                  <button
                    onClick={() => handleSelectConversation(conversation.id)}
                    className={`w-full flex items-start p-3 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 ${
                      hasUnread ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="flex-shrink-0">
                      {conversation.isGroupChat ? (
                        <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
                          <Users className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                        </div>
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                          <User className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="ml-3 flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <h3 className={`text-sm font-medium ${
                          hasUnread ? 'text-blue-800 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'
                        } truncate`}>
                          {getConversationName(conversation)}
                        </h3>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatLastActive(conversation.updatedAt)}
                        </span>
                      </div>
                      <p className={`text-xs ${
                        hasUnread ? 'font-medium text-blue-800 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'
                      } truncate mt-1`}>
                        {conversation.lastMessage ? (
                          <>
                            <span className="font-semibold">
                              {conversation.lastMessage.sender?.name === session?.user?.name ? 'Tu: ' : 
                               conversation.lastMessage.sender?.name ? `${conversation.lastMessage.sender.name}: ` : ''}
                            </span>
                            {conversation.lastMessage.content}
                          </>
                         ) : (
                          <span className="italic">Nessun messaggio</span>
                        )}
                      </p>
                    </div>
                    {hasUnread && (
                      <div className="ml-2 flex-shrink-0">
                        <span className="inline-block h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400"></span>
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        
        {/* Loader per infinite scroll */}
        {isLoadingConversations && conversations.length > 0 && (
          <div className="flex justify-center py-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationList;