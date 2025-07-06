import React, { useState, useEffect } from "react";
import { ConstraintEngine } from "../../../lib/constraints/ConstraintEngine";
import { ConstraintType, Constraint, ParametricParameter } from "../../../types/constraints";
import { GeometricConstraintHelper } from "../../../lib/constraints/GeometricConstraints";
import { DimensionalConstraintHelper } from "../../../lib/constraints/DimensionalConstraints";

interface HistoryBrowserProps {
  constraintEngine: ConstraintEngine;
  onAddConstraint?: (constraint: Constraint) => void;
  onUpdateParameter?: (parameter: ParametricParameter) => void;
  className?: string;
}

/**
 * Component for browsing and modifying the model history
 * Allows creating new constraints and editing parameters
 */
export default function HistoryBrowser({
  constraintEngine,
  onAddConstraint,
  onUpdateParameter,
  className = ""
}: HistoryBrowserProps) {
  const [parameters, setParameters] = useState<ParametricParameter[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [selectedConstraintType, setSelectedConstraintType] = useState<ConstraintType | null>(null);
  const [constraintValue, setConstraintValue] = useState<number>(0);
  const [constraintUnit, setConstraintUnit] = useState<string>("mm");

  // Load constraints and parameters when engine changes
  useEffect(() => {
    if (constraintEngine) {
      setConstraints(constraintEngine.getAllConstraints());
      setParameters(constraintEngine.getAllParameters());
    }
  }, [constraintEngine]);

  /**
   * Update the constraint list when a new constraint is added
   */
  useEffect(() => {
    const updatedConstraints = constraintEngine.getAllConstraints();
    setConstraints(updatedConstraints);
  }, [constraints.length]);

  /**
   * Handle selection of entities for constraints
   */
  const handleEntitySelection = (entityId: string) => {
    // Toggle selection
    if (selectedEntityIds.includes(entityId)) {
      setSelectedEntityIds(selectedEntityIds.filter(id => id !== entityId));
    } else {
      setSelectedEntityIds([...selectedEntityIds, entityId]);
    }
  };

  /**
   * Create a new constraint based on selected entities and type
   */
  const handleCreateConstraint = () => {
    if (!selectedConstraintType || selectedEntityIds.length === 0) {
      return;
    }

    let constraint: Constraint | null = null;

    // Create constraint based on type and selected entities
    switch (selectedConstraintType) {
      case ConstraintType.COINCIDENT:
        if (selectedEntityIds.length === 2) {
          constraint = GeometricConstraintHelper.createCoincidentConstraint(selectedEntityIds[0], selectedEntityIds[1]);
        }
        break;

      case ConstraintType.PARALLEL:
        if (selectedEntityIds.length === 2) {
          constraint = GeometricConstraintHelper.createParallelConstraint(selectedEntityIds[0], selectedEntityIds[1]);
        }
        break;

      case ConstraintType.PERPENDICULAR:
        if (selectedEntityIds.length === 2) {
          constraint = GeometricConstraintHelper.createPerpendicularConstraint(
            selectedEntityIds[0],
            selectedEntityIds[1]
          );
        }
        break;

      case ConstraintType.DISTANCE:
        if (selectedEntityIds.length === 2) {
          constraint = DimensionalConstraintHelper.createDistanceConstraint(
            selectedEntityIds[0],
            selectedEntityIds[1],
            constraintValue,
            constraintUnit
          );
        }
        break;

      case ConstraintType.ANGLE:
        if (selectedEntityIds.length === 2) {
          constraint = DimensionalConstraintHelper.createAngleConstraint(
            selectedEntityIds[0],
            selectedEntityIds[1],
            constraintValue,
            "deg"
          );
        }
        break;

      case ConstraintType.RADIUS:
        if (selectedEntityIds.length === 1) {
          constraint = DimensionalConstraintHelper.createRadiusConstraint(
            selectedEntityIds[0],
            constraintValue,
            constraintUnit
          );
        }
        break;

      case ConstraintType.HORIZONTAL:
        if (selectedEntityIds.length === 1) {
          constraint = GeometricConstraintHelper.createHorizontalConstraint(selectedEntityIds[0]);
        }
        break;

      case ConstraintType.VERTICAL:
        if (selectedEntityIds.length === 1) {
          constraint = GeometricConstraintHelper.createVerticalConstraint(selectedEntityIds[0]);
        }
        break;

      default:
        break;
    }

    if (constraint && onAddConstraint) {
      onAddConstraint(constraint);

      // Reset selection after constraint creation
      setSelectedEntityIds([]);
      setConstraintValue(0);
    }
  };

  /**
   * Update a parameter value
   */
  const handleParameterUpdate = (parameterId: string, value: number) => {
    constraintEngine.updateParameter(parameterId, value);

    // Update local state
    const updatedParameters = constraintEngine.getAllParameters();
    setParameters(updatedParameters);

    // Notify parent
    const updatedParameter = updatedParameters.find(p => p.id === parameterId);
    if (updatedParameter && onUpdateParameter) {
      onUpdateParameter(updatedParameter);
    }
  };

  /**
   * Group constraints by type for display
   */
  const getConstraintsByType = () => {
    const grouped: Record<string, Constraint[]> = {};

    constraints.forEach(constraint => {
      const type = constraint.type;
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(constraint);
    });

    return grouped;
  };

  /**
   * Determine if a constraint can be created with current selection
   */
  const canCreateConstraint = (): boolean => {
    if (!selectedConstraintType) return false;

    // Check if we have enough entities selected for this constraint type
    switch (selectedConstraintType) {
      case ConstraintType.COINCIDENT:
      case ConstraintType.CONCENTRIC:
      case ConstraintType.PARALLEL:
      case ConstraintType.PERPENDICULAR:
      case ConstraintType.TANGENT:
      case ConstraintType.DISTANCE:
      case ConstraintType.ANGLE:
        return selectedEntityIds.length === 2;

      case ConstraintType.HORIZONTAL:
      case ConstraintType.VERTICAL:
      case ConstraintType.RADIUS:
      case ConstraintType.DIAMETER:
      case ConstraintType.LENGTH:
        return selectedEntityIds.length === 1;

      default:
        return false;
    }
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="bg-white rounded-md shadow-sm p-3 mb-3">
        <h3 className="text-lg font-medium text-gray-800">History Browser</h3>
        <p className="text-sm text-gray-500">Manage parametric features and constraints</p>
      </div>

      {/* Parameter section */}
      <div className="bg-white rounded-md shadow-sm p-3 mb-3">
        <h4 className="font-medium text-gray-700 mb-2">Parameters</h4>

        {parameters.length === 0 ? (
          <p className="text-sm text-gray-500">No parameters defined yet</p>
        ) : (
          <div className="space-y-2">
            {parameters.map(param => (
              <div key={param.id} className="flex items-center justify-between">
                <div className="flex-grow">
                  <div className="text-sm font-medium">{param.name}</div>
                  <div className="text-xs text-gray-500">
                    {param.description || `Parameter ID: ${param.id.slice(0, 8)}`}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={param.value}
                    min={param.min}
                    max={param.max}
                    step={0.1}
                    onChange={e => handleParameterUpdate(param.id, parseFloat(e.target.value))}
                    className="w-20 px-2 py-1 text-sm border rounded"
                  />
                  <span className="text-xs text-gray-500">{param.unit || ""}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Constraint browser */}
      <div className="bg-white rounded-md shadow-sm p-3 mb-3">
        <h4 className="font-medium text-gray-700 mb-2">Constraints</h4>

        {Object.entries(getConstraintsByType()).length === 0 ? (
          <p className="text-sm text-gray-500">No constraints applied yet</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(getConstraintsByType()).map(([type, typeConstraints]) => (
              <div key={type} className="border-t pt-2">
                <h5 className="text-sm font-medium text-gray-700">{type} constraints</h5>
                <ul className="mt-1 space-y-1">
                  {typeConstraints.map(constraint => (
                    <li key={constraint.id} className="text-xs text-gray-600 flex justify-between">
                      <span>{constraint.entityIds.join(", ")}</span>
                      <span className="text-gray-400">{constraint.active ? "Active" : "Inactive"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add new constraint */}
      <div className="bg-white rounded-md shadow-sm p-3">
        <h4 className="font-medium text-gray-700 mb-2">Add Constraint</h4>

        <div className="space-y-3">
          {/* Constraint type selection */}
          <div>
            <label className="block text-sm text-gray-500 mb-1">Constraint Type</label>
            <select
              value={selectedConstraintType || ""}
              onChange={e => setSelectedConstraintType(e.target.value as ConstraintType)}
              className="w-full px-2 py-1 border rounded text-sm"
            >
              <option value="">Select a constraint type</option>
              <optgroup label="Geometric Constraints">
                <option value={ConstraintType.COINCIDENT}>Coincident</option>
                <option value={ConstraintType.CONCENTRIC}>Concentric</option>
                <option value={ConstraintType.PARALLEL}>Parallel</option>
                <option value={ConstraintType.PERPENDICULAR}>Perpendicular</option>
                <option value={ConstraintType.HORIZONTAL}>Horizontal</option>
                <option value={ConstraintType.VERTICAL}>Vertical</option>
              </optgroup>
              <optgroup label="Dimensional Constraints">
                <option value={ConstraintType.DISTANCE}>Distance</option>
                <option value={ConstraintType.ANGLE}>Angle</option>
                <option value={ConstraintType.RADIUS}>Radius</option>
                <option value={ConstraintType.DIAMETER}>Diameter</option>
                <option value={ConstraintType.LENGTH}>Length</option>
              </optgroup>
            </select>
          </div>

          {/* Selected entities */}
          <div>
            <label className="block text-sm text-gray-500 mb-1">Selected Entities ({selectedEntityIds.length})</label>
            <div className="text-sm border rounded p-2 min-h-[40px] bg-gray-50">
              {selectedEntityIds.length === 0 ? (
                <span className="text-gray-400">No entities selected</span>
              ) : (
                <ul className="space-y-1">
                  {selectedEntityIds.map((id, index) => (
                    <li key={index} className="flex justify-between">
                      <span className="text-gray-700">{id}</span>
                      <button className="text-red-500 text-xs" onClick={() => handleEntitySelection(id)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Value input for dimensional constraints */}
          {selectedConstraintType &&
            [
              ConstraintType.DISTANCE,
              ConstraintType.ANGLE,
              ConstraintType.RADIUS,
              ConstraintType.DIAMETER,
              ConstraintType.LENGTH
            ].includes(selectedConstraintType) && (
              <div className="flex items-end space-x-2">
                <div className="flex-grow">
                  <label className="block text-sm text-gray-500 mb-1">Value</label>
                  <input
                    type="number"
                    value={constraintValue}
                    onChange={e => setConstraintValue(parseFloat(e.target.value))}
                    min={0}
                    step={selectedConstraintType === ConstraintType.ANGLE ? 5 : 0.1}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>

                <div className="w-20">
                  <label className="block text-sm text-gray-500 mb-1">Unit</label>
                  <select
                    value={constraintUnit}
                    onChange={e => setConstraintUnit(e.target.value)}
                    className="w-full px-2 py-1 border rounded text-sm"
                  >
                    {selectedConstraintType === ConstraintType.ANGLE ? (
                      <>
                        <option value="deg">deg</option>
                        <option value="rad">rad</option>
                      </>
                    ) : (
                      <>
                        <option value="mm">mm</option>
                        <option value="cm">cm</option>
                        <option value="in">in</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
            )}

          {/* Create constraint button */}
          <button
            className={`w-full py-2 rounded-md text-sm font-medium ${
              canCreateConstraint()
                ? "bg-blue-500 text-white hover:bg-blue-600"
                : "bg-gray-200 text-gray-500 cursor-not-allowed"
            }`}
            onClick={handleCreateConstraint}
            disabled={!canCreateConstraint()}
          >
            Create Constraint
          </button>
        </div>
      </div>
    </div>
  );
}
