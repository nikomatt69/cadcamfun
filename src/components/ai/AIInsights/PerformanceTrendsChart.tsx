// src/components/ai/AIInsights/PerformanceTrendsChart.tsx
import React, { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Calendar, Activity } from "react-feather";
import { PerformanceTrend } from "./types";
import { BarChart3 } from "lucide-react";

interface PerformanceTrendsChartProps {
  trends: PerformanceTrend[];
  timeRange: "1h" | "6h" | "1d" | "7d" | "30d";
  onTrendClick?: (trend: PerformanceTrend) => void;
}

/**
 * PerformanceTrendsChart provides comprehensive visual analysis of performance metrics over time
 * with interactive trend exploration and comparative analysis capabilities. This component
 * delivers actionable insights through temporal data visualization while maintaining
 * professional presentation standards for technical analysis workflows.
 */
const PerformanceTrendsChart: React.FC<PerformanceTrendsChartProps> = ({ trends, timeRange, onTrendClick }) => {
  const [selectedMetric, setSelectedMetric] = useState<string>("overall_quality");

  // Process trends data for comprehensive visualization analysis
  const processedData = useMemo(() => {
    const filtered = trends.filter(trend => {
      const now = new Date();
      const trendDate = new Date(trend.timestamp);
      const hoursDiff = (now.getTime() - trendDate.getTime()) / (1000 * 60 * 60);

      switch (timeRange) {
        case "1h":
          return hoursDiff <= 1;
        case "6h":
          return hoursDiff <= 6;
        case "1d":
          return hoursDiff <= 24;
        case "7d":
          return hoursDiff <= 168;
        case "30d":
          return hoursDiff <= 720;
        default:
          return true;
      }
    });

    const grouped = filtered.reduce(
      (acc, trend) => {
        if (!acc[trend.metric]) {
          acc[trend.metric] = [];
        }
        acc[trend.metric].push(trend);
        return acc;
      },
      {} as Record<string, PerformanceTrend[]>
    );

    Object.keys(grouped).forEach(metric => {
      grouped[metric].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    });

    return grouped;
  }, [trends, timeRange]);

  const availableMetrics = Object.keys(processedData);
  const currentTrends = processedData[selectedMetric] || [];

  const trendStats = useMemo(() => {
    if (currentTrends.length < 2) return null;

    const latest = currentTrends[currentTrends.length - 1];
    const previous = currentTrends[currentTrends.length - 2];
    const first = currentTrends[0];

    const change = latest.value - previous.value;
    const overallChange = latest.value - first.value;
    const trend = change > 0 ? "up" : change < 0 ? "down" : "stable";

    return {
      current: latest.value,
      change,
      overallChange,
      trend,
      target: latest.target
    };
  }, [currentTrends]);

  const renderChart = () => {
    if (currentTrends.length === 0) {
      return (
        <div className="flex items-center justify-center h-48 text-gray-500">
          <div className="text-center">
            <BarChart3 size={32} className="mx-auto mb-2 opacity-50" />
            <p>No performance data available for the selected timeframe</p>
          </div>
        </div>
      );
    }

    const width = 600;
    const height = 200;
    const padding = 40;

    const maxValue = Math.max(...currentTrends.map(t => t.value));
    const minValue = Math.min(...currentTrends.map(t => t.value));
    const valueRange = maxValue - minValue || 1;

    const points = currentTrends.map((trend, index) => {
      const x = padding + (index / (currentTrends.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((trend.value - minValue) / valueRange) * (height - 2 * padding);
      return { x, y, value: trend.value, timestamp: trend.timestamp };
    });

    const pathData = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x},${point.y}`).join(" ");

    return (
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="1" opacity="0.3" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {trendStats?.target && (
            <line
              x1={padding}
              y1={height - padding - ((trendStats.target - minValue) / valueRange) * (height - 2 * padding)}
              x2={width - padding}
              y2={height - padding - ((trendStats.target - minValue) / valueRange) * (height - 2 * padding)}
              stroke="#dc2626"
              strokeWidth="2"
              strokeDasharray="5,5"
              opacity="0.6"
            />
          )}

          <path d={pathData} fill="none" stroke="#3b82f6" strokeWidth="2" className="drop-shadow-sm" />

          {points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r="4"
              fill="#3b82f6"
              stroke="white"
              strokeWidth="2"
              className="cursor-pointer hover:r-6 transition-all"
              onClick={() => onTrendClick?.(currentTrends[index])}
            />
          ))}

          <text x="10" y={padding} className="text-xs fill-gray-500">
            {maxValue.toFixed(2)}
          </text>
          <text x="10" y={height - padding + 5} className="text-xs fill-gray-500">
            {minValue.toFixed(2)}
          </text>
        </svg>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Performance Trends Analysis</h3>

        {trendStats && (
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-1">
              {trendStats.trend === "up" ? (
                <TrendingUp size={16} className="text-green-500" />
              ) : trendStats.trend === "down" ? (
                <TrendingDown size={16} className="text-red-500" />
              ) : (
                <Activity size={16} className="text-gray-500" />
              )}
              <span
                className={
                  trendStats.trend === "up"
                    ? "text-green-600"
                    : trendStats.trend === "down"
                      ? "text-red-600"
                      : "text-gray-600"
                }
              >
                {trendStats.change > 0 ? "+" : ""}
                {(trendStats.change * 100).toFixed(1)}%
              </span>
            </div>

            <div className="text-gray-600 dark:text-gray-400">Current: {trendStats.current.toFixed(3)}</div>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-4 mb-4">
        <div className="flex items-center space-x-2">
          <Calendar size={14} className="text-gray-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400">Metric:</span>
        </div>

        <select
          value={selectedMetric}
          onChange={e => setSelectedMetric(e.target.value)}
          className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
        >
          {availableMetrics.map(metric => (
            <option key={metric} value={metric}>
              {metric.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
            </option>
          ))}
        </select>
      </div>

      {renderChart()}

      {currentTrends.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
            <div className="text-sm text-gray-600 dark:text-gray-400">Best Performance</div>
            <div className="text-lg font-semibold text-green-600">
              {Math.max(...currentTrends.map(t => t.value)).toFixed(3)}
            </div>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
            <div className="text-sm text-gray-600 dark:text-gray-400">Average</div>
            <div className="text-lg font-semibold text-blue-600">
              {(currentTrends.reduce((sum, t) => sum + t.value, 0) / currentTrends.length).toFixed(3)}
            </div>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
            <div className="text-sm text-gray-600 dark:text-gray-400">Data Points</div>
            <div className="text-lg font-semibold text-purple-600">{currentTrends.length}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceTrendsChart;
