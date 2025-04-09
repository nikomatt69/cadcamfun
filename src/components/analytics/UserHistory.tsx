// src/components/analytics/UserHistory.tsx
import React, { useState } from 'react';
import { useUserHistory } from '@/src/hooks/useAnalytics';
import { Calendar, Filter, ChevronDown, Activity } from 'react-feather';
import Loading from '@/src/components/ui/Loading';
import { ActivityItemType, ActivityAction } from '@/src/lib/activityTracking';

interface UserHistoryProps {
  limit?: number;
}

export const UserHistory: React.FC<UserHistoryProps> = ({
  limit = 50
}) => {
  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<{
    startDate?: Date;
    endDate?: Date;
    itemTypes: ActivityItemType[];
    actions: ActivityAction[];
  }>({
    itemTypes: [],
    actions: []
  });
  
  // Fetch user history
  const { history, isLoading, error, hasMore, loadMore } = useUserHistory({
    limit,
    itemType: filters.itemTypes.length ? filters.itemTypes : undefined,
    action: filters.actions.length ? filters.actions : undefined,
    startDate: filters.startDate,
    endDate: filters.endDate
  });
  
  // Handle filter changes
  const handleItemTypeChange = (type: ActivityItemType) => {
    setFilters(prev => ({
      ...prev,
      itemTypes: prev.itemTypes.includes(type)
        ? prev.itemTypes.filter(t => t !== type)
        : [...prev.itemTypes, type]
    }));
  };
  
  const handleActionChange = (action: ActivityAction) => {
    setFilters(prev => ({
      ...prev,
      actions: prev.actions.includes(action)
        ? prev.actions.filter(a => a !== action)
        : [...prev.actions, action]
    }));
  };
  
  const handleDateChange = (type: 'start' | 'end', value: string) => {
    if (!value) {
      setFilters(prev => ({
        ...prev,
        [type === 'start' ? 'startDate' : 'endDate']: undefined
      }));
      return;
    }
    
    const date = new Date(value);
    setFilters(prev => ({
      ...prev,
      [type === 'start' ? 'startDate' : 'endDate']: date
    }));
  };
  
  // Activity type options
  const itemTypeOptions: ActivityItemType[] = [
    'project',
    'drawing',
    'component',
    'material',
    'tool',
    'toolpath',
    'organization',
    'machine',
    'page_view'
  ];
  
  // Action options
  const actionOptions: ActivityAction[] = [
    'created',
    'updated',
    'deleted',
    'viewed',
    'exported',
    'imported',
    'shared',
    'login',
    'logout',
    'generate_gcode',
    'analyze_gcode',
    'run_simulation'
  ];
  
  // Get badge color based on action
  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'created':
        return 'bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-100';
      case 'updated':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-100';
      case 'deleted':
        return 'bg-red-100 text-red-800 dark:bg-red-700 dark:text-red-100';
      case 'viewed':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100';
      case 'exported':
      case 'imported':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-700 dark:text-purple-100';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100';
    }
  };
  
  if (error) {
    return (
      <div className="bg-red-50 text-red-800 p-4 rounded-md">
        <p>Failed to load your activity history</p>
        <p className="text-sm">{error.message}</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Your Activity History</h2>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
        >
          <Filter className="h-4 w-4 mr-1" />
          Filters
          <ChevronDown className={`h-4 w-4 ml-1 transform transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
      </div>
      
      {/* Filters panel */}
      {showFilters && (
        <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow rounded-lg p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date Range</h3>
              <div className="space-y-2">
                <div className="flex items-center">
                  <label className="inline-flex items-center text-sm text-gray-700 dark:text-gray-300 mr-2">
                    <Calendar className="h-4 w-4 mr-1" />
                    From:
                  </label>
                  <input
                    type="date"
                    className="form-input rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-900 text-sm focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400"
                    value={filters.startDate?.toISOString().split('T')[0] || ''}
                    onChange={(e) => handleDateChange('start', e.target.value)}
                  />
                </div>
                <div className="flex items-center">
                  <label className="inline-flex items-center text-sm text-gray-700 dark:text-gray-300 mr-2">
                    <Calendar className="h-4 w-4 mr-1" />
                    To:
                  </label>
                  <input
                    type="date"
                    className="form-input rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-900 text-sm focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400"
                    value={filters.endDate?.toISOString().split('T')[0] || ''}
                    onChange={(e) => handleDateChange('end', e.target.value)}
                  />
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Item Types</h3>
              <div className="grid grid-cols-2 gap-2">
                {itemTypeOptions.map((type) => (
                  <label key={type} className="inline-flex items-center">
                    <input
                      type="checkbox"
                      className="form-checkbox rounded text-blue-600 focus:ring-blue-500"
                      checked={filters.itemTypes.includes(type)}
                      onChange={() => handleItemTypeChange(type)}
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 capitalize">{type.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                {actionOptions.map((action) => (
                  <label key={action} className="inline-flex items-center">
                    <input
                      type="checkbox"
                      className="form-checkbox rounded text-blue-600 focus:ring-blue-500"
                      checked={filters.actions.includes(action)}
                      onChange={() => handleActionChange(action)}
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 capitalize">{action.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Activity history list */}
      <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow rounded-lg">
        {history.logs?.length === 0 ? (
          <div className="p-6 text-center">
            <Activity className="h-12 w-12 text-gray-400 mx-auto mb-2" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No activity found</h3>
            <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">
              {filters.itemTypes.length || filters.actions.length || filters.startDate || filters.endDate
                ? 'Try adjusting your filters to see more results.'
                : 'Your activity history will appear here as you use the platform.'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden">
            <ul className="divide-y divide-gray-200 dark:divide-gray-600">
              {history.logs?.map((activity: any) => (
                <li key={activity.id} className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`px-2 py-1 rounded-md text-xs font-medium ${getActionBadgeColor(activity.action)}`}>
                        {activity.action.replace('_', ' ')}
                      </div>
                      <p className="ml-2 text-sm font-medium text-gray-900 dark:text-white capitalize">
                        {activity.itemType.replace('_', ' ')}
                      </p>
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-300">
                      {new Date(activity.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                      Item ID: {activity.itemId}
                    </p>
                    {activity.details && Object.keys(activity.details).length > 0 && (
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-300">
                        <details>
                          <summary className="cursor-pointer text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
                            View details
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto max-h-40">
                            {JSON.stringify(activity.details, null, 2)}
                          </pre>
                        </details>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            
            {hasMore && (
              <div className="px-4 py-4 sm:px-6 border-t border-gray-200 dark:border-gray-600">
                <button
                  onClick={loadMore}
                  disabled={isLoading}
                  className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {isLoading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        )}
        
        {isLoading && (
          <div className="flex justify-center items-center p-4">
            <Loading />
          </div>
        )}
      </div>
    </div>
  );
};