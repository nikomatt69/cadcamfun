// src/components/ui/PWAInstallPrompt.tsx
import React, { useEffect, useState } from 'react';
import { X, Download } from 'react-feather';
import Image from 'next/image';
const PWAInstallPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Check if user has already installed or dismissed the prompt
    const hasPromptBeenShown = localStorage.getItem('pwaPromptDismissed');
    
    if (hasPromptBeenShown) {
      return;
    }
    
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent Chrome 76+ from automatically showing the prompt
      e.preventDefault();
      // Store the event for later use
      setDeferredPrompt(e);
      // Show our custom install prompt
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    // Show the browser install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    // We no longer need the prompt regardless of outcome
    setDeferredPrompt(null);
    setShowPrompt(false);
    
    // Log outcome for analytics
    console.log(`User ${outcome === 'accepted' ? 'accepted' : 'dismissed'} the install prompt`);
    
    // Store that we've shown the prompt
    localStorage.setItem('pwaPromptDismissed', 'true');
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Remember that the user dismissed the prompt
    localStorage.setItem('pwaPromptDismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white dark:bg-gray-800 shadow-lg rounded-lg p-4 max-w-xs z-50 border border-gray-200 dark:border-gray-700">
      <div className="flex justify-between items-start">
        <div className="flex items-center">
          <img src="/icon.png" alt="Logo" className="w-10 h-10 mr-3" />
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">Install App</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Add CAD/CAM to your home screen for quick access</p>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-500">
          <X size={18} />
        </button>
      </div>
      <div className="mt-4 flex justify-end space-x-3">
        <button 
          onClick={handleDismiss}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          Not now
        </button>
        <button 
          onClick={handleInstall}
          className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-blue-700 flex items-center"
        >
          <Download size={16} className="mr-1" />
          Install
        </button>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;