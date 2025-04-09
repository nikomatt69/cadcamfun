// src/pages/_app.tsx
import 'src/styles/globals.css';
import type { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import { Inter } from 'next/font/google';
import { AnimatePresence } from 'framer-motion';
import { ToastProvider } from 'src/contexts/ToastContext';
import PageTransition from '../components/layout/PageTransition';
import PWAInstallPrompt from '../components/ui/PWAInstallPrompt';
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NotificationProvider } from '../contexts/NotificationContext';
import SW from '../contexts/ServiceWorker';
import { AuthProvider } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { camFont } from 'src/lib/camFont';

import { useEffect } from 'react';
import ErrorBoundary from '../components/ui/ErrorBonduary';
import { SubscriptionProvider } from '../contexts/SubscriptionContext';
import PageViewTracker from '../components/analytics/PageViewTracker';
import usePageTracker from '../hooks/usePageTracker';
import { useActivityTracking } from '../hooks/useActivityTracking';
import { Toaster } from 'react-hot-toast';
import { AnalyticsProvider } from '../contexts/AnalyticsContext';
import ViewportMeta from '../components/layout/ViewportMeta';
import { AIContextProvider } from '../components/ai/ai-new/AIContextProvider';
import { CursorProvider } from '../contexts/CursorContext';

// --- Plugin System Imports ---
// Assume createPluginRegistry exists and potentially needs adjustment for client-side storage
// Removed unused PluginRegistry import here, used below explicitly
// Import the function to set the global instance for the hook
import { initializePluginRegistry } from '@/src/hooks/usePluginRegistry';
// Import client-side storage and registry implementation
import { PluginRegistry, InMemoryPluginStorage, PluginStorage } from '@/src/plugins/core/registry';
// --- End Plugin System Imports ---

import { useElementsStore } from 'src/store/elementsStore';

const inter = Inter({ subsets: ['latin'] });

// Ensure this initialization runs only once client-side
let pluginSystemInitialized = false;

export default function App({ Component, pageProps: { session, ...pageProps }, router }: AppProps) {

  // Service Worker Registration Effect (existing)
  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
          .then(registration => {
            console.log('Service Worker registered successfully:', registration.scope);
          })
          .catch(error => {
            console.log('Service Worker registration failed:', error);
          });
      });
    }
  }, []);

  // Plugin System Initialization Effect
  useEffect(() => {
    const initializePluginSystem = async () => {
       // Prevent double initialization
      if (pluginSystemInitialized) {
          console.log('[_app] Plugin system already initialized.');
          return;
      }
      pluginSystemInitialized = true; // Set flag immediately

      console.log('[_app] Initializing Plugin System...');
      try {
        // --- Removed PluginManager Initialization Block --- 

        // === Initialize Client-Side Plugin Registry ===
        // Use explicit client-side storage (e.g., in-memory for now)
        // In a real app, you might create a LocalStorage based provider
        const clientStorage = new PluginStorage(new InMemoryPluginStorage());
        const registry = new PluginRegistry(clientStorage);
        // Note: registry.init() is called in constructor, no need to await here

        // Set the global instance for the usePluginRegistry hook
        initializePluginRegistry(registry);
        console.log('[_app] Client-side PluginRegistry initialized and set for hook.');

        // --- Removed Auto-Enabling Logic --- 

      } catch (error) {
        console.error('[_app] Failed to initialize plugin system:', error);
        // Optionally: Set some global error state or show a notification
      }
    };
    
    // Run initialization only on the client
    if (typeof window !== 'undefined') {
       initializePluginSystem();
    }

  }, []); // Empty dependency array ensures this runs only once on mount
  
  return (
    <ErrorBoundary>
    <SessionProvider 
      session={session}
      >
        <AuthProvider>
          <LanguageProvider>
            <main className={`${inter.className} antialiased`}>
              <NotificationProvider>
                <ToastProvider>
                  <AnimatePresence mode="wait">
                    <PageTransition key={router.route}>
                      <PageViewTracker />
                      <AnalyticsProvider>
                        <CursorProvider>
                          <AIContextProvider>
                            <style jsx global>{`
                              body {
                                font-family: ${camFont.style.fontFamily};
                              }
                            `}</style>
                            <ViewportMeta />
                            <Component {...pageProps} />
                          </AIContextProvider>
                        </CursorProvider>
                      </AnalyticsProvider>
                      <PWAInstallPrompt />
                    </PageTransition>
                  </AnimatePresence>
                </ToastProvider>
              </NotificationProvider>
            </main>
          </LanguageProvider>
        </AuthProvider>
    </SessionProvider>
    </ErrorBoundary>
  );
}