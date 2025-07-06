import React, { useState, useEffect } from "react";
import { BarChart2, Database, Clock, Users, FileText, File, Settings, RefreshCw } from "react-feather";
import { mlTrainingConfig } from "@/src/config/mlTrainingConfig";

interface MLDashboardProps {
  className?: string;
}

interface TrainingStats {
  documentClassification: {
    examples: number;
    highQualityExamples: number;
    feedbackCount: number;
    lastTraining: number | null;
    modelVersion: string | null;
  };
  cadModelAnalysis: {
    examples: number;
    highQualityExamples: number;
    feedbackCount: number;
    lastTraining: number | null;
    modelVersion: string | null;
  };
}

/**
 * Dashboard for monitoring ML training and data collection
 */
export const MLDashboard: React.FC<MLDashboardProps> = ({ className = "" }) => {
  const [stats, setStats] = useState<TrainingStats>({
    documentClassification: {
      examples: 0,
      highQualityExamples: 0,
      feedbackCount: 0,
      lastTraining: null,
      modelVersion: null
    },
    cadModelAnalysis: {
      examples: 0,
      highQualityExamples: 0,
      feedbackCount: 0,
      lastTraining: null,
      modelVersion: null
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [autoTraining, setAutoTraining] = useState(mlTrainingConfig.training.autoTrigger);
  const [dataCollection, setDataCollection] = useState(mlTrainingConfig.collection.enabled);

  // Load ML stats when component mounts
  useEffect(() => {
    loadStats();
  }, []);

  // Function to load ML stats from local storage
  const loadStats = () => {
    setIsLoading(true);

    setTimeout(() => {
      try {
        if (typeof window !== "undefined") {
          // Load training data from localStorage
          const trainingDataStr = localStorage.getItem("ml_training_data");

          if (trainingDataStr) {
            const trainingData = JSON.parse(trainingDataStr);

            // Calculate document classification stats
            const docExamples = trainingData.documentClassification || [];
            const docHighQuality = docExamples.filter((ex: any) => ex.quality > 0.7);
            const docFeedback = docExamples.filter(
              (ex: any) => ex.source === "feedback" || ex.metadata?.feedbackProvided
            );

            // Calculate CAD model analysis stats
            const cadExamples = trainingData.cadModelAnalysis || [];
            const cadHighQuality = cadExamples.filter((ex: any) => ex.quality > 0.7);
            const cadFeedback = cadExamples.filter(
              (ex: any) => ex.source === "feedback" || ex.metadata?.feedbackProvided
            );

            // Load model metadata if available
            const docModelMetadata = localStorage.getItem("ml_model_document-classifier_metadata");
            const cadModelMetadata = localStorage.getItem("ml_model_cad-analyzer_metadata");

            setStats({
              documentClassification: {
                examples: docExamples.length,
                highQualityExamples: docHighQuality.length,
                feedbackCount: docFeedback.length,
                lastTraining: docModelMetadata ? JSON.parse(docModelMetadata).trainedAt : null,
                modelVersion: docModelMetadata ? JSON.parse(docModelMetadata).version : null
              },
              cadModelAnalysis: {
                examples: cadExamples.length,
                highQualityExamples: cadHighQuality.length,
                feedbackCount: cadFeedback.length,
                lastTraining: cadModelMetadata ? JSON.parse(cadModelMetadata).trainedAt : null,
                modelVersion: cadModelMetadata ? JSON.parse(cadModelMetadata).version : null
              }
            });
          }
        }
      } catch (error) {
        console.error("Error loading ML stats:", error);
      } finally {
        setIsLoading(false);
      }
    }, 500);
  };

  // Toggle auto-training
  const toggleAutoTraining = () => {
    const newValue = !autoTraining;
    setAutoTraining(newValue);

    // Update config in localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("ml_auto_training_enabled", String(newValue));
    }
  };

  // Toggle data collection
  const toggleDataCollection = () => {
    const newValue = !dataCollection;
    setDataCollection(newValue);

    // Update config in localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("ml_data_collection_enabled", String(newValue));
    }
  };

  // Format date for display
  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return "Never";
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Calculate training progress
  const calculateTrainingProgress = (examples: number) => {
    const threshold = mlTrainingConfig.training.minExamplesRequired;
    const percentage = Math.min(100, Math.round((examples / threshold) * 100));
    return percentage;
  };

  return (
    <div className={`ml-dashboard ${className}`}>
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
        <div className="bg-gray-100 dark:bg-gray-800 p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-medium flex items-center">
            <Database className="mr-2 text-blue-500" size={20} />
            ML Training Dashboard
          </h2>
          <button
            onClick={loadStats}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            title="Refresh stats"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {isLoading ? (
          <div className="p-6 flex justify-center items-center">
            <div className="animate-spin h-8 w-8 border-2 border-blue-500 dark:border-blue-400 border-t-transparent dark:border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div className="p-4">
            {/* Configuration section */}
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-900/30">
              <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center mb-3">
                <Settings size={16} className="mr-2" />
                Configuration
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-Training</div>
                    <div className="text-xs text-gray-500">
                      Automatically train models when enough data is available
                    </div>
                  </div>
                  <div className="relative inline-block w-10 mr-2 align-middle select-none">
                    <input
                      type="checkbox"
                      checked={autoTraining}
                      onChange={toggleAutoTraining}
                      className="sr-only"
                      id="toggleAutoTraining"
                    />
                    <label
                      htmlFor="toggleAutoTraining"
                      className={`block overflow-hidden h-5 rounded-full cursor-pointer ${
                        autoTraining ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"
                      }`}
                    >
                      <span
                        className={`block h-5 w-5 rounded-full bg-white transform transition-transform ${
                          autoTraining ? "translate-x-5" : "translate-x-0"
                        }`}
                      ></span>
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Data Collection</div>
                    <div className="text-xs text-gray-500">Collect examples for ML training</div>
                  </div>
                  <div className="relative inline-block w-10 mr-2 align-middle select-none">
                    <input
                      type="checkbox"
                      checked={dataCollection}
                      onChange={toggleDataCollection}
                      className="sr-only"
                      id="toggleDataCollection"
                    />
                    <label
                      htmlFor="toggleDataCollection"
                      className={`block overflow-hidden h-5 rounded-full cursor-pointer ${
                        dataCollection ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
                      }`}
                    >
                      <span
                        className={`block h-5 w-5 rounded-full bg-white transform transition-transform ${
                          dataCollection ? "translate-x-5" : "translate-x-0"
                        }`}
                      ></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Document Classification */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="bg-purple-50 dark:bg-purple-900/20 p-3 border-b border-purple-200 dark:border-purple-900/30">
                  <h3 className="text-sm font-medium text-purple-700 dark:text-purple-300 flex items-center">
                    <FileText size={16} className="mr-2" />
                    Document Classification
                  </h3>
                </div>

                <div className="p-4 space-y-4">
                  {/* Training progress */}
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Training Progress</span>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {stats.documentClassification.examples} / {mlTrainingConfig.training.minExamplesRequired}{" "}
                        examples
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500"
                        style={{ width: `${calculateTrainingProgress(stats.documentClassification.examples)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center">
                        <Users size={12} className="mr-1" />
                        Feedback Count
                      </div>
                      <div className="text-lg font-medium text-gray-800 dark:text-gray-200">
                        {stats.documentClassification.feedbackCount}
                      </div>
                    </div>

                    <div className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center">
                        <BarChart2 size={12} className="mr-1" />
                        High Quality
                      </div>
                      <div className="text-lg font-medium text-gray-800 dark:text-gray-200">
                        {stats.documentClassification.highQualityExamples}
                      </div>
                    </div>

                    <div className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded col-span-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center">
                        <Clock size={12} className="mr-1" />
                        Last Training
                      </div>
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {formatDate(stats.documentClassification.lastTraining)}
                      </div>
                    </div>
                  </div>

                  {/* Model info */}
                  {stats.documentClassification.modelVersion && (
                    <div className="p-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-900/30 rounded">
                      <div className="text-xs text-purple-700 dark:text-purple-300 mb-1">Active Model</div>
                      <div className="text-sm font-mono text-purple-800 dark:text-purple-200">
                        {stats.documentClassification.modelVersion}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* CAD Model Analysis */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 border-b border-blue-200 dark:border-blue-900/30">
                  <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center">
                    <File size={16} className="mr-2" />
                    CAD Model Analysis
                  </h3>
                </div>

                <div className="p-4 space-y-4">
                  {/* Training progress */}
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Training Progress</span>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {stats.cadModelAnalysis.examples} / {mlTrainingConfig.training.minExamplesRequired} examples
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${calculateTrainingProgress(stats.cadModelAnalysis.examples)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center">
                        <Users size={12} className="mr-1" />
                        Feedback Count
                      </div>
                      <div className="text-lg font-medium text-gray-800 dark:text-gray-200">
                        {stats.cadModelAnalysis.feedbackCount}
                      </div>
                    </div>

                    <div className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center">
                        <BarChart2 size={12} className="mr-1" />
                        High Quality
                      </div>
                      <div className="text-lg font-medium text-gray-800 dark:text-gray-200">
                        {stats.cadModelAnalysis.highQualityExamples}
                      </div>
                    </div>

                    <div className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded col-span-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center">
                        <Clock size={12} className="mr-1" />
                        Last Training
                      </div>
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {formatDate(stats.cadModelAnalysis.lastTraining)}
                      </div>
                    </div>
                  </div>

                  {/* Model info */}
                  {stats.cadModelAnalysis.modelVersion && (
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/30 rounded">
                      <div className="text-xs text-blue-700 dark:text-blue-300 mb-1">Active Model</div>
                      <div className="text-sm font-mono text-blue-800 dark:text-blue-200">
                        {stats.cadModelAnalysis.modelVersion}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Manual training trigger */}
            <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Manual Training Control</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={stats.documentClassification.examples < 50}
                >
                  Train Document Classifier
                </button>

                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={stats.cadModelAnalysis.examples < 50}
                >
                  Train CAD Analyzer
                </button>
              </div>

              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Note: Manual training requires at least 50 examples. Training may take several minutes to complete.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MLDashboard;
