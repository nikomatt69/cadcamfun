// src/hooks/useActivityTracking.ts
import { useCallback } from 'react';
import axios from 'axios';
import { useSession } from 'next-auth/react';
import { ActivityItemType, ActivityAction } from '@/src/lib/activityTracking';

/**
 * Hook for client-side activity tracking
 */
export function useActivityTracking() {
  const { data: session } = useSession();
  
  /**
   * Log an activity from the client side
   */
  const trackActivity = useCallback(
    async (
      itemId: string,
      itemType: ActivityItemType,
      action: ActivityAction,
      details?: any
    ) => {
      // Only track if user is authenticated
      if (!session?.user) {
        return;
      }
      
      try {
        await axios.post('/api/analytics/track', {
          itemId,
          itemType,
          action,
          details
        });
      } catch (error) {
        // Silently fail - we don't want tracking errors to disrupt the user experience
        console.error('Failed to track activity:', error);
      }
    },
    [session]
  );
  
  /**
   * Log a page view
   */
  const trackPageView = useCallback(
    async (path: string, details?: any) => {
      // Only track if user is authenticated
      if (!session?.user) {
        return;
      }
      
      try {
        await axios.post('/api/analytics/track', {
          itemId: path,
          itemType: 'page_view',
          action: 'viewed',
          details: {
            path,
            ...details
          }
        });
      } catch (error) {
        // Silently fail
        console.error('Failed to track page view:', error);
      }
    },
    [session]
  );
  
  return {
    trackActivity,
    trackPageView
  };
}