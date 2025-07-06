import React, { useState } from "react";
import { useAssemblyManager } from "../../../hooks/useAssemblyManager";
import { Joint, JointType, AssemblyNode, JointLimits } from "../../../types/assembly";

interface JointCreatorProps {
  onJointCreated?: (joint: Joint) => void;
  onJointRemoved?: (jointId: string) => void;
}

export const JointCreator: React.FC<JointCreatorProps> = ({ onJointCreated, onJointRemoved }) => {
  const assemblyManager = useAssemblyManager();
  const { nodes, joints } = assemblyManager.getState() as {
    nodes: Record<string, AssemblyNode>;
    joints: Record<string, Joint>;
  };

  const [showForm, setShowForm] = useState(false);
  const [jointType, setJointType] = useState<JointType>("fixed");
  const [parentId, setParentId] = useState<string>("");
  const [childId, setChildId] = useState<string>("");
  const [origin, setOrigin] = useState({ x: 0, y: 0, z: 0 });
  const [primaryAxis, setPrimaryAxis] = useState({ x: 0, y: 0, z: 1 });
  const [limits, setLimits] = useState<JointLimits>({});

  const resetForm = () => {
    setJointType("fixed");
    setParentId("");
    setChildId("");
    setOrigin({ x: 0, y: 0, z: 0 });
    setPrimaryAxis({ x: 0, y: 0, z: 1 });
    setLimits({});
    setShowForm(false);
  };

  const handleCreateJoint = () => {
    if (!parentId || !childId) return;

    const newJoint = assemblyManager.addJoint(
      jointType,
      parentId,
      childId,
      origin,
      primaryAxis,
      undefined,
      limits,
      `${jointType} Joint`
    );

    if (onJointCreated && newJoint) {
      onJointCreated(newJoint);
    }

    resetForm();
  };

  const handleRemoveJoint = (jointId: string) => {
    const success = assemblyManager.removeJoint(jointId);
    if (success && onJointRemoved) {
      onJointRemoved(jointId);
    }
  };

  const availableComponents = Object.values(nodes)
    .filter((node): node is AssemblyNode => !!node)
    .filter(node => node.type === "component" || node.type === "subassembly")
    .map(node => ({
      id: node.id,
      name: node.name || `${node.type} ${node.id.substring(0, 4)}`
    }));

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="bg-gray-100 px-4 py-2 border-b flex justify-between items-center">
        <h3 className="font-medium">Assembly Joints</h3>
        <button
          type="button"
          className="px-2 py-1 text-xs rounded hover:bg-gray-200 focus:outline-none"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancel" : "+ Add Joint"}
        </button>
      </div>

      {showForm && (
        <div className="p-3 border-b">
          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">Joint Type</label>
            <select
              value={jointType}
              onChange={e => setJointType(e.target.value as JointType)}
              className="w-full p-1.5 border rounded text-sm"
            >
              <option value="fixed">Fixed</option>
              <option value="revolute">Revolute (Rotation)</option>
              <option value="prismatic">Prismatic (Sliding)</option>
              <option value="cylindrical">Cylindrical</option>
              <option value="spherical">Ball (Spherical)</option>
              <option value="planar">Planar</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">Parent Component</label>
            <select
              value={parentId}
              onChange={e => setParentId(e.target.value)}
              className="w-full p-1.5 border rounded text-sm"
            >
              <option value="">Select parent component</option>
              {availableComponents.map(component => (
                <option key={component.id} value={component.id}>
                  {component.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">Child Component</label>
            <select
              value={childId}
              onChange={e => setChildId(e.target.value)}
              className="w-full p-1.5 border rounded text-sm"
              disabled={!parentId}
            >
              <option value="">Select child component</option>
              {availableComponents
                .filter(component => component.id !== parentId)
                .map(component => (
                  <option key={component.id} value={component.id}>
                    {component.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">Joint Origin (Relative to Parent)</label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-gray-500">X</label>
                <input
                  type="number"
                  value={origin.x}
                  onChange={e => setOrigin({ ...origin, x: parseFloat(e.target.value) || 0 })}
                  className="w-full p-1.5 border rounded text-sm"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Y</label>
                <input
                  type="number"
                  value={origin.y}
                  onChange={e => setOrigin({ ...origin, y: parseFloat(e.target.value) || 0 })}
                  className="w-full p-1.5 border rounded text-sm"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Z</label>
                <input
                  type="number"
                  value={origin.z}
                  onChange={e => setOrigin({ ...origin, z: parseFloat(e.target.value) || 0 })}
                  className="w-full p-1.5 border rounded text-sm"
                  step="0.1"
                />
              </div>
            </div>
          </div>

          {(jointType === "revolute" ||
            jointType === "prismatic" ||
            jointType === "cylindrical" ||
            jointType === "planar") && (
            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">Primary Axis (Normalized)</label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-500">X</label>
                  <input
                    type="number"
                    value={primaryAxis.x}
                    onChange={e => setPrimaryAxis({ ...primaryAxis, x: parseFloat(e.target.value) || 0 })}
                    className="w-full p-1.5 border rounded text-sm"
                    step="0.1"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Y</label>
                  <input
                    type="number"
                    value={primaryAxis.y}
                    onChange={e => setPrimaryAxis({ ...primaryAxis, y: parseFloat(e.target.value) || 0 })}
                    className="w-full p-1.5 border rounded text-sm"
                    step="0.1"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Z</label>
                  <input
                    type="number"
                    value={primaryAxis.z}
                    onChange={e => setPrimaryAxis({ ...primaryAxis, z: parseFloat(e.target.value) || 0 })}
                    className="w-full p-1.5 border rounded text-sm"
                    step="0.1"
                  />
                </div>
              </div>
            </div>
          )}

          {(jointType === "revolute" || jointType === "cylindrical") && (
            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">Angle Limits (degrees)</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500">Min</label>
                  <input
                    type="number"
                    value={limits.minAngle ?? ""}
                    onChange={e => setLimits({ ...limits, minAngle: parseFloat(e.target.value) || undefined })}
                    className="w-full p-1.5 border rounded text-sm"
                    step="1"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Max</label>
                  <input
                    type="number"
                    value={limits.maxAngle ?? ""}
                    onChange={e => setLimits({ ...limits, maxAngle: parseFloat(e.target.value) || undefined })}
                    className="w-full p-1.5 border rounded text-sm"
                    step="1"
                  />
                </div>
              </div>
            </div>
          )}

          {(jointType === "prismatic" || jointType === "cylindrical" || jointType === "planar") && (
            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">Distance Limits</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500">Min</label>
                  <input
                    type="number"
                    value={limits.minDistance ?? ""}
                    onChange={e => setLimits({ ...limits, minDistance: parseFloat(e.target.value) || undefined })}
                    className="w-full p-1.5 border rounded text-sm"
                    step="0.1"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Max</label>
                  <input
                    type="number"
                    value={limits.maxDistance ?? ""}
                    onChange={e => setLimits({ ...limits, maxDistance: parseFloat(e.target.value) || undefined })}
                    className="w-full p-1.5 border rounded text-sm"
                    step="0.1"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 focus:outline-none"
              onClick={handleCreateJoint}
              disabled={!parentId || !childId}
            >
              Create Joint
            </button>
          </div>
        </div>
      )}

      <div className="overflow-y-auto max-h-80">
        {Object.keys(joints).length === 0 ? (
          <div className="py-3 px-4 text-sm text-gray-500 italic">No joints. Add a joint to connect components.</div>
        ) : (
          <ul className="divide-y">
            {Object.values(joints).map((joint: Joint) => {
              const parentNode = nodes[joint.parent];
              const childNode = nodes[joint.child];

              return (
                <li key={joint.id} className="px-4 py-2 hover:bg-gray-50 flex justify-between items-center">
                  <div>
                    <div className="font-medium text-sm">
                      {joint.type.charAt(0).toUpperCase() + joint.type.slice(1)} Joint
                    </div>
                    <div className="text-xs text-gray-600">
                      {parentNode?.name || joint.parent.substring(0, 4)} →{" "}
                      {childNode?.name || joint.child.substring(0, 4)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="p-1 text-xs rounded hover:bg-gray-200 text-red-600 focus:outline-none"
                    onClick={() => handleRemoveJoint(joint.id)}
                    title="Remove Joint"
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
