import React, { useState } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { Cpu, BarChart2, Activity, Settings, MessageCircle, RefreshCw, TrendingUp, Zap, Clock, Target } from "react-feather";
import { useAI } from "./AIContextProvider";
import { useDocumentAnalyzer } from "@/src/hooks/useDocumentAnalyzer";
import { useEnhancedContext } from "@/src/hooks/useEnhancedContext";

// Animation variants
const cardVariants = {
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

const tabVariants = {
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

const statCardVariants = {
  hover: {
    y: -5,
    scale: 1.02,
    transition: { duration: 0.2 }
  }
};

const progressVariants = {
  initial: { width: 0 },
  animate: (percentage: number) => ({
    width: `${percentage}%`,
    transition: { duration: 1, ease: "easeOut" }
  })
};

export const AIDashboard: React.FC = () => {
  const { state } = useAI();
  const { documentInsights, isAnalyzing, refreshAnalysis } = useDocumentAnalyzer();
  const { contextSummary } = useEnhancedContext();
  const [activeTab, setActiveTab] = useState<"context" | "stats" | "insights" | "performance">("stats");

  // Real performance data from AI state
  const performance = state.performance || {
    averageResponseTime: 0,
    successRate: 0,
    tokenUsage: 0,
    totalRequests: 0,
    modelUsage: {}
  };

  // Calculate additional metrics from real history data
  const historyStats = {
    totalRequests: state.history.length,
    successfulRequests: state.history.filter(item => item.type === "ai_response").length,
    todayRequests: state.history.filter(item => {
      const today = new Date();
      const itemDate = new Date(item.timestamp);
      return itemDate.toDateString() === today.toDateString();
    }).length,
    tokenUsage: state.history.reduce((total, item) => {
      return total + (item.tokenUsage?.total || 0);
    }, 0)
  };

  // Real model capabilities and usage from history
  const modelUsageStats = state.history.reduce((acc, item) => {
    if (item.modelUsed) {
      acc[item.modelUsed] = (acc[item.modelUsed] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  // Define real model capabilities based on actual usage
  const MODEL_CAPABILITIES = Object.keys(modelUsageStats).length > 0
    ? Object.keys(modelUsageStats).reduce((acc, model) => {
      acc[model] = {
        name: model.split("-").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" "),
        capabilities: model.includes("gpt-4") ? ["reasoning", "code", "analysis"] :
          model.includes("gpt-3.5") ? ["chat", "completion"] :
            model.includes("claude") ? ["analysis", "reasoning"] :
              model.includes("gemini") ? ["multimodal", "reasoning"] :
                ["general"]
      };
      return acc;
    }, {} as Record<string, any>)
    : {
      "No models used yet": {
        name: "No AI Models",
        capabilities: ["Start using AI to see model statistics"]
      }
    };

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <motion.h2
          className="text-2xl font-bold flex items-center bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <motion.div
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ duration: 0.2 }}
          >
            <Cpu className="mr-3 text-blue-500" size={24} />
          </motion.div>
          AI Intelligence Dashboard
        </motion.h2>

        {/* Tabs */}
        <motion.div
          className="flex space-x-1 backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 p-1 rounded-xl shadow-md border border-white/30 dark:border-gray-600/30"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {[
            { key: "stats", label: "Statistics", icon: BarChart2 },
            { key: "performance", label: "Performance", icon: TrendingUp },
            { key: "context", label: "Context", icon: Activity },
            { key: "insights", label: "Insights", icon: Target }
          ].map((tab, index) => (
            <motion.button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${activeTab === tab.key
                  ? "bg-blue-500 text-white shadow-md"
                  : "text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-gray-700/40"
                }`}
              variants={tabVariants}
              animate={activeTab === tab.key ? "active" : "inactive"}
              whileHover="hover"
              whileTap={{ scale: 0.98 }}
              // initial={{ opacity: 0, y: 10 }}
              // animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 + index * 0.05 }}
            >
              <div className="flex items-center">
                <tab.icon size={14} className="mr-2" />
                {tab.label}
              </div>
            </motion.button>
          ))}
        </motion.div>
      </motion.div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === "stats" && (
          <motion.div
            key="stats"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            <motion.div
              className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
              variants={statCardVariants}
              whileHover="hover"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Response Time</h3>
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.2 }}
                >
                  <Clock size={16} className="text-green-500" />
                </motion.div>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {Math.round(performance.averageResponseTime || 0)}ms
              </div>
              <p className="text-xs text-green-600 dark:text-green-400">
                {performance.averageResponseTime > 0 ? "Live performance" : "No data yet"}
              </p>
            </motion.div>

            <motion.div
              className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
              variants={statCardVariants}
              whileHover="hover"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Success Rate</h3>
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.2 }}
                >
                  <Target size={16} className="text-blue-500" />
                </motion.div>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {historyStats.totalRequests > 0
                  ? Math.round((historyStats.successfulRequests / historyStats.totalRequests) * 100)
                  : 0}%
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                {historyStats.successfulRequests}/{historyStats.totalRequests} successful
              </p>
            </motion.div>

            <motion.div
              className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
              variants={statCardVariants}
              whileHover="hover"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Tokens Used</h3>
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.2 }}
                >
                  <Zap size={16} className="text-purple-500" />
                </motion.div>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {(performance.tokenUsage || historyStats.tokenUsage || 0).toLocaleString()}
              </div>
              <p className="text-xs text-purple-600 dark:text-purple-400">Total consumed</p>
            </motion.div>

            <motion.div
              className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
              variants={statCardVariants}
              whileHover="hover"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.4 }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Requests</h3>
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.2 }}
                >
                  <Activity size={16} className="text-orange-500" />
                </motion.div>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {historyStats.totalRequests}
              </div>
              <p className="text-xs text-orange-600 dark:text-orange-400">
                {historyStats.todayRequests} today
              </p>
            </motion.div>
          </motion.div>
        )}

        {activeTab === "performance" && (
          <motion.div
            key="performance"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="space-y-6"
          >
            <motion.div
              className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
              variants={cardVariants as Variants}
              initial="initial"
              animate="animate"
              transition={{ delay: 0.1 }}
            >
              <motion.h3
                className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4 flex items-center"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              >
                <TrendingUp size={18} className="mr-2 text-blue-500" />
                Model Usage Distribution
              </motion.h3>
              <div className="space-y-4">
                {Object.entries(MODEL_CAPABILITIES).map(([model, config], index) => {
                  const usageCount = modelUsageStats[model] || 0;
                  const percentage = historyStats.totalRequests ? (usageCount / historyStats.totalRequests) * 100 : 0;

                  return (
                    <motion.div
                      key={model}
                      className="space-y-2"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.3 + index * 0.1 }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{config.name}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-500 dark:text-gray-400">{usageCount} requests</span>
                          <span className="text-sm font-medium text-blue-600 dark:text-blue-400">{Math.round(percentage)}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                          variants={progressVariants as Variants}
                          initial="initial"
                          animate="animate"
                          custom={percentage}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <motion.div
                className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
                variants={cardVariants as Variants}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.2 }}
              >
                <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">Performance Metrics</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Avg Response Time</span>
                    <span className="font-bold text-green-600 dark:text-green-400">
                      {Math.round(performance.averageResponseTime || 0)}ms
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Success Rate</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {historyStats.totalRequests > 0
                        ? Math.round((historyStats.successfulRequests / historyStats.totalRequests) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Error Rate</span>
                    <span className="font-bold text-purple-600 dark:text-purple-400">
                      {historyStats.totalRequests > 0
                        ? (100 - Math.round((historyStats.successfulRequests / historyStats.totalRequests) * 100)).toFixed(1)
                        : 0}%
                    </span>
                  </div>
                </div>
              </motion.div>

              <motion.div
                className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
                variants={cardVariants as Variants}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.3 }}
              >
                <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">Usage Statistics</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Total Requests</span>
                    <span className="font-bold text-orange-600 dark:text-orange-400">{historyStats.totalRequests}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Tokens Processed</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">
                      {(performance.tokenUsage || historyStats.tokenUsage || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-pink-50 dark:bg-pink-900/20 rounded-xl">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Active Models</span>
                    <span className="font-bold text-pink-600 dark:text-pink-400">
                      {Object.keys(modelUsageStats).length || 0}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {activeTab === "context" && (
          <motion.div
            key="context"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <motion.div
                className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
                variants={cardVariants as Variants}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.1 }}
              >
                <h3 className="text-lg font-medium text-blue-800 dark:text-blue-200 mb-4 flex items-center">
                  <Activity size={18} className="mr-2" />
                  CAD Elements
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Total Elements</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">{contextSummary?.elements.count || 0}</span>
                  </div>
                  {contextSummary && Object.entries(contextSummary.elements.types).length > 0 && (
                    <div className="space-y-2">
                      {Object.entries(contextSummary.elements.types).map(([type, count], index) => (
                        <motion.div
                          key={type}
                          className="flex justify-between items-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: 0.2 + index * 0.05 }}
                        >
                          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{type}</span>
                          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{count}</span>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>

              <motion.div
                className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
                variants={cardVariants as Variants}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.2 }}
              >
                <h3 className="text-lg font-medium text-purple-800 dark:text-purple-200 mb-4 flex items-center">
                  <MessageCircle size={18} className="mr-2" />
                  Active Context
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Documents</span>
                    <span className="font-bold text-purple-600 dark:text-purple-400">{contextSummary?.documents.count || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Context Size</span>
                    <span className="font-bold text-purple-600 dark:text-purple-400">
                      {contextSummary?.documents.summary ? `${Math.round(contextSummary.documents.summary.length / 1024)}KB` : "0KB"}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>

            <motion.div
              className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
              variants={cardVariants as Variants}
              initial="initial"
              animate="animate"
              transition={{ delay: 0.3 }}
            >
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">Environment Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Browser</div>
                  <div className="font-medium text-gray-700 dark:text-gray-300">{contextSummary?.environment.browser || "Unknown"}</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Screen Resolution</div>
                  <div className="font-medium text-gray-700 dark:text-gray-300">{contextSummary?.environment.screen || "Unknown"}</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Operating System</div>
                  <div className="font-medium text-gray-700 dark:text-gray-300">{contextSummary?.environment.os || "Unknown"}</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {activeTab === "insights" && (
          <motion.div
            key="insights"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="space-y-6"
          >
            <motion.div
              className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
              variants={cardVariants as Variants}
              initial="initial"
              animate="animate"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 flex items-center">
                  <Target size={18} className="mr-2 text-green-500" />
                  Document Intelligence
                </h3>
                <motion.button
                  onClick={() => refreshAnalysis()}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded-xl backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-white/30 dark:border-gray-600/30 transition-all duration-200"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <RefreshCw size={16} className={isAnalyzing ? "animate-spin" : ""} />
                </motion.button>
              </div>

              {documentInsights.length > 0 ? (
                <div className="space-y-4">
                  {documentInsights.map((insight, index) => (
                    <motion.div
                      key={index}
                      className="p-4 backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 rounded-xl border border-white/30 dark:border-gray-600/30"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium capitalize text-gray-700 dark:text-gray-300">{insight.key}</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {Math.round(insight.confidence * 100)}% confidence
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{insight.value}</p>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <motion.div
                  className="p-8 backdrop-blur-sm bg-gray-50/60 dark:bg-gray-700/60 rounded-xl text-center border border-gray-200/30 dark:border-gray-600/30"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <motion.div
                    animate={{ rotate: isAnalyzing ? 360 : 0 }}
                    transition={{ duration: 2, repeat: isAnalyzing ? Infinity : 0, ease: "linear" }}
                  >
                    <Target size={32} className="mx-auto mb-3 text-gray-400 dark:text-gray-500" />
                  </motion.div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {isAnalyzing ? "🔄 Analyzing documents..." : "📄 No insights found. Add context files to get AI-powered insights."}
                  </p>
                </motion.div>
              )}
            </motion.div>

            <motion.div
              className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 p-6 rounded-2xl shadow-xl border border-white/30 dark:border-gray-600/30"
              variants={cardVariants as Variants}
              initial="initial"
              animate="animate"
              transition={{ delay: 0.2 }}
            >
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4 flex items-center">
                <MessageCircle size={18} className="mr-2 text-blue-500" />
                Recent Activity History
              </h3>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {state.history.slice(0, 5).map((item, index) => (
                  <motion.div
                    key={item.id}
                    className="p-3 backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 rounded-lg border border-white/30 dark:border-gray-600/30"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    whileHover={{ x: 4, transition: { duration: 0.2 } }}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                        {item.type === "user_message" ? "🧑 User" : "🤖 AI Assistant"}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 truncate">
                      {item.type === "user_message"
                        ? item.prompt
                        : typeof item.result === "string"
                          ? item.result
                          : "Complex AI response generated"}
                    </p>
                  </motion.div>
                ))}
                {state.history.length === 0 && (
                  <motion.div
                    className="p-4 text-center text-gray-500 dark:text-gray-400"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    No AI interactions yet. Start using the AI assistant to see activity history.
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
