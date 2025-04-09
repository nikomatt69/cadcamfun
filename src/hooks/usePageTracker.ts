// src/hooks/usePageTracker.ts
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';

export default function usePageTracker() {
  const router = useRouter();
  const { data: session, status } = useSession();
  
  useEffect(() => {
    // Only track if the user is authenticated
    if (status !== 'authenticated' || !session?.user?.id) return;
    
    const trackPageView = async () => {
      const path = router.asPath;
      let pageType = 'page';
      let itemId = '';
      
      // Identify page type based on path
      if (path.startsWith('/projects/')) {
        pageType = 'project';
        itemId = path.split('/')[2];
      } else if (path.startsWith('/cad')) {
        pageType = 'cad_editor';
      } else if (path.startsWith('/cam')) {
        pageType = 'cam_editor';
      } else if (path.startsWith('/materials/')) {
        pageType = 'material';
        itemId = path.split('/')[2];
      } else if (path.startsWith('/components/')) {
        pageType = 'component';
        itemId = path.split('/')[2];
      } else if (path.startsWith('/drawings/')) {
        pageType = 'drawing';
        itemId = path.split('/')[2];
      }
      
      try {
        await fetch('/api/analytics/track', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'page_view',
            itemId: itemId || undefined,
            itemType: pageType,
            details: { path }
          }),
        });
      } catch (error) {
        console.error('Failed to track page view:', error);
      }
    };
    
    trackPageView();
  }, [router.asPath, session, status]);
  
  // No return value needed as this is just for tracking
  return null;
}