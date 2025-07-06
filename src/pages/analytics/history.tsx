// src/pages/analytics/history.tsx
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { BarChart2, Calendar, Filter, Activity, TrendingUp, Users, FileText, Cpu } from "react-feather";
import { useRouter } from "next/router";
import { UserHistory } from "@/src/components/analytics/UserHistory";
import { useAnalytics } from "@/src/hooks/useAnalytics";

const AnalyticsHistory: React.FC = () => {
  const router = useRouter();
  const [selectedFilter, setSelectedFilter] = useState<"all" | "cad" | "cam" | "ai" | "projects">("all");
  const { data: analyticsData, isLoading } = useAnalytics({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    endDate: new Date()
  });

  // Calculate real statistics from analytics data
  const stats = {
    totalActivities: analyticsData?.totalActivities || 0,
    thisWeek: analyticsData?.thisWeekActivities || 0,
    avgDaily: analyticsData?.avgDailyActivities || 0
  };

  // Define filter options with counts if available
  const filterOptions = [
    { key: "all", label: "All Activities", icon: Activity, count: stats.totalActivities },
    { key: "cad", label: "CAD", icon: FileText, count: analyticsData?.cadActivities || 0 },
    { key: "cam", label: "CAM", icon: BarChart2, count: analyticsData?.camActivities || 0 },
    { key: "ai", label: "AI", icon: Cpu, count: analyticsData?.aiActivities || 0 },
    { key: "projects", label: "Projects", icon: Users, count: analyticsData?.projectActivities || 0 }
  ];

  // Animation variants
  const containerVariants = {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1
      }
    }
  };

  const cardVariants: Variants = {
    initial: { opacity: 0, y: 20, scale: 0.95 },
    animate: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.5,
        ease: "easeOut"
      }
    },
    hover: {
      y: -5,
      scale: 1.02,
      transition: { duration: 0.2 }
    }
  };

  const statCardVariants: Variants = {
    initial: { opacity: 0, scale: 0.8 },
    animate: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.4,
        ease: "backOut"
      }
    },
    hover: {
      scale: 1.05,
      y: -3,
      transition: { duration: 0.2 }
    }
  };

  const filterVariants: Variants = {
    inactive: {
      scale: 1,
      backgroundColor: "transparent"
    },
    active: {
      scale: 1.05,
      backgroundColor: "rgba(59, 130, 246, 0.1)",
      transition: {
        duration: 0.2
      }
    },
    hover: {
      scale: 1.03,
      transition: {
        duration: 0.15
      }
    }
  };

  const numberVariants: Variants = {
    initial: { scale: 0.5, opacity: 0 },
    animate: {
      scale: 1,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 20
      }
    }
  };

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900"
      variants={containerVariants}
      initial="initial"
      animate="animate"
    >
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Header */}
        <motion.div
          className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0"
          variants={cardVariants}
        >
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-3xl font-bold flex items-center bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ duration: 0.2 }}
              >
                <BarChart2 className="mr-3 text-blue-500" size={28} />
              </motion.div>
              Activity History
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Track your productivity and usage patterns
            </p>
          </motion.div>

          <motion.button
            onClick={() => router.push("/analytics")}
            className="px-6 py-3 backdrop-blur-md bg-white/80 dark:bg-gray-700/80 text-gray-700 dark:text-gray-300 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30 hover:bg-white/90 dark:hover:bg-gray-700/90 transition-all duration-200 font-medium"
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Back to Overview
          </motion.button>
        </motion.div>

        {/* Stats Overview */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          variants={cardVariants}
        >
          <motion.div
            className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
            variants={statCardVariants}
            whileHover="hover"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Activities</h3>
              <motion.div
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.2 }}
              >
                <Activity size={20} className="text-blue-500" />
              </motion.div>
            </div>
            <motion.div variants={numberVariants}>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {isLoading ? "..." : stats.totalActivities.toLocaleString()}
              </p>
            </motion.div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              {isLoading ? "Loading..." : "All time"}
            </p>
          </motion.div>

          <motion.div
            className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
            variants={statCardVariants}
            whileHover="hover"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">This Week</h3>
              <motion.div
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.2 }}
              >
                <Calendar size={20} className="text-green-500" />
              </motion.div>
            </div>
            <motion.div variants={numberVariants}>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {isLoading ? "..." : stats.thisWeek.toLocaleString()}
              </p>
            </motion.div>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              {isLoading ? "Loading..." : "Last 7 days"}
            </p>
          </motion.div>

          <motion.div
            className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
            variants={statCardVariants}
            whileHover="hover"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Daily Average</h3>
              <motion.div
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.2 }}
              >
                <TrendingUp size={20} className="text-purple-500" />
              </motion.div>
            </div>
            <motion.div variants={numberVariants}>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {isLoading ? "..." : Math.round(stats.avgDaily)}
              </p>
            </motion.div>
            <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
              {isLoading ? "Loading..." : "Per day"}
            </p>
          </motion.div>
        </motion.div>

        {/* Filter Controls */}
        <motion.div
          className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
          variants={cardVariants}
        >
          <motion.div
            className="flex items-center mb-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              whileHover={{ scale: 1.1 }}
              transition={{ duration: 0.2 }}
            >
              <Filter size={18} className="mr-2 text-gray-600 dark:text-gray-400" />
            </motion.div>
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Filter Activities</h3>
          </motion.div>

          <motion.div
            className="flex flex-wrap gap-3"
            initial="initial"
            animate="animate"
            variants={{
              initial: { opacity: 0 },
              animate: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.05
                }
              }
            }}
          >
            {filterOptions.map((option, index) => (
              <motion.button
                key={option.key}
                onClick={() => setSelectedFilter(option.key as any)}
                className={`flex items-center px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 backdrop-blur-sm border ${selectedFilter === option.key
                    ? "bg-blue-500 text-white shadow-lg border-blue-400"
                    : "bg-white/60 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-700/80 border-white/30 dark:border-gray-600/30"
                  }`}
                variants={filterVariants}
                animate={selectedFilter === option.key ? "active" : "inactive"}
                whileHover="hover"
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <option.icon size={16} className="mr-2" />
                <span>{option.label}</span>
                {option.count > 0 && (
                  <motion.span
                    className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${selectedFilter === option.key
                        ? "bg-white/20 text-white"
                        : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
                      }`}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, delay: 0.2 + index * 0.05 }}
                  >
                    {option.count}
                  </motion.span>
                )}
              </motion.button>
            ))}
          </motion.div>
        </motion.div>

        {/* Activity History */}
        <motion.div
          className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30 overflow-hidden"
          variants={cardVariants}
        >
          <div className="p-6 border-b border-gray-200/50 dark:border-gray-600/50">
            <motion.h3
              className="text-lg font-medium text-gray-700 dark:text-gray-300 flex items-center"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
            >
              <motion.div
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.2 }}
              >
                <Activity size={18} className="mr-2 text-indigo-500" />
              </motion.div>
              Recent Activity Timeline
            </motion.h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {selectedFilter === "all" ? "All activities" : `Filtered by ${selectedFilter.toUpperCase()}`}
            </p>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={selectedFilter}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="p-6"
            >
              <UserHistory limit={50} />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default AnalyticsHistory;
