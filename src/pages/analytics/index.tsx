// src/pages/analytics/index.tsx
import React, { useState } from "react";

import { useRouter } from "next/router";
import { motion, AnimatePresence, Variants } from "framer-motion";
import Layout from "@/src/components/layout/Layout";
import { Calendar, BarChart2, ChevronDown, Activity, TrendingUp, Users, Cpu, DollarSign } from "react-feather";
import Loading from "@/src/components/ui/Loading";
import { AnalyticsOverview } from "src/components/analytics/AnalyticsOverview";
import { ActivityChart, ChartMetric } from "@/src/components/analytics/ActivityChart";
import { AIDashboard } from "@/src/components/ai/ai-new/AIDashboard";
import { UserCostAnalytics } from "@/src/components/analytics/UserCostAnalytics";
import MetaTags from "@/src/components/layout/Metatags";

// Animation variants
const pageVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      staggerChildren: 0.1
    }
  },
  exit: { opacity: 0, y: -20 }
};

const cardVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 20 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: "easeOut"
    }
  }
};

const headerVariants: Variants = {
  initial: { opacity: 0, y: -20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut"
    }
  }
};

const buttonVariants: Variants = {
  hover: {
    scale: 1.05,
    y: -2,
    transition: {
      duration: 0.2,
      ease: "easeInOut"
    }
  },
  tap: {
    scale: 0.98,
    transition: {
      duration: 0.1
    }
  }
};

const tabVariants: Variants = {
  inactive: {
    scale: 1,
    backgroundColor: "transparent"
  },
  active: {
    scale: 1.02,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    transition: {
      duration: 0.2
    }
  },
  hover: {
    scale: 1.03,
    backgroundColor: "rgba(59, 130, 246, 0.05)",
    transition: {
      duration: 0.15
    }
  }
};

// Define the metric options for the dropdown
type MetricOption = {
  value: ChartMetric;
  label: string;
};

const metricOptions: MetricOption[] = [
  { value: "activityCount", label: "Activity Count" },
  { value: "aiRequests", label: "AI Requests" },
  { value: "cadDrawings", label: "CAD Drawings" },
  { value: "projects", label: "Projects" },
  { value: "components", label: "Components" },
  { value: "toolpaths", label: "Toolpaths" },
  { value: "storageUsage", label: "Storage Usage (MB)" },
  { value: "toolpathsGenerated", label: "Toolpaths Generated" },
  { value: "connections", label: "Connections" },
  { value: "programRuns", label: "Program Runs" }
];

export default function AnalyticsDashboardPage() {

  const router = useRouter();
  const [activeSection, setActiveSection] = useState<"overview" | "charts" | "ai" | "costs">("overview");

  // Date range state
  const [dateRange, setDateRange] = useState<{
    startDate?: Date;
    endDate?: Date;
  }>({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)), // Last 30 days
    endDate: new Date()
  });

  // Chart type state
  const [chartType, setChartType] = useState<"line" | "bar">("line");

  // Selected metric state
  const [selectedMetric, setSelectedMetric] = useState<ChartMetric>("activityCount");

  // Handle date range changes
  const handleDateChange = (type: "start" | "end", value: string) => {
    if (!value) {
      setDateRange(prev => ({
        ...prev,
        [type === "start" ? "startDate" : "endDate"]: undefined
      }));
      return;
    }

    const date = new Date(value);
    setDateRange(prev => ({
      ...prev,
      [type === "start" ? "startDate" : "endDate"]: date
    }));
  };

  // Predefined date ranges
  const setDateRangePreset = (preset: "today" | "7days" | "30days" | "90days" | "year") => {
    const endDate = new Date();
    let startDate = new Date();

    switch (preset) {
      case "today":
        startDate = new Date(endDate);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "7days":
        startDate.setDate(endDate.getDate() - 7);
        break;
      case "30days":
        startDate.setDate(endDate.getDate() - 30);
        break;
      case "90days":
        startDate.setDate(endDate.getDate() - 90);
        break;
      case "year":
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
    }

    setDateRange({ startDate, endDate });
  };

  // Toggle chart type
  const toggleChartType = () => {
    setChartType(prev => (prev === "line" ? "bar" : "line"));
  };

  // Handle metric change
  const handleMetricChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedMetric(e.target.value as ChartMetric);
  };

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading />
      </div>
    );
  }

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

  // Check if user is admin (implement your own admin check)
  const isAdmin = false;

  return (
    <>
      <MetaTags ogImage="/og-image.png" title="Analytics Dashboard" />

      <Layout>
        <motion.div
          className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 px-4 py-6"
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {/* Header Section */}
          <motion.div
            className="flex flex-col md:flex-row md:items-center justify-between mb-8"
            variants={headerVariants}
          >
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
                Analytics Dashboard
              </h1>
              <p className="text-gray-600 dark:text-gray-400">Monitor your CAD/CAM workflow performance and AI insights</p>
            </motion.div>

            {/* Navigation Tabs */}
            <motion.div
              className="flex space-x-2 backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 p-2 rounded-2xl shadow-lg border border-white/30 dark:border-gray-600/30 mt-4 md:mt-0"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <motion.button
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${activeSection === "overview"
                  ? "bg-blue-500 text-white shadow-md"
                  : "text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-gray-700/40"
                  }`}
                variants={tabVariants}
                animate={activeSection === "overview" ? "active" : "inactive"}
                whileHover="hover"
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveSection("overview")}
              >
                <div className="flex items-center">
                  <BarChart2 size={16} className="mr-2" />
                  Overview
                </div>
              </motion.button>
              <motion.button
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${activeSection === "charts"
                  ? "bg-blue-500 text-white shadow-md"
                  : "text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-gray-700/40"
                  }`}
                variants={tabVariants}
                animate={activeSection === "charts" ? "active" : "inactive"}
                whileHover="hover"
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveSection("charts")}
              >
                <div className="flex items-center">
                  <TrendingUp size={16} className="mr-2" />
                  Charts
                </div>
              </motion.button>
              <motion.button
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${activeSection === "ai"
                  ? "bg-blue-500 text-white shadow-md"
                  : "text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-gray-700/40"
                  }`}
                variants={tabVariants}
                animate={activeSection === "ai" ? "active" : "inactive"}
                whileHover="hover"
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveSection("ai")}
              >
                <div className="flex items-center">
                  <Cpu size={16} className="mr-2" />
                  AI Insights
                </div>
              </motion.button>
              <motion.button
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${activeSection === "costs"
                  ? "bg-blue-500 text-white shadow-md"
                  : "text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-gray-700/40"
                  }`}
                variants={tabVariants}
                animate={activeSection === "costs" ? "active" : "inactive"}
                whileHover="hover"
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveSection("costs")}
              >
                <div className="flex items-center">
                  <DollarSign size={16} className="mr-2" />
                  User Costs
                </div>
              </motion.button>
            </motion.div>
          </motion.div>

          {/* Date Range Controls */}
          <motion.div
            className="mb-8 backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-6 shadow-xl border border-white/30 dark:border-gray-600/30"
            variants={cardVariants}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.3 }}
          >
            <motion.div
              className="flex flex-col lg:flex-row lg:items-center justify-between space-y-4 lg:space-y-0"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
            >
              <div className="flex flex-wrap gap-2">
                {["today", "7days", "30days", "90days", "year"].map((preset, index) => (
                  <motion.button
                    key={preset}
                    onClick={() => setDateRangePreset(preset as any)}
                    className="px-4 py-2 text-sm font-medium rounded-xl backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-white/30 dark:border-gray-600/30 transition-all duration-200"
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.5 + index * 0.05 }}
                  >
                    {preset === "today" ? "Today" :
                      preset === "7days" ? "7 Days" :
                        preset === "30days" ? "30 Days" :
                          preset === "90days" ? "90 Days" : "Year"}
                  </motion.button>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
                <div className="flex items-center space-x-2">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Calendar className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  </motion.div>
                  <input
                    type="date"
                    className="form-input rounded-xl border-white/30 dark:border-gray-600/30 backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 text-sm focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 transition-all duration-200"
                    value={dateRange.startDate?.toISOString().split("T")[0] || ""}
                    onChange={e => handleDateChange("start", e.target.value)}
                  />
                </div>
                <span className="text-gray-500 dark:text-gray-400 font-medium">to</span>
                <div className="flex items-center space-x-2">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Calendar className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  </motion.div>
                  <input
                    type="date"
                    className="form-input rounded-xl border-white/30 dark:border-gray-600/30 backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 text-sm focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 transition-all duration-200"
                    value={dateRange.endDate?.toISOString().split("T")[0] || ""}
                    onChange={e => handleDateChange("end", e.target.value)}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Content Sections */}
          <AnimatePresence mode="wait">
            {activeSection === "overview" && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="space-y-8"
              >
                <motion.div
                  variants={cardVariants}
                  initial="initial"
                  animate="animate"
                  transition={{ delay: 0.1 }}
                >
                  <AnalyticsOverview startDate={dateRange.startDate} endDate={dateRange.endDate} isAdmin={isAdmin} />
                </motion.div>
              </motion.div>
            )}

            {activeSection === "charts" && (
              <motion.div
                key="charts"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="space-y-8"
              >
                <motion.div
                  className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-6 shadow-xl border border-white/30 dark:border-gray-600/30"
                  variants={cardVariants}
                  initial="initial"
                  animate="animate"
                  transition={{ delay: 0.1 }}
                >
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 space-y-4 lg:space-y-0">
                    <motion.h2
                      className="text-2xl font-bold text-gray-900 dark:text-white"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: 0.2 }}
                    >
                      Activity Trends
                    </motion.h2>
                    <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 items-start sm:items-center w-full lg:w-auto">
                      {/* Metric Selector */}
                      <motion.div
                        className="relative w-full sm:w-64"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: 0.3 }}
                      >
                        <select
                          value={selectedMetric}
                          onChange={handleMetricChange}
                          className="form-select appearance-none block w-full pr-10 py-3 text-sm rounded-xl border-white/30 dark:border-gray-600/30 backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 transition-all duration-200"
                        >
                          {metricOptions.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 dark:text-gray-400">
                          <ChevronDown className="h-4 w-4" />
                        </div>
                      </motion.div>

                      {/* Chart Type Toggle */}
                      <motion.button
                        onClick={toggleChartType}
                        className="flex items-center px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-xl backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-white/30 dark:border-gray-600/30 transition-all duration-200"
                        variants={buttonVariants}
                        whileHover="hover"
                        whileTap="tap"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: 0.4 }}
                      >
                        <BarChart2 className="h-4 w-4 mr-2" />
                        {chartType === "line" ? "Show Bar Chart" : "Show Line Chart"}
                      </motion.button>
                    </div>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                  >
                    <ActivityChart
                      startDate={dateRange.startDate}
                      endDate={dateRange.endDate}
                      chartType={chartType}
                      metric={selectedMetric}
                    />
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

            {activeSection === "ai" && (
              <motion.div
                key="ai"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="space-y-8"
              >
                <motion.div
                  variants={cardVariants}
                  initial="initial"
                  animate="animate"
                  transition={{ delay: 0.1 }}
                  className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-6 shadow-xl border border-white/30 dark:border-gray-600/30"
                >
                  <AIDashboard />
                </motion.div>
              </motion.div>
            )}

            {activeSection === "costs" && (
              <motion.div
                key="costs"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="space-y-8"
              >
                <motion.div
                  variants={cardVariants}
                  initial="initial"
                  animate="animate"
                  transition={{ delay: 0.1 }}
                >
                  <UserCostAnalytics
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    isAdmin={isAdmin}
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </Layout>
    </>
  );
}
