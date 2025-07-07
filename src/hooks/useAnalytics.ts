// src/hooks/useAnalytics.ts
import { useState, useEffect, useCallback, useRef } from "react";
import { ActivityItemType, ActivityAction } from "@/src/lib/activityTracking";
import { useSession } from "@/src/lib/auth-client";
import { analyticsCoordinator } from "@/src/lib/analyticsCoordinator";
import { useTauri } from "./useTauri";

interface AnalyticsFilters {
  startDate?: Date;
  endDate?: Date;
  itemType?: ActivityItemType[];
  action?: ActivityAction[];
  groupBy?: "day" | "week" | "month";
  userFilter?: string;
}

interface UseAnalyticsResult {
  data: any;
  isLoading: boolean;
  error: any;
  refetch: () => Promise<void>;
}

// Cache globale per le richieste analytics
const analyticsCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minuti
const POLLING_INTERVAL = 5 * 60 * 1000; // 5 minuti

// Hook principale ottimizzato
export function useAnalytics(filters: AnalyticsFilters = {}, options: { enablePolling?: boolean } = { enablePolling: true }): UseAnalyticsResult {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<any>(null);
  const pollerIdRef = useRef<string>(`analytics-${Math.random().toString(36).substr(2, 9)}`);
  const { data: session } = useSession();
  const { httpFetch } = useTauri();

  // Genera chiave cache basata sui filtri
  const getCacheKey = useCallback(() => {
    return JSON.stringify({
      startDate: filters.startDate?.toISOString(),
      endDate: filters.endDate?.toISOString(),
      itemType: filters.itemType?.sort(),
      action: filters.action?.sort(),
      groupBy: filters.groupBy,
      userFilter: filters.userFilter
    });
  }, [filters]);

  const fetchAnalytics = useCallback(async (forceRefresh = false) => {
    // Only fetch if user is authenticated
    if (!session?.user?.id) {
      setIsLoading(false);
      return;
    }

    const cacheKey = getCacheKey();
    const now = Date.now();

    // Controlla cache se non è un refresh forzato
    if (!forceRefresh) {
      const cached = analyticsCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        setData(cached.data);
        setIsLoading(false);
        return;
      }
    }

    // Mostra loading solo per la prima richiesta
    if (!data && !forceRefresh) setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (filters.startDate) {
        params.append("startDate", filters.startDate.toISOString());
      }
      if (filters.endDate) {
        params.append("endDate", filters.endDate.toISOString());
      }
      if (filters.itemType?.length) {
        filters.itemType.forEach(type => {
          params.append("itemType", type);
        });
      }
      if (filters.action?.length) {
        filters.action.forEach(action => {
          params.append("action", action);
        });
      }
      if (filters.groupBy) {
        params.append("groupBy", filters.groupBy);
      }
      if (filters.userFilter) {
        params.append("userFilter", filters.userFilter);
      }

      const response = await httpFetch(`/api/analytics?${params.toString()}`, {
        method: 'GET',
        headers: { "Cache-Control": "no-cache" }
      });

      if (!response.ok) {
        // Handle non-ok responses
        if (response.status === 401) {
          throw new Error("Analytics fetch failed: User not authenticated");
        }
        throw new Error(`Analytics fetch failed with status: ${response.status}`);
      }

      const responseData = await response.json();
      setData(responseData);

      // Salva in cache
      analyticsCache.set(cacheKey, { data: responseData, timestamp: now });

    } catch (err: any) {
      // Handle 401 errors specifically to avoid spamming
      if (err.message.includes("401") || err.message.includes("not authenticated")) {
        console.warn("Analytics fetch failed: User not authenticated");
        setError(null); // Don't show error for auth issues
      } else {
        setError(err);
        console.error("Failed to fetch analytics data:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [filters, data, getCacheKey, session, httpFetch]);

  useEffect(() => {
    // Only start polling if user is authenticated
    if (!session?.user?.id) {
      setIsLoading(false);
      return;
    }

    // Fetch iniziale
    fetchAnalytics();

    // Use global coordinator for polling instead of individual intervals
    if (options.enablePolling) {
      analyticsCoordinator.registerPoller(pollerIdRef.current, () => {
        fetchAnalytics(true);
      });
    }

    // Cleanup
    return () => {
      analyticsCoordinator.unregisterPoller(pollerIdRef.current);
    };
  }, [fetchAnalytics, options.enablePolling, session?.user?.id]);

  return {
    data,
    isLoading,
    error,
    refetch: () => fetchAnalytics(true)
  };
}

// Hook semplificato per metriche utente (con cache dedicata)
interface UserHistoryFilters {
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
  itemType?: ActivityItemType[];
  action?: ActivityAction[];
}

interface UseUserHistoryResult {
  history: { logs: any[]; total: number };
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
  const [history, setHistory] = useState<{ logs: any[]; total: number }>({ logs: [], total: 0 });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<any>(null);
  const { data: session } = useSession();
  const { httpFetch } = useTauri();

  const fetchHistory = useCallback(async () => {
    // Only fetch if user is authenticated
    if (!session?.user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (filters.limit) {
        params.append("limit", filters.limit.toString());
      }
      if (filters.offset !== undefined) {
        params.append("offset", filters.offset.toString());
      }
      if (filters.startDate) {
        params.append("startDate", filters.startDate.toISOString());
      }
      if (filters.endDate) {
        params.append("endDate", filters.endDate.toISOString());
      }
      if (filters.itemType?.length) {
        filters.itemType.forEach(type => {
          params.append("itemType", type);
        });
      }
      if (filters.action?.length) {
        filters.action.forEach(action => {
          params.append("action", action);
        });
      }

      const response = await httpFetch(`/api/analytics/user-history?${params.toString()}`);

      if (!response.ok) {
        // Handle non-ok responses
        if (response.status === 401) {
          throw new Error("User history fetch failed: User not authenticated");
        }
        throw new Error(`User history fetch failed with status: ${response.status}`);
      }

      const responseData = await response.json();

      if (filters.offset && filters.offset > 0) {
        setHistory(prev => ({
          logs: [...prev.logs, ...responseData.logs],
          total: responseData.total
        }));
      } else {
        setHistory(responseData);
      }
    } catch (err: any) {
      // Handle 401 errors specifically to avoid spamming
      if (err.message.includes("401") || err.message.includes("not authenticated")) {
        console.warn("User history fetch failed: User not authenticated");
        setError(null); // Don't show error for auth issues
      } else {
        setError(err);
        console.error("Failed to fetch user history:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [filters, session, httpFetch]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const hasMore = history.logs.length < history.total;

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
