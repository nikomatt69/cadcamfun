// src/components/ui/Toast.tsx
import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'react-feather';
import { motion, AnimatePresence } from 'framer-motion';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  title?: string;
}

interface ToastProps {
  toast: Toast;
  onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  const [progress, setProgress] = useState(100);
  const duration = toast.duration || 5000;
  
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, duration);
    
    const interval = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev - (100 / (duration / 100));
        return newProgress < 0 ? 0 : newProgress;
      });
    }, 100);
    
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [toast.id, duration, onClose]);
  
  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle className="text-green-500" size={20} />;
      case 'error':
        return <AlertCircle className="text-red-500" size={20} />;
      case 'warning':
        return <AlertTriangle className="text-yellow-500" size={20} />;
      default:
        return <Info className="text-blue-500" size={20} />;
    }
  };
  
  const getTitle = () => {
    switch (toast.type) {
      case 'success':
        return 'Success';
      case 'error':
        return 'Error';
      case 'warning':
        return 'Warning';
      default:
        return 'Info';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.2 } }}
      className="relative backdrop-blur-xl backdrop-saturate-150 bg-white/80 dark:bg-gray-800/80 rounded-2xl shadow-lg overflow-hidden"
      style={{ width: '320px', WebkitBackdropFilter: 'blur(20px)' }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {getIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
              {toast.title || getTitle()}
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
              {toast.message}
            </p>
          </div>
          <button
            onClick={() => onClose(toast.id)}
            className="flex-shrink-0 ml-2 mt-0.5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      
      <div 
        className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-100"
        style={{ width: `${progress}%` }}
      />
    </motion.div>
  );
};

export default Toast;