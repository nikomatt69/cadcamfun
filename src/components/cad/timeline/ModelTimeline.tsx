import React, { useState, useEffect } from "react";
import { ConstraintHistoryEntry } from "../../../types/constraints";
import { ConstraintEngine } from "../../../lib/constraints/ConstraintEngine";
import { ConstraintType } from "../../../types/constraints";

interface ModelTimelineProps {
  constraintEngine: ConstraintEngine;
  onHistoryItemSelected?: (entryId: string) => void;
  onRollbackToItem?: (entryId: string) => void;
}

type TimelineItemType = "constraint" | "operation" | "parameter";

interface TimelineItem {
  id: string;
  type: TimelineItemType;
  timestamp: number;
  description: string;
  details: Record<string, any>;
  data: any;
}

/**
 * Timeline component for visualizing parametric modeling history
 */
export default function ModelTimeline({
  constraintEngine,
  onHistoryItemSelected,
  onRollbackToItem
}: ModelTimelineProps) {
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  // Load history when constraint engine changes
  useEffect(() => {
    if (constraintEngine) {
      const constraintHistory = constraintEngine.getHistory();

      // Convert constraint history to timeline items
      const items = constraintHistory.map(entry => convertConstraintEntryToTimelineItem(entry));

      setTimelineItems(items);
    }
  }, [constraintEngine]);

  /**
   * Convert a constraint history entry to a timeline item
   */
  const convertConstraintEntryToTimelineItem = (entry: ConstraintHistoryEntry): TimelineItem => {
    let description = "";
    const details: Record<string, any> = {};

    if (entry.type === "add") {
      const constraint = entry.newState;
      description = getConstraintDescription(constraint?.type);
      details.entities = constraint?.entityIds || [];
      details.action = "Created";
    } else if (entry.type === "modify") {
      const constraint = entry.newState;
      description = getConstraintDescription(constraint?.type);
      details.entities = constraint?.entityIds || [];
      details.action = "Modified";
      details.previousState = entry.previousState;
    } else if (entry.type === "remove") {
      const constraint = entry.previousState;
      description = getConstraintDescription(constraint?.type);
      details.entities = constraint?.entityIds || [];
      details.action = "Removed";
    }

    return {
      id: entry.id,
      type: "constraint",
      timestamp: entry.timestamp,
      description,
      details,
      data: entry
    };
  };

  /**
   * Get a human-readable description for a constraint type
   */
  const getConstraintDescription = (type?: ConstraintType): string => {
    if (!type) return "Unknown constraint";

    switch (type) {
      case ConstraintType.COINCIDENT:
        return "Coincident constraint";
      case ConstraintType.CONCENTRIC:
        return "Concentric constraint";
      case ConstraintType.PARALLEL:
        return "Parallel constraint";
      case ConstraintType.PERPENDICULAR:
        return "Perpendicular constraint";
      case ConstraintType.HORIZONTAL:
        return "Horizontal constraint";
      case ConstraintType.VERTICAL:
        return "Vertical constraint";
      case ConstraintType.TANGENT:
        return "Tangent constraint";
      case ConstraintType.DISTANCE:
        return "Distance constraint";
      case ConstraintType.ANGLE:
        return "Angle constraint";
      case ConstraintType.RADIUS:
        return "Radius constraint";
      case ConstraintType.DIAMETER:
        return "Diameter constraint";
      case ConstraintType.LENGTH:
        return "Length constraint";
      default:
        return `${type} constraint`;
    }
  };

  /**
   * Handle clicking on a timeline item
   */
  const handleItemClick = (itemId: string) => {
    setSelectedItem(itemId);
    if (onHistoryItemSelected) {
      onHistoryItemSelected(itemId);
    }
  };

  /**
   * Handle rollback to a specific history point
   */
  const handleRollbackClick = (itemId: string) => {
    if (onRollbackToItem) {
      onRollbackToItem(itemId);
    }
  };

  /**
   * Format a timestamp to a readable time
   */
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  /**
   * Renders the details of a selected timeline item
   */
  const renderItemDetails = () => {
    if (!selectedItem) return null;

    const item = timelineItems.find(i => i.id === selectedItem);
    if (!item) return null;

    return (
      <div className="bg-gray-50 p-3 mt-2 rounded-md">
        <h4 className="font-medium text-gray-800">{item.description}</h4>
        <p className="text-sm text-gray-600">
          {item.details.action} at {formatTime(item.timestamp)}
        </p>

        {item.details.entities && item.details.entities.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-gray-500">Affected entities:</p>
            <ul className="text-xs list-disc pl-4">
              {item.details.entities.map((entityId: string, index: number) => (
                <li key={index} className="text-gray-700">
                  {entityId}
                </li>
              ))}
            </ul>
          </div>
        )}

        {item.type === "constraint" && item.details.action === "Modified" && (
          <div className="mt-2">
            <p className="text-xs text-gray-500">Changes:</p>
            <div className="text-xs text-gray-700">
              {Object.entries(item.details.previousState || {})
                .filter(([key]) => key !== "id" && key !== "type")
                .map(([key, value]) => {
                  const newValue = item.data.newState?.[key];
                  if (JSON.stringify(value) !== JSON.stringify(newValue)) {
                    return (
                      <div key={key} className="flex justify-between">
                        <span>{key}:</span>
                        <span className="font-mono">
                          {JSON.stringify(value)} → {JSON.stringify(newValue)}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="bg-white rounded-md shadow-sm p-2 mb-2">
        <h3 className="text-lg font-medium text-gray-800">Model Timeline</h3>
        <p className="text-sm text-gray-500">History-based parametric modeling</p>
      </div>

      <div className="flex-grow overflow-auto">
        {timelineItems.length === 0 ? (
          <div className="flex justify-center items-center h-full">
            <p className="text-gray-500">No history items yet</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {timelineItems.map(item => (
              <li
                key={item.id}
                className={`
                  p-2 rounded-md cursor-pointer transition-colors 
                  ${selectedItem === item.id ? "bg-blue-100" : "hover:bg-gray-100"}
                `}
                onClick={() => handleItemClick(item.id)}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <span
                      className={`
                      w-3 h-3 rounded-full mr-2
                      ${
                        item.type === "constraint"
                          ? "bg-green-500"
                          : item.type === "operation"
                            ? "bg-blue-500"
                            : "bg-purple-500"
                      }
                    `}
                    ></span>
                    <span className="text-sm font-medium">{item.description}</span>
                  </div>
                  <span className="text-xs text-gray-500">{formatTime(item.timestamp)}</span>
                </div>

                <div className="flex mt-1 text-xs text-gray-500">
                  <span>{item.details.action}</span>
                  {item.details.entities && (
                    <span className="ml-2">
                      ({item.details.entities.length} entit{item.details.entities.length === 1 ? "y" : "ies"})
                    </span>
                  )}
                </div>

                {selectedItem === item.id && (
                  <div className="mt-2 flex space-x-2">
                    <button
                      className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                      onClick={e => {
                        e.stopPropagation();
                        handleRollbackClick(item.id);
                      }}
                    >
                      Rollback to this point
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedItem && renderItemDetails()}
    </div>
  );
}
