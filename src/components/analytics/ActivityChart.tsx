// src/components/analytics/ActivityChart.tsx
import React, { useCallback, useEffect, useState, useRef } from "react";
import axios from "axios";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { Loader, AlertCircle } from "react-feather";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartJSTooltip,
  Legend as ChartJSLegend
} from "chart.js";
import { UserMetricDataPoint } from "./UserMetricsChart"; // Keep using this unified interface

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, ChartJSTooltip, ChartJSLegend);

// Cache per ActivityChart
const activityChartCache = new Map<string, { data: any; timestamp: number }>();
const ACTIVITY_CHART_CACHE_DURATION = 5 * 60 * 1000; // 5 minuti

// Define possible metrics (ensure this matches the API's validMetrics)
export type ChartMetric =
  | "activityCount"
  | "toolpathsGenerated"
  | "connections"
  | "programRuns"
  | "aiRequests"
  | "cadDrawings"
  | "storageUsage"
  | "projects"
  | "components"
  | "toolpaths";

interface ActivityChartProps {
  startDate?: Date;
  endDate?: Date;
  groupBy?: "day" | "week" | "month";
  itemType?: string[]; // For filtering ActivityLog based metrics
  action?: string[]; // For filtering ActivityLog based metrics
  userFilter?: string;
  chartType?: "line" | "bar";
  metric?: ChartMetric; // Use the defined type
}

// Define colors for each metric (Consolidated)
const metricColors = {
  activityCount: "#4f46e5", // Indigo
  aiRequests: "#8884d8", // Purple
  cadDrawings: "#82ca9d", // Green
  storageUsage: "#ffc658", // Yellow/Orange
  projects: "#ff7300", // Orange
  components: "#00C49F", // Teal
  toolpaths: "#0088FE", // Blue
  toolpathsGenerated: "#fbbf24", // Amber (assuming this is distinct from toolpaths count)
  connections: "#a855f7", // Purple (different shade)
  programRuns: "#ec4899" // Pink
};

export const ActivityChart: React.FC<ActivityChartProps> = ({
  startDate,
  endDate,
  groupBy = "day",
  itemType,
  action,
  userFilter,
  chartType = "line",
  metric = "activityCount"
}) => {
  const [data, setData] = useState<UserMetricDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Genera cache key
  const getCacheKey = () => {
    return JSON.stringify({
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      groupBy,
      itemType: itemType?.sort(),
      action: action?.sort(),
      userFilter,
      metric
    });
  };

  const fetchActivityData = useCallback(async (forceRefresh = false) => {
    const cacheKey = getCacheKey();
    const now = Date.now();
    
    // Controlla cache se non è refresh forzato
    if (!forceRefresh) {
      const cached = activityChartCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < ACTIVITY_CHART_CACHE_DURATION) {
        setData(cached.data);
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    setError(null);
    let currentError: Error | null = null;
    
    try {
      const endpoint = "/api/analytics/user-metrics";

      const response = await axios.get(endpoint, {
        params: {
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
          groupBy,
          itemType,
          action,
          userFilter,
          metric
        },
        timeout: 15000,
        headers: { "Cache-Control": "no-cache" },
        withCredentials: true
      });

      if (response.data && response.data.chartData) {
        setData(response.data.chartData);
        setRetryCount(0);
        
        // Salva in cache
        activityChartCache.set(cacheKey, { 
          data: response.data.chartData, 
          timestamp: now 
        });
      } else {
        throw new Error("Invalid data structure received from the server");
      }
    } catch (err) {
      console.error("Error fetching activity data:", err);
      currentError = err as Error;
      const errorMessage = err instanceof Error ? err.message : "Failed to load chart data";
      setError(errorMessage);

      if (
        retryCount < 2 &&
        axios.isAxiosError(err) &&
        (err.response?.status === 500 || err.response?.status === 504 || !err.response)
      ) {
        const delay = 2000 * Math.pow(2, retryCount);
        setRetryCount(prev => prev + 1);
        console.log(`Retrying fetch in ${delay}ms (attempt ${retryCount + 1})`);
        setTimeout(() => fetchActivityData(true), delay);
      } else {
        setRetryCount(0);
      }
    } finally {
      if (
        !(
          axios.isAxiosError(currentError) &&
          (currentError.response?.status === 500 || currentError.response?.status === 504 || !currentError.response) &&
          retryCount < 2
        )
      ) {
        setIsLoading(false);
      }
    }
  }, [retryCount, startDate, endDate, groupBy, itemType, action, userFilter, metric]);

  useEffect(() => {
    setRetryCount(0);
    
    // Fetch iniziale
    fetchActivityData();

    // Setup polling ogni 5 minuti
    intervalRef.current = setInterval(() => {
      fetchActivityData(true); // Force refresh
    }, 5 * 60 * 1000);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [startDate?.toISOString(), endDate?.toISOString(), groupBy, itemType?.join(","), action?.join(","), userFilter, metric]);

  // --- Loading, Error, No Data states remain largely the same ---
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
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
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

  if (error && retryCount === 0) {
    // Only show error if not retrying
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
              setRetryCount(0); // Reset retries before manual attempt
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

  // Check for data *after* loading and error checks
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
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No data available for the selected period or metric.
          </p>
        </motion.div>
      </motion.div>
    );
  }

  // Format date label based on groupBy
  const formatDate = (date: string) => {
    try {
      const d = new Date(date + "T00:00:00Z"); // Assume UTC date from API
      if (isNaN(d.getTime())) {
        return "Invalid date"; // Handle potential invalid date strings
      }

      switch (groupBy) {
        case "day":
          return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
        case "week":
          // Display the start date of the week
          return `Wk ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`;
        case "month":
          return d.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
        default:
          return date;
      }
    } catch (e) {
      console.error("Date formatting error:", date, e);
      return "Date Error";
    }
  };

  // Determine the data key based on the metric prop
  // The API now returns data with the correct metric field populated
  const dataKey = metric as keyof UserMetricDataPoint; // Use the metric directly as the key

  const chartLabel = metric
    .replace(/([A-Z])/g, " $1") // Add space before capitals
    .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
    .trim();

  const metricColor = metricColors[metric as keyof typeof metricColors] || "#4f46e5"; // Fallback color

  // Render the appropriate chart type (Line or Bar)
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow duration-300"
    >
      <motion.h3
        className="text-sm sm:text-base font-medium text-gray-600 dark:text-gray-400 mb-4 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        {chartLabel} Trend ({groupBy})
      </motion.h3>
      <motion.div
        className="h-64"
        whileHover={{ scale: 1.01 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "line" ? (
            <LineChart
              data={data}
              margin={{ top: 5, right: 10, left: -20, bottom: 20 }} // Adjusted margins
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                angle={-45}
                textAnchor="end"
                height={60}
                tick={{ fill: "var(--color-text-secondary)", fontSize: "0.7rem" }}
                stroke="var(--color-border-default)"
                interval="preserveStartEnd" // Ensure start/end labels are shown
              />
              <YAxis
                tick={{ fill: "var(--color-text-secondary)", fontSize: "0.7rem" }}
                stroke="var(--color-border-default)"
                allowDecimals={false} // Assuming counts are integers
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-canvas-subtle)",
                  borderColor: "var(--color-border-default)",
                  borderRadius: "0.375rem",
                  fontSize: "0.75rem",
                  color: "var(--color-text-primary)"
                }}
                labelFormatter={formatDate}
                formatter={(value: number, name: string) => [value, chartLabel]} // Use consistent label
              />
              <Line
                type="monotone"
                dataKey={dataKey} // Use the metric key directly
                name={chartLabel} // Set name for tooltip
                stroke={metricColor}
                strokeWidth={2}
                dot={{ r: 3, fill: metricColor }}
                activeDot={{ r: 6, strokeWidth: 0, fill: "var(--color-accent-emphasis)" }}
                connectNulls={false} // Don't connect lines across missing data points (0 values)
              />
            </LineChart>
          ) : (
            // Bar Chart
            <BarChart
              data={data}
              margin={{ top: 5, right: 10, left: -20, bottom: 20 }} // Adjusted margins
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                angle={-45}
                textAnchor="end"
                height={60}
                tick={{ fill: "var(--color-text-secondary)", fontSize: "0.7rem" }}
                stroke="var(--color-border-default)"
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "var(--color-text-secondary)", fontSize: "0.7rem" }}
                stroke="var(--color-border-default)"
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-canvas-subtle)",
                  borderColor: "var(--color-border-default)",
                  borderRadius: "0.375rem",
                  fontSize: "0.75rem",
                  color: "var(--color-text-primary)"
                }}
                labelFormatter={formatDate}
                formatter={(value: number, name: string) => [value, chartLabel]}
              />
              <Bar
                dataKey={dataKey} // Use the metric key directly
                name={chartLabel} // Set name for tooltip
                fill={metricColor}
                radius={[4, 4, 0, 0]} // Rounded top corners
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </motion.div>
    </motion.div>
  );
};

export default ActivityChart;
