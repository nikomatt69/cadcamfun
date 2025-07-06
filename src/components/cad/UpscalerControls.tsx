// src/components/cad/UpscalerControls.tsx
import React, { useState } from "react";
import { Monitor, Sliders, Eye, Zap, Settings } from "react-feather";

interface UpscalerControlsProps {
  stats: {
    scaleFactor: number;
    resolution: string;
    isActive: boolean;
    performanceGain: number;
  };
  isEnabled: boolean;
  onToggle: () => void;
  onUpdateOptions: (options: any) => void;
  presets: {
    highQuality: () => void;
    balanced: () => void;
    performance: () => void;
    disabled: () => void;
  };
}

const UpscalerControls: React.FC<UpscalerControlsProps> = ({
  stats,
  isEnabled,
  onToggle,
  onUpdateOptions,
  presets
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const getQualityColor = (scaleFactor: number) => {
    if (scaleFactor >= 2.0) return "text-green-500";
    if (scaleFactor >= 1.5) return "text-blue-500";
    if (scaleFactor >= 1.25) return "text-yellow-500";
    return "text-gray-500";
  };

  const getPerformanceColor = (gain: number) => {
    if (gain >= 50) return "text-green-500";
    if (gain >= 25) return "text-blue-500";
    if (gain >= 10) return "text-yellow-500";
    return "text-gray-500";
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-2">
          <Monitor className="h-4 w-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">Upscaler</span>
          <div className={`w-2 h-2 rounded-full ${isEnabled && stats.isActive ? "bg-green-500" : "bg-gray-300"}`} />
        </div>

        <div className="flex items-center space-x-2">
          {/* Quick stats */}
          <span className={`text-xs font-mono ${getQualityColor(stats.scaleFactor)}`}>
            {stats.scaleFactor.toFixed(1)}x
          </span>
          <span className={`text-xs ${getPerformanceColor(stats.performanceGain)}`}>
            +{stats.performanceGain.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-3 space-y-3">
          {/* Status Row */}
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>Status:</span>
            <span className={isEnabled && stats.isActive ? "text-green-600" : "text-gray-500"}>
              {isEnabled && stats.isActive ? "Active" : "Disabled"}
            </span>
          </div>

          {/* Resolution Info */}
          {stats.resolution && (
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>Resolution:</span>
              <span className="font-mono">{stats.resolution}</span>
            </div>
          )}

          {/* Performance Gain */}
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>Est. Performance:</span>
            <span className={getPerformanceColor(stats.performanceGain)}>+{stats.performanceGain.toFixed(1)}%</span>
          </div>

          {/* Quick Toggle */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onToggle}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                isEnabled && stats.isActive
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-green-500 text-white hover:bg-green-600"
              }`}
            >
              {isEnabled && stats.isActive ? "Disable" : "Enable"}
            </button>

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`p-2 rounded transition-colors ${
                showAdvanced ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>

          {/* Quality Presets */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={presets.highQuality}
              className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
            >
              <Eye className="h-3 w-3 inline mr-1" />
              High Quality
            </button>

            <button
              onClick={presets.balanced}
              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
            >
              <Sliders className="h-3 w-3 inline mr-1" />
              Balanced
            </button>

            <button
              onClick={presets.performance}
              className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
            >
              <Zap className="h-3 w-3 inline mr-1" />
              Performance
            </button>

            <button
              onClick={presets.disabled}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
            >
              Disabled
            </button>
          </div>

          {/* Advanced Controls */}
          {showAdvanced && (
            <div className="border-t border-gray-100 pt-3 space-y-3">
              <div className="text-xs font-medium text-gray-700 mb-2">Advanced Settings</div>

              {/* Scale Factor Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Scale Factor:</span>
                  <span>{stats.scaleFactor.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="3.0"
                  step="0.1"
                  value={stats.scaleFactor}
                  onChange={e => onUpdateOptions({ scaleFactor: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Edge Detection Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Edge Detection:</span>
                <button
                  onClick={() => onUpdateOptions({ useEdgeDetection: !stats.isActive })}
                  className={`w-8 h-4 rounded-full ${
                    stats.isActive ? "bg-blue-500" : "bg-gray-300"
                  } relative transition-colors`}
                >
                  <div
                    className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${
                      stats.isActive ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* FSR Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">FSR Algorithm:</span>
                <button
                  onClick={() => onUpdateOptions({ enableFSR: !stats.isActive })}
                  className={`w-8 h-4 rounded-full ${
                    stats.isActive ? "bg-blue-500" : "bg-gray-300"
                  } relative transition-colors`}
                >
                  <div
                    className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${
                      stats.isActive ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UpscalerControls;
