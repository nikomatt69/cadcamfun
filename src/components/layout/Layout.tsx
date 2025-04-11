import React, { ReactNode, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { ChevronUp, AlertTriangle } from 'react-feather';
import { Toaster } from 'react-hot-toast';
import EnhancedSidebar from './Sidebar';
import Link from 'next/link';
import Navbar from './Navbar';
import Footer from '../ui/Footer';
import useRefreshToken from '@/src/hooks/useRefreshToken';
import BottomNavigation from '../components/BottomNavigation';
import CookieConsentBanner from '../components/CookieConsentBanner';
import { disconnectWebSocket, initializeWebSocket } from '@/src/lib/websocket';
import { AIAssistant, AIAssistantButton } from '../ai/ai-new';
import ToastContainer from '../ui/ToastContainer';
import NotificationPermissionPrompt from '../notifications/NotificationPermissionPrompt';
import  PluginSidebar  from 'src/components/plugins/PluginSidebar';


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
  const [showPluginSidebar, setShowPluginSidebar] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [welcomeBanner, setWelcomeBanner] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  
  // Handle sidebar toggle based on screen size
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Set initial state based on screen size
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

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
      mainElement.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      if (mainElement) {
        mainElement.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  // Function to scroll back to top
  const scrollToTop = () => {
    const mainElement = mainRef.current;
    if (mainElement) {
      mainElement.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };
  
  // Generate breadcrumbs based on current route
  const getBreadcrumbs = () => {
    const path = router.asPath;
    const pathSegments = path.split('/').filter(Boolean);
    
    // If we're on the home page, don't show breadcrumbs
    if (pathSegments.length === 0) {
      return [];
    }
    
    // Build breadcrumbs array with paths
    const breadcrumbs = [{ name: 'Home', href: '/' }];
    
    let currentPath = '';
    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      
      // Add specific breadcrumb labels based on route
      let name = segment.charAt(0).toUpperCase() + segment.slice(1);
      
      // Handle dynamic routes with better names
      if (segment.match(/^[a-f0-9]{24}$/)) {
        // This is likely a MongoDB ID or similar
        if (pathSegments[index - 1] === 'projects') {
          name = 'Project Details';
        } else if (pathSegments[index - 1] === 'users') {
          name = 'User Profile';
        } else {
          name = 'Details';
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
  const contentWidthClass = fullWidth ? 'max-w-full' : 'max-w-7xl';

  useEffect(() => {
    // Mostra il prompt solo se:
    // 1. L'utente è loggato
    // 2. Non ha già accettato/rifiutato le notifiche
    // 3. Il browser supporta le notifiche
    if (
      session?.user &&
      'Notification' in window &&
      !localStorage.getItem('notificationsEnabled') &&
      !localStorage.getItem('notificationsPromptDismissed')
    ) {
      // Aspetta 3 secondi prima di mostrare il prompt
      const timer = setTimeout(() => {
        setShowNotificationPrompt(true);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [session]);

  return (
    <div className="h-screen rounded-xl bg-gray dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col">
      {!hideNav && 
        <Navbar />
     }
      
      <div className="flex flex-1 rounded-xl overflow-hidden">
        {!hideSidebar && (
          <EnhancedSidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        )}
        
        <div className={`flex-1 flex flex-col transition-all duration-300 ${
          !hideSidebar && sidebarOpen ? 'md:ml-64' : !hideSidebar ? 'md:ml-16' : ''
        }`}>
          {/* Maintenance Mode Alert */}
          {maintenanceMode && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-3 sm:p-4 flex-shrink-0">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
                </div>
                <div className="ml-2 sm:ml-3">
                  <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-200">
                    System is undergoing scheduled maintenance. Some features may be unavailable.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Breadcrumbs - Hide on very small screens */}
          {showBreadcrumbs && breadcrumbs.length > 0 && (
            <nav className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-sm px-3 py-2 sm:px-4 sm:py-3 flex-shrink-0 hidden sm:block">
              <ol className="flex text-xs sm:text-sm overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent pb-1">
                {breadcrumbs.map((breadcrumb, index) => (
                  <li key={breadcrumb.href} className="flex items-center whitespace-nowrap">
                    {index > 0 && (
                      <svg className="mx-1 sm:mx-2 h-3 w-3 sm:h-4 sm:w-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                    {index === breadcrumbs.length - 1 ? (
                      <span className="text-gray-500 dark:text-gray-400 truncate">{breadcrumb.name}</span>
                    ) : (
                      <Link href={breadcrumb.href} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 truncate">
                        {breadcrumb.name}
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          
          {/* Main content with scrolling */}
          <main 
            ref={mainRef}
            className="flex-1 overflow-y-auto dark:bg-gray-900 dark:text-white scrollbar-thin bg-gray-50 rounded-xl scrollbar-thumb-gray-300 scrollbar-track-transparent" 
            style={{ scrollBehavior: 'smooth' }}
          >
            
            <div className={`${contentWidthClass} mx-auto mb-1 rounded-xl overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent px-2 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6`}>
              {children}
            </div>
            <>
              
              <PluginSidebar 
             isOpen={sidebarOpen}
             onClose={() => setSidebarOpen(false)}
              /> 
              
              </>
            <Toaster
              position="bottom-right"
              containerStyle={{ 
                wordBreak: 'break-word',
                bottom: '60px', // Adjusted for bottom navigation on mobile
                right: '8px',
                maxWidth: 'calc(100vw - 32px)' // Ensure toast doesn't overflow on mobile
              }}
              toastOptions={{
                style: {
                  maxWidth: '100%',
                  fontSize: '0.875rem'
                }
              }}
             
              
            />
            <ToastContainer />
            {/* Footer */}
            <footer className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-inner mt-6 sm:mt-8 pb-16 sm:pb-0">
              <div className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 text-center sm:text-left">
                <div className="flex flex-col md:flex-row justify-between items-center">
                  <div className="mb-3 md:mb-0">
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      &copy; {new Date().getFullYear()} CAD/CAM FUN. All rights reserved.
                    </p>
                  </div>
                  <div className="flex space-x-3 sm:space-x-6 text-xs sm:text-sm">
                    <Footer/>
                  </div>
                </div>
              </div>
            </footer>
            <div className="fixed bottom-4 right-4 z-150"><AIAssistant/></div>
            
            <AIAssistantButton mode="cad" fixed className='ac' />
            {/* Bottom Navigation for Mobile */}
            <div className="sm:hidden">
              <BottomNavigation/>
            </div>
          </main>
          
          {/* Back to Top button - positioned higher on mobile to avoid bottom nav */}
          {showScrollTop && (
            <button
              onClick={scrollToTop}
              className="fixed bottom-16 sm:bottom-6 right-4 sm:right-6 p-2 sm:p-3 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 focus:outline-none transition-all duration-300 z-40"
              aria-label="Back to top"
            >
              <ChevronUp size={16} className="sm:h-5 sm:w-5" />
            </button>
          )}
        </div>
      </div>
      
      {/* Cookie Consent Banner - at the very bottom with bottom padding for mobile */}
      <CookieConsentBanner />
      
      {showNotificationPrompt && (
        <NotificationPermissionPrompt
          onClose={() => setShowNotificationPrompt(false)}
        />
      )}
    </div>
  );
};

export default EnhancedLayout;