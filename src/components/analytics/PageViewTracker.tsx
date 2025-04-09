// src/components/analytics/PageViewTracker.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useActivityTracking } from 'src/hooks/useActivityTracking';

/**
 * Component that automatically tracks page views
 * Place this component in your _app.tsx to track all page views
 */
export const PageViewTracker: React.FC = () => {
  const router = useRouter();
  const { status } = useSession();
  const { trackPageView } = useActivityTracking();
  
  useEffect(() => {
    // Only track when authentication is complete
    if (status !== 'authenticated') {
      return;
    }
    
    // Define handler for route changes
    const handleRouteChange = (path: string) => {
      // Track the page view
      trackPageView(path, {
        query: router.query,
        referrer: document.referrer
      });
    };
    
    // Track the initial page view
    handleRouteChange(router.pathname);
    
    // Set up the route change handler
    router.events.on('routeChangeComplete', handleRouteChange);
    
    // Clean up the route change handler
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router, status, trackPageView]);
  
  // This component doesn't render anything
  return null;
};

export default PageViewTracker;