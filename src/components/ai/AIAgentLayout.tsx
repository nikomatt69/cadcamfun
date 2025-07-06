import React, { useState } from "react";
import { Element } from "@/src/store/elementsStore";
import { UnifiedAIAgent } from "./UnifiedAIAgent";

interface AIAgentLayoutProps {
  onElementsGenerated?: (elements: Element[]) => void;
  availableElements?: Element[];
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left" | "sidebar";
  className?: string;
}

export const AIAgentLayout: React.FC<AIAgentLayoutProps> = ({
  onElementsGenerated,
  availableElements = [],
  position = "bottom-right",
  className = ""
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const getPositionClasses = () => {
    const baseClasses = "fixed z-50 transition-all duration-300 ease-in-out";

    switch (position) {
      case "bottom-right":
        return `${baseClasses} bottom-4 right-4 ${isVisible ? "w-96 h-[600px]" : "w-16 h-16"}`;
      case "bottom-left":
        return `${baseClasses} bottom-4 left-4 ${isVisible ? "w-96 h-[600px]" : "w-16 h-16"}`;
      case "top-right":
        return `${baseClasses} top-4 right-4 ${isVisible ? "w-96 h-[600px]" : "w-16 h-16"}`;
      case "top-left":
        return `${baseClasses} top-4 left-4 ${isVisible ? "w-96 h-[600px]" : "w-16 h-16"}`;
      case "sidebar":
        return `${baseClasses} top-0 right-0 h-full ${isVisible ? "w-96" : "w-16"}`;
      default:
        return `${baseClasses} bottom-4 right-4 ${isVisible ? "w-96 h-[600px]" : "w-16 h-16"}`;
    }
  };

  return (
    <>
      {/* Floating Toggle Button (when collapsed) */}
      {!isVisible && (
        <div className={getPositionClasses()}>
          <button
            onClick={() => setIsVisible(true)}
            className="w-full h-full bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors group"
            title="Apri AI Agent"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">🤖</span>
          </button>
        </div>
      )}

      {/* Full AI Agent Interface (when expanded) */}
      {isVisible && (
        <div className={getPositionClasses()}>
          <div className="relative h-full">
            {/* Close button */}
            <button
              onClick={() => setIsVisible(false)}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs z-10 flex items-center justify-center"
              title="Chiudi"
            >
              ✕
            </button>

            <UnifiedAIAgent
              onElementsGenerated={onElementsGenerated}
              availableElements={availableElements}
              className={`h-full ${className}`}
            />
          </div>
        </div>
      )}

      {/* Backdrop for mobile */}
      {isVisible && (
        <div className="fixed inset-0 bg-black bg-opacity-30 z-40 lg:hidden" onClick={() => setIsVisible(false)} />
      )}
    </>
  );
};

// Export anche il componente principale per uso diretto
export { UnifiedAIAgent } from "./UnifiedAIAgent";
