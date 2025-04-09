import React, { useState, useEffect } from 'react';

interface StatusMessageProps {
  message: string;
  duration?: number | null;
  type?: 'info' | 'success' | 'warning' | 'error';
  showIcon?: boolean;
  darkMode?: boolean;
  className?: string;
}

const StatusMessage: React.FC<StatusMessageProps> = ({
  message,
  duration = 5000,
  type = 'info',
  showIcon = true,
  darkMode = false,
  className = '',
}) => {
  const [visible, setVisible] = useState(true);
  
  useEffect(() => {
    // Reset visibility when message changes
    setVisible(true);
    
    // Auto-hide the message after duration (if specified)
    if (duration) {
      const timer = setTimeout(() => {
        setVisible(false);
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [message, duration]);

  // If not visible, don't render anything
  if (!visible) return null;
  
  // Icon mapping for status types
  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        );
      case 'error':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        );
      case 'warning':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        );
      case 'info':
      default:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        );
    }
  };

  // Get color based on status type
  const getColor = () => {
    switch (type) {
      case 'success': return '#10b981';
      case 'error': return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'info': default: return '#3b82f6';
    }
  };
  
  return (
    <div 
      className={`status-message ${type} ${darkMode ? 'dark' : 'light'} ${className}`}
      style={{
        position: 'absolute',
        bottom: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        borderRadius: '6px',
        background: darkMode ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)',
        color: darkMode ? '#e0e0e0' : '#333',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
        zIndex: 100,
        fontSize: '14px',
        maxWidth: '80%',
        animation: 'fadeIn 0.3s ease-out',
      }}
    >
      {showIcon && (
        <div 
          className="status-icon"
          style={{ 
            marginRight: '8px',
            color: getColor(),
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {getIcon()}
        </div>
      )}
      <div className="status-text">{message}</div>
      
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px) translateX(-50%);
          }
          to {
            opacity: 1;
            transform: translateY(0) translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
};

export default StatusMessage; 