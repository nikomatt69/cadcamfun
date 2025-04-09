// src/components/analytics/AnalyticsOverview.tsx - Updated for mobile
import React from 'react';
import { useAnalytics } from '@/src/hooks/useAnalytics';
import { Activity, Users, Eye, FileText, Tool, Database } from 'react-feather';
import Loading from '@/src/components/ui/Loading';
import { ActivityCard } from './ActivityCard';
import { StatCard } from './StatCard';
import { ActivityItemType } from '@/src/lib/activityTracking';

interface AnalyticsOverviewProps {
  startDate?: Date;
  endDate?: Date;
  userFilter?: string;
  isAdmin?: boolean;
}

export const AnalyticsOverview: React.FC<AnalyticsOverviewProps> = ({
  startDate,
  endDate,
  userFilter,
  isAdmin = false
}) => {
  const { data, isLoading, error } = useAnalytics({
    startDate,
    endDate,
    userFilter,
    groupBy: 'day'
  });
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loading />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-50 text-red-800 p-3 rounded-md text-sm">
        <p>Failed to load analytics data</p>
        <p className="text-xs mt-1">{error.message}</p>
      </div>
    );
  }
  
  if (!data) {
    return (
      <div className="bg-yellow-50 text-yellow-800 p-3 rounded-md text-sm">
        <p>No analytics data available</p>
      </div>
    );
  }
  
  // Group activity by type
  const activityByType = data.statistics?.countByType?.reduce((acc: Record<string, number>, item: any) => {
    acc[item.itemType] = item._count;
    return acc;
  }, {}) || {};
  
  // Group activity by action
  const activityByAction = data.statistics?.countByAction?.reduce((acc: Record<string, number>, item: any) => {
    acc[item.action] = item._count;
    return acc;
  }, {}) || {};
  
  // Calculate total activity count
  const totalActivityCount = Object.values(activityByType).length > 0 
    ? (Object.values(activityByType) as number[]).reduce((sum, count) => sum + count, 0) 
    : 0;
  
  // Map icons to activity types
  const getIcon = (type: ActivityItemType) => {
    switch (type) {
      case 'project':
        return <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500" />;
      case 'component':
        return <Database className="h-6 w-6 sm:h-8 sm:w-8 text-green-500" />;
      case 'tool':
        return <Tool className="h-6 w-6 sm:h-8 sm:w-8 text-orange-500" />;
      case 'page_view':
        return <Eye className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500" />;
      default:
        return <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-gray-500" />;
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Stats Cards - Responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Total Activity"
          value={totalActivityCount}
          icon={<Activity className="h-8 w-8 sm:h-10 sm:w-10 text-blue-500" />}
          change={10} // Replace with actual change percentage
          changeLabel="vs. previous period"
        />
        
        <StatCard
          title="Active Users"
          value={data.activeUsers?.length || 0}
          icon={<Users className="h-8 w-8 sm:h-10 sm:w-10 text-green-500" />}
          change={5} // Replace with actual change percentage
          changeLabel="from last month"
        />
        
        {isAdmin && (
          <StatCard
            title="Total Users"
            value={data.userCount || 0}
            icon={<Users className="h-8 w-8 sm:h-10 sm:w-10 text-purple-500" />}
          />
        )}
        
        <StatCard
          title="Page Views"
          value={activityByType['page_view'] || 0}
          icon={<Eye className="h-8 w-8 sm:h-10 sm:w-10 text-indigo-500" />}
          change={3} // Replace with actual change percentage
          changeLabel="from last week"
        />
      </div>
      
      {/* Activity by Type - Responsive card */}
      <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow rounded-lg p-3 sm:p-4">
        <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-3 sm:mb-4">Activity by Type</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Object.entries(activityByType)
            .sort(([, countA], [, countB]) => (countB as number) - (countA as number))
            .map(([type, count]) => (
              <ActivityCard
                key={type}
                title={type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}
                count={count as number}
                icon={getIcon(type as ActivityItemType)}
              />
            ))
          }
        </div>
      </div>
      
      {/* Recent Activity - Scrollable table container */}
      <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow rounded-lg p-3 sm:p-4">
        <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-3 sm:mb-4">Recent Activity</h3>
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
                {data.recentActivity && data.recentActivity.length > 0 ? (
                  data.recentActivity.slice(0, 5).map((activity: any) => (
                    <tr key={activity.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      {isAdmin && (
                        <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-6 w-6 sm:h-8 sm:w-8">
                              {activity.user?.image ? (
                                <img className="h-6 w-6 sm:h-8 sm:w-8 rounded-full" src={activity.user.image} alt="" />
                              ) : (
                                <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                                  {activity.user?.name?.charAt(0) || '?'}
                                </div>
                              )}
                            </div>
                            <div className="ml-2 sm:ml-4">
                              <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate max-w-[100px] sm:max-w-none">
                                {activity.user?.name || 'Unknown'}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-300 truncate max-w-[100px] sm:max-w-none">
                                {activity.user?.email || ''}
                              </div>
                            </div>
                          </div>
                        </td>
                      )}
                      <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                        <div className="text-xs sm:text-sm text-gray-900 dark:text-white capitalize">
                          {(activity.action || '').replace('_', ' ')}
                        </div>
                      </td>
                      <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                        <div className="text-xs sm:text-sm text-gray-900 dark:text-white capitalize">
                          {(activity.itemType || '').replace('_', ' ')}
                        </div>
                      </td>
                      <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500 dark:text-gray-300">
                        {activity.timestamp ? new Date(activity.timestamp).toLocaleDateString() : ''}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={isAdmin ? 4 : 3} className="px-3 py-4 sm:px-6 sm:py-8 text-center text-sm text-gray-500 dark:text-gray-300">
                      No recent activity
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};