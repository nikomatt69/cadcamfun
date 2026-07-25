import React, { ReactNode, useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";

import { motion, AnimatePresence, Variants } from "framer-motion";
import { ChevronUp, AlertTriangle } from "react-feather";
import { Toaster } from "react-hot-toast";
import EnhancedSidebar from "./Sidebar";
import Link from "next/link";
import Navbar from "./Navbar";
import Footer from "../ui/Footer";
import useRefreshToken from "@/src/hooks/useRefreshToken";
import BottomNavigation from "../components/BottomNavigation";
import CookieConsentBanner from "../components/CookieConsentBanner";
import ToastContainer from "../ui/ToastContainer";
import NotificationPermissionPrompt from "../notifications/NotificationPermissionPrompt";
import { useSession } from "@/src/lib/auth-client";

// Animation variants
const layoutVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.8,
      ease: "easeOut",
      staggerChildren: 0.1
    }
  }
};

const containerVariants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut"
    }
  }
};

const mainContentVariants = {
  initial: { opacity: 0, scale: 0.98 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.7,
      ease: "easeOut"
    }
  }
};

const breadcrumbVariants = {
  initial: { opacity: 0, y: -10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut",
      staggerChildren: 0.05
    }
  }
};

const breadcrumbItemVariants = {
  initial: { opacity: 0, x: -10 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3 }
  },
  hover: {
    x: 2,
    transition: { duration: 0.15 }
  }
};

const scrollButtonVariants = {
  initial: { opacity: 0, scale: 0.5, y: 20 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: "backOut"
    }
  },
  exit: {
    opacity: 0,
    scale: 0.5,
    y: 20,
    transition: {
      duration: 0.3,
      ease: "easeIn"
    }
  },
  hover: {
    scale: 1.1,
    y: -5,
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
    transition: { duration: 0.2 }
  },
  tap: {
    scale: 0.95,
    transition: { duration: 0.1 }
  }
};

const alertVariants = {
  initial: { opacity: 0, y: -10, scale: 0.95 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: "easeOut"
    }
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.95,
    transition: {
      duration: 0.3,
      ease: "easeIn"
    }
  }
};

const notificationVariants = {
  initial: { opacity: 0, scale: 0.9, y: 50 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "backOut"
    }
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    y: 50,
    transition: {
      duration: 0.3,
      ease: "easeIn"
    }
  }
};

type EnhancedLayoutProps = {
  children: ReactNode;
  hideNav?: boolean;
  hideSidebar?: boolean;
  fullWidth?: boolean;
  showBreadcrumbs?: boolean;
};

const EnhancedLayout: React.FC<EnhancedLayoutProps> = ({
  children,
  hideNav = false,
  hideSidebar = false,
  fullWidth = false,
  showBreadcrumbs = true
}) => {
  const { data: session } = useSession();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const maintenanceMode = false;

  // Detect mobile device and handle sidebar toggle based on screen size
  useEffect(() => {
    const handleResize = () => {
      const newIsMobile = window.innerWidth < 768;
      setIsMobile(newIsMobile);

      if (newIsMobile) {
        setSidebarOpen(false); // Always close sidebar on mobile
      } else {
        setSidebarOpen(true); // Open sidebar on desktop
      }
    };

    // Set initial state
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Close sidebar when navigating on mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [router.pathname, isMobile]); // Close sidebar when route changes on mobile

  useRefreshToken();

  // Handle scroll to show/hide "back to top" button
  useEffect(() => {
    const handleScroll = () => {
      const mainElement = mainRef.current;
      if (mainElement) {
        setShowScrollTop(mainElement.scrollTop > 300);
      }
    };

    const mainElement = mainRef.current;
    if (mainElement) {
      mainElement.addEventListener("scroll", handleScroll, { passive: true });
    }

    return () => {
      if (mainElement) {
        mainElement.removeEventListener("scroll", handleScroll);
      }
    };
  }, []);

  // Function to scroll back to top
  const scrollToTop = () => {
    const mainElement = mainRef.current;
    if (mainElement) {
      mainElement.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }
  };

  // Generate breadcrumbs based on current route
  const getBreadcrumbs = () => {
    const path = router.asPath;
    const pathSegments = path.split("/").filter(Boolean);

    // If we're on the home page, don't show breadcrumbs
    if (pathSegments.length === 0) {
      return [];
    }

    // Build breadcrumbs array with paths
    const breadcrumbs = [{ name: "Home", href: "/" }];

    let currentPath = "";
    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`;

      // Add specific breadcrumb labels based on route
      let name = segment.charAt(0).toUpperCase() + segment.slice(1);

      // Handle dynamic routes with better names
      if (segment.match(/^[a-f0-9]{24}$/)) {
        // This is likely a MongoDB ID or similar
        if (pathSegments[index - 1] === "projects") {
          name = "Project Details";
        } else if (pathSegments[index - 1] === "users") {
          name = "User Profile";
        } else {
          name = "Details";
        }
      }

      breadcrumbs.push({
        name,
        href: currentPath
      });
    });

    return breadcrumbs;
  };

  // Get breadcrumbs for the current route
  const breadcrumbs = getBreadcrumbs();

  // Determine main content width class
  const contentWidthClass = fullWidth ? "max-w-full" : "max-w-7xl";

  useEffect(() => {
    // Mostra il prompt solo se:
    // 1. L'utente è loggato
    // 2. Non ha già accettato/rifiutato le notifiche
    // 3. Il browser supporta le notifiche
    if (
      session?.user &&
      "Notification" in window &&
      !localStorage.getItem("notificationsEnabled") &&
      !localStorage.getItem("notificationsPromptDismissed")
    ) {
      // Aspetta 3 secondi prima di mostrare il prompt
      const timer = setTimeout(() => {
        setShowNotificationPrompt(true);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [session]);

  return (
    <>
      <motion.div
        className="h-screen rounded-xl backdrop-blur-sm bg-gradient-to-br from-gray-50/90 via-white/80 to-blue-50/70 dark:from-gray-900/90 dark:via-gray-800/80 dark:to-purple-900/70 text-gray-900 dark:text-gray-100 flex flex-col"
        variants={layoutVariants as Variants}
        initial="initial"
        animate="animate"
      >
        {!hideNav && (
          <motion.div variants={containerVariants as Variants}>
            <Navbar onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />
          </motion.div>
        )}

        {/* Container root for plugin iframes */}
        <div
          id="plugin-container-root"
          style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0, overflow: "hidden" }}
        ></div>

        <motion.div
          className="flex flex-1 rounded-xl rounded-t-none overflow-hidden pt-16 sm:pt-20"
          variants={containerVariants as Variants}
        >
          {!hideSidebar && (
            <motion.div variants={containerVariants as Variants}>
              <EnhancedSidebar
                isOpen={sidebarOpen}
                setIsOpen={setSidebarOpen}
                isMobile={isMobile}
              />
            </motion.div>
          )}

          <motion.div
            className={`flex-1 flex flex-col transition-all duration-300 ${!isMobile && !hideSidebar && sidebarOpen ? "md:ml-64" : !isMobile && !hideSidebar ? "md:ml-16" : ""
              }`}
            variants={mainContentVariants as Variants}
          >
            {/* Maintenance Mode Alert */}
            <AnimatePresence>
              {maintenanceMode && (
                <motion.div
                  className="backdrop-blur-md bg-amber-50/90 dark:bg-amber-900/30 border-l-4 border-amber-500 p-3 sm:p-4 flex-shrink-0 shadow-lg border border-amber-200/50 dark:border-amber-600/30"
                  variants={alertVariants as Variants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <div className="flex items-center">
                    <motion.div
                      className="flex-shrink-0"
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ duration: 0.2 }}
                    >
                      <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
                    </motion.div>
                    <div className="ml-2 sm:ml-3">
                      <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-200">
                        System is undergoing scheduled maintenance. Some features may be unavailable.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Breadcrumbs - Hide on very small screens */}
            {showBreadcrumbs && breadcrumbs.length > 0 && (
              <motion.nav
                className="backdrop-blur-md bg-gradient-to-r from-white/90 via-white/85 to-white/80 dark:from-gray-800/90 dark:via-gray-800/85 dark:to-gray-800/80 shadow-lg border-b border-white/30 dark:border-gray-600/30 px-3 rounded-b-2xl rounded-t-none py-2 sm:px-4 sm:py-3 flex-shrink-0 hidden sm:block"
                variants={breadcrumbVariants as Variants}
                initial="initial"
                animate="animate"
              >
                <motion.ol
                  className="flex text-xs sm:text-sm overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent pb-1"
                  variants={breadcrumbVariants as Variants}
                >
                  {breadcrumbs.map((breadcrumb, index) => (
                    <motion.li
                      key={breadcrumb.href}
                      className="flex items-center whitespace-nowrap"
                      variants={breadcrumbItemVariants as Variants}
                    >
                      {index > 0 && (
                        <motion.svg
                          className="mx-1 sm:mx-2 h-3 w-3 sm:h-4 sm:w-4 text-gray-400"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                        >
                          <path
                            fillRule="evenodd"
                            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                            clipRule="evenodd"
                          />
                        </motion.svg>
                      )}
                      {index === breadcrumbs.length - 1 ? (
                        <motion.span
                          className="text-gray-500 dark:text-gray-400 truncate"
                          variants={breadcrumbItemVariants as Variants}
                        >
                          {breadcrumb.name}
                        </motion.span>
                      ) : (
                        <motion.div variants={breadcrumbItemVariants as Variants} whileHover="hover">
                          <Link
                            href={breadcrumb.href}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 truncate transition-colors duration-200"
                          >
                            {breadcrumb.name}
                          </Link>
                        </motion.div>
                      )}
                    </motion.li>
                  ))}
                </motion.ol>
              </motion.nav>
            )}

            <motion.main
              ref={mainRef}
              className="flex-1 flex-grow overflow-y-auto backdrop-blur-sm bg-gradient-to-br from-gray-50/70 via-white/60 to-blue-50/50 dark:from-gray-900/70 dark:via-gray-800/60 dark:to-purple-900/50 dark:text-white scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent rounded-md transition-all duration-300 ease-in-out"
              style={{ scrollBehavior: "smooth" }}
              variants={mainContentVariants as Variants}
            >
              <motion.div
                className={`${contentWidthClass} mx-auto mb-1 rounded-2xl overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent px-2 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6`}
                variants={containerVariants as Variants}
              >
                {children}
              </motion.div>

              <Toaster
                position="bottom-right"
                containerStyle={{
                  wordBreak: "break-word",
                  bottom: "60px", // Adjusted for bottom navigation on mobile
                  right: "8px",
                  maxWidth: "calc(100vw - 32px)" // Ensure toast doesn't overflow on mobile
                }}
                toastOptions={{
                  style: {
                    maxWidth: "100%",
                    fontSize: "0.875rem",
                    backdropFilter: "blur(12px)",
                    backgroundColor: "rgba(255, 255, 255, 0.9)",
                    border: "1px solid rgba(255, 255, 255, 0.3)",
                    borderRadius: "12px"
                  }
                }}
              />
              <ToastContainer />

              {/* Notification Prompt - Hide in Electron mode */}
              <AnimatePresence>
                {showNotificationPrompt && (
                  <motion.div
                    variants={notificationVariants as Variants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <NotificationPermissionPrompt
                      onClose={() => {
                        // Persist dismissal state if not already granted
                        if (Notification.permission !== "granted") {
                          localStorage.setItem("notificationsPromptDismissed", "true");
                        }
                        setShowNotificationPrompt(false);
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Pulsante per aprire il pannello della chat - spostato per essere più contestuale */}


            </motion.main>

            {/* Back to Top button */}
            <AnimatePresence>
              {showScrollTop && (
                <motion.button
                  onClick={scrollToTop}
                  className="scroll-to-top fixed bottom-20 right-4 backdrop-blur-md bg-gradient-to-r from-blue-500/90 to-purple-500/90 hover:from-blue-600/90 hover:to-purple-600/90 text-white p-3 rounded-full shadow-2xl border border-white/30 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-blue-500/50 focus:ring-offset-2 z-40"
                  aria-label="Scroll to top"
                  variants={scrollButtonVariants as Variants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  whileHover="hover"
                  whileTap="tap"
                >
                  <motion.div
                    animate={{ y: [0, -2, 0] }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                  >
                    <ChevronUp size={20} />
                  </motion.div>
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Pannello Chat Integrato */}
        </motion.div>
        <Footer />
        <div className="sm:hidden">
          <BottomNavigation />
        </div>
        {/* Cookie Consent Banner - Hide in Electron mode */}
        <CookieConsentBanner />

        {/* AI Agent Toolbar */}
      </motion.div>
    </>
  );
};

export default EnhancedLayout;
