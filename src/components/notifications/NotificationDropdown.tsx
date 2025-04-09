// src/components/notifications/NotificationDropdown.tsx
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { Check, Trash2, X, MessageCircle, Folder, Box } from 'react-feather';
import useNotificationStore from '@/src/store/notificationStore';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';

const NotificationDropdown: React.FC = () => {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const {
    notifications,
    isOpen,
    isLoading,
    unreadCount,
    setIsOpen,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchNotifications
  } = useNotificationStore();
  
  useEffect(() => {
    // Fetch notifications when dropdown opens
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);
  
  useEffect(() => {
    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [setIsOpen]);
  
  const handleNotificationClick = (notification: any) => {
    // Mark as read
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    
    // Navigate to the link if provided
    if (notification.linkUrl) {
      router.push(notification.linkUrl);
      setIsOpen(false);
    }
  };
  
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'NEW_MESSAGE':
        return <MessageCircle className="h-5 w-5 text-blue-500" />;
      case 'PROJECT_CREATED':
        return <Folder className="h-5 w-5 text-green-500" />;
      case 'COMPONENT_CREATED':
        return <Box className="h-5 w-5 text-purple-500" />;
      default:
        return <Bell className="h-5 w-5 text-gray-500" />;
    }
  };
  
  const formatTime = (date: string) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true, locale: it });
    } catch (error) {
      return 'data sconosciuta';
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div
      ref={dropdownRef}
      className="absolute rounded-xl right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-md shadow-lg overflow-hidden z-50"
      style={{ top: '100%' }}
    >
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Notifiche
          {unreadCount > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100 rounded-full">
              {unreadCount} nuove
            </span>
          )}
        </h3>
        
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 focus:outline-none"
            aria-label="Segna tutto come letto"
          >
            Segna tutto come letto
          </button>
        )}
      </div>
      
      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nessuna notifica</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {notifications.map(notification => (
              <li 
                key={notification.id}
                className={`relative hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  !notification.isRead ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <button
                  className="w-full text-left p-3 pr-10"
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start">
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="ml-3 flex-1">
                      <p className={`text-sm font-medium ${
                        !notification.isRead 
                          ? 'text-gray-900 dark:text-white' 
                          : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        {notification.title}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {notification.content}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {formatTime(notification.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
                
                <div className="absolute top-3 right-3 flex space-x-1">
                  {!notification.isRead && (
                    <button
                      onClick={() => markAsRead(notification.id)}
                      className="p-1 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900"
                      aria-label="Segna come letto"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteNotification(notification.id)}
                    className="p-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900"
                    aria-label="Elimina notifica"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      
      <div className="p-2 border-t border-gray-200 dark:border-gray-700 text-center">
        <button
          onClick={() => setIsOpen(false)}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 focus:outline-none"
        >
          Chiudi
        </button>
      </div>
    </div>
  );
};

export default NotificationDropdown;

// Add missing icon
const Bell = (props: any) => (
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
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
  </svg>
);