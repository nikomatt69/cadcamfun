import { io, Socket } from 'socket.io-client';
import useNotificationStore from '@/src/store/notificationStore';

// Singleton socket instance
let socket: Socket | null = null;

/**
 * Initialize WebSocket connection with authentication token
 * @param token JWT token from NextAuth session
 * @returns The socket.io client instance
 */
export const initializeWebSocket = async (token: string): Promise<Socket> => {
  // Close existing connection if exists
  if (socket) {
    socket.disconnect();
  }

  // Create a new socket connection
  socket = io({
    path: '/api/websocket',
    query: { token }, // Use query instead of auth headers
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    transports: ['websocket', 'polling'] // Prefer WebSocket, fallback to polling
  });

  // Handle events
  socket.on('connect', () => {
    console.log('WebSocket connected');
  });

  socket.on('disconnect', (reason) => {
    console.log(`WebSocket disconnected: ${reason}`);
  });

  socket.on('error', (err) => {
    console.error('WebSocket error:', err);
  });

  // Listen for notifications
  socket.on('notification', (notification) => {
    // Update the notification store
    const { notifications, unreadCount } = useNotificationStore.getState();
    
    // Add notification to store
    useNotificationStore.setState({
      notifications: [notification, ...notifications],
      unreadCount: unreadCount + 1
    });
    
    // Show browser notification if available
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.content,
        icon: '/favicon.ico',
        tag: notification.id,
        requireInteraction: true,
        silent: false,
      });
    }
  });

  // Listen for typing events
  socket.on('userTyping', async (data) => {
    const useChatStore = (await import('@/src/store/chatStore')).default;
    const { typingUsers } = useChatStore.getState();
    
    if (data.isTyping) {
      // Add or update typing user
      useChatStore.setState({
        typingUsers: {
          ...typingUsers,
          [data.conversationId]: {
            ...typingUsers[data.conversationId],
            [data.userId]: {
              name: data.userName,
              timestamp: Date.now()
            }
          }
        }
      });
    } else {
      // Remove user from typing list
      if (typingUsers[data.conversationId] && typingUsers[data.conversationId][data.userId]) {
        const updatedConversationTypers = { ...typingUsers[data.conversationId] };
        delete updatedConversationTypers[data.userId];
        
        useChatStore.setState({
          typingUsers: {
            ...typingUsers,
            [data.conversationId]: updatedConversationTypers
          }
        });
      }
    }
  });

  return socket;
};

/**
 * Join a specific organization channel for receiving notifications
 * @param organizationId The organization ID to join
 */
export const joinOrganization = (organizationId: string): void => {
  if (socket && socket.connected) {
    socket.emit('joinOrganization', organizationId);
    console.log(`Joined organization channel: ${organizationId}`);
  } else {
    console.warn('Socket not connected, cannot join organization channel');
  }
};

/**
 * Leave an organization channel
 * @param organizationId The organization ID to leave
 */
export const leaveOrganization = (organizationId: string): void => {
  if (socket && socket.connected) {
    socket.emit('leaveOrganization', organizationId);
    console.log(`Left organization channel: ${organizationId}`);
  }
};

/**
 * Send typing status to other participants in a conversation
 * @param conversationId The conversation ID
 * @param isTyping Whether the user is typing or has stopped typing
 */
export const sendTypingStatus = (conversationId: string, isTyping: boolean): void => {
  if (socket && socket.connected) {
    socket.emit('typing', {
      conversationId,
      isTyping
    });
    console.log(`Sent typing status (${isTyping}) for conversation: ${conversationId}`);
  } else {
    console.warn('Socket not connected, cannot send typing status');
  }
};

/**
 * Disconnect WebSocket connection
 */
export const disconnectWebSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log('WebSocket disconnected');
  }
};

/**
 * Get current socket instance
 * @returns The current socket instance or null if not connected
 */
export const getSocket = (): Socket | null => {
  return socket;
};