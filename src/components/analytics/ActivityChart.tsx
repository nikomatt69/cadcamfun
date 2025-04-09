// src/components/analytics/ActivityChart.tsx
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader, AlertCircle } from 'react-feather';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartJSTooltip,
  Legend as ChartJSLegend,
  ChartData
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartJSTooltip,
  ChartJSLegend
);

interface ActivityChartProps {
  startDate?: Date;
  endDate?: Date;
  groupBy?: 'day' | 'week' | 'month';
  itemType?: string[];
  action?: string[];
  userFilter?: string;
  chartType?: 'line' | 'bar';
}

interface ActivityData {
  date: string;
  count: number;
}

export const ActivityChart: React.FC<ActivityChartProps> = ({
  startDate,
  endDate,
  groupBy = 'day',
  itemType,
  action,
  userFilter,
  chartType = 'line'
}) => {
  const [data, setData] = useState<ActivityData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const fetchActivityData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await axios.get('/api/analytics/chart', {
        timeout: 10000, // 10 second timeout
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        withCredentials: true
      });

      if (response.data) {
        setData(response.data);
      } else {
        throw new Error('No data received from the server');
      }
    } catch (err) {
      console.error('Error fetching activity data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load chart data';
      setError(errorMessage);
      
      // Retry logic for specific errors
      if (retryCount < 3 && axios.isAxiosError(err) && (err.response?.status === 500 || !err.response)) {
        setRetryCount(prev => prev + 1);
        setTimeout(() => {
          fetchActivityData();
        }, 2000 * Math.pow(2, retryCount)); // Exponential backoff
      }
    } finally {
      setIsLoading(false);
    }
  }, [retryCount]);

  useEffect(() => {
    fetchActivityData();
  }, [fetchActivityData]);
  
  if (isLoading) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex items-center justify-center h-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
      >
        <motion.div 
          className="flex flex-col items-center"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <Loader className="w-8 h-8 text-blue-500" />
          </motion.div>
          <motion.p 
            className="mt-2 text-sm text-gray-500 dark:text-gray-400"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Loading chart data...
          </motion.p>
        </motion.div>
      </motion.div>
    );
  }
  
  if (error) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="flex items-center justify-center h-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
      >
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          >
            <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
          </motion.div>
          <motion.h3 
            className="text-lg font-medium text-gray-900 dark:text-white mb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Unable to load chart
          </motion.h3>
          <motion.p 
            className="text-sm text-gray-500 dark:text-gray-400 mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {error}
          </motion.p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setRetryCount(0);
              fetchActivityData();
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors shadow-md hover:shadow-lg"
          >
            Try again
          </motion.button>
        </div>
      </motion.div>
    );
  }
  
  if (!data || data.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex items-center justify-center h-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
      >
        <motion.div 
          className="text-center"
          initial={{ y: 20 }}
          animate={{ y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <p className="text-sm text-gray-500 dark:text-gray-400">No data available</p>
        </motion.div>
      </motion.div>
    );
  }
  
  // Format date label based on groupBy
  const formatDate = (date: string) => {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) {
        throw new Error('Invalid date');
      }
      
      switch (groupBy) {
        case 'day':
          return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        case 'week':
          return `Week ${d.toLocaleDateString(undefined, { day: 'numeric' })}`;
        case 'month':
          return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        default:
          return date;
      }
    } catch (e) {
      console.error('Date formatting error:', e);
      return 'Invalid date';
    }
  };
  
  // Render the appropriate chart type
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow duration-300"
    >
      <motion.div 
        className="h-64"
        whileHover={{ scale: 1.01 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'line' ? (
            <LineChart
              data={data}
              margin={{ top: 5, right: 10, left: 0, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatDate}
                angle={-45}
                textAnchor="end"
                height={60}
                tick={{ fontSize: 10 }}
                padding={{ left: 10, right: 10 }}
              />
              <YAxis 
                tick={{ fontSize: 10 }}
                width={30}
              />
              <Tooltip
                formatter={(value: number) => [`${value} activities`, 'Count']}
                labelFormatter={(label: string) => formatDate(label)}
                contentStyle={{ 
                  fontSize: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  border: 'none',
                  padding: '8px'
                }}
              />
              <Legend 
                wrapperStyle={{ 
                  fontSize: '12px', 
                  marginTop: '10px',
                  padding: '10px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)'
                }} 
              />
              <Line 
                type="monotone" 
                dataKey="count" 
                name="Activity Count"
                stroke="#3B82F6" 
                strokeWidth={3}
                dot={{ strokeWidth: 2 }}
                activeDot={{ 
                  r: 8,
                  strokeWidth: 2,
                  stroke: '#3B82F6',
                  fill: '#fff'
                }} 
              />
            </LineChart>
          ) : (
            <BarChart
              data={data}
              margin={{ top: 5, right: 10, left: 0, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatDate}
                angle={-45}
                textAnchor="end"
                height={60}
                tick={{ fontSize: 10 }}
                padding={{ left: 10, right: 10 }}
              />
              <YAxis 
                tick={{ fontSize: 10 }}
                width={30}
              />
              <Tooltip
                formatter={(value: number) => [`${value} activities`, 'Count']}
                labelFormatter={(label: string) => formatDate(label)}
                contentStyle={{ 
                  fontSize: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  border: 'none',
                  padding: '8px'
                }}
              />
              <Legend 
                wrapperStyle={{ 
                  fontSize: '12px', 
                  marginTop: '10px',
                  padding: '10px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)'
                }} 
              />
              <Bar 
                dataKey="count" 
                name="Activity Count"
                fill="#3B82F6"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </motion.div>
    </motion.div>
  );
};

export default ActivityChart;