// src/hooks/useAnalytics.ts
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ActivityItemType, ActivityAction } from '@/src/lib/activityTracking';

interface AnalyticsFilters {
  startDate?: Date;
  endDate?: Date;
  itemType?: ActivityItemType[];
  action?: ActivityAction[];
  groupBy?: 'day' | 'week' | 'month';
  userFilter?: string;
}

interface UseAnalyticsResult {
  data: any;
  isLoading: boolean;
  error: any;
  refetch: () => Promise<void>;
}

export function useAnalytics(filters: AnalyticsFilters = {}): UseAnalyticsResult {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<any>(null);
  
  const fetchAnalytics = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Build query parameters
      const params = new URLSearchParams();
      
      if (filters.startDate) {
        params.append('startDate', filters.startDate.toISOString());
      }
      
      if (filters.endDate) {
        params.append('endDate', filters.endDate.toISOString());
      }
      
      if (filters.itemType?.length) {
        filters.itemType.forEach(type => {
          params.append('itemType', type);
        });
      }
      
      if (filters.action?.length) {
        filters.action.forEach(action => {
          params.append('action', action);
        });
      }
      
      if (filters.groupBy) {
        params.append('groupBy', filters.groupBy);
      }
      
      if (filters.userFilter) {
        params.append('userFilter', filters.userFilter);
      }
      
      // Make the API request
      const response = await axios.get(`/api/analytics?${params.toString()}`);
      setData(response.data);
    } catch (err) {
      setError(err);
      console.error('Failed to fetch analytics data:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchAnalytics();
  }, [
    filters.startDate?.toISOString(),
    filters.endDate?.toISOString(),
    filters.itemType?.join(','),
    filters.action?.join(','),
    filters.groupBy,
    filters.userFilter
  ]);
  
  return {
    data,
    isLoading,
    error,
    refetch: fetchAnalytics
  };
}

interface UserHistoryFilters {
  limit?: number;
  offset?: number;
  itemType?: ActivityItemType[];
  action?: ActivityAction[];
  startDate?: Date;
  endDate?: Date;
}

interface UseUserHistoryResult {
  history: any;
  isLoading: boolean;
  error: any;
  refetch: () => Promise<void>;
  hasMore: boolean;
  loadMore: () => void;
}

export function useUserHistory(initialFilters: UserHistoryFilters = {}): UseUserHistoryResult {
  const [filters, setFilters] = useState<UserHistoryFilters>({
    limit: 50,
    offset: 0,
    ...initialFilters
  });
  const [history, setHistory] = useState<{ logs: any[], total: number }>({ logs: [], total: 0 });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<any>(null);
  
  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Build query parameters
      const params = new URLSearchParams();
      
      if (filters.limit) {
        params.append('limit', filters.limit.toString());
      }
      
      if (filters.offset !== undefined) {
        params.append('offset', filters.offset.toString());
      }
      
      if (filters.startDate) {
        params.append('startDate', filters.startDate.toISOString());
      }
      
      if (filters.endDate) {
        params.append('endDate', filters.endDate.toISOString());
      }
      
      if (filters.itemType?.length) {
        filters.itemType.forEach(type => {
          params.append('itemType', type);
        });
      }
      
      if (filters.action?.length) {
        filters.action.forEach(action => {
          params.append('action', action);
        });
      }
      
      // Make the API request
      const response = await axios.get(`/api/analytics/user-history?${params.toString()}`);
      
      // If we're loading more (offset > 0), append to existing logs
      if (filters.offset && filters.offset > 0) {
        setHistory(prev => ({
          logs: [...prev.logs, ...response.data.logs],
          total: response.data.total
        }));
      } else {
        // Otherwise, replace the logs
        setHistory(response.data);
      }
    } catch (err) {
      setError(err);
      console.error('Failed to fetch user history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);
  
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, filters.limit, filters.offset]);
  
  // Check if there are more logs to load
  const hasMore = history.logs.length < history.total;
  
  // Function to load more logs
  const loadMore = () => {
    if (hasMore && !isLoading) {
      setFilters(prev => ({
        ...prev,
        offset: (prev.offset || 0) + (prev.limit || 50)
      }));
    }
  };
  
  return {
    history,
    isLoading,
    error,
    refetch: fetchHistory,
    hasMore,
    loadMore
  };
}