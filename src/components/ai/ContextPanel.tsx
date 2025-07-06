import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectContext, useConversationMemory, ConversationEntry, ProjectContext } from "../../store/aiAgentStore";

interface ContextPanelProps {
  className?: string;
  compact?: boolean;
  showMemoryInsights?: boolean;
}

const ContextPanel: React.FC<ContextPanelProps> = ({ className = "", compact = false, showMemoryInsights = true }) => {
  const { projects, activeProject, setActive } = useProjectContext();

  const { memory, findRelevant, stats } = useConversationMemory();

  const [selectedTab, setSelectedTab] = useState<"overview" | "memory" | "projects" | "insights">("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [relevantEntries, setRelevantEntries] = useState<ConversationEntry[]>([]);

  // Update relevant entries based on search
  useEffect(() => {
    if (searchTerm.trim()) {
      const relevant = findRelevant(searchTerm, 5);
      setRelevantEntries(relevant);
    } else {
      setRelevantEntries(memory.slice(0, 5));
    }
  }, [searchTerm, findRelevant, memory]);

  const getProjectTypeIcon = (type: ProjectContext["type"]) => {
    switch (type) {
      case "cad":
        return "📐";
      case "cam":
        return "⚙️";
      case "mixed":
        return "🔧";
      default:
        return "📁";
    }
  };

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

  if (compact) {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg p-3 ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-900">Context</h4>
          <div className="flex items-center space-x-1 text-xs text-gray-500">
            <span>{memory.length} entries</span>
            {activeProject && <span>• {activeProject.name}</span>}
          </div>
        </div>

        {/* Quick context display */}
        <div className="space-y-2">
          {activeProject && (
            <div className="flex items-center space-x-2 p-2 bg-blue-50 rounded">
              <span>{getProjectTypeIcon(activeProject.type)}</span>
              <span className="text-sm text-blue-900 truncate">{activeProject.name}</span>
            </div>
          )}

          {relevantEntries.slice(0, 2).map(entry => (
            <div key={entry.id} className={`p-2 border-l-2 rounded-r text-xs ${getEntryTypeColor(entry.role)}`}>
              <div className="font-medium">{entry.role}</div>
              <div className="text-gray-700 truncate">{entry.content}</div>
              <div className="text-gray-500 mt-1">{formatTimeAgo(entry.timestamp)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Context Panel</h3>
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <span>{memory.length} entries</span>
            <span>•</span>
            <span>{projects.length} projects</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
        <div className="flex space-x-1">
          {[
            { id: "overview", label: "Overview", icon: "📊" },
            { id: "memory", label: "Memory", icon: "🧠" },
            { id: "projects", label: "Projects", icon: "📁" },
            { id: "insights", label: "Insights", icon: "💡" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id as any)}
              className={`
                flex items-center space-x-1 px-3 py-1.5 text-sm rounded-md transition-colors
                ${
                  selectedTab === tab.id
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                }
              `}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-h-96 overflow-y-auto">
        <AnimatePresence mode="wait">
          {selectedTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Active Project */}
              {activeProject ? (
                <div className="p-3 border border-blue-200 rounded-lg bg-blue-50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{getProjectTypeIcon(activeProject.type)}</span>
                      <span className="font-medium text-blue-900">{activeProject.name}</span>
                    </div>
                    <span className="text-xs text-blue-700">Active Project</span>
                  </div>
                  <p className="text-sm text-blue-800">{activeProject.description}</p>
                  <div className="mt-2 flex items-center space-x-3 text-xs text-blue-600">
                    <span>{activeProject.files.length} files</span>
                    <span>{activeProject.objectives.length} objectives</span>
                    <span>Modified {formatTimeAgo(activeProject.timeline.lastActivity)}</span>
                  </div>
                </div>
              ) : (
                <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                  <p className="text-sm text-gray-600">No active project</p>
                  <p className="text-xs text-gray-500 mt-1">Create or select a project to organize your work</p>
                </div>
              )}

              {/* Memory Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-lg font-bold text-gray-900">{stats.totalEntries}</div>
                  <div className="text-xs text-gray-600">Total Entries</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-lg font-bold text-gray-900">
                    {Math.round((stats.averageImportance || 0) * 100)}%
                  </div>
                  <div className="text-xs text-gray-600">Avg. Importance</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-lg font-bold text-gray-900">
                    {Object.keys(stats.topicDistribution || {}).length}
                  </div>
                  <div className="text-xs text-gray-600">Unique Topics</div>
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Recent Activity</h4>
                <div className="space-y-2">
                  {relevantEntries.slice(0, 3).map(entry => (
                    <div key={entry.id} className={`p-2 border-l-2 rounded-r text-sm ${getEntryTypeColor(entry.role)}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium capitalize">{entry.role}</span>
                        <span className="text-xs text-gray-500">{formatTimeAgo(entry.timestamp)}</span>
                      </div>
                      <p className="text-gray-700 text-xs leading-relaxed">
                        {entry.content.slice(0, 120)}
                        {entry.content.length > 120 ? "..." : ""}
                      </p>
                      {entry.context.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {entry.context.tags.slice(0, 3).map((tag, i) => (
                            <span key={i} className="px-1 py-0.5 text-xs bg-white bg-opacity-70 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {selectedTab === "memory" && (
            <motion.div
              key="memory"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Memory Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search memory..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
              </div>

              {/* Memory Entries */}
              <div className="space-y-2">
                {relevantEntries.map((entry, index) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`p-3 border-l-4 rounded-r-lg ${getEntryTypeColor(entry.role)}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-medium uppercase tracking-wide">{entry.role}</span>
                        <span className="text-xs text-gray-500">
                          Importance: {Math.round(entry.context.importance * 100)}%
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">{formatTimeAgo(entry.timestamp)}</span>
                    </div>

                    <p className="text-sm text-gray-800 mb-2 leading-relaxed">{entry.content}</p>

                    {/* Context info */}
                    <div className="space-y-1">
                      {entry.context.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {entry.context.tags.map((tag, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 text-xs bg-white bg-opacity-80 border border-gray-200 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {(entry.context.mcpToolsUsed?.length || entry.context.fileReferences?.length) && (
                        <div className="flex items-center space-x-3 text-xs text-gray-600">
                          {entry.context.mcpToolsUsed?.length && (
                            <span>🔧 {entry.context.mcpToolsUsed.length} tools used</span>
                          )}
                          {entry.context.fileReferences?.length && (
                            <span>📁 {entry.context.fileReferences.length} files</span>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {relevantEntries.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400 mb-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                  <p className="text-sm">No memory entries found</p>
                  <p className="text-xs text-gray-400">Start a conversation to build memory</p>
                </div>
              )}
            </motion.div>
          )}

          {selectedTab === "projects" && (
            <motion.div
              key="projects"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {projects.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400 mb-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                  <p className="text-sm">No projects yet</p>
                  <p className="text-xs text-gray-400">Create projects to organize your work</p>
                </div>
              ) : (
                projects.map(project => (
                  <div
                    key={project.id}
                    className={`
                      p-3 border rounded-lg cursor-pointer transition-all
                      ${
                        activeProject?.id === project.id
                          ? "border-blue-300 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }
                    `}
                    onClick={() => setActive(project.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">{getProjectTypeIcon(project.type)}</span>
                        <span className="font-medium text-gray-900">{project.name}</span>
                      </div>
                      {activeProject?.id === project.id && (
                        <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded">Active</span>
                      )}
                    </div>

                    <p className="text-sm text-gray-600 mb-2">{project.description}</p>

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center space-x-3">
                        <span>{project.files.length} files</span>
                        <span>{project.objectives.length} objectives</span>
                        <span>{project.timeline.milestones.length} milestones</span>
                      </div>
                      <span>{formatTimeAgo(project.timeline.lastActivity)}</span>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}

          {selectedTab === "insights" && showMemoryInsights && (
            <motion.div
              key="insights"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {/* Topic Distribution */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Top Topics</h4>
                <div className="space-y-1">
                  {Object.entries(stats.topicDistribution || {})
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .slice(0, 5)
                    .map(([topic, count]) => (
                      <div key={topic} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{topic}</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full"
                              style={{
                                width: `${Math.min(((count as number) / Math.max(...(Object.values(stats.topicDistribution || {}) as number[]))) * 100, 100)}%`
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-6">{count as number}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Memory Timeline */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Memory Timeline</h4>
                <div className="text-xs text-gray-600 space-y-1">
                  {stats.newestEntry && <div>Latest: {formatTimeAgo(stats.newestEntry)}</div>}
                  {stats.oldestEntry && <div>Oldest: {formatTimeAgo(stats.oldestEntry)}</div>}
                  <div>Average importance: {Math.round((stats.averageImportance || 0) * 100)}%</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ContextPanel;
