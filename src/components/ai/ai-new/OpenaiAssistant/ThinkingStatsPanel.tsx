import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, TrendingUp, Activity, Zap, Database, Target, Settings } from "react-feather";
import { useExtendedThinking } from "@/src/hooks/useExtendedThinking";
import { BarChart3, Brain, Lightbulb } from "lucide-react";

interface ThinkingStatsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export const ThinkingStatsPanel: React.FC<ThinkingStatsPanelProps> = ({ isOpen, onClose, className = "" }) => {
  const { getMemoryStats, currentSessions, thinkingOptions, updateThinkingOptions, clearMemory } =
    useExtendedThinking();

  const [stats, setStats] = useState<{
    totalConversations: number;
    totalThinkingSessions: number;
    averageSessionDuration: number;
    topSpecializations: string[];
  }>({
    totalConversations: 0,
    totalThinkingSessions: 0,
    averageSessionDuration: 0,
    topSpecializations: []
  });

  const [activeTab, setActiveTab] = useState<"overview" | "sessions" | "memory" | "settings">("overview");

  useEffect(() => {
    if (isOpen) {
      // Initial update
      setStats(getMemoryStats());

      // Periodic updates while panel is open
      const interval = setInterval(() => {
        setStats(getMemoryStats());
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [isOpen, getMemoryStats, currentSessions]);

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return "text-green-500";
    if (confidence >= 0.6) return "text-yellow-500";
    return "text-red-500";
  };

  const renderOverviewTab = () => (
    <div className="space-y-4">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
          <div className="flex items-center space-x-2">
            <Brain size={16} className="text-purple-500" />
            <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Total Sessions</span>
          </div>
          <p className="text-xl font-bold text-purple-800 dark:text-purple-200">{stats.totalThinkingSessions}</p>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
          <div className="flex items-center space-x-2">
            <Clock size={16} className="text-blue-500" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Avg Duration</span>
          </div>
          <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
            {formatDuration(stats.averageSessionDuration)}
          </p>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
          <div className="flex items-center space-x-2">
            <Database size={16} className="text-green-500" />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">Conversations</span>
          </div>
          <p className="text-xl font-bold text-green-800 dark:text-green-200">{stats.totalConversations}</p>
        </div>

        <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
          <div className="flex items-center space-x-2">
            <Activity size={16} className="text-orange-500" />
            <span className="text-sm font-medium text-orange-700 dark:text-orange-300">Active Sessions</span>
          </div>
          <p className="text-xl font-bold text-orange-800 dark:text-orange-200">{currentSessions.size}</p>
        </div>
      </div>

      {/* Specializations */}
      {stats.topSpecializations.length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
            <Target size={14} className="mr-2 text-indigo-500" />
            Top Specializations
          </h4>
          <div className="flex flex-wrap gap-2">
            {stats.topSpecializations.map((spec, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs rounded-full"
              >
                {spec}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderSessionsTab = () => (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Active Thinking Sessions ({currentSessions.size})
      </h4>

      {currentSessions.size === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Brain size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No active thinking sessions</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {Array.from(currentSessions.values()).map(session => (
            <div
              key={session.id}
              className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Session {session.id.substring(0, 8)}...
                </span>
                <span className="text-xs text-gray-500">{formatDuration(session.totalDuration)}</span>
              </div>

              <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">{session.context.substring(0, 80)}...</div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">{session.steps.length} steps</span>
                {session.steps.length > 0 && (
                  <span
                    className={`${getConfidenceColor(
                      session.steps.reduce((sum, step) => sum + step.confidence, 0) / session.steps.length
                    )} font-medium`}
                  >
                    {Math.round(
                      (session.steps.reduce((sum, step) => sum + step.confidence, 0) / session.steps.length) * 100
                    )}
                    % confidence
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderMemoryTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Memory Management</h4>
        <button
          onClick={clearMemory}
          className="px-3 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 text-xs rounded-lg transition-colors"
        >
          Clear Memory
        </button>
      </div>

      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-700/50">
        <div className="flex items-center space-x-2 mb-2">
          <Lightbulb size={14} className="text-yellow-600" />
          <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Memory Statistics</span>
        </div>
        <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
          <li>• Conversations tracked: {stats.totalConversations}</li>
          <li>• Total thinking sessions: {stats.totalThinkingSessions}</li>
          <li>• Average session duration: {formatDuration(stats.averageSessionDuration)}</li>
          <li>• Memory persistence: Enabled (localStorage)</li>
        </ul>
      </div>
    </div>
  );

  const renderSettingsTab = () => (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Thinking Configuration</h4>

      {/* Verbosity Level */}
      <div>
        <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Verbosity Level</label>
        <select
          value={thinkingOptions.verbosityLevel}
          onChange={e =>
            updateThinkingOptions({
              verbosityLevel: e.target.value as "minimal" | "normal" | "detailed" | "verbose"
            })
          }
          className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
        >
          <option value="minimal">Minimal</option>
          <option value="normal">Normal</option>
          <option value="detailed">Detailed</option>
          <option value="verbose">Verbose</option>
        </select>
      </div>

      {/* Budget Tokens */}
      <div>
        <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
          Budget Tokens: {thinkingOptions.budgetTokens}
        </label>
        <input
          type="range"
          min="500"
          max="5000"
          step="100"
          value={thinkingOptions.budgetTokens}
          onChange={e => updateThinkingOptions({ budgetTokens: parseInt(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Show Real Time */}
      <label className="flex items-center space-x-2 text-xs">
        <input
          type="checkbox"
          checked={thinkingOptions.showRealTime}
          onChange={e => updateThinkingOptions({ showRealTime: e.target.checked })}
          className="rounded"
        />
        <span className="text-gray-700 dark:text-gray-300">Show real-time thinking</span>
      </label>

      {/* Persist to Memory */}
      <label className="flex items-center space-x-2 text-xs">
        <input
          type="checkbox"
          checked={thinkingOptions.persistToMemory}
          onChange={e => updateThinkingOptions({ persistToMemory: e.target.checked })}
          className="rounded"
        />
        <span className="text-gray-700 dark:text-gray-300">Persist to memory</span>
      </label>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 ${className}`}
        >
          <motion.div
            initial={{ y: 20 }}
            animate={{ y: 0 }}
            className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Zap size={18} className="text-white" />
                <h3 className="text-white font-medium">Extended Thinking Stats</h3>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded p-1 transition-colors"
              >
                ×
              </button>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex">
                {[
                  { id: "overview", label: "Overview", icon: BarChart3 },
                  { id: "sessions", label: "Sessions", icon: Activity },
                  { id: "memory", label: "Memory", icon: Database },
                  { id: "settings", label: "Settings", icon: Settings }
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id as typeof activeTab)}
                    className={`flex-1 px-3 py-2 text-xs font-medium flex items-center justify-center space-x-1 transition-colors ${
                      activeTab === id
                        ? "border-b-2 border-purple-500 text-purple-600 dark:text-purple-400"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    }`}
                  >
                    <Icon size={12} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-96">
              {activeTab === "overview" && renderOverviewTab()}
              {activeTab === "sessions" && renderSessionsTab()}
              {activeTab === "memory" && renderMemoryTab()}
              {activeTab === "settings" && renderSettingsTab()}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
