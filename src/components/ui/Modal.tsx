// src/components/ui/Modal.tsx
// Unified Modal component using Headless UI for accessibility
import React, { Fragment, ReactNode } from 'react';
import { Dialog as HeadlessDialog, Transition } from '@headlessui/react';
import { X } from 'react-feather';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | '2xl' | '3xl' | '4xl' | '5xl';
  showCloseButton?: boolean;
  preventBackdropClose?: boolean;
  className?: string;
  closeOnEscape?: boolean;
}

/**
 * Unified Modal component
 * Uses Headless UI for better accessibility
 * Replaces both the old Modal and Dialog components
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  preventBackdropClose = false,
  className = '',
  closeOnEscape = true,
}) => {
  // Size mapping for max-width
  const sizeMap: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    full: 'max-w-full',
  };

  const handleClose = () => {
    if (!preventBackdropClose) {
      onClose();
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <HeadlessDialog 
        as="div" 
        className={`relative z-50 ${className}`} 
        onClose={handleClose}
        static={preventBackdropClose}
      >
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        </Transition.Child>

        {/* Modal container */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95 translate-y-4"
              enterTo="opacity-100 scale-100 translate-y-0"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100 translate-y-0"
              leaveTo="opacity-0 scale-95 translate-y-4"
            >
              <HeadlessDialog.Panel 
                className={`
                  w-full ${sizeMap[size]} 
                  transform overflow-hidden 
                  rounded-2xl 
                  bg-white dark:bg-gray-800 
                  p-6 
                  text-left 
                  align-middle 
                  shadow-2xl 
                  transition-all
                  border border-gray-100 dark:border-gray-700
                `}
              >
                {/* Header */}
                {(title || showCloseButton) && (
                  <div className="flex items-center justify-between mb-4">
                    {title && (
                      <HeadlessDialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                        {title}
                      </HeadlessDialog.Title>
                    )}
                    {showCloseButton && (
                      <button
                        onClick={onClose}
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        aria-label="Close modal"
                      >
                        <X size={20} />
                      </button>
                    )}
                  </div>
                )}

                {/* Content */}
                <div className="mt-2">
                  {children}
                </div>
              </HeadlessDialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </HeadlessDialog>
    </Transition>
  );
};

export default Modal;
