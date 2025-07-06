// src/components/analytics/PageViewTracker.tsx
import { useEffect } from "react";
import { useRouter } from "next/router";

import { useActivityTracking } from "src/hooks/useActivityTracking";
import { useAuth } from "@/src/contexts/AuthContext";

/**
 * Component that automatically tracks page views
 * Place this component in your _app.tsx to track all page views
 */
export const PageViewTracker: React.FC = () => {
  const router = useRouter();

  const { trackPageView } = useActivityTracking();
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    // Only track when authentication is complete
    if (!isAuthenticated || !user) {
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
    router.events.on("routeChangeComplete", handleRouteChange);

    // Clean up the route change handler
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router, trackPageView, isAuthenticated, user]);

  // This component doesn't render anything
  return null;
};

export default PageViewTracker;
