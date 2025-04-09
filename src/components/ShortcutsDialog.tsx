// src/components/ui/ShortcutsDialog.tsx
import React, { useState, useEffect } from 'react';
import { X } from 'react-feather';

export interface Shortcut {
  keys: string[];
  description: string;
}

export interface ShortcutCategory {
  title: string;
  shortcuts: Shortcut[];
}

interface ShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: ShortcutCategory[];
}

export const ShortcutsDialog: React.FC<ShortcutsDialogProps> = ({ 
  isOpen, 
  onClose,
  shortcuts 
}) => {
  const [isMac, setIsMac] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  
  // Detect if user is on Mac
  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes('mac') || 
             navigator.userAgent.toLowerCase().includes('mac'));
  }, []);
  
  if (!isOpen) return null;
  
  // Format key for display based on platform
  const formatKey = (key: string): string => {
    const formattedKey = key.trim().toLowerCase();
    
    // Platform-specific key mappings
    if (isMac) {
      switch (formattedKey) {
        case 'ctrl':
          return '⌘'; // Command
        case 'alt':
          return '⌥'; // Option
        case 'shift':
          return '⇧'; // Shift
        case 'meta':
          return '⌘'; // Command
        case 'escape':
          return 'Esc';
        case 'backspace':
          return '⌫';
        case 'delete':
          return '⌦';
        case 'arrowup':
          return '↑';
        case 'arrowdown':
          return '↓';
        case 'arrowleft':
          return '←';
        case 'arrowright':
          return '→';
        default:
          // Capitalize first letter for single keys
          return formattedKey.length === 1 
            ? formattedKey.toUpperCase() 
            : formattedKey.charAt(0).toUpperCase() + formattedKey.slice(1);
      }
    } else {
      // Windows/Other platform key mappings
      switch (formattedKey) {
        case 'meta':
          return 'Win';
        case 'escape':
          return 'Esc';
        case 'arrowup':
          return '↑';
        case 'arrowdown':
          return '↓';
        case 'arrowleft':
          return '←';
        case 'arrowright':
          return '→';
        default:
          // Capitalize first letter for single keys
          return formattedKey.length === 1 
            ? formattedKey.toUpperCase() 
            : formattedKey.charAt(0).toUpperCase() + formattedKey.slice(1);
      }
    }
  };
  
  // Convert shortcut arrays for platform-specific display
  const getFormattedShortcut = (shortcut: Shortcut) => {
    return shortcut.keys.map(keyCombo => {
      // Handle key combinations (e.g., "Ctrl + S")
      if (keyCombo.includes('+')) {
        return keyCombo.split('+')
          .map(k => formatKey(k))
          .join(' + ');
      }
      
      // Handle multiple keys for the same shortcut
      return formatKey(keyCombo);
    });
  };
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Keyboard Shortcuts {isMac ? '(Mac)' : '(Windows/Linux)'}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 focus:outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Category sidebar */}
          <div className="w-full md:w-1/4 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
            <ul className="py-2 flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible">
              {shortcuts.map((category, index) => (
                <li key={category.title} className="flex-shrink-0 md:flex-shrink">
                  <button
                    className={`w-full text-left px-4 py-2 text-sm whitespace-nowrap md:whitespace-normal ${
                      activeCategory === index
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => setActiveCategory(index)}
                  >
                    {category.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Shortcuts list */}
          <div className="w-full md:w-3/4 overflow-y-auto p-4 md:p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              {shortcuts[activeCategory]?.title}
            </h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {shortcuts[activeCategory]?.shortcuts.map((shortcut, idx) => (
                <div key={idx} className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2 mb-2">
                  <div className="pr-4 text-gray-700 dark:text-gray-300">
                    {shortcut.description}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {getFormattedShortcut(shortcut).map((formattedKey, keyIdx) => (
                      <kbd
                        key={keyIdx}
                        className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-800 dark:text-gray-100 dark:border-gray-500"
                      >
                        {formattedKey}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-3 text-right">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Press <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-800 dark:text-gray-100 dark:border-gray-500">
              {isMac ? '?' : 'Shift + ?'}
            </kbd> or <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-800 dark:text-gray-100 dark:border-gray-500">
              F2
            </kbd> to open this dialog
          </span>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsDialog;