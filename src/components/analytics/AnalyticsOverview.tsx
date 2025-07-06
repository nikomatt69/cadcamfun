// src/components/analytics/AnalyticsOverview.tsx - Updated for mobile
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useAnalytics } from "@/src/hooks/useAnalytics";
import {
  Activity,
  Users,
  Eye,
  FileText,
  Tool,
  Database,
  Server,
  CheckCircle,
  AlertCircle,
  Cpu,
  BarChart,
  Zap, // Added for AI Requests
  HardDrive, // Added for Storage
  Folder, // Added for Projects
  Grid, // Added for Components
  GitMerge // Added for Toolpaths (alternative)
} from "react-feather";
import Loading from "@/src/components/ui/Loading";
import { ActivityCard } from "./ActivityCard";
import { StatCard } from "./StatCard";
import { ActivityItemType } from "@/src/lib/activityTracking";

interface AnalyticsOverviewProps {
  startDate?: Date;
  endDate?: Date;
  userFilter?: string;
  isAdmin?: boolean;
}

// Cache per user metrics
const userMetricsCache = new Map<string, { data: any; timestamp: number }>();
const USER_METRICS_CACHE_DURATION = 5 * 60 * 1000; // 5 minuti

// Interface for user metrics summary data from API
interface UserMetricsSummary {
  totalActions: number;
  uniqueActionsToday: number;
  avgActionsPerDay: number;
  mostActiveHour: number;
  lastActivityTime?: Date;

  totalAIRequests: number;
  totalTokensUsed: number;
  estimatedCost: number;
  mostUsedModel: string;

  cadOperations: number;
  camOperations: number;
  projectsWorkedOn: number;
  componentsCreated: number;
  toolpathsGenerated: number;

  storageUsedMB: number;
  drawingsCreated: number;

  connectionsEstablished: number;
  programRuns: number;
}

// Interface for the API response structure (only summary needed here now)
interface UserMetricsApiResponse {
  summary: UserMetricsSummary;
}

export const AnalyticsOverview: React.FC<AnalyticsOverviewProps> = ({
  startDate,
  endDate,
  userFilter,
  isAdmin = false
}) => {
  const {
    data: generalAnalyticsData,
    isLoading: isGeneralLoading,
    error: generalError
  } = useAnalytics({
    startDate,
    endDate,
    userFilter,
    groupBy: "day"
  });

  // State for user metrics summary con cache ottimizzata
  const [metricsSummary, setMetricsSummary] = useState<UserMetricsSummary | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Genera cache key per user metrics
  const getCacheKey = () => {
    return JSON.stringify({
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      userFilter
    });
  };

  // Fetch ottimizzato con cache
  const fetchMetricsSummary = async (forceRefresh = false) => {
    // Only fetch if user is authenticated
    if (!isAdmin) {
      // For non-admin users, we would typically need session check
      // but this component is passed isAdmin prop, so we respect that
    }

    const cacheKey = getCacheKey();
    const now = Date.now();
    
    // Controlla cache se non è refresh forzato
    if (!forceRefresh) {
      const cached = userMetricsCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < USER_METRICS_CACHE_DURATION) {
        setMetricsSummary(cached.data);
        setIsSummaryLoading(false);
        return;
      }
    }

    // Loading solo per prima richiesta
    if (!metricsSummary && !forceRefresh) setIsSummaryLoading(true);
    setSummaryError(null);
    
    try {
      const params = {
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        userFilter
      };
      
      const response = await axios.get<UserMetricsApiResponse>("/api/analytics/user-metrics", {
        params,
        timeout: 10000,
        headers: { "Cache-Control": "no-cache" }
      });
      
      if (response.data && response.data.summary) {
        setMetricsSummary(response.data.summary);
        // Salva in cache
        userMetricsCache.set(cacheKey, { data: response.data.summary, timestamp: now });
      } else {
        throw new Error("Summary data not found in API response");
      }
    } catch (err) {
      console.error("Failed to fetch user metrics summary:", err);
      setSummaryError(err instanceof Error ? err.message : "Failed to load metrics summary");
    } finally {
      setIsSummaryLoading(false);
    }
  };

  // Effect ottimizzato con polling di 5 minuti
  useEffect(() => {
    // Fetch iniziale
    fetchMetricsSummary();

    // Setup polling ogni 5 minuti - coordinato con altri analytics
    intervalRef.current = setInterval(() => {
      fetchMetricsSummary(true); // Force refresh
    }, 5 * 60 * 1000);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [startDate?.toISOString(), endDate?.toISOString(), userFilter]);

  // Combined loading state
  const isLoading = isGeneralLoading || isSummaryLoading;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-60">
        <Loading />
      </div>
    );
  }

  const combinedError = generalError?.message || summaryError;
  if (combinedError) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-md shadow-sm space-y-2">
        <div className="flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          <p className="font-semibold">Failed to load analytics data</p>
        </div>
        <p className="text-sm ml-7">{combinedError}</p>
      </div>
    );
  }

  if (!generalAnalyticsData && !isGeneralLoading) {
    // Decide how to handle this - maybe just show StatCards?
  }

  const { statistics, activeUsers, userCount, recentActivity } = generalAnalyticsData || {};
  const activityByType =
    statistics?.countByType?.reduce((acc: Record<string, number>, item: any) => {
      acc[item.itemType] = item._count;
      return acc;
    }, {}) || {};

  const totalActivityCount =
    metricsSummary?.totalActions ??
    (Object.values(activityByType).length > 0
      ? (Object.values(activityByType) as number[]).reduce((sum, count) => sum + count, 0)
      : 0);

  const getIcon = (type: ActivityItemType) => {
    switch (type) {
      case "project":
        return <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500" />;
      case "component":
        return <Database className="h-6 w-6 sm:h-8 sm:w-8 text-green-500" />;
      case "tool":
        return <Tool className="h-6 w-6 sm:h-8 sm:w-8 text-orange-500" />;
      case "page_view":
        return <Eye className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500" />;
      default:
        return <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <StatCard
          title="Total Activity"
          value={totalActivityCount}
          icon={<Activity className="h-8 w-8 sm:h-10 sm:w-10 text-blue-500" />}
        />

        <StatCard
          title="Active Users"
          value={activeUsers?.length || 0}
          icon={<Users className="h-8 w-8 sm:h-10 sm:w-10 text-green-500" />}
        />

        {isAdmin && (
          <StatCard
            title="Total Users"
            value={userCount || 0}
            icon={<Users className="h-8 w-8 sm:h-10 sm:w-10 text-purple-500" />}
          />
        )}

        <StatCard
          title="Page Views"
          value={activityByType["page_view"] || 0}
          icon={<Eye className="h-8 w-8 sm:h-10 sm:w-10 text-indigo-500" />}
        />

        <StatCard
          title="AI Requests"
          value={metricsSummary?.totalAIRequests ?? "N/A"}
          icon={<Zap className="h-8 w-8 sm:h-10 sm:w-10 text-yellow-500" />}
        />
        <StatCard
          title="CAD Drawings"
          value={metricsSummary?.cadOperations ?? "N/A"}
          icon={<FileText className="h-8 w-8 sm:h-10 sm:w-10 text-cyan-500" />}
        />
        <StatCard
          title="Storage Used (MB)"
          value={metricsSummary?.storageUsedMB ?? "N/A"}
          icon={<HardDrive className="h-8 w-8 sm:h-10 sm:w-10 text-red-500" />}
        />
        <StatCard
          title="Projects"
          value={metricsSummary?.projectsWorkedOn ?? "N/A"}
          icon={<Folder className="h-8 w-8 sm:h-10 sm:w-10 text-blue-600" />}
        />
        <StatCard
          title="Components"
          value={metricsSummary?.componentsCreated ?? "N/A"}
          icon={<Grid className="h-8 w-8 sm:h-10 sm:w-10 text-green-600" />}
        />
        <StatCard
          title="Toolpaths"
          value={metricsSummary?.toolpathsGenerated ?? "N/A"}
          icon={<GitMerge className="h-8 w-8 sm:h-10 sm:w-10 text-purple-600" />}
        />
      </div>

      {Object.keys(activityByType).length > 0 && (
        <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow rounded-lg p-3 sm:p-4 mt-4">
          <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-3 sm:mb-4">
            Activity by Type
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.entries(activityByType)
              .sort(([, countA], [, countB]) => (countB as number) - (countA as number))
              .map(([type, count]) => (
                <ActivityCard
                  key={type}
                  title={type.charAt(0).toUpperCase() + type.slice(1).replace("_", " ")}
                  count={count as number}
                  icon={getIcon(type as ActivityItemType)}
                />
              ))}
          </div>
        </div>
      )}

      {recentActivity && recentActivity.length > 0 && (
        <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow rounded-lg p-3 sm:p-4 mt-4">
          <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-3 sm:mb-4">
            Recent Activity
          </h3>
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <div className="inline-block min-w-full align-middle px-3 sm:px-0">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    {isAdmin && (
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        User
                      </th>
                    )}
                    <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white divide-y divide-gray-200 dark:divide-gray-600">
                  {recentActivity.slice(0, 5).map((activity: any) => (
                    <tr key={activity.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      {isAdmin && (
                        <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-6 w-6 sm:h-8 sm:w-8">
                              {activity.user?.image ? (
                                <img className="h-6 w-6 sm:h-8 sm:w-8 rounded-full" src={activity.user.image} alt="" />
                              ) : (
                                <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                                  {activity.user?.name?.charAt(0) || "?"}
                                </div>
                              )}
                            </div>
                            <div className="ml-2 sm:ml-4">
                              <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate max-w-[100px] sm:max-w-none">
                                {activity.user?.name || "Unknown"}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-300 truncate max-w-[100px] sm:max-w-none">
                                {activity.user?.email || ""}
                              </div>
                            </div>
                          </div>
                        </td>
                      )}
                      <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                        <div className="text-xs sm:text-sm text-gray-900 dark:text-white capitalize">
                          {(activity.action || "").replace("_", " ")}
                        </div>
                      </td>
                      <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                        <div className="text-xs sm:text-sm text-gray-900 dark:text-white capitalize">
                          {(activity.itemType || "").replace("_", " ")}
                        </div>
                      </td>
                      <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                        <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-300">
                          {new Date(activity.createdAt).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
