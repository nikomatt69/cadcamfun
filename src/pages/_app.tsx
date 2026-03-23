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
import { AuthProvider } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { camFont } from 'src/lib/camFont';

import { useEffect } from 'react';
import { ErrorBoundary } from '@/src/components/ui/ErrorBoundary';
import { AnalyticsProvider } from '../contexts/AnalyticsContext';
import ViewportMeta from '../components/layout/ViewportMeta';
import { AIContextProvider } from '../components/ai/ai-new/AIContextProvider';
import { CursorProvider } from '../contexts/CursorContext';
import { PluginClientProvider } from '../context/PluginClientContext';

import { initializePluginRegistry } from '@/src/hooks/usePluginRegistry';
import { PluginRegistry, PluginStorage } from '@/src/plugins/core/registry';
import { InMemoryPluginStorage } from '@/src/plugins/core/registry/pluginStorage';

import { logger } from '@/src/lib/error/logger';
import { monitoring } from '@/src/lib/monitoring';

let pluginSystemInitialized = false;

export default function App({ Component, pageProps: { session, ...pageProps }, router }: AppProps) {

  // Service Worker Registration Effect (existing)
  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
          .then(registration => {
            logger.debug('Service Worker registered successfully:', registration.scope);
          })
          .catch(error => {
            logger.error('Service Worker registration failed:', error);
          });
      });
    }
  }, []);

  // Plugin System Initialization Effect
  useEffect(() => {
     const initializePluginSystem = async () => {
      if (pluginSystemInitialized) {
          logger.debug('Plugin system already initialized.');
          return;
      }
      pluginSystemInitialized = true;

      logger.debug('Initializing Plugin System...');
      try {
        const clientStorage = new PluginStorage(new InMemoryPluginStorage());
        const registry = new PluginRegistry(clientStorage);
        initializePluginRegistry(registry);
        logger.debug('Client-side PluginRegistry initialized and set for hook.');

      } catch (error) {
        logger.error('Failed to initialize plugin system:', error);
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
            <main className={`${camFont.style.fontFamily} antialiased`}>
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
                            <PluginClientProvider>
                             
                                <Component {...pageProps} />
                              
                            </PluginClientProvider>
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