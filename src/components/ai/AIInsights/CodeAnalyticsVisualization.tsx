// src/components/ai/AIInsights/CodeAnalyticsVisualization.tsx
import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Zap, Shield, TrendingUp, Filter, Grid, List, Eye, Clock } from "react-feather";
import { AIInsight } from "./types";
import { BarChart3 } from "lucide-react";

interface CodeAnalyticsVisualizationProps {
  insights: AIInsight[];
  viewMode: "grid" | "list";
  onInsightAction: (insight: AIInsight, action: "view" | "apply" | "dismiss") => void;
  filterOptions?: {
    types: string[];
    priorities: string[];
    categories: string[];
  };
}

/**
 * CodeAnalyticsVisualization provides comprehensive visualization of AI-generated insights
 * with interactive filtering, prioritization, and action management capabilities.
 * This component serves as the primary interface for reviewing and acting upon
 * analytical recommendations within the G-code development workflow.
 */
const CodeAnalyticsVisualization: React.FC<CodeAnalyticsVisualizationProps> = ({
  insights,
  viewMode,
  onInsightAction,
  filterOptions
}) => {
  // State for filtering and sorting insights
  const [activeFilters, setActiveFilters] = useState({
    type: "all",
    priority: "all",
    category: "all",
    actionable: "all"
  });

  const [sortBy, setSortBy] = useState<"priority" | "confidence" | "impact" | "timestamp">("priority");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Processed and filtered insights with sorting
  const processedInsights = useMemo(() => {
    let filtered = insights;

    // Apply filters
    if (activeFilters.type !== "all") {
      filtered = filtered.filter(insight => insight.type === activeFilters.type);
    }

    if (activeFilters.priority !== "all") {
      filtered = filtered.filter(insight => insight.priority === activeFilters.priority);
    }

    if (activeFilters.category !== "all") {
      filtered = filtered.filter(insight => insight.category === activeFilters.category);
    }

    if (activeFilters.actionable !== "all") {
      const isActionable = activeFilters.actionable === "true";
      filtered = filtered.filter(insight => insight.actionable === isActionable);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "priority":
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          comparison = priorityOrder[b.priority] - priorityOrder[a.priority];
          break;
        case "confidence":
          comparison = b.confidence - a.confidence;
          break;
        case "impact":
          const aImpact = Object.values(a.impact).reduce((sum, val) => sum + (val || 0), 0);
          const bImpact = Object.values(b.impact).reduce((sum, val) => sum + (val || 0), 0);
          comparison = bImpact - aImpact;
          break;
        case "timestamp":
          comparison = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          break;
      }

      return sortOrder === "desc" ? comparison : -comparison;
    });

    return filtered;
  }, [insights, activeFilters, sortBy, sortOrder]);

  // Insight statistics for overview
  const insightStats = useMemo(() => {
    const total = insights.length;
    const actionable = insights.filter(i => i.actionable).length;
    const critical = insights.filter(i => i.priority === "critical").length;
    const avgConfidence = insights.reduce((sum, i) => sum + i.confidence, 0) / total || 0;

    return {
      total,
      actionable,
      critical,
      avgConfidence: Math.round(avgConfidence * 100)
    };
  }, [insights]);

  // Render individual insight card
  const renderInsightCard = (insight: AIInsight) => {
    const priorityColors = {
      critical: "border-red-500 bg-red-50 dark:bg-red-900/20",
      high: "border-orange-500 bg-orange-50 dark:bg-orange-900/20",
      medium: "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20",
      low: "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
    };

    const typeIcons = {
      optimization: <TrendingUp size={16} className="text-blue-600" />,
      quality: <CheckCircle size={16} className="text-green-600" />,
      efficiency: <Zap size={16} className="text-yellow-600" />,
      safety: <Shield size={16} className="text-red-600" />,
      trend: <BarChart3 size={16} className="text-purple-600" />,
      prediction: <Eye size={16} className="text-indigo-600" />,
      default: <AlertTriangle size={16} className="text-gray-500" />
    };

    const impactMetrics = Object.entries(insight.impact)
      .filter(([_, value]) => value && value > 0)
      .map(([key, value]) => ({
        key,
        value,
        label: key.replace(/([A-Z])/g, " $1").toLowerCase()
      }));

    return (
      <div
        key={insight.id}
        className={`border rounded-lg p-4 transition-all duration-200 hover:shadow-md ${priorityColors[insight.priority]}`}
      >
        {/* Insight Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <div className="flex-shrink-0">
              {typeIcons[insight.type as keyof typeof typeIcons] || typeIcons.default}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{insight.title}</h4>
              <div className="flex items-center space-x-2 mt-1">
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    insight.priority === "critical"
                      ? "bg-red-100 text-red-800"
                      : insight.priority === "high"
                        ? "bg-orange-100 text-orange-800"
                        : insight.priority === "medium"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {insight.priority}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{insight.category.replace("_", " ")}</span>
              </div>
            </div>
          </div>

          {/* Confidence Score */}
          <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
            <BarChart3 size={12} />
            <span>{Math.round(insight.confidence * 100)}%</span>
          </div>
        </div>

        {/* Insight Description */}
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{insight.description}</p>

        {/* Impact Metrics */}
        {impactMetrics.length > 0 && (
          <div className="mb-3">
            <div className="grid grid-cols-2 gap-2">
              {impactMetrics.map(metric => (
                <div key={metric.key} className="text-xs">
                  <span className="text-gray-600 dark:text-gray-400 capitalize">{metric.label}:</span>
                  <span className="ml-1 font-medium text-gray-900 dark:text-gray-100">
                    {typeof metric.value === "number"
                      ? metric.key.includes("Reduction") || metric.key.includes("Improvement")
                        ? `+${(metric.value * 100).toFixed(0)}%`
                        : metric.value.toFixed(1)
                      : metric.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
            <Clock size={10} />
            <span>{new Date(insight.timestamp).toLocaleString()}</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => onInsightAction(insight, "view")}
              className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
            >
              View Details
            </button>

            {insight.actionable && (
              <button
                onClick={() => onInsightAction(insight, "apply")}
                className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Apply
              </button>
            )}

            <button
              onClick={() => onInsightAction(insight, "dismiss")}
              className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900 hover:bg-red-200 dark:hover:bg-red-800 text-red-700 dark:text-red-300 rounded transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render list view
  const renderListView = () => <div className="space-y-3">{processedInsights.map(renderInsightCard)}</div>;

  // Render grid view
  const renderGridView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {processedInsights.map(renderInsightCard)}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Analytics Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Code Analytics</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {processedInsights.length} of {insights.length} insights shown
          </p>
        </div>

        {/* Statistics Summary */}
        <div className="flex items-center space-x-4 text-sm">
          <div className="text-center">
            <div className="text-lg font-bold text-blue-600">{insightStats.total}</div>
            <div className="text-xs text-gray-500">Total</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">{insightStats.actionable}</div>
            <div className="text-xs text-gray-500">Actionable</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-600">{insightStats.critical}</div>
            <div className="text-xs text-gray-500">Critical</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-purple-600">{insightStats.avgConfidence}%</div>
            <div className="text-xs text-gray-500">Avg Confidence</div>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-4">
          {/* Type Filter */}
          <div className="flex items-center space-x-2">
            <Filter size={14} className="text-gray-500" />
            <select
              value={activeFilters.type}
              onChange={e => setActiveFilters(prev => ({ ...prev, type: e.target.value }))}
              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
            >
              <option value="all">All Types</option>
              <option value="optimization">Optimization</option>
              <option value="quality">Quality</option>
              <option value="efficiency">Efficiency</option>
              <option value="safety">Safety</option>
              <option value="prediction">Prediction</option>
            </select>
          </div>

          {/* Priority Filter */}
          <select
            value={activeFilters.priority}
            onChange={e => setActiveFilters(prev => ({ ...prev, priority: e.target.value }))}
            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
          >
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Actionable Filter */}
          <select
            value={activeFilters.actionable}
            onChange={e => setActiveFilters(prev => ({ ...prev, actionable: e.target.value }))}
            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
          >
            <option value="all">All Insights</option>
            <option value="true">Actionable Only</option>
            <option value="false">Non-Actionable</option>
          </select>

          {/* Sort Controls */}
          <div className="flex items-center space-x-2 ml-auto">
            <span className="text-sm text-gray-600 dark:text-gray-400">Sort by:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
            >
              <option value="priority">Priority</option>
              <option value="confidence">Confidence</option>
              <option value="impact">Impact</option>
              <option value="timestamp">Date</option>
            </select>

            <button
              onClick={() => setSortOrder(prev => (prev === "asc" ? "desc" : "asc"))}
              className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {sortOrder === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </div>
      </div>

      {/* Insights Visualization */}
      {processedInsights.length > 0 ? (
        viewMode === "grid" ? (
          renderGridView()
        ) : (
          renderListView()
        )
      ) : (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">No insights match your filters</h3>
          <p className="text-sm">Try adjusting your filter criteria to see more results</p>
        </div>
      )}
    </div>
  );
};

export default CodeAnalyticsVisualization;
