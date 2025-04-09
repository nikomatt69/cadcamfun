// src/components/ui/Dialog.tsx
import React, { Fragment } from 'react';
import { Dialog as HeadlessDialog, Transition } from '@headlessui/react';
import { X } from 'react-feather';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
}

const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
}) => {
  // Map size to max-width
  const sizeMap = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-4xl',
  };
  
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <HeadlessDialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25 dark:bg-opacity-50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <HeadlessDialog.Panel 
                className={`w-full ${sizeMap[size]} transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all`}
              >
                {title && (
                  <div className="flex items-center justify-between mb-4">
                    <HeadlessDialog.Title
                      as="h3"
                      className="text-lg font-medium leading-6 text-gray-900 dark:text-white"
                    >
                      {title}
                    </HeadlessDialog.Title>
                    
                    {showCloseButton && (
                      <button
                        type="button"
                        className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                        onClick={onClose}
                      >
                        <span className="sr-only">Close</span>
                        <X size={20} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
                
                <div>
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

export default Dialog;