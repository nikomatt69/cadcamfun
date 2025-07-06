import React, { useState } from "react";
import { useConstraints } from "../../contexts/ConstraintContext";
import ModelTimeline from "./timeline/ModelTimeline";
import HistoryBrowser from "./timeline/HistoryBrowser";
import { Constraint, ParametricParameter } from "../../types/constraints";

/**
 * Parametric Modeling Panel for the CAD UI
 * Integrates the constraint system with the main CAD interface
 */
export default function ParametricModelingPanel() {
  const { constraintEngine, addConstraint, updateConstraint, removeConstraint, updateParameter } = useConstraints();

  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"timeline" | "browser">("timeline");

  // Handle adding a new constraint from the UI
  const handleAddConstraint = (constraint: Constraint) => {
    addConstraint(constraint);
  };

  // Handle updating a parameter from the UI
  const handleUpdateParameter = (parameter: ParametricParameter) => {
    updateParameter(parameter.id, parameter.value);
  };

  // Handle selection of a history item
  const handleHistoryItemSelected = (entryId: string) => {
    // Highlight the relevant entities in the CAD view
    // This would integrate with your existing selection system
    console.log(`Selected history item: ${entryId}`);
  };

  // Handle rollback to a specific point in history
  const handleRollbackToItem = (entryId: string) => {
    // Implement rollback functionality
    // This would need to integrate with your CAD system's state management
    console.log(`Rolling back to: ${entryId}`);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="bg-white border-b flex">
        <button
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "timeline" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-600 hover:text-gray-800"
          }`}
          onClick={() => setActiveTab("timeline")}
        >
          Timeline
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "browser" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-600 hover:text-gray-800"
          }`}
          onClick={() => setActiveTab("browser")}
        >
          Constraints
        </button>
      </div>

      <div className="flex-grow overflow-hidden">
        {activeTab === "timeline" ? (
          <ModelTimeline
            constraintEngine={constraintEngine}
            onHistoryItemSelected={handleHistoryItemSelected}
            onRollbackToItem={handleRollbackToItem}
          />
        ) : (
          <HistoryBrowser
            constraintEngine={constraintEngine}
            onAddConstraint={handleAddConstraint}
            onUpdateParameter={handleUpdateParameter}
          />
        )}
      </div>

      <div className="bg-gray-50 border-t p-2 text-xs text-gray-500">
        Tip: Use constraints to create parametric relationships between CAD elements
      </div>
    </div>
  );
}
