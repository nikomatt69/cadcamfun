import React, { useState } from "react";
import { useAssemblyManager } from "../../../hooks/useAssemblyManager";
import { Constraint, ConstraintType } from "../../../types/assembly";

interface AssemblyConstraintsProps {
  onConstraintAdded?: (constraint: Constraint) => void;
  onConstraintRemoved?: (constraintId: string) => void;
}

export const AssemblyConstraints: React.FC<AssemblyConstraintsProps> = ({ onConstraintAdded, onConstraintRemoved }) => {
  const assemblyManager = useAssemblyManager();
  const { nodes, constraints } = assemblyManager.getState();

  const [showAddForm, setShowAddForm] = useState(false);
  const [constraintType, setConstraintType] = useState<ConstraintType>("fixed");
  const [firstEntityId, setFirstEntityId] = useState<string>("");
  const [secondEntityId, setSecondEntityId] = useState<string>("");
  const [offset, setOffset] = useState<number>(0);
  const [angle, setAngle] = useState<number>(0);

  // Reset form to default state
  const resetForm = () => {
    setConstraintType("fixed");
    setFirstEntityId("");
    setSecondEntityId("");
    setOffset(0);
    setAngle(0);
    setShowAddForm(false);
  };

  // Handle adding a new constraint
  const handleAddConstraint = () => {
    if (!firstEntityId || !secondEntityId) return;

    const constraintData = {
      type: constraintType,
      entityA: firstEntityId,
      entityB: secondEntityId,
      parameters: {}
    };

    // Add constraint-specific parameters
    if (constraintType === "distance") {
      constraintData.parameters = { distance: offset };
    } else if (constraintType === "angle") {
      constraintData.parameters = { angle };
    }

    const newConstraint = assemblyManager.addConstraint(
      constraintType,
      firstEntityId,
      secondEntityId,
      constraintData.parameters
    );

    if (onConstraintAdded && newConstraint) {
      onConstraintAdded(newConstraint);
    }

    resetForm();
  };

  // Handle removing a constraint
  const handleRemoveConstraint = (constraintId: string) => {
    assemblyManager.removeConstraint(constraintId);

    if (onConstraintRemoved) {
      onConstraintRemoved(constraintId);
    }
  };

  // Get available entities for constraints
  const availableEntities = Object.values(nodes).map(node => ({
    id: node.id,
    name: node.name || `${node.type} ${node.id.substring(0, 4)}`
  }));

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="bg-gray-100 px-4 py-2 border-b flex justify-between items-center">
        <h3 className="font-medium">Assembly Constraints</h3>
        <button
          type="button"
          className="px-2 py-1 text-xs rounded hover:bg-gray-200 focus:outline-none"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? "Cancel" : "+ Add Constraint"}
        </button>
      </div>

      {showAddForm && (
        <div className="p-3 border-b">
          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">Constraint Type</label>
            <select
              value={constraintType}
              onChange={e => setConstraintType(e.target.value as ConstraintType)}
              className="w-full p-1.5 border rounded text-sm"
            >
              <option value="fixed">Fixed</option>
              <option value="point">Point-to-Point</option>
              <option value="distance">Distance</option>
              <option value="angle">Angle</option>
              <option value="parallel">Parallel</option>
              <option value="perpendicular">Perpendicular</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">First Entity</label>
            <select
              value={firstEntityId}
              onChange={e => setFirstEntityId(e.target.value)}
              className="w-full p-1.5 border rounded text-sm"
            >
              <option value="">Select first entity</option>
              {availableEntities.map(entity => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">Second Entity</label>
            <select
              value={secondEntityId}
              onChange={e => setSecondEntityId(e.target.value)}
              className="w-full p-1.5 border rounded text-sm"
            >
              <option value="">Select second entity</option>
              {availableEntities.map(entity => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </div>

          {constraintType === "distance" && (
            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">Distance</label>
              <input
                type="number"
                value={offset}
                onChange={e => setOffset(parseFloat(e.target.value) || 0)}
                className="w-full p-1.5 border rounded text-sm"
                min="0"
                step="0.1"
              />
            </div>
          )}

          {constraintType === "angle" && (
            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">Angle (degrees)</label>
              <input
                type="number"
                value={angle}
                onChange={e => setAngle(parseFloat(e.target.value) || 0)}
                className="w-full p-1.5 border rounded text-sm"
                min="0"
                max="360"
                step="1"
              />
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 focus:outline-none"
              onClick={handleAddConstraint}
              disabled={!firstEntityId || !secondEntityId}
            >
              Add Constraint
            </button>
          </div>
        </div>
      )}

      <div className="overflow-y-auto max-h-80">
        {Object.values(constraints).length === 0 ? (
          <div className="py-3 px-4 text-sm text-gray-500 italic">
            No constraints. Add a constraint to connect components.
          </div>
        ) : (
          <ul className="divide-y">
            {Object.values(constraints).map(constraint => {
              const entityA = nodes[constraint.entityA];
              const entityB = nodes[constraint.entityB];

              return (
                <li key={constraint.id} className="px-4 py-2 hover:bg-gray-50 flex justify-between items-center">
                  <div>
                    <div className="font-medium text-sm">
                      {constraint.type.charAt(0).toUpperCase() + constraint.type.slice(1)} Constraint
                    </div>
                    <div className="text-xs text-gray-600">
                      {entityA?.name || constraint.entityA} ↔ {entityB?.name || constraint.entityB}
                      {constraint.type === "distance" &&
                        constraint.parameters.distance !== undefined &&
                        ` (${constraint.parameters.distance} units)`}
                      {constraint.type === "angle" &&
                        constraint.parameters.angle !== undefined &&
                        ` (${constraint.parameters.angle}°)`}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="p-1 text-xs rounded hover:bg-gray-200 text-red-600 focus:outline-none"
                    onClick={() => handleRemoveConstraint(constraint.id)}
                    title="Remove Constraint"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
