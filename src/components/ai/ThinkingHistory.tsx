import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useThinkingHistory } from "../../store/extendedThinkingStore";
import { ThinkingSession } from "../../types/AITypes";
import ThinkingStepComponent from "./ThinkingStepComponent";

interface ThinkingHistoryProps {
  maxItems?: number;
  showSearch?: boolean;
  compact?: boolean;
  onSelectThinking?: (thinking: ThinkingSession) => void;
  className?: string;
}

const ThinkingHistory: React.FC<ThinkingHistoryProps> = ({
  maxItems = 50,
  showSearch = true,
  compact = false,
  onSelectThinking,
  className = ""
}) => {
  const { history, selectedId, selectThinking, removeThinking, exportThinking, clearHistory } = useThinkingHistory();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterBy, setFilterBy] = useState<"all" | "completed" | "interrupted" | "error">("all");
  const [sortBy, setSortBy] = useState<"timestamp" | "confidence" | "duration">("timestamp");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Filter and sort history
  const filteredHistory = useMemo(() => {
    let filtered = history.filter(thinking => {
      // Text search
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesQuery = thinking.userQuery.toLowerCase().includes(searchLower);
        const matchesSummary = thinking.summary.toLowerCase().includes(searchLower);
        const matchesSteps = thinking.steps.some(step => step.content.toLowerCase().includes(searchLower));

        if (!matchesQuery && !matchesSummary && !matchesSteps) {
          return false;
        }
      }

      // Status filter
      if (filterBy !== "all" && thinking.outcome !== filterBy) {
        return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "timestamp":
          return b.timestamp.getTime() - a.timestamp.getTime();
        case "confidence":
          return b.confidence - a.confidence;
        case "duration":
          return b.totalDuration - a.totalDuration;
        default:
          return 0;
      }
    });

    return filtered.slice(0, maxItems);
  }, [history, searchTerm, filterBy, sortBy, maxItems]);

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const getOutcomeIcon = (outcome: ThinkingSession["outcome"]) => {
    switch (outcome) {
      case "completed":
        return { icon: "✅", color: "text-green-600", bg: "bg-green-100" };
      case "interrupted":
        return { icon: "⏸️", color: "text-yellow-600", bg: "bg-yellow-100" };
      case "error":
        return { icon: "❌", color: "text-red-600", bg: "bg-red-100" };
      default:
        return { icon: "❓", color: "text-gray-600", bg: "bg-gray-100" };
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "text-green-600";
    if (confidence >= 0.6) return "text-yellow-600";
    return "text-red-600";
  };

  if (compact) {
    return (
      <div className={`space-y-2 ${className}`}>
        {filteredHistory.slice(0, 5).map(thinking => {
          const outcome = getOutcomeIcon(thinking.outcome);
          return (
            <motion.div
              key={thinking.id}
              whileHover={{ scale: 1.01 }}
              className="p-3 bg-white border border-gray-200 rounded-lg cursor-pointer hover:shadow-sm transition-all"
              onClick={() => {
                selectThinking(thinking.id);
                onSelectThinking?.(thinking);
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <span className={`${outcome.color}`}>{outcome.icon}</span>
                  <span className="text-sm text-gray-900 truncate">{thinking.userQuery}</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <span className={getConfidenceColor(thinking.confidence)}>
                    {Math.round(thinking.confidence * 100)}%
                  </span>
                  <span>{thinking.steps.length} steps</span>
                </div>
              </div>
            </motion.div>
          );
        })}

        {history.length > 5 && (
          <button
            onClick={() => {
              /* Open full history */
            }}
            className="w-full p-2 text-xs text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-lg transition-colors"
          >
            View all {history.length} thinking sessions
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Thinking History</h3>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">
              {filteredHistory.length} of {history.length}
            </span>
            {history.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm("Clear all thinking history?")) {
                    clearHistory();
                  }
                }}
                className="text-sm text-red-600 hover:text-red-700 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      {showSearch && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 space-y-3">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search thinking sessions..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">Filter:</label>
              <select
                value={filterBy}
                onChange={e => setFilterBy(e.target.value as any)}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="all">All</option>
                <option value="completed">Completed</option>
                <option value="interrupted">Interrupted</option>
                <option value="error">Error</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">Sort:</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="timestamp">Latest</option>
                <option value="confidence">Confidence</option>
                <option value="duration">Duration</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* History List */}
      <div className="max-h-96 overflow-y-auto">
        {filteredHistory.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            <h3 className="text-sm font-medium text-gray-900 mb-1">No thinking sessions found</h3>
            <p className="text-sm text-gray-500">
              {searchTerm || filterBy !== "all"
                ? "Try adjusting your search or filters"
                : "Thinking sessions will appear here as you interact with the AI"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredHistory.map(thinking => {
              const outcome = getOutcomeIcon(thinking.outcome);
              const isExpanded = expandedItems.has(thinking.id);
              const isSelected = selectedId === thinking.id;

              return (
                <motion.div
                  key={thinking.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`p-4 hover:bg-gray-50 transition-colors ${isSelected ? "bg-blue-50 border-l-4 border-l-blue-500" : ""}`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-full ${outcome.bg}`}>
                        <span className={`text-sm ${outcome.color}`}>{outcome.icon}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="text-sm font-medium text-gray-900 truncate">{thinking.userQuery}</h4>
                          <span className="text-xs text-gray-500">{thinking.timestamp.toLocaleString()}</span>
                        </div>

                        <p className="text-sm text-gray-600 mb-2">{thinking.summary || "No summary available"}</p>

                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span>{thinking.steps.length} steps</span>
                          <span className={getConfidenceColor(thinking.confidence)}>
                            {Math.round(thinking.confidence * 100)}% confident
                          </span>
                          <span>{Math.round(thinking.totalDuration)}ms</span>
                          {thinking.mcpToolsUsed.length > 0 && <span>{thinking.mcpToolsUsed.length} tools</span>}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-1 ml-3">
                      <button
                        onClick={() => toggleExpanded(thinking.id)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title={isExpanded ? "Collapse" : "Expand"}
                      >
                        <motion.svg
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </motion.svg>
                      </button>

                      <button
                        onClick={() => {
                          const exported = exportThinking(thinking.id);
                          navigator.clipboard.writeText(exported);
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Copy to clipboard"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      </button>

                      <button
                        onClick={() => {
                          if (window.confirm("Remove this thinking session?")) {
                            removeThinking(thinking.id);
                          }
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Remove"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Expanded Steps */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="mt-4 pt-4 border-t border-gray-200"
                      >
                        <div className="space-y-2">
                          {thinking.steps.map((step, index) => (
                            <ThinkingStepComponent
                              key={step.id}
                              step={step}
                              index={index}
                              isExpanded={false}
                              isLast={index === thinking.steps.length - 1}
                              onToggleExpand={() => {}}
                              showConfidence={false}
                              showTiming={false}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ThinkingHistory;
