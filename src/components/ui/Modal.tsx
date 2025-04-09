import React, { ReactNode, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'react-feather';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  preventBackdropClose?: boolean;
}

const Modal: React.FC<ModalProps> = ({ 
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  preventBackdropClose = false
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);
  
  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventBackdropClose) {
        onClose();
      }
    };
    
    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
    }
    
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, preventBackdropClose]);
  
  // Size classes for different screen sizes
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl w-full'
  };

  const modalVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1 }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if clicking directly on the backdrop, not on modal content
    if (!preventBackdropClose && e.target === e.currentTarget) {
      onClose();
    }
  };

  const isMobileFullScreen = size === 'full';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          {/* Backdrop */}
          <motion.div 
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleBackdropClick}
          />

          {/* Modal panel */}
          <motion.div
            className={`bg-white dark:bg-gray-800 dark:text-white 
              ${isMobileFullScreen ? 'fixed bottom-0 left-0 right-0 sm:relative sm:rounded-lg rounded-t-xl' : 'rounded-xl'} 
              text-left overflow-hidden shadow-xl transform transition-all
              ${sizeClasses[size]} w-full z-10`}
            variants={modalVariants}
            transition={{ duration: 0.3, delay: 0.1 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxHeight: isMobileFullScreen ? '90vh' : undefined
            }}
          >
            <div className="sticky top-0 z-10 px-4 pt-5 pb-4 sm:p-6 sm:pb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <motion.h3 
                  className="text-lg font-medium text-gray-900 dark:text-white truncate pr-8"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                >
                  {title}
                </motion.h3>
                <motion.button
                  className="rounded-full p-1 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
                  onClick={onClose}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <span className="sr-only">Close</span>
                  <X size={20} />
                </motion.button>
              </div>
            </div>
            <motion.div 
              ref={contentRef}
              className={`px-4 pt-4 pb-6 sm:p-6 ${isMobileFullScreen ? 'overflow-y-auto max-h-[70vh] sm:max-h-[60vh]' : ''}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            >
              {children}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Modal;