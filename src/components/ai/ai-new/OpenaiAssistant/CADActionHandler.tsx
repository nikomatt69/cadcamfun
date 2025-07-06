import React from "react";
import { AIAction } from "@/src/types/AITypes";
import { CADElementPreview } from "./CADElementPreview";
import { ComponentPreviewSection } from "../ComponentPreviewSection";
import { ThreeDPreview } from "src/pages/components/[id]";
import { ComponentData } from "@/src/types/component";
interface CADActionHandlerProps {
  actions: AIAction[];
  onExecute: (action: AIAction) => void;
  isProcessing: boolean;
}

export const CADActionHandler: React.FC<CADActionHandlerProps> = ({ actions, onExecute, isProcessing }) => {
  if (actions.length === 0) return null;

  // Get a user-friendly name for the action type
  const getActionName = (type: string): string => {
    switch (type) {
      case "generateCADElement":
        return "Create Elements";
      case "updateCADElement":
        return "Update Element";
      case "removeCADElement":
        return "Remove Element";
      case "groupCADElements":
        return "Group Elements";
      case "autoQuoteCADElements":
        return "Auto Quote Elements";
      case "generate2DTechnicalDrawings":
        return "Generate 2D Technical Drawings";
      case "simulatePhysicalProperties":
        return "Simulate Physical Properties";
      case "analyzeManufacturability":
        return "Analyze Manufacturability";

      default:
        return type.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase());
    }
  };

  return (
    <div className="bg-gradient-to-br from-blue-50/70 to-indigo-50/70 dark:from-blue-900/30 dark:to-indigo-900/30 backdrop-blur-xl border border-blue-200/50 dark:border-blue-700/50 p-4 rounded-2xl shadow-lg">
      <div className="flex items-center space-x-2 mb-4">
        <div className="w-2 h-2 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full"></div>
        <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300">CAD Operations</h3>
        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium">
          {actions.length}
        </span>
      </div>
      <div className="space-y-4">
        {actions.map((action, index) => (
          <div
            key={`${action.type}-${index}`}
            className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-blue-200/50 dark:border-blue-700/50 rounded-xl p-4 shadow-md"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-1.5 h-1.5 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full"></div>
                  <h4 className="font-semibold text-blue-700 dark:text-blue-400 text-sm">{getActionName(action.type)}</h4>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{action.description}</p>
              </div>
              <button
                onClick={() => onExecute(action)}
                disabled={isProcessing}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex items-center space-x-2 ${
                  isProcessing
                    ? "bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl hover:scale-105"
                }`}
              >
                <span>{isProcessing ? "Processing..." : "Apply Changes"}</span>
              </button>
            </div>

            {/* Render action-specific preview or general payload */}
            <div className="mt-3 bg-gray-50/70 dark:bg-gray-900/70 backdrop-blur-sm p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">Payload Preview:</div>
              <div className="overflow-x-auto max-h-32 overflow-y-auto">
                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {action.payload ? JSON.stringify(action.payload, null, 2) : "{}"}
              </pre>
              </div>
            </div>

            {/* Aggiungi l'anteprima per le azioni di generazione */}
            <ComponentPreviewSection action={action.payload} />

            {/* Specific previews (can be removed if general payload is sufficient) */}
            {/* Example: Keep specific preview for generateCADElement if needed */}

            {action.type === "generateCADElement" && <CADElementPreview action={action} />}
          </div>
        ))}
      </div>
    </div>
  );
};
