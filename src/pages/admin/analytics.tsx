// src/pages/admin/analytics.tsx
import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Layout from '@/src/components/layout/Layout';
import { Calendar, BarChart2, Users, Search, Filter, RefreshCw } from 'react-feather';
import axios from 'axios';
import Loading from '@/src/components/ui/Loading';
import Metatags from '@/src/components/layout/Metatags';
import { AnalyticsOverview } from '@/src/components/analytics/AnalyticsOverview';
import { ActivityChart } from '@/src/components/analytics/ActivityChart';
import { UserHistory } from '@/src/components/analytics/UserHistory';

export default function AdminAnalyticsDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Check if user is admin
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // List of users for filtering
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  
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
  
  // Get admin status and user list
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (status === 'authenticated') {
        try {
          // Call your API to check if user is admin
          const response = await axios.get('/api/admin/check');
          setIsAdmin(response.data.isAdmin);
          
          if (response.data.isAdmin) {
            // If admin, fetch user list
            const usersResponse = await axios.get('/api/admin/users');
            setUsers(usersResponse.data);
          } else {
            // If not admin, redirect to normal analytics page
            router.push('/analytics');
          }
        } catch (error) {
          console.error('Failed to check admin status:', error);
          router.push('/analytics');
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    checkAdminStatus();
  }, [status, router]);
  
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
  
  // Handle user selection
  const handleUserChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedUser(e.target.value);
  };
  
  if (status === 'loading' || isLoading) {
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
  
  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-96">
          <div className="text-red-600 text-xl mb-4">Access Denied</div>
          <p className="text-gray-600 mb-4">You do not have permission to view this page.</p>
          <button
            onClick={() => router.push('/analytics')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go to Your Analytics
          </button>
        </div>
      </Layout>
    );
  }
  
  return (
    <>
      <Metatags title="Admin Analytics Dashboard" />
      
      <Layout>
        <div className="px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 md:mb-0">
              Admin Analytics Dashboard
            </h1>
            
            <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
              {/* User selection */}
              <div className="flex items-center relative w-full sm:w-auto">
                <Users className="h-4 w-4 absolute left-3 text-gray-500" />
                <select
                  value={selectedUser}
                  onChange={handleUserChange}
                  className="form-select pl-10 pr-8 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-white"
                >
                  <option value="">All Users</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name || user.email}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Date range controls */}
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
              
              {/* Date presets */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setDateRangePreset('7days')}
                  className="px-3 py-1 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  7d
                </button>
                <button
                  onClick={() => setDateRangePreset('30days')}
                  className="px-3 py-1 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  30d
                </button>
                <button
                  onClick={() => setDateRangePreset('90days')}
                  className="px-3 py-1 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  90d
                </button>
              </div>
            </div>
          </div>
          
          {/* Analytics Overview */}
          <AnalyticsOverview 
            startDate={dateRange.startDate} 
            endDate={dateRange.endDate}
            userFilter={selectedUser}
            isAdmin={true}
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
              userFilter={selectedUser}
            />
          </div>
          
          {/* Active Users Table */}
          <div className="mt-6 bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow rounded-lg p-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Most Active Users</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Total Activity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Last Active
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Most Common Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white divide-y divide-gray-200 dark:divide-gray-600">
                  {/* Sample data - replace with actual data from API */}
                  {[1, 2, 3, 4, 5].map((_, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                              {String.fromCharCode(65 + index)}
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              User {index + 1}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-300">
                              user{index + 1}@example.com
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {Math.floor(Math.random() * 200) + 50}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500 dark:text-gray-300">
                          {new Date(Date.now() - Math.random() * 86400000 * 10).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-100">
                          {['viewed', 'created', 'updated', 'exported'][Math.floor(Math.random() * 4)]}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                        <button
                          onClick={() => setSelectedUser(`user${index + 1}`)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* User Activity (if a specific user is selected) */}
          {selectedUser && (
            <div className="mt-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                User Activity History
              </h2>
              <UserHistory limit={20} />
            </div>
          )}
        </div>
      </Layout>
    </>
  );
}