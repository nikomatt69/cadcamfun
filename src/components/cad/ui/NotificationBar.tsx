import React, { useState, useEffect } from 'react';
import { Notification, NotificationType } from '@/src/types/ui';

interface NotificationBarProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
  position?: 'top' | 'bottom';
  darkMode?: boolean;
  className?: string;
}

export const NotificationBar: React.FC<NotificationBarProps> = ({
  notifications,
  onDismiss,
  position = 'top',
  darkMode = false,
  className = '',
}) => {
  // Auto-dismiss notifications after their duration
  useEffect(() => {
    notifications.forEach(notification => {
      if (notification.duration && notification.dismissable !== false) {
        const timer = setTimeout(() => {
          onDismiss(notification.id);
        }, notification.duration);
        
        return () => clearTimeout(timer);
      }
    });
  }, [notifications, onDismiss]);

  // Icon mapping for notification types
  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        );
      case 'error':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        );
      case 'warning':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        );
      case 'info':
      default:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        );
    }
  };

  // Background color based on notification type and theme
  const getBackgroundColor = (type: NotificationType) => {
    if (darkMode) {
      switch (type) {
        case 'success': return 'rgba(16, 185, 129, 0.2)';
        case 'error': return 'rgba(239, 68, 68, 0.2)';
        case 'warning': return 'rgba(245, 158, 11, 0.2)';
        case 'info': default: return 'rgba(59, 130, 246, 0.2)';
      }
    } else {
      switch (type) {
        case 'success': return 'rgba(16, 185, 129, 0.1)';
        case 'error': return 'rgba(239, 68, 68, 0.1)';
        case 'warning': return 'rgba(245, 158, 11, 0.1)';
        case 'info': default: return 'rgba(59, 130, 246, 0.1)';
      }
    }
  };

  // Border color based on notification type
  const getBorderColor = (type: NotificationType) => {
    switch (type) {
      case 'success': return 'rgb(16, 185, 129)';
      case 'error': return 'rgb(239, 68, 68)';
      case 'warning': return 'rgb(245, 158, 11)';
      case 'info': default: return 'rgb(59, 130, 246)';
    }
  };

  // Icon color based on notification type
  const getIconColor = (type: NotificationType) => {
    switch (type) {
      case 'success': return 'rgb(16, 185, 129)';
      case 'error': return 'rgb(239, 68, 68)';
      case 'warning': return 'rgb(245, 158, 11)';
      case 'info': default: return 'rgb(59, 130, 246)';
    }
  };

  return (
    <div 
      className={`cad-notification-bar ${position} ${darkMode ? 'dark' : 'light'} ${className}`}
      style={{
        position: 'absolute',
        [position]: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: '400px',
        width: '100%',
        zIndex: 1000,
      }}
    >
      {notifications.map((notification) => (
        <div 
          key={notification.id}
          className={`notification-item ${notification.type}`}
          style={{
            display: 'flex',
            padding: '12px',
            borderRadius: '6px',
            backgroundColor: getBackgroundColor(notification.type),
            borderLeft: `4px solid ${getBorderColor(notification.type)}`,
            color: darkMode ? '#e0e0e0' : '#333',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(8px)',
            animation: '0.3s ease-out slideIn',
          }}
        >
          <div 
            className="notification-icon"
            style={{
              display: 'flex',
              alignItems: 'center',
              color: getIconColor(notification.type),
              marginRight: '12px',
            }}
          >
            {getIcon(notification.type)}
          </div>
          
          <div className="notification-content" style={{ flex: 1 }}>
            {notification.title && (
              <div className="notification-title" style={{ fontWeight: 600, marginBottom: '4px' }}>
                {notification.title}
              </div>
            )}
            <div className="notification-message" style={{ fontSize: '14px' }}>
              {notification.message}
            </div>
          </div>
          
          {notification.dismissable !== false && (
            <button
              onClick={() => onDismiss(notification.id)}
              className="dismiss-button"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: darkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)',
                marginLeft: '8px',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      ))}

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}; 