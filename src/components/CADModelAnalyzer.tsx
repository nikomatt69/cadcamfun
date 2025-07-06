import React, { useState, useEffect } from "react";
import { Cpu, BarChart2, AlertTriangle, Check } from "react-feather";
import { mlService } from "@/src/lib/ai/MachineLearningService";
import AIFeedbackCollector from "@/src/components/ai/AIFeedbackCollector";
import { Element } from "@/src/store/elementsStore";
import { LightbulbIcon } from "lucide-react";

interface CADModelAnalyzerProps {
  elements: Element[];
  modelId: string;
  onAnalysisComplete?: (result: any) => void;
  className?: string;
}

interface AnalysisResult {
  id: string;
  complexity: number;
  suggestions: string[];
  features: string[];
  timestamp: number;
}

/**
 * Component that analyzes CAD models using ML and provides insights
 */
export const CADModelAnalyzer: React.FC<CADModelAnalyzerProps> = ({
  elements,
  modelId,
  onAnalysisComplete,
  className = ""
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Analyze CAD model when component mounts or elements change
  useEffect(() => {
    if (!elements || elements.length === 0) {
      setIsAnalyzing(false);
      setError("No elements to analyze.");
      return;
    }

    const analyzeModel = async () => {
      setIsAnalyzing(true);
      setError(null);

      try {
        // Call ML service to analyze CAD model
        const analysis = await mlService.analyzeCADModel(elements);

        // Create result with unique ID for feedback tracking
        const analysisResult: AnalysisResult = {
          id: `cad_${modelId}_${Date.now()}`,
          ...analysis,
          timestamp: Date.now()
        };

        // Update state
        setResult(analysisResult);

        // Notify parent component
        if (onAnalysisComplete) {
          onAnalysisComplete(analysisResult);
        }
      } catch (err) {
        console.error("CAD model analysis error:", err);
        setError("Failed to analyze CAD model. Please try again.");
      } finally {
        setIsAnalyzing(false);
      }
    };

    analyzeModel();
  }, [elements, modelId]);

  // Handle feedback submission
  const handleFeedbackSubmitted = (isCorrect: boolean, correctedOutput?: any) => {
    console.log("Feedback submitted:", { isCorrect, correctedOutput });
  };

  // Render complexity gauge
  const renderComplexityGauge = (complexity: number) => {
    // Normalize complexity to 0-100 scale
    const percentage = Math.min(100, Math.max(0, complexity * 10));

    // Determine color based on complexity
    const color = complexity > 7 ? "text-red-500" : complexity > 4 ? "text-yellow-500" : "text-green-500";

    return (
      <div className="flex flex-col items-center">
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-1">
          <div
            className={`h-full ${complexity > 7 ? "bg-red-500" : complexity > 4 ? "bg-yellow-500" : "bg-green-500"}`}
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
        <div className="flex justify-between w-full">
          <span className="text-xs text-gray-500">Simple</span>
          <span className={`text-xs font-medium ${color}`}>{complexity.toFixed(1)}/10</span>
          <span className="text-xs text-gray-500">Complex</span>
        </div>
      </div>
    );
  };

  return (
    <div className={`cad-model-analyzer ${className}`}>
      {isAnalyzing ? (
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center">
            <div className="animate-spin mr-3 h-5 w-5 border-2 border-blue-500 dark:border-blue-400 border-t-transparent dark:border-t-transparent rounded-full"></div>
            <span className="text-gray-700 dark:text-gray-300">Analyzing CAD model...</span>
          </div>
        </div>
      ) : error ? (
        <div className="p-4 border border-red-200 dark:border-red-900/30 rounded-md bg-red-50 dark:bg-red-900/10">
          <div className="flex items-center text-red-600 dark:text-red-400">
            <AlertTriangle size={18} className="mr-2" />
            <span>{error}</span>
          </div>
          {elements.length > 0 && (
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Retry
            </button>
          )}
        </div>
      ) : (
        result && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
            <div className="bg-gray-100 dark:bg-gray-800 p-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-medium flex items-center">
                <Cpu size={16} className="mr-2 text-blue-500" />
                CAD Model Analysis
              </h3>
            </div>

            <div className="p-4 bg-white dark:bg-gray-900">
              {/* Complexity section */}
              <div className="mb-4">
                <div className="flex items-center mb-2">
                  <BarChart2 size={16} className="mr-2 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Model Complexity</span>
                </div>
                {renderComplexityGauge(result.complexity)}
              </div>

              {/* Features section */}
              {result.features.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center mb-2">
                    <Check size={16} className="mr-2 text-green-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Detected Features</span>
                  </div>
                  <div className="space-y-1">
                    {result.features.map((feature, index) => (
                      <div
                        key={index}
                        className="p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                      >
                        <span className="text-gray-700 dark:text-gray-300 capitalize">
                          {feature.replace(/_/g, " ")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions section */}
              {result.suggestions.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center mb-2">
                    <LightbulbIcon size={16} className="mr-2 text-yellow-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Suggestions</span>
                  </div>
                  <div className="space-y-2">
                    {result.suggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-900/30"
                      >
                        <span className="text-yellow-700 dark:text-yellow-300">{suggestion}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Feedback collection */}
              <div className="mt-4">
                <AIFeedbackCollector
                  exampleId={result.id}
                  modelType="cadModelAnalysis"
                  result={result}
                  onFeedbackSubmitted={handleFeedbackSubmitted}
                />
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default CADModelAnalyzer;
