import React, { useState, useEffect } from "react";
import { Cpu, Maximize2, Minimize2, Code, Download } from "react-feather";
import CADModelAnalyzer from "./CADModelAnalyzer";
import { useElementsStore } from "@/src/store/elementsStore";
import { v4 as uuidv4 } from "uuid";

interface CADModelInsightPanelProps {
  className?: string;
  onInsightsGenerated?: (insights: any) => void;
}

/**
 * Panel that provides ML-powered insights and analysis for the current CAD model
 */
export const CADModelInsightPanel: React.FC<CADModelInsightPanelProps> = ({ className = "", onInsightsGenerated }) => {
  const { elements } = useElementsStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [modelId] = useState(`model_${uuidv4()}`);
  const [lastAnalysisElements, setLastAnalysisElements] = useState<number>(0);

  // Auto-analyze when elements change significantly
  useEffect(() => {
    // Skip if already analyzing
    if (isAnalyzing) return;

    // Check if element count has changed enough to trigger analysis
    const countDifference = Math.abs(elements.length - lastAnalysisElements);
    const percentChange = elements.length > 0 ? (countDifference / elements.length) * 100 : 0;

    // Trigger analysis if more than 20% change or first time
    if (lastAnalysisElements === 0 || percentChange > 20) {
      setIsAnalyzing(true);
    }
  }, [elements, lastAnalysisElements, isAnalyzing]);

  // Handle analysis completion
  const handleAnalysisComplete = (result: any) => {
    setIsAnalyzing(false);
    setLastAnalysisElements(elements.length);

    if (onInsightsGenerated) {
      onInsightsGenerated(result);
    }
  };

  // Force a new analysis
  const triggerAnalysis = () => {
    setIsAnalyzing(true);
  };

  // Toggle panel expansion
  const toggleExpansion = () => {
    setIsExpanded(!isExpanded);
  };

  // Export insights as JSON
  const exportInsights = (insights: any) => {
    const dataStr = JSON.stringify(insights, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;

    const exportName = `cad_insights_${new Date().toISOString().slice(0, 10)}.json`;

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportName);
    linkElement.click();
  };

  return (
    <div className={`cad-model-insight-panel ${className}`}>
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 overflow-hidden">
        <div className="bg-gray-100 dark:bg-gray-800 p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="font-medium flex items-center">
            <Cpu size={16} className="mr-2 text-blue-500" />
            CAD Model Insights
          </h2>

          <div className="flex items-center space-x-1">
            <button
              onClick={triggerAnalysis}
              disabled={isAnalyzing || elements.length === 0}
              className="p-1.5 rounded-full text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Analyze model"
            >
              <Code size={16} />
            </button>

            <button
              onClick={toggleExpansion}
              className="p-1.5 rounded-full text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
              title={isExpanded ? "Collapse panel" : "Expand panel"}
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

        <div
          className={`transition-all duration-300 overflow-hidden ${isExpanded ? "max-h-[1000px]" : "max-h-[400px]"}`}
        >
          {elements.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              <p>No CAD elements in the workspace.</p>
              <p className="text-sm mt-1">Add elements to get AI-powered insights.</p>
            </div>
          ) : (
            <div className="p-3">
              <CADModelAnalyzer elements={elements} modelId={modelId} onAnalysisComplete={handleAnalysisComplete} />

              {lastAnalysisElements > 0 && !isAnalyzing && (
                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 flex justify-between items-center">
                  <span>Last analyzed: {lastAnalysisElements} elements</span>
                  <button
                    onClick={() =>
                      exportInsights({
                        modelId,
                        elements: elements.map(el => ({
                          id: el.id,
                          type: el.type
                        })),
                        timestamp: Date.now()
                      })
                    }
                    className="flex items-center px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300"
                  >
                    <Download size={12} className="mr-1" />
                    Export
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CADModelInsightPanel;
