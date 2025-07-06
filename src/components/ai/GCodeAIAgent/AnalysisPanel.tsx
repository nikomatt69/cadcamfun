// src/components/ai/GCodeAIAgent/AnalysisPanel.tsx
import React from "react";
import { Search, AlertTriangle, Info, CheckCircle, RefreshCw } from "react-feather";
import { GCodeAnalysisResult } from "@/src/hooks/useGCodeAI";

interface AnalysisPanelProps {
  gcode: string;
  onAnalyze: () => void;
  analysisResult: GCodeAnalysisResult | null;
  isAnalyzing: boolean;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ gcode, onAnalyze, analysisResult, isAnalyzing }) => {
  // Check if we have code to analyze
  const hasCode = gcode && gcode.trim().length > 0;

  // Get issue counts by severity
  const issueCounts = analysisResult
    ? {
        critical: analysisResult.issues.filter(i => i.severity === "critical").length,
        warning: analysisResult.issues.filter(i => i.severity === "warning").length,
        info: analysisResult.issues.filter(i => i.severity === "info").length,
        total: analysisResult.issues.length
      }
    : { critical: 0, warning: 0, info: 0, total: 0 };

  // Get severity icon
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertTriangle size={16} className="text-red-500" />;
      case "warning":
        return <AlertTriangle size={16} className="text-yellow-500" />;
      case "info":
        return <Info size={16} className="text-blue-500" />;
      default:
        return <Info size={16} />;
    }
  };

  return (
    <div className="flex-1 overflow-auto p-4">
      {/* Analysis Actions */}
      <div className="mb-4">
        <button
          onClick={onAnalyze}
          disabled={isAnalyzing || !hasCode}
          className={`w-full py-2 px-4 rounded-lg flex items-center justify-center ${
            isAnalyzing || !hasCode
              ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600 text-white"
          }`}
        >
          {isAnalyzing ? (
            <>
              <RefreshCw size={18} className="mr-2 animate-spin" />
              Analyzing G-Code...
            </>
          ) : (
            <>
              <Search size={18} className="mr-2" />
              Analyze G-Code
            </>
          )}
        </button>

        {!hasCode && (
          <p className="text-xs text-red-500 mt-2">No G-code to analyze. Please enter some code in the editor.</p>
        )}
      </div>

      {/* Analysis Results */}
      {analysisResult && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600">
            <h3 className="text-lg font-medium mb-2">Analysis Summary</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">{analysisResult.summary}</p>

            {/* Issue Counts */}
            <div className="flex flex-wrap mt-3 gap-2">
              <div className="flex items-center text-xs font-medium px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">
                <span className="mr-1">Total Issues:</span>
                <span className="font-bold">{issueCounts.total}</span>
              </div>
              {issueCounts.critical > 0 && (
                <div className="flex items-center text-xs font-medium px-2 py-1 rounded bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
                  <AlertTriangle size={12} className="mr-1" />
                  <span className="font-bold">{issueCounts.critical} Critical</span>
                </div>
              )}
              {issueCounts.warning > 0 && (
                <div className="flex items-center text-xs font-medium px-2 py-1 rounded bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">
                  <AlertTriangle size={12} className="mr-1" />
                  <span className="font-bold">{issueCounts.warning} Warnings</span>
                </div>
              )}
              {issueCounts.info > 0 && (
                <div className="flex items-center text-xs font-medium px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                  <Info size={12} className="mr-1" />
                  <span className="font-bold">{issueCounts.info} Info</span>
                </div>
              )}
              {issueCounts.total === 0 && (
                <div className="flex items-center text-xs font-medium px-2 py-1 rounded bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                  <CheckCircle size={12} className="mr-1" />
                  <span className="font-bold">No issues found</span>
                </div>
              )}
            </div>
          </div>

          {/* Issues List */}
          {issueCounts.total > 0 && (
            <div className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600">
              <h3 className="text-lg font-medium mb-3">Issues Found</h3>
              <div className="space-y-3">
                {analysisResult.issues.map((issue, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-md border ${
                      issue.severity === "critical"
                        ? "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800"
                        : issue.severity === "warning"
                          ? "bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800"
                          : "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800"
                    }`}
                  >
                    <div className="flex items-start">
                      <div className="mr-2 mt-0.5">{getSeverityIcon(issue.severity)}</div>
                      <div>
                        <p
                          className={`text-sm font-medium ${
                            issue.severity === "critical"
                              ? "text-red-700 dark:text-red-300"
                              : issue.severity === "warning"
                                ? "text-yellow-700 dark:text-yellow-300"
                                : "text-blue-700 dark:text-blue-300"
                          }`}
                        >
                          {issue.description}
                        </p>
                        {issue.lineNumbers.length > 0 && (
                          <p className="text-xs mt-1 text-gray-600 dark:text-gray-400">
                            Line{issue.lineNumbers.length > 1 ? "s" : ""}: {issue.lineNumbers.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!analysisResult && !isAnalyzing && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
          <Search size={40} className="mb-2" />
          <p className="text-center">
            Click the Analyze button to check your G-code for issues and potential improvements.
          </p>
        </div>
      )}
    </div>
  );
};

export default AnalysisPanel;
