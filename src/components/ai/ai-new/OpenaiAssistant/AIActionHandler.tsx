// src/components/ai/AIActionHandler.tsx
import React from "react";
import { AIAction } from "../../../../types/AITypes";

interface AIActionHandlerProps {
  actions: AIAction[];
  onExecute: (action: AIAction) => void;
  isProcessing: boolean;
}

export const AIActionHandler: React.FC<AIActionHandlerProps> = ({ actions, onExecute, isProcessing }) => {
  if (actions.length === 0) return null;

  return (
    <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 p-4 rounded-2xl shadow-lg">
      <div className="flex items-center space-x-2 mb-3">
        <div className="w-2 h-2 bg-gradient-to-r from-purple-400 to-indigo-500 rounded-full"></div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Pending Actions</h3>
        <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
          {actions.length}
        </span>
      </div>
      <div className="space-y-3">
        {actions.map((action, index) => (
          <div
            key={`${action.type}-${index}`}
            className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-blue-200/50 dark:border-blue-700/50 rounded-xl p-4 shadow-md"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <div className="w-1.5 h-1.5 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full"></div>
                  <h4 className="font-semibold text-blue-700 dark:text-blue-400 text-sm">{action.type}</h4>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{action.description}</p>
              </div>
              <button
                onClick={() => onExecute(action)}
                disabled={isProcessing}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 flex items-center space-x-2 ${
                  isProcessing
                    ? "bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl hover:scale-105"
                }`}
              >
                <span>{isProcessing ? "Processing..." : "Execute"}</span>
              </button>
            </div>
            <div className="mt-3 bg-gray-50/70 dark:bg-gray-900/70 backdrop-blur-sm p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">Payload Preview:</div>
              <div className="overflow-x-auto max-h-32 overflow-y-auto">
                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {JSON.stringify(action.payload, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
