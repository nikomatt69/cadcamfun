// src/context/NotificationContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = ({ type, message, duration = 5000 }: Omit<Notification, 'id'>) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, type, message, duration }]);
    
    // Rimuovi automaticamente la notifica dopo la durata specificata
    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>
      {children}
      <NotificationList />
    </NotificationContext.Provider>
  );
}

function NotificationList() {
  const context = useContext(NotificationContext);
  if (!context) return null;
  
  const { notifications, removeNotification } = context;
  
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2">
      {notifications.map(notification => (
        <div 
          key={notification.id}
          className={`rounded-md p-4 shadow-md flex items-start ${getBackgroundColor(notification.type)}`}
        >
          <div className="mr-3">{getIcon(notification.type)}</div>
          <div className="flex-grow">{notification.message}</div>
          <button 
            onClick={() => removeNotification(notification.id)}
            className="ml-3 text-gray-500 hover:text-gray-700"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// Helper functions
function getBackgroundColor(type: NotificationType): string {
  switch (type) {
    case 'success': return 'bg-green-50 text-green-800';
    case 'error': return 'bg-red-50 text-red-800';
    case 'warning': return 'bg-yellow-50 text-yellow-800';
    case 'info': return 'bg-blue-50 text-blue-800';
  }
}

function getIcon(type: NotificationType) {
  // Implementa gli iconi in base al tipo
  return '📝';
}

// Hook per usare le notifiche
export function useNotification() {
  const context = useContext(NotificationContext);
  
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  
  return context;
}