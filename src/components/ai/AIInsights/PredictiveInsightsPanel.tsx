// src/components/ai/AIInsights/PredictiveInsightsPanel.tsx
import React, { useState, useMemo } from "react";
import { Eye, TrendingUp, Clock, Target, AlertTriangle, CheckCircle, ArrowRight } from "react-feather";
import { PredictiveInsight } from "./types";
import { Brain, Lightbulb } from "lucide-react";

interface PredictiveInsightsPanelProps {
  predictions: PredictiveInsight[];
  onPredictionAction: (prediction: PredictiveInsight, action: "view" | "apply" | "dismiss") => void;
  displayConfig?: {
    maxPredictions: number;
    showConfidenceThreshold: number;
    groupByTimeframe: boolean;
  };
}

/**
 * PredictiveInsightsPanel delivers forward-looking analytical recommendations based on
 * historical patterns and current development trajectories. This component provides
 * actionable intelligence for proactive decision-making within the G-code development
 * workflow while maintaining clear presentation of prediction confidence and timeframes.
 */
const PredictiveInsightsPanel: React.FC<PredictiveInsightsPanelProps> = ({
  predictions,
  onPredictionAction,
  displayConfig = {
    maxPredictions: 5,
    showConfidenceThreshold: 0.5,
    groupByTimeframe: true
  }
}) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("all");
  const [expandedPredictions, setExpandedPredictions] = useState<Set<string>>(new Set());

  // Process and filter predictions based on configuration and user selections
  const processedPredictions = useMemo(() => {
    let filtered = predictions.filter(p => p.probability >= displayConfig.showConfidenceThreshold);

    if (selectedTimeframe !== "all") {
      filtered = filtered.filter(p => p.timeframe === selectedTimeframe);
    }

    // Sort by probability (highest first) and limit results
    filtered.sort((a, b) => b.probability - a.probability);

    if (displayConfig.groupByTimeframe) {
      const grouped = filtered.reduce(
        (acc, prediction) => {
          if (!acc[prediction.timeframe]) {
            acc[prediction.timeframe] = [];
          }
          acc[prediction.timeframe].push(prediction);
          return acc;
        },
        {} as Record<string, PredictiveInsight[]>
      );

      return grouped;
    }

    return { all: filtered.slice(0, displayConfig.maxPredictions) };
  }, [predictions, selectedTimeframe, displayConfig]);

  const availableTimeframes = useMemo(() => {
    const timeframes = Array.from(new Set(predictions.map(p => p.timeframe)));
    return ["all", ...timeframes];
  }, [predictions]);

  const togglePredictionExpansion = (predictionId: string) => {
    setExpandedPredictions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(predictionId)) {
        newSet.delete(predictionId);
      } else {
        newSet.add(predictionId);
      }
      return newSet;
    });
  };

  const getTimeframeIcon = (timeframe: string) => {
    switch (timeframe) {
      case "immediate":
        return <AlertTriangle size={16} className="text-red-500" />;
      case "short_term":
        return <Clock size={16} className="text-orange-500" />;
      case "medium_term":
        return <Target size={16} className="text-blue-500" />;
      case "long_term":
        return <TrendingUp size={16} className="text-green-500" />;
      default:
        return <Eye size={16} className="text-gray-500" />;
    }
  };

  const getTimeframeLabel = (timeframe: string) => {
    switch (timeframe) {
      case "immediate":
        return "Immediate (Next Session)";
      case "short_term":
        return "Short Term (1-7 Days)";
      case "medium_term":
        return "Medium Term (1-4 Weeks)";
      case "long_term":
        return "Long Term (1+ Months)";
      default:
        return timeframe.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  const renderPrediction = (prediction: PredictiveInsight) => {
    const isExpanded = expandedPredictions.has(prediction.id);
    const confidenceLevel = prediction.probability >= 0.8 ? "high" : prediction.probability >= 0.6 ? "medium" : "low";

    const confidenceColors = {
      high: "text-green-600 bg-green-100 dark:bg-green-900/30",
      medium: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30",
      low: "text-red-600 bg-red-100 dark:bg-red-900/30"
    };

    return (
      <div
        key={prediction.id}
        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800"
      >
        {/* Prediction Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div className="flex-shrink-0">{getTimeframeIcon(prediction.timeframe)}</div>

            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm">Predictive Analysis</h4>
              <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                {getTimeframeLabel(prediction.timeframe)}
              </p>
            </div>
          </div>

          {/* Confidence Indicator */}
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${confidenceColors[confidenceLevel]}`}>
            {Math.round(prediction.probability * 100)}% confidence
          </div>
        </div>

        {/* Prediction Content */}
        <div className="mb-4">
          <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{prediction.prediction}</p>
        </div>

        {/* Data Sources */}
        <div className="mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <Brain size={14} className="text-blue-500" />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Based on analysis of:</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {prediction.basedOn.map((source, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded"
              >
                {source.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
              </span>
            ))}
          </div>
        </div>

        {/* Recommended Actions */}
        {prediction.recommendedActions.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center space-x-2 mb-2">
              <Lightbulb size={14} className="text-amber-500" />
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Recommended Actions:</span>
            </div>

            {isExpanded ? (
              <ul className="space-y-1">
                {prediction.recommendedActions.map((action, index) => (
                  <li key={index} className="flex items-start space-x-2 text-sm">
                    <ArrowRight size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{action}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {prediction.recommendedActions[0]}
                {prediction.recommendedActions.length > 1 && (
                  <span className="text-blue-600 dark:text-blue-400 ml-1">
                    (+{prediction.recommendedActions.length - 1} more)
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => togglePredictionExpansion(prediction.id)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-medium"
          >
            {isExpanded ? "Show Less" : "Show More Details"}
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => onPredictionAction(prediction, "view")}
              className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
            >
              Analyze
            </button>

            {confidenceLevel === "high" && (
              <button
                onClick={() => onPredictionAction(prediction, "apply")}
                className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Apply Recommendations
              </button>
            )}

            <button
              onClick={() => onPredictionAction(prediction, "dismiss")}
              className="px-3 py-1 text-xs bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderTimeframeGroup = (timeframe: string, groupPredictions: PredictiveInsight[]) => (
    <div key={timeframe}>
      <div className="flex items-center space-x-2 mb-3">
        {getTimeframeIcon(timeframe)}
        <h4 className="font-medium text-gray-900 dark:text-gray-100">{getTimeframeLabel(timeframe)}</h4>
        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded">
          {groupPredictions.length} prediction{groupPredictions.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-3 mb-6">{groupPredictions.map(renderPrediction)}</div>
    </div>
  );

  // Calculate overall statistics
  const totalPredictions = predictions.length;
  const highConfidencePredictions = predictions.filter(p => p.probability >= 0.8).length;
  const avgConfidence = predictions.reduce((sum, p) => sum + p.probability, 0) / totalPredictions || 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      {/* Panel Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
            <Eye size={20} className="mr-2 text-blue-600" />
            Predictive Insights
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            AI-powered predictions based on code analysis and development patterns
          </p>
        </div>

        {/* Statistics Summary */}
        <div className="flex items-center space-x-4 text-sm">
          <div className="text-center">
            <div className="font-bold text-blue-600">{totalPredictions}</div>
            <div className="text-xs text-gray-500">Total</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-green-600">{highConfidencePredictions}</div>
            <div className="text-xs text-gray-500">High Confidence</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-purple-600">{Math.round(avgConfidence * 100)}%</div>
            <div className="text-xs text-gray-500">Avg Confidence</div>
          </div>
        </div>
      </div>

      {/* Timeframe Filter */}
      {availableTimeframes.length > 2 && (
        <div className="flex items-center space-x-4 mb-6">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by timeframe:</span>
          <select
            value={selectedTimeframe}
            onChange={e => setSelectedTimeframe(e.target.value)}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
          >
            {availableTimeframes.map(timeframe => (
              <option key={timeframe} value={timeframe}>
                {timeframe === "all" ? "All Timeframes" : getTimeframeLabel(timeframe)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Predictions Display */}
      {Object.keys(processedPredictions).length > 0 ? (
        <div className="space-y-6">
          {displayConfig.groupByTimeframe ? (
            Object.entries(processedPredictions).map(([timeframe, groupPredictions]) =>
              renderTimeframeGroup(timeframe, groupPredictions)
            )
          ) : (
            <div className="space-y-3">{processedPredictions.all?.map(renderPrediction)}</div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Eye size={48} className="mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">No Predictions Available</h3>
          <p className="text-sm">
            Continue using the editor to generate predictive insights based on your development patterns
          </p>
        </div>
      )}
    </div>
  );
};

export default PredictiveInsightsPanel;
