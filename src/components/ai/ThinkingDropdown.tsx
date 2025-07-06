// src/components/ai/ThinkingDropdown.tsx
import React, { useState, useEffect } from "react";
import { Brain, ChevronDown, ChevronUp, Clock, Lightbulb, CheckCircle, AlertCircle } from "lucide-react";
import { ThinkingSession, ThinkingStep } from "@/src/types/AITypes";

interface ThinkingDropdownProps {
  thinkingSession: ThinkingSession | null;
  isOpen: boolean;
  onToggle: () => void;
  showRealTime?: boolean;
  className?: string;
}

export const ThinkingDropdown: React.FC<ThinkingDropdownProps> = ({
  thinkingSession,
  isOpen,
  onToggle,
  showRealTime = true,
  className = ""
}) => {
  const [animatedSteps, setAnimatedSteps] = useState<ThinkingStep[]>([]);

  // Animate steps as they come in
  useEffect(() => {
    if (thinkingSession?.steps) {
      const timer = setTimeout(() => {
        setAnimatedSteps(thinkingSession.steps);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [thinkingSession?.steps]);

  if (!thinkingSession) {
    return null;
  }

  const getPhaseIcon = (type: string) => {
    switch (type) {
      case "analysis":
        return <Brain className="w-3 h-3" />;
      case "reasoning":
        return <Lightbulb className="w-3 h-3" />;
      case "conclusion":
        return <Clock className="w-3 h-3" />;
      case "question":
        return <CheckCircle className="w-3 h-3" />;
      default:
        return <AlertCircle className="w-3 h-3" />;
    }
  };

  const getPhaseColor = (type: string) => {
    switch (type) {
      case "analysis":
        return "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800";
      case "reasoning":
        return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800";
      case "conclusion":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800";
      case "question":
        return "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-800";
      default:
        return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700";
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const averageConfidence =
    thinkingSession.steps.length > 0
      ? thinkingSession.steps.reduce((sum, step) => sum + step.confidence, 0) / thinkingSession.steps.length
      : 0;

  return (
    <div className={`w-full ${className}`}>
      {/* Compact Summary Header */}
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 py-2 bg-gradient-to-r from-purple-50 via-blue-50 to-indigo-50 dark:from-purple-900/30 dark:via-blue-900/30 dark:to-indigo-900/30 border border-purple-100 dark:border-purple-800 rounded-lg hover:from-purple-100 hover:via-blue-100 hover:to-indigo-100 dark:hover:from-purple-900/50 dark:hover:via-blue-900/50 dark:hover:to-indigo-900/50 transition-all duration-200 group"
      >
        <div className="flex items-center gap-2">
          <Brain className={`w-4 h-4 text-purple-600 dark:text-purple-400 ${showRealTime ? "animate-pulse" : ""}`} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Thinking Process</span>

          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-current rounded-full" />
              {thinkingSession.steps.length} steps
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(thinkingSession.totalDuration)}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              {Math.round(averageConfidence * 100)}%
            </span>
          </div>
        </div>

        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
        )}
      </button>

      {/* Compact Expanded Details */}
      {isOpen && (
        <div className="mt-2 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
          {/* Summary */}
          {thinkingSession.summary && (
            <div className="mb-3 p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Summary</p>
              <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{thinkingSession.summary}</p>
            </div>
          )}

          {/* Compact Steps */}
          <div className="space-y-2">
            {animatedSteps.map((step, index) => (
              <div
                key={step.id}
                className={`p-2 rounded-md border-l-2 transition-all duration-200 ${getPhaseColor(step.type)}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    {getPhaseIcon(step.type)}
                    <span className="text-xs font-medium capitalize">{step.type}</span>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>{Math.round(step.confidence * 100)}%</span>
                    <span>•</span>
                    <span>
                      {new Date(step.timestamp).toLocaleTimeString("en", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit"
                      })}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{step.content}</p>

                {step.reasoning && (
                  <div className="mt-1.5 p-1.5 bg-white/60 dark:bg-gray-600/40 rounded text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Reasoning:</span> {step.reasoning}
                  </div>
                )}

                {step.relatedConcepts && step.relatedConcepts.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {step.relatedConcepts.slice(0, 3).map((ctx, idx) => (
                      <span
                        key={idx}
                        className="px-1.5 py-0.5 bg-white/70 dark:bg-gray-600/50 rounded text-xs text-gray-600 dark:text-gray-400"
                      >
                        {ctx}
                      </span>
                    ))}
                    {step.relatedConcepts.length > 3 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        +{step.relatedConcepts.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Compact Statistics */}
          <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-1">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{thinkingSession.steps.length}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Steps</p>
              </div>
              <div className="p-1">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {formatDuration(thinkingSession.totalDuration)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Duration</p>
              </div>
              <div className="p-1">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {Math.round(averageConfidence * 100)}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Confidence</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThinkingDropdown;
