// src/pages/_app.tsx
import "src/styles/globals.css";
import "src/styles/gcode-editor.css"; // Import the GCode Editor styles
import type { AppProps } from "next/app";
import { AnimatePresence } from "framer-motion";
import { ToastProvider } from "src/contexts/ToastContext";
import PageTransition from "../components/layout/PageTransition";
import PWAInstallPrompt from "../components/ui/PWAInstallPrompt";
import { NotificationProvider } from "../contexts/NotificationContext";
import { AuthProvider } from "../contexts/AuthContext";
import { AuthLoadingProvider } from "../contexts/AuthLoadingContext";
import AuthWrapper from "../components/auth/AuthWrapper";
import { LanguageProvider } from "../contexts/LanguageContext";
import { camFont } from "src/lib/camFont";
import ErrorBoundary from "../components/ui/ErrorBonduary";
import { SubscriptionProvider } from "../contexts/SubscriptionContext";
import PageViewTracker from "../components/analytics/PageViewTracker";
import { AnalyticsProvider } from "../contexts/AnalyticsContext";
import ViewportMeta from "../components/layout/ViewportMeta";
import { AIContextProvider } from "../components/ai/ai-new/AIContextProvider";
import { CursorProvider } from "../contexts/CursorContext";
import { PluginClientProvider } from "@/src/contexts/PluginClientContext";
import { initializePluginRegistry } from "@/src/hooks/usePluginRegistry";
import { PluginRegistry, PluginStorage } from "@/src/plugins/core/registry";
import { InMemoryPluginStorage } from "@/src/plugins/core/registry/pluginStorage";
import MetaTags from "../components/layout/Metatags";
import { useElementsStore } from "src/store/elementsStore";
import { ThemeProvider } from "../contexts/ThemeProvider";
import { ConstraintProvider } from "../contexts/ConstraintContext";
import { MCPProvider } from "../contexts/MCPContext";
import InitialOnboarding from "../components/auth/InitialOnboarding";
import { useAuth } from "../contexts/AuthContext";
import { useState, useCallback, useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { authClient } from "../lib/auth-client";
import { initializeSqlClient } from '../lib/database/sqlClient';
// Import the event handlers

// Ensure this initialization runs only once client-side
let pluginSystemInitialized = false;

export default function App({ Component, pageProps, router }: AppProps) {
  // Get the function to add elements from the Zustand store
  const addElements = useElementsStore(state => state.addElements);
  const [sqlClientReady, setSqlClientReady] = useState(false);

  // Welcome onboarding state - shows BEFORE signin

  const [showWelcome, setShowWelcome] = useState(false);

  // Check if user should see welcome onboarding
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;
    
    // Show onboarding only for non-authenticated users who haven't seen it
    const checkOnboarding = async () => {
      try {
        if (authClient && authClient.getSession) {
          const session = await authClient.getSession();
          if (!session) {
            const hasSeenOnboarding = localStorage.getItem('cadcam-onboarding-seen');
            if (!hasSeenOnboarding) {
              setShowWelcome(true);
            }
          }
        }
      } catch (error) {
        console.error('Error checking onboarding status:', error);
      }
    };
    
    checkOnboarding();
  }, []);

  // Handle onboarding completion - redirect to signin
  const handleOnboardingComplete = useCallback(() => {
    setShowWelcome(false);
    localStorage.setItem('cadcam-onboarding-seen', 'true');
    // Redirect to signin page
    router.push('/auth/signin');
  }, [router]);

  // Service Worker Registration Effect (existing)
  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/service-worker.js")
          .then(registration => {
            console.log("Service Worker registered successfully:", registration.scope);
          })
          .catch(error => {
            console.log("Service Worker registration failed:", error);
          });
      });
    }
  }, []);

  // Plugin System Initialization Effect
  useEffect(() => {
    const initializePluginSystem = async () => {
      // Prevent double initialization
      if (pluginSystemInitialized) {
        console.log("[_app] Plugin system already initialized.");
        return;
      }
      pluginSystemInitialized = true; // Set flag immediately

      console.log("[_app] Initializing Plugin System...");
      try {
        // === Initialize Client-Side Plugin Registry ===
        // Use explicit client-side storage (e.g., in-memory for now)
        // In a real app, you might create a LocalStorage based provider
        const clientStorage = new PluginStorage(new InMemoryPluginStorage());
        const registry = new PluginRegistry(clientStorage);
        // Note: registry.init() is called in constructor, no need to await here

        // Set the global instance for the usePluginRegistry hook
        initializePluginRegistry(registry);
        console.log("[_app] Client-side PluginRegistry initialized and set for hook.");
      } catch (error) {
        console.error("[_app] Failed to initialize plugin system:", error);
        // Optionally: Set some global error state or show a notification
      }
    };

    // Run initialization only on the client
    if (typeof window !== "undefined") {
      initializePluginSystem();
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  // Initialize SQL client on app startup
  useEffect(() => {
    const initSqlClient = async () => {
      try {
        await initializeSqlClient();
        setSqlClientReady(true);
        console.log('✅ SQL Client initialized in app startup');
      } catch (error) {
        console.warn('⚠️ SQL Client initialization failed:', error);
        setSqlClientReady(true); // Continue without SQL client
      }
    };

    initSqlClient();
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider >
        <AuthLoadingProvider>
          <AuthWrapper>
            <LanguageProvider>
              <MetaTags ogImage="/og-image.png" />
              <main className={`${camFont.style.fontFamily} antialiased bg-white dark:bg-gray-900`}>
                <div id="plugin-container-root" style={{ position: "relative", zIndex: 1000 }} />
                <ThemeProvider>
                  <SubscriptionProvider>
                    <NotificationProvider>
                      <ToastProvider>
                        <AnimatePresence mode="wait">
                          <PageTransition key={router.route}>
                            <PageViewTracker />
                            <AnalyticsProvider>
                              <CursorProvider>
                                <MCPProvider>
                                  <ConstraintProvider>
                                    <AIContextProvider addElementsToCanvas={addElements}>
                                      {/* Add event handlers for CAD/CAM integration */}
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
                                  </ConstraintProvider>
                                </MCPProvider>
                              </CursorProvider>
                            </AnalyticsProvider>
                            <PWAInstallPrompt />
                          </PageTransition>
                        </AnimatePresence>
                      </ToastProvider>
                    </NotificationProvider>
                  </SubscriptionProvider>
                </ThemeProvider>
              </main>
            </LanguageProvider>
          </AuthWrapper>
        </AuthLoadingProvider>
      </AuthProvider>

      {/* Initial Onboarding - appears before signin for new users */}
      <InitialOnboarding
        isVisible={showWelcome}
        onComplete={handleOnboardingComplete}
      />
    </ErrorBoundary>
  );
}
