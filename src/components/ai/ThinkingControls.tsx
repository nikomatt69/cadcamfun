import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useThinkingSettings, useThinkingAnalytics } from "../../store/extendedThinkingStore";
import { ThinkingDepth } from "../../types/AITypes";

interface ThinkingControlsProps {
  isVisible?: boolean;
  onToggle?: () => void;
  compact?: boolean;
  className?: string;
}

const ThinkingControls: React.FC<ThinkingControlsProps> = ({
  isVisible = true,
  onToggle,
  compact = false,
  className = ""
}) => {
  const { depth, autoShow, realTime, speed, setDepth, setAutoShow, setRealTime, setSpeed } = useThinkingSettings();

  const { insights } = useThinkingAnalytics();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const depthOptions: { value: ThinkingDepth; label: string; description: string; color: string }[] = [
    {
      value: "shallow",
      label: "Quick",
      description: "Fast, surface-level analysis",
      color: "text-green-600 bg-green-100"
    },
    {
      value: "medium",
      label: "Balanced",
      description: "Good balance of speed and depth",
      color: "text-blue-600 bg-blue-100"
    },
    {
      value: "deep",
      label: "Thorough",
      description: "Comprehensive analysis with detailed reasoning",
      color: "text-purple-600 bg-purple-100"
    },
    {
      value: "comprehensive",
      label: "Expert",
      description: "Maximum depth with all considerations",
      color: "text-red-600 bg-red-100"
    }
  ];

  const speedOptions = [
    { value: "slow" as const, label: "Slow", description: "Easy to follow, step by step" },
    { value: "normal" as const, label: "Normal", description: "Balanced presentation speed" },
    { value: "fast" as const, label: "Fast", description: "Quick overview, less detail" }
  ];

  if (!isVisible) return null;

  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        {/* Quick depth selector */}
        <select
          value={depth}
          onChange={e => setDepth(e.target.value as ThinkingDepth)}
          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {depthOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Auto-show toggle */}
        <label className="flex items-center space-x-1 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={autoShow}
            onChange={e => setAutoShow(e.target.checked)}
            className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span>Auto</span>
        </label>

        {/* Expand button */}
        {onToggle && (
          <button
            onClick={onToggle}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Expand controls"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"
              />
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Thinking Controls</h3>
          {onToggle && (
            <button onClick={onToggle} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Thinking Depth */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Thinking Depth</label>
          <div className="grid grid-cols-2 gap-2">
            {depthOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setDepth(option.value)}
                className={`
                  p-3 text-left border-2 rounded-lg transition-all duration-200
                  ${
                    depth === option.value
                      ? `${option.color} border-current`
                      : "bg-gray-50 border-gray-200 hover:border-gray-300"
                  }
                `}
              >
                <div className="text-sm font-medium">{option.label}</div>
                <div className="text-xs text-gray-600 mt-1">{option.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Display Settings */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Display Settings</label>

          <div className="space-y-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={autoShow}
                onChange={e => setAutoShow(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Auto-show thinking process</span>
            </label>

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={realTime}
                onChange={e => setRealTime(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Real-time thinking updates</span>
            </label>
          </div>
        </div>

        {/* Speed Control */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Presentation Speed</label>
          <div className="flex space-x-1">
            {speedOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setSpeed(option.value)}
                className={`
                  flex-1 p-2 text-xs text-center border rounded transition-colors
                  ${
                    speed === option.value
                      ? "bg-blue-100 border-blue-300 text-blue-700"
                      : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                  }
                `}
                title={option.description}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Settings Toggle */}
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            <motion.svg
              animate={{ rotate: showAdvanced ? 90 : 0 }}
              transition={{ duration: 0.2 }}
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </motion.svg>
            <span>Advanced Settings</span>
          </button>

          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-3 pt-3 border-t border-gray-100 space-y-3"
              >
                {/* Future advanced settings */}
                <div className="text-xs text-gray-500">Advanced settings coming soon...</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Analytics Summary */}
        {insights.totalSessions > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <h4 className="text-xs font-medium text-gray-700 mb-2">Quick Stats</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-gray-500">Sessions</div>
                <div className="font-medium">{insights.totalSessions}</div>
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-gray-500">Avg. Confidence</div>
                <div className="font-medium">{Math.round(insights.averageConfidence * 100)}%</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Presets */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">Quick Presets</span>
          <div className="flex space-x-1">
            <button
              onClick={() => {
                setDepth("shallow");
                setSpeed("fast");
                setAutoShow(false);
              }}
              className="px-2 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
            >
              Minimal
            </button>
            <button
              onClick={() => {
                setDepth("medium");
                setSpeed("normal");
                setAutoShow(true);
                setRealTime(true);
              }}
              className="px-2 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
            >
              Default
            </button>
            <button
              onClick={() => {
                setDepth("comprehensive");
                setSpeed("slow");
                setAutoShow(true);
                setRealTime(true);
              }}
              className="px-2 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
            >
              Maximum
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ThinkingControls;
