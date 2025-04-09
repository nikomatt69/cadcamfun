// src/store/notificationStore.ts
import create from 'zustand';

export interface Notification {
  id: string;
  type: 'NEW_MESSAGE' | 'PROJECT_CREATED' | 'COMPONENT_CREATED' | 'MEMBER_JOINED' | 'ORGANIZATION_INVITATION';
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  userId: string;
  organizationId?: string;
  projectId?: string;
  componentId?: string;
  messageId?: string;
  linkUrl?: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  isOpen: boolean;
  
  // Actions
  fetchNotifications: (limit?: number, offset?: number, onlyUnread?: boolean) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  setIsOpen: (isOpen: boolean) => void;
  toggleOpen: () => void;
}

const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  isOpen: false,
  
  fetchNotifications: async (limit = 20, offset = 0, onlyUnread = false) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(
        `/api/notifications?limit=${limit}&offset=${offset}&onlyUnread=${onlyUnread}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }
      
      const data = await response.json();
      
      set({
        notifications: data.notifications,
        unreadCount: data.unreadCount,
        isLoading: false
      });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false
      });
    }
  },
  
  markAsRead: async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isRead: true })
      });
      
      if (!response.ok) {
        throw new Error('Failed to mark notification as read');
      }
      
      set(state => ({
        notifications: state.notifications.map(notification =>
          notification.id === notificationId
            ? { ...notification, isRead: true }
            : notification
        ),
        unreadCount: state.unreadCount > 0 ? state.unreadCount - 1 : 0
      }));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  },
  
  markAllAsRead: async () => {
    try {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to mark all notifications as read');
      }
      
      set(state => ({
        notifications: state.notifications.map(notification => ({
          ...notification,
          isRead: true
        })),
        unreadCount: 0
      }));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  },
  
  deleteNotification: async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete notification');
      }
      
      const notification = get().notifications.find(n => n.id === notificationId);
      const wasUnread = notification && !notification.isRead;
      
      set(state => ({
        notifications: state.notifications.filter(n => n.id !== notificationId),
        unreadCount: wasUnread && state.unreadCount > 0 ? state.unreadCount - 1 : state.unreadCount
      }));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  },
  
  setIsOpen: (isOpen: boolean) => {
    set({ isOpen });
  },
  
  toggleOpen: () => {
    set(state => ({ isOpen: !state.isOpen }));
  }
}));

export default useNotificationStore;