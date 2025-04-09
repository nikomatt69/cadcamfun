// src/pages/analytics/index.tsx
import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Layout from '@/src/components/layout/Layout';
import { Calendar, BarChart2, Users, ArrowRight } from 'react-feather';
import Loading from '@/src/components/ui/Loading';
import Metatags from '@/src/components/layout/Metatags';
import { AnalyticsOverview } from 'src/components/analytics/AnalyticsOverview';
import { ActivityChart } from '@/src/components/analytics/ActivityChart';
import { UserHistory } from '@/src/components/analytics/UserHistory';

export default function AnalyticsDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Date range state
  const [dateRange, setDateRange] = useState<{
    startDate?: Date;
    endDate?: Date;
  }>({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)), // Last 30 days
    endDate: new Date()
  });
  
  // Chart type state
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  
  // Handle date range changes
  const handleDateChange = (type: 'start' | 'end', value: string) => {
    if (!value) {
      setDateRange(prev => ({
        ...prev,
        [type === 'start' ? 'startDate' : 'endDate']: undefined
      }));
      return;
    }
    
    const date = new Date(value);
    setDateRange(prev => ({
      ...prev,
      [type === 'start' ? 'startDate' : 'endDate']: date
    }));
  };
  
  // Predefined date ranges
  const setDateRangePreset = (preset: 'today' | '7days' | '30days' | '90days' | 'year') => {
    const endDate = new Date();
    let startDate = new Date();
    
    switch (preset) {
      case 'today':
        startDate = new Date(endDate);
        startDate.setHours(0, 0, 0, 0);
        break;
      case '7days':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case 'year':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
    }
    
    setDateRange({ startDate, endDate });
  };
  
  // Toggle chart type
  const toggleChartType = () => {
    setChartType(prev => prev === 'line' ? 'bar' : 'line');
  };
  
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading />
      </div>
    );
  }
  
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  
  // Check if user is admin (implement your own admin check)
  const isAdmin = false;
  
  return (
    <>
      <Metatags title="Analytics Dashboard" />
      
      <Layout>
        <div className="px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 md:mb-0">
              Analytics Dashboard
            </h1>
            
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setDateRangePreset('today')}
                  className="px-3 py-1 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Today
                </button>
                <button
                  onClick={() => setDateRangePreset('7days')}
                  className="px-3 py-1 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  7 Days
                </button>
                <button
                  onClick={() => setDateRangePreset('30days')}
                  className="px-3 py-1 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  30 Days
                </button>
                <button
                  onClick={() => setDateRangePreset('90days')}
                  className="px-3 py-1 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  90 Days
                </button>
                <button
                  onClick={() => setDateRangePreset('year')}
                  className="px-3 py-1 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Year
                </button>
              </div>
              
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <input
                    type="date"
                    className="form-input rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-900 text-sm focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400"
                    value={dateRange.startDate?.toISOString().split('T')[0] || ''}
                    onChange={(e) => handleDateChange('start', e.target.value)}
                  />
                </div>
                <span className="text-gray-500">to</span>
                <div className="flex items-center space-x-1">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <input
                    type="date"
                    className="form-input rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-900 text-sm focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400"
                    value={dateRange.endDate?.toISOString().split('T')[0] || ''}
                    onChange={(e) => handleDateChange('end', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Analytics Overview */}
          <AnalyticsOverview 
            startDate={dateRange.startDate} 
            endDate={dateRange.endDate}
            isAdmin={isAdmin}
          />
          
          {/* Activity Chart */}
          <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Activity Trends</h2>
              <button
                onClick={toggleChartType}
                className="flex items-center text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              >
                <BarChart2 className="h-4 w-4 mr-1" />
                {chartType === 'line' ? 'Show Bar Chart' : 'Show Line Chart'}
              </button>
            </div>
            <ActivityChart 
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              chartType={chartType}
            />
          </div>
          
          {/* User History */}
          <div className="mt-6">
            <UserHistory limit={20} />
            
            <div className="mt-4 text-center">
              <a 
                href="/analytics/history"
                className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
              >
                View Complete History
                <ArrowRight className="h-4 w-4 ml-1" />
              </a>
            </div>
          </div>
        </div>
      </Layout>
    </>
  );
}