import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useConversationMemory, ConversationEntry } from "../../store/aiAgentStore";

interface MemoryViewerProps {
  className?: string;
  maxEntries?: number;
  allowExport?: boolean;
  showFilters?: boolean;
}

const MemoryViewer: React.FC<MemoryViewerProps> = ({
  className = "",
  maxEntries = 100,
  allowExport = true,
  showFilters = true
}) => {
  const { memory, searchMemory, stats, findRelevant } = useConversationMemory();

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "user" | "assistant" | "system">("all");
  const [importanceFilter, setImportanceFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [sortBy, setSortBy] = useState<"timestamp" | "importance" | "relevance">("timestamp");
  const [timeFilter, setTimeFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [selectedEntry, setSelectedEntry] = useState<ConversationEntry | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  // Filter and sort memory entries
  const filteredMemory = useMemo(() => {
    let filtered = [...memory];

    // Text search
    if (searchTerm.trim()) {
      const searchResults = searchMemory(searchTerm, { limit: maxEntries });
      filtered = searchResults;
    }

    // Role filter
    if (roleFilter !== "all") {
      filtered = filtered.filter(entry => entry.role === roleFilter);
    }

    // Importance filter
    if (importanceFilter !== "all") {
      const importanceThresholds = {
        high: 0.7,
        medium: 0.4,
        low: 0
      };
      const threshold = importanceThresholds[importanceFilter];
      const upperThreshold = importanceFilter === "high" ? 1 : importanceFilter === "medium" ? 0.7 : 0.4;

      filtered = filtered.filter(
        entry => entry.context.importance >= threshold && entry.context.importance < upperThreshold
      );
    }

    // Time filter
    if (timeFilter !== "all") {
      const now = new Date();
      const timeThresholds = {
        today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        week: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        month: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      };

      const threshold = timeThresholds[timeFilter];
      filtered = filtered.filter(entry => entry.timestamp >= threshold);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "timestamp":
          return b.timestamp.getTime() - a.timestamp.getTime();
        case "importance":
          return b.context.importance - a.context.importance;
        case "relevance":
          // If search term exists, use relevance from search
          if (searchTerm.trim()) {
            const aRelevance = findRelevant(searchTerm, 1000).indexOf(a);
            const bRelevance = findRelevant(searchTerm, 1000).indexOf(b);
            return aRelevance - bRelevance;
          }
          return b.context.importance - a.context.importance;
        default:
          return 0;
      }
    });

    return filtered.slice(0, maxEntries);
  }, [memory, searchTerm, roleFilter, importanceFilter, timeFilter, sortBy, maxEntries, searchMemory, findRelevant]);

  // Memory analysis
  const memoryAnalysis = useMemo(() => {
    const analysis = {
      totalTokens: memory.reduce((sum, entry) => sum + entry.content.length, 0),
      averageEntryLength:
        memory.length > 0 ? memory.reduce((sum, entry) => sum + entry.content.length, 0) / memory.length : 0,
      roleDistribution: memory.reduce(
        (acc, entry) => {
          acc[entry.role] = (acc[entry.role] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      topicTrends: {} as Record<string, number[]>,
      conversationFlow: [] as any[],
      qualityMetrics: {
        averageImportance: stats.averageImportance,
        highImportanceCount: memory.filter(e => e.context.importance > 0.7).length,
        recentActivity: memory.filter(e => new Date().getTime() - e.timestamp.getTime() < 24 * 60 * 60 * 1000).length
      }
    };

    // Calculate topic trends over time
    const topicsByTime = memory.reduce(
      (acc, entry) => {
        const day = entry.timestamp.toDateString();
        if (!acc[day]) acc[day] = {};
        entry.context.tags.forEach(tag => {
          acc[day][tag] = (acc[day][tag] || 0) + 1;
        });
        return acc;
      },
      {} as Record<string, Record<string, number>>
    );

    // Convert to trend data
    Object.keys(stats.topicDistribution || {}).forEach(topic => {
      analysis.topicTrends[topic] = Object.keys(topicsByTime).map(day => topicsByTime[day][topic] || 0);
    });

    return analysis;
  }, [memory, stats]);

  const getEntryTypeColor = (role: ConversationEntry["role"]) => {
    switch (role) {
      case "user":
        return "border-l-blue-400 bg-blue-50";
      case "assistant":
        return "border-l-green-400 bg-green-50";
      case "system":
        return "border-l-yellow-400 bg-yellow-50";
      default:
        return "border-l-gray-400 bg-gray-50";
    }
  };

  const getImportanceColor = (importance: number) => {
    if (importance >= 0.8) return "text-red-600 bg-red-100";
    if (importance >= 0.6) return "text-orange-600 bg-orange-100";
    if (importance >= 0.4) return "text-yellow-600 bg-yellow-100";
    return "text-gray-600 bg-gray-100";
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const exportMemory = () => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      totalEntries: memory.length,
      filteredEntries: filteredMemory.length,
      filters: { searchTerm, roleFilter, importanceFilter, timeFilter, sortBy },
      analysis: memoryAnalysis,
      entries: filteredMemory.map(entry => ({
        ...entry,
        timestamp: entry.timestamp.toISOString()
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memory-export-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Memory Viewer</h3>
            <p className="text-sm text-gray-600">
              {filteredMemory.length} of {memory.length} entries
              {searchTerm && ` matching "${searchTerm}"`}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowAnalysis(!showAnalysis)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                showAnalysis ? "bg-purple-100 text-purple-700" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              📊 Analysis
            </button>

            {allowExport && (
              <button
                onClick={exportMemory}
                className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              >
                📤 Export
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Analysis Panel */}
      <AnimatePresence>
        {showAnalysis && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-3 border-b border-gray-100 bg-purple-50"
          >
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-lg font-bold text-purple-900">{Math.round(memoryAnalysis.averageEntryLength)}</div>
                <div className="text-xs text-purple-700">Avg. Length</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-purple-900">
                  {Math.round(memoryAnalysis.qualityMetrics.averageImportance * 100)}%
                </div>
                <div className="text-xs text-purple-700">Avg. Importance</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-purple-900">
                  {memoryAnalysis.qualityMetrics.highImportanceCount}
                </div>
                <div className="text-xs text-purple-700">High Importance</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-purple-900">{memoryAnalysis.qualityMetrics.recentActivity}</div>
                <div className="text-xs text-purple-700">Recent (24h)</div>
              </div>
            </div>

            {/* Role Distribution */}
            <div>
              <h5 className="text-sm font-medium text-purple-900 mb-2">Role Distribution</h5>
              <div className="flex space-x-4">
                {Object.entries(memoryAnalysis.roleDistribution).map(([role, count]) => (
                  <div key={role} className="flex items-center space-x-1">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        role === "user" ? "bg-blue-500" : role === "assistant" ? "bg-green-500" : "bg-yellow-500"
                      }`}
                    ></div>
                    <span className="text-xs text-purple-700">
                      {role}: {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      {showFilters && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* Search */}
            <div className="col-span-2">
              <input
                type="text"
                placeholder="Search memory..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as any)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Roles</option>
              <option value="user">User</option>
              <option value="assistant">Assistant</option>
              <option value="system">System</option>
            </select>

            {/* Importance Filter */}
            <select
              value={importanceFilter}
              onChange={e => setImportanceFilter(e.target.value as any)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Importance</option>
              <option value="high">High (70%+)</option>
              <option value="medium">Medium (40-70%)</option>
              <option value="low">Low (&lt;40%)</option>
            </select>

            {/* Sort By */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="timestamp">Latest First</option>
              <option value="importance">Most Important</option>
              <option value="relevance">Most Relevant</option>
            </select>
          </div>

          {/* Time Filter */}
          <div className="mt-3 flex space-x-2">
            {[
              { value: "all", label: "All Time" },
              { value: "today", label: "Today" },
              { value: "week", label: "This Week" },
              { value: "month", label: "This Month" }
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setTimeFilter(option.value as any)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  timeFilter === option.value
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Memory Entries */}
      <div className="max-h-96 overflow-y-auto">
        {filteredMemory.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            <h3 className="text-sm font-medium text-gray-900 mb-1">No entries found</h3>
            <p className="text-sm text-gray-500">
              {searchTerm || roleFilter !== "all" || importanceFilter !== "all" || timeFilter !== "all"
                ? "Try adjusting your filters"
                : "Start a conversation to build memory"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredMemory.map((entry, index) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                  selectedEntry?.id === entry.id ? "bg-blue-50 border-l-4 border-l-blue-500" : ""
                }`}
                onClick={() => setSelectedEntry(selectedEntry?.id === entry.id ? null : entry)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1 min-w-0">
                    {/* Role indicator */}
                    <div
                      className={`
                      w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium
                      ${
                        entry.role === "user"
                          ? "bg-blue-100 text-blue-700"
                          : entry.role === "assistant"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                      }
                    `}
                    >
                      {entry.role.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-sm font-medium text-gray-900 capitalize">{entry.role}</span>
                        <span className="text-xs text-gray-500">{formatTimeAgo(entry.timestamp)}</span>
                        <span
                          className={`
                          px-2 py-0.5 text-xs font-medium rounded-full
                          ${getImportanceColor(entry.context.importance)}
                        `}
                        >
                          {Math.round(entry.context.importance * 100)}%
                        </span>
                      </div>

                      {/* Content */}
                      <p className="text-sm text-gray-800 mb-2 leading-relaxed">
                        {selectedEntry?.id === entry.id
                          ? entry.content
                          : entry.content.slice(0, 200) + (entry.content.length > 200 ? "..." : "")}
                      </p>

                      {/* Tags */}
                      {entry.context.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {entry.context.tags.slice(0, selectedEntry?.id === entry.id ? undefined : 5).map((tag, i) => (
                            <span key={i} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded border">
                              {tag}
                            </span>
                          ))}
                          {!selectedEntry && entry.context.tags.length > 5 && (
                            <span className="px-2 py-0.5 text-xs text-gray-500">
                              +{entry.context.tags.length - 5} more
                            </span>
                          )}
                        </div>
                      )}

                      {/* Context indicators */}
                      <div className="flex items-center space-x-3 text-xs text-gray-500">
                        {entry.context.mcpToolsUsed?.length && (
                          <span>🔧 {entry.context.mcpToolsUsed.length} tools</span>
                        )}
                        {entry.context.fileReferences?.length && (
                          <span>📁 {entry.context.fileReferences.length} files</span>
                        )}
                        {entry.context.thinkingProcessId && <span>🧠 thinking</span>}
                        {entry.context.relatedEntries?.length && (
                          <span>🔗 {entry.context.relatedEntries.length} related</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expand indicator */}
                  <div className="ml-2 flex-shrink-0">
                    <motion.svg
                      animate={{ rotate: selectedEntry?.id === entry.id ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </motion.svg>
                  </div>
                </div>

                {/* Expanded content */}
                <AnimatePresence>
                  {selectedEntry?.id === entry.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 pt-3 border-t border-gray-200"
                    >
                      {/* Full context details */}
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="font-medium text-gray-700">Mode:</span>
                          <span className="ml-2 text-gray-600">{entry.mode}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Timestamp:</span>
                          <span className="ml-2 text-gray-600">{entry.timestamp.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Related entries */}
                      {entry.context.relatedEntries && entry.context.relatedEntries.length > 0 && (
                        <div className="mt-2">
                          <span className="text-xs font-medium text-gray-700">Related entries:</span>
                          <div className="mt-1 text-xs text-gray-600">
                            {entry.context.relatedEntries.length} similar conversations found
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-3 flex items-center space-x-2">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(entry.content);
                          }}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        >
                          Copy
                        </button>

                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setSearchTerm(entry.context.tags[0] || "");
                          }}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        >
                          Find Similar
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MemoryViewer;
