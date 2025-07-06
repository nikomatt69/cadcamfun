import React, { useState, useEffect, useRef } from "react";
import { Element } from "@/src/store/elementsStore";
import { useAI } from "./ai-new/AIContextProvider";
import { UnifiedAIAgent } from "./UnifiedAIAgent";
import { ChevronLeft, ChevronRight, Cpu } from "react-feather";

interface AIAgentToolbarProps {
  onElementsGenerated?: (elements: Element[]) => void;
  availableElements?: Element[];
  className?: string;
}

export const AIAgentToolbar: React.FC<AIAgentToolbarProps> = ({
  onElementsGenerated,
  availableElements = [],
  className = ""
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClose = () => {
    setIsAnimating(true);
    setIsExpanded(false);
    setTimeout(() => setIsAnimating(false), 300);
  };

  return (
    <div
      className={`fixed right-0 top-1/2 transform -translate-y-1/2 z-50 flex flex-col h-[1000px] bg-gray-100 dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden transition-all duration-300 ease-in-out ${
        isExpanded ? "w-96" : "w-12 rounded-lg rounded-l-3xl"
      } ${className}`}
    >
      {isExpanded ? (
        <>
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b bg-gradient-to-b from-blue-400 to-blue-700 text-white rounded-t-3xl dark:from-gray-700 dark:to-gray-800 dark:border-gray-600">
            <div className="flex rounded-t-3xl h-12 items-center">
              <Cpu className="mr-2 w-6 h-6" />
              <div>
                <h3 className="font-medium">AI Agent Assistant</h3>
              </div>
            </div>
            <div className="flex space-x-1">
              <button
                onClick={handleClose}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                title="Collapse"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Content Area - Unified AI Agent */}
          <div className="flex-1 overflow-hidden flex h-full flex-col relative">
            <UnifiedAIAgent
              onElementsGenerated={onElementsGenerated}
              availableElements={availableElements}
              className="h-full border-0 shadow-none bg-transparent"
            />
          </div>

          {/* Status Indicator at bottom */}
        </>
      ) : (
        // Collapsed view
        <div className="h-full flex flex-col items-center py-4 space-y-4">
          <button
            onClick={() => setIsExpanded(true)}
            className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800"
            title="Expand AI Assistant"
          >
            <ChevronLeft size={16} className="text-blue-600 dark:text-blue-300" />
          </button>
          <Cpu size={16} className="text-gray-500 dark:text-gray-400" />

          {/* Status Indicator */}
        </div>
      )}
    </div>
  );
};
