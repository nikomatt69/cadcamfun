import React, { useState, useEffect } from "react";
import { FileText, Tag, CheckCircle, AlertCircle } from "react-feather";
import { mlService } from "@/src/lib/ai/MachineLearningService";
import AIFeedbackCollector from "./AIFeedbackCollector";

interface DocumentAnalyzerProps {
  documentText: string;
  documentId: string;
  onAnalysisComplete?: (result: any) => void;
  className?: string;
}

interface AnalysisResult {
  id: string;
  category: string;
  confidence: number;
  keywords: string[];
  timestamp: number;
}

/**
 * Component that analyzes documents using ML and shows results with feedback collection
 */
export const DocumentAnalyzer: React.FC<DocumentAnalyzerProps> = ({
  documentText,
  documentId,
  onAnalysisComplete,
  className = ""
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Analyze document when component mounts or document changes
  useEffect(() => {
    if (!documentText) return;

    const analyzeDocument = async () => {
      setIsAnalyzing(true);
      setError(null);

      try {
        // Call ML service to classify document
        const classification = await mlService.classifyDocument(documentText);

        // Create result with unique ID for feedback tracking
        const analysisResult: AnalysisResult = {
          id: `doc_${documentId}_${Date.now()}`,
          ...classification,
          timestamp: Date.now()
        };

        // Update state
        setResult(analysisResult);

        // Notify parent component
        if (onAnalysisComplete) {
          onAnalysisComplete(analysisResult);
        }
      } catch (err) {
        console.error("Document analysis error:", err);
        setError("Failed to analyze document. Please try again.");
      } finally {
        setIsAnalyzing(false);
      }
    };

    analyzeDocument();
  }, [documentText, documentId]);

  // Handle feedback submission
  const handleFeedbackSubmitted = (isCorrect: boolean, correctedOutput?: any) => {
    console.log("Feedback submitted:", { isCorrect, correctedOutput });
  };

  // Render confidence indicator
  const renderConfidenceIndicator = (confidence: number) => {
    const color = confidence > 0.8 ? "text-green-500" : confidence > 0.6 ? "text-yellow-500" : "text-red-500";

    return (
      <div className="flex items-center">
        <div
          className={`w-2 h-2 rounded-full ${
            confidence > 0.8 ? "bg-green-500" : confidence > 0.6 ? "bg-yellow-500" : "bg-red-500"
          } mr-1`}
        ></div>
        <span className={`text-xs ${color}`}>{Math.round(confidence * 100)}% confidence</span>
      </div>
    );
  };

  return (
    <div className={`document-analyzer ${className}`}>
      {isAnalyzing ? (
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center">
            <div className="animate-spin mr-3 h-5 w-5 border-2 border-blue-500 dark:border-blue-400 border-t-transparent dark:border-t-transparent rounded-full"></div>
            <span className="text-gray-700 dark:text-gray-300">Analyzing document...</span>
          </div>
        </div>
      ) : error ? (
        <div className="p-4 border border-red-200 dark:border-red-900/30 rounded-md bg-red-50 dark:bg-red-900/10">
          <div className="flex items-center text-red-600 dark:text-red-400">
            <AlertCircle size={18} className="mr-2" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      ) : (
        result && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
            <div className="bg-gray-100 dark:bg-gray-800 p-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-medium flex items-center">
                <FileText size={16} className="mr-2 text-blue-500" />
                Document Analysis
              </h3>
            </div>

            <div className="p-4 bg-white dark:bg-gray-900">
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Category</span>
                  {renderConfidenceIndicator(result.confidence)}
                </div>
                <div className="flex items-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                  <span className="text-blue-700 dark:text-blue-300 font-medium capitalize">
                    {result.category.replace(/_/g, " ")}
                  </span>
                </div>
              </div>

              {result.keywords.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Keywords</span>
                    <Tag size={14} className="ml-1 text-gray-500" />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {result.keywords.map((keyword, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <AIFeedbackCollector
                  exampleId={result.id}
                  modelType="documentClassification"
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

export default DocumentAnalyzer;
