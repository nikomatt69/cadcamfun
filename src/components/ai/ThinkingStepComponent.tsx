import React, { useState } from "react";
import { motion } from "framer-motion";
import { ThinkingStep } from "@/src/types/AITypes";

interface ThinkingStepComponentProps {
  step: ThinkingStep;
  index: number;
  isExpanded: boolean;
  isLast: boolean;
  onToggleExpand: () => void;
  showConfidence?: boolean;
  showTiming?: boolean;
}

const ThinkingStepComponent: React.FC<ThinkingStepComponentProps> = ({
  step,
  index,
  isExpanded,
  isLast,
  onToggleExpand,
  showConfidence = true,
  showTiming = true
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const getStepIcon = (type: ThinkingStep["type"]) => {
    const icons: Record<ThinkingStep["type"], { emoji: string; color: string }> = {
      analysis: { emoji: "🔍", color: "text-blue-600" },
      reasoning: { emoji: "🧠", color: "text-purple-600" },
      conclusion: { emoji: "✅", color: "text-green-600" },
      question: { emoji: "❓", color: "text-orange-600" },
      hypothesis: { emoji: "💡", color: "text-yellow-600" }
    };
    return icons[type] || { emoji: "💭", color: "text-gray-600" };
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "text-green-600 bg-green-100 border-green-200";
    if (confidence >= 0.6) return "text-yellow-600 bg-yellow-100 border-yellow-200";
    return "text-red-600 bg-red-100 border-red-200";
  };

  const getBorderColor = (type: ThinkingStep["type"]) => {
    const colors: Record<ThinkingStep["type"], string> = {
      analysis: "border-l-blue-400",
      reasoning: "border-l-purple-400",
      conclusion: "border-l-green-400",
      question: "border-l-orange-400",
      hypothesis: "border-l-yellow-400"
    };
    return colors[type] || "border-l-gray-400";
  };

  const getBackgroundColor = (type: ThinkingStep["type"]) => {
    const colors: Record<ThinkingStep["type"], string> = {
      analysis: "bg-blue-50",
      reasoning: "bg-purple-50",
      conclusion: "bg-green-50",
      question: "bg-orange-50",
      hypothesis: "bg-yellow-50"
    };
    return colors[type] || "bg-gray-50";
  };

  const stepIcon = getStepIcon(step.type);
  const confidenceColor = getConfidenceColor(step.confidence);
  const borderColor = getBorderColor(step.type);
  const bgColor = getBackgroundColor(step.type);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
      className="relative"
    >
      {/* Timeline connector */}
      {!isLast && <div className="absolute left-6 top-12 w-px h-8 bg-gray-200"></div>}

      <div
        className={`
          relative pl-4 pr-3 py-3 border-l-4 rounded-r-lg cursor-pointer
          transition-all duration-200 hover:shadow-md hover:scale-[1.01]
          ${borderColor} ${bgColor}
          ${isExpanded ? "ring-2 ring-blue-200 shadow-lg" : ""}
          ${isHovered ? "shadow-md" : ""}
        `}
        onClick={onToggleExpand}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Step header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1">
            {/* Icon and timeline marker */}
            <div className="relative flex-shrink-0">
              <div className="w-8 h-8 bg-white border-2 border-gray-200 rounded-full flex items-center justify-center">
                <span className={`text-sm ${stepIcon.color}`}>{stepIcon.emoji}</span>
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {index + 1}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-xs font-semibold text-gray-800 uppercase tracking-wider">{step.type}</span>

                {showTiming && step.duration && (
                  <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded">{step.duration}ms</span>
                )}

                {step.timestamp && <span className="text-xs text-gray-400">{step.timestamp.toLocaleTimeString()}</span>}
              </div>

              <p className="text-sm text-gray-900 leading-relaxed mb-2">{step.content}</p>

              {/* Related concepts preview */}
              {step.relatedConcepts.length > 0 && !isExpanded && (
                <div className="flex flex-wrap gap-1">
                  {step.relatedConcepts.slice(0, 3).map((concept: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 text-xs bg-white bg-opacity-70 text-gray-600 rounded border">
                      {concept}
                    </span>
                  ))}
                  {step.relatedConcepts.length > 3 && (
                    <span className="px-2 py-0.5 text-xs text-gray-500">+{step.relatedConcepts.length - 3} more</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right side controls */}
          <div className="flex items-start space-x-2 ml-3">
            {/* Confidence indicator */}
            {showConfidence && (
              <div
                className={`
                px-2 py-1 text-xs font-medium rounded-full border
                ${confidenceColor}
              `}
              >
                {Math.round(step.confidence * 100)}%
              </div>
            )}

            {/* Expand/collapse button */}
            <button
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              onClick={e => {
                e.stopPropagation();
                onToggleExpand();
              }}
            >
              <motion.svg
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </motion.svg>
            </button>
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="mt-4 pt-4 border-t border-gray-200 border-opacity-50"
          >
            {/* Detailed reasoning */}
            {step.reasoning && (
              <div className="mb-4">
                <h5 className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Detailed Reasoning</h5>
                <div className="bg-white bg-opacity-60 rounded-lg p-3 border">
                  <p className="text-sm text-gray-800 leading-relaxed">{step.reasoning}</p>
                </div>
              </div>
            )}

            {/* Related concepts */}
            {step.relatedConcepts.length > 0 && (
              <div className="mb-4">
                <h5 className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Related Concepts</h5>
                <div className="flex flex-wrap gap-2">
                  {step.relatedConcepts.map((concept: string, i: number) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, delay: i * 0.05 }}
                      className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-full hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      {concept}
                    </motion.span>
                  ))}
                </div>
              </div>
            )}

            {/* Step metadata */}
            <div className="bg-white bg-opacity-40 rounded-lg p-3 border border-dashed border-gray-300">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-medium text-gray-600">Confidence Level:</span>
                  <div className="mt-1">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          step.confidence >= 0.8
                            ? "bg-green-500"
                            : step.confidence >= 0.6
                              ? "bg-yellow-500"
                              : "bg-red-500"
                        }`}
                        style={{ width: `${step.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-gray-600">{Math.round(step.confidence * 100)}% confident</span>
                  </div>
                </div>

                <div>
                  <span className="font-medium text-gray-600">Processing Time:</span>
                  <div className="mt-1 text-gray-800">{step.duration ? `${step.duration}ms` : "Unknown"}</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-3 flex items-center justify-end space-x-2">
              <button
                onClick={e => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(step.content);
                }}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-white hover:bg-opacity-50 rounded transition-colors"
              >
                Copy Step
              </button>

              <button
                onClick={e => {
                  e.stopPropagation();
                  // Future: Add to favorites or notes
                }}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-white hover:bg-opacity-50 rounded transition-colors"
              >
                Save
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default ThinkingStepComponent;
