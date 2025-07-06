// src/components/ai/AIInsights/InsightsMetricsPanel.tsx
import React, { useMemo } from "react";
import { TrendingUp, TrendingDown, Activity, Clock, Shield, Zap, Target } from "react-feather";
import { CodeMetrics, PerformanceTrend } from "./types";
import { BarChart3 } from "lucide-react";

interface InsightsMetricsPanelProps {
  metrics: CodeMetrics;
  trends: PerformanceTrend[];
  onMetricClick?: (metric: string) => void;
}

/**
 * InsightsMetricsPanel provides comprehensive visualization of code quality metrics
 * with trend analysis and interactive exploration capabilities. This component
 * delivers real-time insights into code performance characteristics while maintaining
 * intuitive user interaction patterns for detailed metric investigation.
 */
const InsightsMetricsPanel: React.FC<InsightsMetricsPanelProps> = ({ metrics, trends, onMetricClick }) => {
  // Calculate trend indicators for each metric category
  const trendAnalysis = useMemo(() => {
    const analysis = {
      efficiency: { trend: "stable" as "up" | "down" | "stable", change: 0 },
      safety: { trend: "stable" as "up" | "down" | "stable", change: 0 },
      maintainability: { trend: "stable" as "up" | "down" | "stable", change: 0 },
      performance: { trend: "stable" as "up" | "down" | "stable", change: 0 }
    };

    if (trends.length >= 2) {
      const recent = trends.slice(-5);
      const efficiencyTrend = recent.filter(t => t.metric === "efficiency");

      if (efficiencyTrend.length >= 2) {
        const change = efficiencyTrend[efficiencyTrend.length - 1].value - efficiencyTrend[0].value;
        analysis.efficiency.change = change;
        analysis.efficiency.trend = change > 0.05 ? "up" : change < -0.05 ? "down" : "stable";
      }
    }

    return analysis;
  }, [trends]);

  // Metric configuration with visualization properties
  const metricConfig = [
    {
      key: "efficiency",
      label: "Efficiency",
      value: metrics.efficiency,
      icon: <Zap size={20} />,
      color: "blue",
      description: "Overall code efficiency and optimization level"
    },
    {
      key: "safety",
      label: "Safety",
      value: metrics.safety,
      icon: <Shield size={20} />,
      color: "green",
      description: "Safety compliance and risk assessment"
    },
    {
      key: "maintainability",
      label: "Maintainability",
      value: metrics.maintainability,
      icon: <Activity size={20} />,
      color: "purple",
      description: "Code readability and maintenance ease"
    },
    {
      key: "compatibility",
      label: "Compatibility",
      value: metrics.compatibility,
      icon: <Target size={20} />,
      color: "orange",
      description: "Standard compliance and portability"
    }
  ];

  const performanceMetrics = [
    {
      key: "executionTime",
      label: "Execution Time",
      value: `${metrics.executionTime.toFixed(1)}s`,
      icon: <Clock size={16} />,
      trend: trendAnalysis.performance
    },
    {
      key: "toolpathLength",
      label: "Toolpath Length",
      value: `${metrics.toolpathLength.toFixed(1)}mm`,
      icon: <Activity size={16} />,
      trend: trendAnalysis.performance
    },
    {
      key: "complexity",
      label: "Complexity",
      value: `${(metrics.complexity * 100).toFixed(0)}%`,
      icon: <BarChart3 size={16} />,
      trend: trendAnalysis.performance
    }
  ];

  const renderMetricCard = (config: (typeof metricConfig)[0]) => {
    const percentage = Math.round(config.value * 100);
    const trend = trendAnalysis[config.key as keyof typeof trendAnalysis];

    return (
      <div
        key={config.key}
        className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => onMetricClick?.(config.key)}
      >
        <div className="flex items-center justify-between mb-3">
          <div
            className={`p-2 rounded-lg bg-${config.color}-100 dark:bg-${config.color}-900/30 text-${config.color}-600 dark:text-${config.color}-400`}
          >
            {config.icon}
          </div>

          {trend && (
            <div className="flex items-center space-x-1">
              {trend.trend === "up" && <TrendingUp size={14} className="text-green-500" />}
              {trend.trend === "down" && <TrendingDown size={14} className="text-red-500" />}
              {trend.change !== 0 && (
                <span
                  className={`text-xs ${trend.trend === "up" ? "text-green-600" : trend.trend === "down" ? "text-red-600" : "text-gray-500"}`}
                >
                  {trend.change > 0 ? "+" : ""}
                  {(trend.change * 100).toFixed(1)}%
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{config.label}</span>
            <span
              className={`text-lg font-bold ${
                percentage >= 80 ? "text-green-600" : percentage >= 60 ? "text-yellow-600" : "text-red-600"
              }`}
            >
              {percentage}%
            </span>
          </div>

          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 bg-${config.color}-500`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">{config.description}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Quality Metrics Grid */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Code Quality Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">{metricConfig.map(renderMetricCard)}</div>
      </div>

      {/* Performance Statistics */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Performance Statistics</h3>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {performanceMetrics.map(metric => (
              <div key={metric.key} className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-400">
                    {metric.icon}
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{metric.value}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{metric.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Command Analysis</h3>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{metrics.rapidMoves}</div>
              <div className="text-xs text-blue-700 dark:text-blue-300">Rapid Moves</div>
            </div>

            <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="text-xl font-bold text-green-600 dark:text-green-400">{metrics.feedMoves}</div>
              <div className="text-xs text-green-700 dark:text-green-300">Feed Moves</div>
            </div>

            <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <div className="text-xl font-bold text-purple-600 dark:text-purple-400">{metrics.arcMoves}</div>
              <div className="text-xs text-purple-700 dark:text-purple-300">Arc Moves</div>
            </div>

            <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <div className="text-xl font-bold text-orange-600 dark:text-orange-400">{metrics.toolChanges}</div>
              <div className="text-xs text-orange-700 dark:text-orange-300">Tool Changes</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsightsMetricsPanel;
