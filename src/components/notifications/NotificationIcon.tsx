// src/components/notifications/NotificationIcon.tsx
import { useEffect } from 'react';
import { Bell } from 'react-feather';
import useNotificationStore from '@/src/store/notificationStore';

interface NotificationIconProps {
  onClick?: () => void;
}

const NotificationIcon: React.FC<NotificationIconProps> = ({ onClick }) => {
  const { unreadCount, fetchNotifications, toggleOpen } = useNotificationStore();
  
  useEffect(() => {
    // Carica le notifiche all'avvio
    fetchNotifications();
    
    // Polling per le notifiche ogni 30 secondi
    const interval = setInterval(() => {
      fetchNotifications();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [fetchNotifications]);
  
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      toggleOpen();
    }
  };
  
  return (
    <button
      onClick={handleClick}
      className="relative p-2 text-gray-600 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded-full"
      aria-label="Notifications"
    >
      <Bell className="h-5 w-5" />
      
      {unreadCount > 0 && (
        <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};

export default NotificationIcon;