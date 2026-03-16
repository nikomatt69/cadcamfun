import { io, Socket } from 'socket.io-client';
import useNotificationStore from '@/src/store/notificationStore';

// Singleton socket instance
let socket: Socket | null = null;

/**
 * Initialize WebSocket connection with authentication token
 * Uses Authorization header for secure token transmission
 * @param token JWT token from NextAuth session
 * @returns The socket.io client instance
 */
export const initializeWebSocket = async (token: string): Promise<Socket> => {
  // Close existing connection if exists
  if (socket) {
    socket.disconnect();
  }

  // Create a new socket connection with auth header
  socket = io({
    path: '/api/websocket',
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    transports: ['websocket', 'polling'],
    auth: {
      token // Send token in auth object (will be in Authorization header)
    },
    // Also include in query for backward compatibility and as fallback
    query: { token }
  });

  // Handle events
  socket.on('connect', () => {
    console.log('WebSocket connected');
  });

  socket.on('disconnect', (reason) => {
    console.log('WebSocket disconnected: ' + reason);
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

export const joinOrganization = (organizationId: string): void => {
  if (socket && socket.connected) {
    socket.emit('joinOrganization', organizationId);
  }
};

export const leaveOrganization = (organizationId: string): void => {
  if (socket && socket.connected) {
    socket.emit('leaveOrganization', organizationId);
  }
};

export const sendTypingStatus = (conversationId: string, isTyping: boolean): void => {
  if (socket && socket.connected) {
    socket.emit('typing', { conversationId, isTyping });
  }
};

export const disconnectWebSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = (): Socket | null => {
  return socket;
};
