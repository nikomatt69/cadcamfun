import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { Loader, AlertCircle } from "react-feather";

// Define the structure for a single data point in the chart
export interface UserMetricDataPoint {
  date: string; // e.g., 'Mon', 'Tue', '2023-10-26'
  aiRequests?: number;
  cadDrawings?: number;
  storageUsage?: number; // Assuming MB or GB
  projects?: number;
  components?: number;
  toolpaths?: number;
  activityCount?: number;
  toolpathsGenerated?: number;
  connections?: number;
  programRuns?: number;
}

// Define the props for the component
interface UserMetricsChartProps {
  data: UserMetricDataPoint[];
  isLoading?: boolean;
  error?: string | null;
  title?: string;
}

// Placeholder data for development/testing
const placeholderData: UserMetricDataPoint[] = [
  { date: "Mon", aiRequests: 10, cadDrawings: 5, storageUsage: 100, projects: 2, components: 15, toolpaths: 8 },
  { date: "Tue", aiRequests: 15, cadDrawings: 7, storageUsage: 120, projects: 2, components: 18, toolpaths: 10 },
  { date: "Wed", aiRequests: 12, cadDrawings: 6, storageUsage: 110, projects: 3, components: 20, toolpaths: 9 },
  { date: "Thu", aiRequests: 20, cadDrawings: 10, storageUsage: 150, projects: 3, components: 25, toolpaths: 12 },
  { date: "Fri", aiRequests: 18, cadDrawings: 9, storageUsage: 140, projects: 4, components: 28, toolpaths: 11 },
  { date: "Sat", aiRequests: 25, cadDrawings: 12, storageUsage: 180, projects: 4, components: 30, toolpaths: 15 },
  { date: "Sun", aiRequests: 22, cadDrawings: 11, storageUsage: 160, projects: 5, components: 32, toolpaths: 13 }
];

// Define colors for each metric line
const metricColors = {
  aiRequests: "#8884d8", // Purple
  cadDrawings: "#82ca9d", // Green
  storageUsage: "#ffc658", // Yellow/Orange
  projects: "#ff7300", // Orange
  components: "#00C49F", // Teal
  toolpaths: "#0088FE" // Blue
};

export const UserMetricsChart: React.FC<UserMetricsChartProps> = ({
  data = placeholderData, // Use placeholder if no data provided
  isLoading = false,
  error = null,
  title = "User Metrics Over Time"
}) => {
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex items-center justify-center h-64 bg-white dark:bg-gray-800 rounded-lg shadow p-6"
      >
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
          <Loader className="w-8 h-8 text-blue-500" />
        </motion.div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="flex flex-col items-center justify-center h-64 bg-white dark:bg-gray-800 rounded-lg shadow p-6"
      >
        <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Error Loading Chart</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
      </motion.div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex items-center justify-center h-64 bg-white dark:bg-gray-800 rounded-lg shadow p-6"
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">No data available for this period.</p>
      </motion.div>
    );
  }

  // Dynamically determine which metrics have data to display
  const availableMetrics = Object.keys(data[0] || {}).filter(
    key => key !== "date" && data.some(d => d[key as keyof UserMetricDataPoint] != null)
  ) as Array<keyof typeof metricColors>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 h-80 sm:h-96" // Increased height
    >
      <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{
            top: 5,
            right: 20,
            left: 0,
            bottom: 40 // Increased bottom margin for legend
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            dataKey="date"
            fontSize={10}
            tick={{ fill: "#6b7280" }}
            axisLine={{ stroke: "#d1d5db" }}
            tickLine={{ stroke: "#d1d5db" }}
          />
          <YAxis
            fontSize={10}
            tick={{ fill: "#6b7280" }}
            axisLine={{ stroke: "#d1d5db" }}
            tickLine={{ stroke: "#d1d5db" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              fontSize: "0.75rem",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)"
            }}
            labelStyle={{ fontWeight: "bold", color: "#1f2937", marginBottom: "0.25rem" }}
            itemStyle={{ color: "#374151", padding: "0.1rem 0" }}
          />
          <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: "20px", fontSize: "0.7rem" }} iconSize={10} />
          {availableMetrics.includes("aiRequests") && (
            <Line
              type="monotone"
              dataKey="aiRequests"
              name="AI Requests"
              stroke={metricColors.aiRequests}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          )}
          {availableMetrics.includes("cadDrawings") && (
            <Line
              type="monotone"
              dataKey="cadDrawings"
              name="CAD Drawings"
              stroke={metricColors.cadDrawings}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          )}
          {availableMetrics.includes("storageUsage") && (
            <Line
              type="monotone"
              dataKey="storageUsage"
              name="Storage (MB)"
              stroke={metricColors.storageUsage}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          )}
          {availableMetrics.includes("projects") && (
            <Line
              type="monotone"
              dataKey="projects"
              name="Projects"
              stroke={metricColors.projects}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          )}
          {availableMetrics.includes("components") && (
            <Line
              type="monotone"
              dataKey="components"
              name="Components"
              stroke={metricColors.components}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          )}
          {availableMetrics.includes("toolpaths") && (
            <Line
              type="monotone"
              dataKey="toolpaths"
              name="Toolpaths"
              stroke={metricColors.toolpaths}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
};
