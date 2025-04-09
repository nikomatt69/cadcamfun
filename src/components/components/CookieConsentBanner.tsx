// src/components/CookieConsentBanner.tsx
import { useAnalytics } from '@/src/contexts/AnalyticsContext';
import React, { useState, useEffect } from 'react';

export default function CookieConsentBanner() {
  const { consentGiven, setConsentGiven } = useAnalytics();
  const [visible, setVisible] = useState(false);
  // Add state to detect mobile devices
  const [isMobile, setIsMobile] = useState(false);

  // Check if on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Show banner if consent hasn't been given
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!consentGiven) {
        setVisible(true);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [consentGiven]);

  if (!visible) return null;

  return (
    <div className={`fixed inset-x-0 z-50 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-lg ${
      isMobile ? 'bottom-14' : 'bottom-0' // Adjust position for mobile to account for bottom nav
    }`}>
      <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <div className="mb-4 sm:mb-0 sm:mr-4 text-center sm:text-left">
            <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              We use cookies to analyze site usage and improve your experience. By clicking &quot;Accept&quot;, you consent to our use of cookies.
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => {
                setConsentGiven(false);
                setVisible(false);
              }}
              className="px-3 py-1.5 sm:px-4 sm:py-2 border border-gray-300 text-xs sm:text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              Decline
            </button>
            <button
              onClick={() => {
                setConsentGiven(true);
                setVisible(false);
              }}
              className="px-3 py-1.5 sm:px-4 sm:py-2 border border-transparent text-xs sm:text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}