// src/components/ai/GCodeAIAgent/OptimizationPanel.tsx
import React, { useState } from "react";
import { Zap, Check, RefreshCw, ChevronDown, ChevronUp, Copy, Clock, FileText, Code } from "react-feather";
import { GCodeOptimizationResult } from "@/src/hooks/useGCodeAI";

interface OptimizationPanelProps {
  gcode: string;
  onOptimize: (type: "speed" | "quality" | "balanced") => void;
  optimizationResult: GCodeOptimizationResult | null;
  isOptimizing: boolean;
  onApplyOptimized: (code: string) => void;
}

const OptimizationPanel: React.FC<OptimizationPanelProps> = ({
  gcode,
  onOptimize,
  optimizationResult,
  isOptimizing,
  onApplyOptimized
}) => {
  const [optimizationType, setOptimizationType] = useState<"speed" | "quality" | "balanced">("balanced");
  const [showImprovements, setShowImprovements] = useState<boolean>(true);
  const [codeCopied, setCodeCopied] = useState<boolean>(false);

  // Check if we have code to optimize
  const hasCode = gcode && gcode.trim().length > 0;

  // Handle copy optimized code
  const handleCopyCode = () => {
    if (optimizationResult?.code) {
      navigator.clipboard.writeText(optimizationResult.code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  // Handle apply optimized code
  const handleApplyCode = () => {
    if (optimizationResult?.code) {
      onApplyOptimized(optimizationResult.code);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-4">
      {/* Optimization Controls */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Optimization Type</label>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <button
            onClick={() => setOptimizationType("speed")}
            className={`py-2 px-3 rounded-md text-sm font-medium flex flex-col items-center ${
              optimizationType === "speed"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-2 border-blue-500"
                : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
            }`}
          >
            <Zap size={16} className="mb-1" />
            Speed
          </button>
          <button
            onClick={() => setOptimizationType("quality")}
            className={`py-2 px-3 rounded-md text-sm font-medium flex flex-col items-center ${
              optimizationType === "quality"
                ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-2 border-green-500"
                : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
            }`}
          >
            <Check size={16} className="mb-1" />
            Quality
          </button>
          <button
            onClick={() => setOptimizationType("balanced")}
            className={`py-2 px-3 rounded-md text-sm font-medium flex flex-col items-center ${
              optimizationType === "balanced"
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border-2 border-purple-500"
                : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
            }`}
          >
            <Clock size={16} className="mb-1" />
            Balanced
          </button>
        </div>

        <button
          onClick={() => onOptimize(optimizationType)}
          disabled={isOptimizing || !hasCode}
          className={`w-full py-2 px-4 rounded-lg flex items-center justify-center ${
            isOptimizing || !hasCode
              ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              : optimizationType === "speed"
                ? "bg-blue-500 hover:bg-blue-600 text-white"
                : optimizationType === "quality"
                  ? "bg-green-500 hover:bg-green-600 text-white"
                  : "bg-purple-500 hover:bg-purple-600 text-white"
          }`}
        >
          {isOptimizing ? (
            <>
              <RefreshCw size={18} className="mr-2 animate-spin" />
              Optimizing G-Code...
            </>
          ) : (
            <>
              <Zap size={18} className="mr-2" />
              Optimize for {optimizationType.charAt(0).toUpperCase() + optimizationType.slice(1)}
            </>
          )}
        </button>

        {!hasCode && (
          <p className="text-xs text-red-500 mt-2">No G-code to optimize. Please enter some code in the editor.</p>
        )}
      </div>

      {/* Optimization Results */}
      {optimizationResult && (
        <div className="space-y-4">
          {/* Statistics */}
          <div className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600">
            <h3 className="text-lg font-medium mb-3">Optimization Results</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-md">
                <div className="text-xs text-gray-500 dark:text-gray-400">Original Lines</div>
                <div className="text-xl font-bold">{optimizationResult.stats.originalLines}</div>
              </div>
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-md">
                <div className="text-xs text-gray-500 dark:text-gray-400">Optimized Lines</div>
                <div className="text-xl font-bold">{optimizationResult.stats.optimizedLines}</div>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-md">
                <div className="text-xs text-green-500 dark:text-green-400">Reduction</div>
                <div className="text-xl font-bold text-green-700 dark:text-green-400">
                  {optimizationResult.stats.reductionPercent}%
                </div>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-md">
                <div className="text-xs text-blue-500 dark:text-blue-400">Time Saved</div>
                <div className="text-xl font-bold text-blue-700 dark:text-blue-400">
                  ~{optimizationResult.stats.estimatedTimeReduction.toFixed(2)} min
                </div>
              </div>
            </div>

            {/* Improvements */}
            <div className="mt-4">
              <button
                onClick={() => setShowImprovements(!showImprovements)}
                className="flex items-center justify-between w-full p-2 bg-gray-100 dark:bg-gray-800 rounded-md"
              >
                <span className="font-medium text-sm">Improvements Made</span>
                {showImprovements ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showImprovements && (
                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {optimizationResult.improvements.map((improvement, index) => (
                      <li key={index}>{improvement}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Optimized Code Actions */}
          <div className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 flex justify-between">
            <button
              onClick={handleCopyCode}
              className="flex items-center py-2 px-4 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              {codeCopied ? (
                <>
                  <Check size={16} className="mr-2 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={16} className="mr-2" />
                  Copy Code
                </>
              )}
            </button>

            <button
              onClick={handleApplyCode}
              className="flex items-center py-2 px-4 rounded-md bg-green-500 hover:bg-green-600 text-white"
            >
              <Code size={16} className="mr-2" />
              Apply Optimized Code
            </button>
          </div>

          {/* Optimized Code Preview */}
          <div className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-medium">Optimized Code Preview</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {optimizationResult.stats.optimizedLines} lines
              </span>
            </div>

            <div className="max-h-60 overflow-y-auto p-3 bg-gray-100 dark:bg-gray-800 rounded-md">
              <pre className="text-xs font-mono">
                <code>
                  {optimizationResult.code.split("\n").slice(0, 100).join("\n")}
                  {optimizationResult.code.split("\n").length > 100 && "\n... (truncated)"}
                </code>
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!optimizationResult && !isOptimizing && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
          <Zap size={40} className="mb-2" />
          <p className="text-center">
            Click the Optimize button to improve your G-code for better performance or quality.
          </p>
        </div>
      )}
    </div>
  );
};

export default OptimizationPanel;
