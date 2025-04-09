// src/store/chatStore.ts
import create from 'zustand';
import { SoundEffects } from '@/src/lib/soundEffects';
import { sendTypingStatus } from '@/src/lib/websocket';

interface Message {
  id: string;
  content: string;
  senderId: string;
  sender?: {
    id: string;
    name: string | null;
    image: string | null;
  };
  conversationId: string;
  createdAt: string;
  updatedAt: string;
  fileId?: string;
  fileUrl?: string;
}

interface ConversationsState {
  conversations: any[];
  isLoadingConversations: boolean;
  hasMoreConversations: boolean;
  currentPage: number;
  error: string | null;
  activeConversation: any | null;
  messages: Message[];
  isLoadingMessages: boolean;
  hasMoreMessages: boolean;
  nextCursor: string | null;
  isSending: boolean;
  typingUsers: Record<string, Record<string, { name: string, timestamp: number }>>;
  lastRefreshTime: number | null;
  
  fetchConversations: (organizationId: string, page?: number, refresh?: boolean) => Promise<void>;
  fetchMoreConversations: (organizationId: string) => Promise<void>;
  refreshConversations: (organizationId: string) => Promise<void>;
  createConversation: (organizationId: string, participantIds: string[], name: string, isGroupChat: boolean) => Promise<any>;
  fetchConversation: (conversationId: string) => Promise<void>;
  fetchMessages: (conversationId: string, cursor?: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string, fileId?: string, fileUrl?: string) => Promise<void>;
  markAsRead: (conversationId: string) => Promise<void>;
  clearActiveConversation: () => void;
  setTyping: (conversationId: string, isTyping: boolean) => void;
  receiveMessage: (message: any) => void;
  sendFileMessage: (conversationId: string, fileId: string, fileUrl: string, fileName: string, fileType: string) => Promise<void>;
}

const useChatStore = create<ConversationsState>((set, get) => ({
  conversations: [],
  isLoadingConversations: false,
  hasMoreConversations: false,
  currentPage: 1,
  error: null,
  activeConversation: null,
  messages: [],
  isLoadingMessages: false,
  hasMoreMessages: false,
  nextCursor: null,
  isSending: false,
  typingUsers: {},
  lastRefreshTime: null as number | null,
  
  fetchConversations: async (organizationId, page = 1, refresh = false) => {
    if (!organizationId) return;
    
    set({ isLoadingConversations: true, error: null });
    
    try {
      const response = await fetch(`/api/organizations/${organizationId}/conversations?page=${page}&limit=15`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }
      
      const data = await response.json();
      
      // Deduplicare le conversazioni usando gli ID
      const newConversations = data.conversations || [];
      
      set((state) => {
        // Se è un refresh o è la prima pagina, sostituisci completamente le conversazioni
        // altrimenti aggiungi solo le nuove conversazioni, evitando duplicati
        let mergedConversations = [];
        
        if (refresh || page === 1) {
          mergedConversations = newConversations;
        } else {
          // Usa un Map per deduplicare
          const existingConvsMap = new Map(
            state.conversations.map(conv => [conv.id, conv])
          );
          
          // Aggiungi solo le conversazioni nuove
          newConversations.forEach((conv: any) => {
            existingConvsMap.set(conv.id, conv);
          });
          
          mergedConversations = Array.from(existingConvsMap.values());
        }
        
        return {
          conversations: mergedConversations,
          hasMoreConversations: data.pagination?.hasMore || false,
          currentPage: page,
          isLoadingConversations: false
        };
      });
    } catch (error) {
      console.error('Error fetching conversations:', error);
      set({ 
        error: error instanceof Error ? error.message : 'An error occurred',
        isLoadingConversations: false 
      });
    }
  },
  
  fetchMoreConversations: async (organizationId) => {
    if (!organizationId) return;
    
    const { currentPage, hasMoreConversations } = get();
    
    if (hasMoreConversations) {
      await get().fetchConversations(organizationId, currentPage + 1, false);
    }
  },
  
  refreshConversations: async (organizationId) => {
    if (!organizationId) return;
    
    // Reset alla prima pagina e sostituisci completamente la lista
    set({ currentPage: 1 });
    await get().fetchConversations(organizationId, 1, true);
  },
  
  createConversation: async (organizationId, participantIds, name, isGroupChat = false) => {
    if (!organizationId || !participantIds || !participantIds.length) {
      set({ error: 'Missing required parameters for creating conversation' });
      return null;
    }
    
    try {
      const response = await fetch(`/api/organizations/${organizationId}/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          participantIds,
          name,
          isGroupChat
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create conversation');
      }
      
      const conversation = await response.json();
      
      // Dopo aver creato una nuova conversazione, aggiorna la lista
      get().refreshConversations(organizationId);
      
      return conversation;
    } catch (error) {
      console.error('Error creating conversation:', error);
      set({ error: error instanceof Error ? error.message : 'An error occurred' });
      return null;
    }
  },
  
  fetchConversation: async (conversationId) => {
    if (!conversationId) {
      set({ error: 'Conversation ID is required' });
      return;
    }
    
    set({ isLoadingMessages: true, error: null });
    
    try {
      const response = await fetch(`/api/conversation/${conversationId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch conversation');
      }
      
      const conversation = await response.json();
      
      set({ activeConversation: conversation });
      
      // Fetch messages for this conversation
      await get().fetchMessages(conversationId);
    } catch (error) {
      console.error('Error fetching conversation:', error);
      set({ 
        error: error instanceof Error ? error.message : 'An error occurred',
        isLoadingMessages: false 
      });
    }
  },
  
  fetchMessages: async (conversationId, cursor) => {
    if (!conversationId) return;
    
    if (!cursor) {
      set({ isLoadingMessages: true, messages: [] });
    }
    
    try {
      const url = cursor 
        ? `/api/conversation/${conversationId}/messages?cursor=${cursor}`
        : `/api/conversation/${conversationId}/messages`;
        
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      
      const data = await response.json();
      
      set((state) => ({
        messages: cursor 
          ? [...state.messages, ...data.messages]
          : data.messages,
        hasMoreMessages: data.hasMore,
        nextCursor: data.nextCursor,
        isLoadingMessages: false
      }));
    } catch (error) {
      console.error('Error fetching messages:', error);
      set({ 
        error: error instanceof Error ? error.message : 'An error occurred',
        isLoadingMessages: false 
      });
    }
  },
  
  sendMessage: async (conversationId, content, fileId, fileUrl) => {
    if (!conversationId || !content.trim()) {
      console.error('Missing required parameters for sending message');
      set({ error: 'Conversation ID and content are required' });
      return;
    }
    
    set({ isSending: true, error: null });
    
    try {
      console.log(`Sending message to: /api/conversation/${conversationId}/messages`);
      console.log('Message content:', content);
      
      const response = await fetch(`/api/conversation/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content,
          ...(fileId && fileUrl ? { fileId, fileUrl } : {})
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server error response:', errorData);
        throw new Error(errorData.message || 'Failed to send message');
      }
      
      const message = await response.json();
      console.log('Message sent successfully:', message);
      
      // Add message to the list
      set((state) => ({
        messages: [...state.messages, message],
        isSending: false
      }));
      
      // Make sure typing is cleared
      if (typeof window !== 'undefined') {
        get().setTyping(conversationId, false);
      }
      
      // Update the conversation list to show this as the latest message
      const activeConversation = get().activeConversation;
      if (activeConversation?.organizationId) {
        // Use a flag to avoid unnecessary API calls
        const lastUpdateTime = Date.now();
        const throttleTime = 2000; // 2 seconds

        // Avoid updating too frequently
        const currentRefreshTime = get().lastRefreshTime;
        if (currentRefreshTime === null || (lastUpdateTime - currentRefreshTime) > throttleTime) {
          get().refreshConversations(activeConversation.organizationId);
          set({ lastRefreshTime: lastUpdateTime });
        }
      }
      
      return message;
    } catch (error) {
      console.error('Error sending message:', error);
      set({ 
        error: error instanceof Error ? error.message : 'An error occurred',
        isSending: false 
      });
      throw error;
    }
  },
  
  markAsRead: async (conversationId) => {
    if (!conversationId) return;
    
    try {
      await fetch(`/api/conversation/${conversationId}/read`, {
        method: 'POST'
      });
      
      // Update the local conversation to mark it as read
      set((state) => {
        const updatedConversations = state.conversations.map(conv => {
          if (conv.id === conversationId) {
            return {
              ...conv,
              lastReadAt: new Date().toISOString()
            };
          }
          return conv;
        });
        
        return { conversations: updatedConversations };
      });
    } catch (error) {
      console.error('Error marking conversation as read:', error);
    }
  },
  
  clearActiveConversation: () => {
    set({ 
      activeConversation: null,
      messages: [],
      hasMoreMessages: false,
      nextCursor: null
    });
  },
  
  setTyping: (() => {
    const typingTimeouts: Record<string, NodeJS.Timeout> = {};
    
    return (conversationId: string, isTyping: boolean) => {
      if (!conversationId) return;
      
      const previousTimeout = typingTimeouts[conversationId];
      
      if (previousTimeout) {
        clearTimeout(previousTimeout);
      }
      
      // Invia immediatamente lo stato se si inizia a digitare
      if (isTyping) {
        try {
          sendTypingStatus(conversationId, true);
        } catch (error) {
          console.error('Error sending typing status:', error);
        }
        
        // Imposta un timeout per inviare lo stato "non sta digitando" dopo 3 secondi di inattività
        typingTimeouts[conversationId] = setTimeout(() => {
          try {
            sendTypingStatus(conversationId, false);
          } catch (error) {
            console.error('Error sending typing status:', error);
          }
          delete typingTimeouts[conversationId];
        }, 3000);
      } else {
        // Invia immediatamente lo stato "non sta digitando"
        try {
          sendTypingStatus(conversationId, false);
        } catch (error) {
          console.error('Error sending typing status:', error);
        }
        delete typingTimeouts[conversationId];
      }
    };
  })(),
  
  receiveMessage: (message: any) => {
    if (!message || !message.conversationId) {
      console.error('Received invalid message', message);
      return;
    }
    
    const { messages, activeConversation } = get();
    
    // Aggiorna i messaggi se siamo nella conversazione corretta
    if (activeConversation?.id === message.conversationId) {
      // Verifica se il messaggio esiste già
      const messageExists = messages.some(m => m.id === message.id);
      if (!messageExists) {
        set({
          messages: [...messages, message]
        });
      }
      
      // Riproduci suono solo se il messaggio è nuovo e non è stato inviato dall'utente corrente
      const userId = typeof window !== 'undefined' ? sessionStorage.getItem('userId') : null;
      if (message.senderId !== userId) {
        try {
          SoundEffects.getInstance().playSound('message');
        } catch (error) {
          console.error('Error playing sound:', error);
        }
      }
    } else {
      // Per le altre conversazioni, incrementa il contatore non letti
      // e riproduci un suono di notifica
      try {
        SoundEffects.getInstance().playSound('notification');
      } catch (error) {
        console.error('Error playing notification sound:', error);
      }
    }
    
    // Update the conversation list to show the latest message
    // but only if we haven't updated the list recently
    if (message.organizationId) {
      const lastUpdateTime = Date.now();
      const throttleTime = 2000; // 2 seconds

      // Avoid updating too frequently
      const currentRefreshTime = get().lastRefreshTime;
      if (currentRefreshTime === null || (lastUpdateTime - currentRefreshTime) > throttleTime) {
        get().refreshConversations(message.organizationId);
        set({ lastRefreshTime: lastUpdateTime });
      }
    }
  },
  
  sendFileMessage: async (conversationId, fileId, fileUrl, fileName, fileType) => {
    if (!conversationId || !fileId || !fileUrl || !fileName) {
      console.error('Missing required parameters for file message');
      return;
    }
    
    const fileContent = fileType.startsWith('image/') 
      ? `![${fileName}](${fileUrl})`
      : `[${fileName}](${fileUrl})`;
      
    const content = `Sent a file: ${fileName}`;
    
    return get().sendMessage(conversationId, content, fileId, fileUrl);
  },
}));

export type { Message };
export default useChatStore;