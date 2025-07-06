import React, { useState } from "react";
import { useAssemblyManager } from "../../../hooks/useAssemblyManager";
import { AssemblyNode } from "../../../types/assembly";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

interface AssemblyBrowserProps {
  onNodeSelect: (nodeId: string) => void;
  selectedNodeId?: string;
}

export const AssemblyBrowser: React.FC<AssemblyBrowserProps> = ({ onNodeSelect, selectedNodeId }) => {
  const assemblyManager = useAssemblyManager();
  const { nodes } = assemblyManager.getState();

  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Find root level nodes (nodes without parents)
  const rootNodes = Object.values(nodes).filter(node => !node.parent);

  // Toggle node expansion state
  const toggleNodeExpansion = (nodeId: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  // Get child nodes for a given parent node
  const getChildNodes = (parentId: string): AssemblyNode[] => {
    return Object.values(nodes).filter(node => node.parent === parentId);
  };

  // Render a tree node and its children recursively
  const renderNode = (node: AssemblyNode, depth = 0) => {
    const isExpanded = expandedNodes[node.id] || false;
    const childNodes = getChildNodes(node.id);
    const hasChildren = childNodes.length > 0;
    const isSelected = selectedNodeId === node.id;

    return (
      <div key={node.id}>
        <div
          className={`
            py-1 px-2 flex items-center cursor-pointer text-sm
            ${isSelected ? "bg-blue-100 border-l-2 border-blue-500" : "hover:bg-gray-100"}
          `}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={() => onNodeSelect(node.id)}
        >
          {hasChildren && (
            <button
              type="button"
              className="mr-1 p-0.5 rounded-sm hover:bg-gray-200 focus:outline-none"
              onClick={e => {
                e.stopPropagation();
                toggleNodeExpansion(node.id);
              }}
            >
              {isExpanded ? (
                <ChevronDownIcon className="h-3 w-3 text-gray-500" />
              ) : (
                <ChevronRightIcon className="h-3 w-3 text-gray-500" />
              )}
            </button>
          )}

          {!hasChildren && <span className="w-4 h-4 mr-1"></span>}

          <span className="truncate">{node.name || `${node.type} ${node.id.substring(0, 4)}`}</span>

          <span className="ml-1.5 text-xs text-gray-500">({node.type})</span>
        </div>

        {hasChildren && isExpanded && <div>{childNodes.map(childNode => renderNode(childNode, depth + 1))}</div>}
      </div>
    );
  };

  // Handle node creation
  const handleAddNode = () => {
    const name = prompt("Enter node name:");
    if (name) {
      assemblyManager.addComponent(
        name,
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        selectedNodeId || null,
        "temp-component-id",
        {}
      );
    }
  };

  // Handle node deletion
  const handleDeleteNode = () => {
    if (selectedNodeId && confirm("Are you sure you want to delete this node?")) {
      assemblyManager.removeNode(selectedNodeId);
      if (selectedNodeId === selectedNodeId) {
        onNodeSelect(""); // Clear selection if deleted node was selected
      }
    }
  };

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="bg-gray-100 px-4 py-2 border-b flex justify-between items-center">
        <h3 className="font-medium">Assembly Structure</h3>
        <div className="space-x-1">
          <button
            type="button"
            className="p-1 text-xs rounded hover:bg-gray-200 focus:outline-none"
            onClick={handleAddNode}
            title="Add Node"
          >
            + Add
          </button>
          {selectedNodeId && (
            <button
              type="button"
              className="p-1 text-xs rounded hover:bg-gray-200 text-red-600 focus:outline-none"
              onClick={handleDeleteNode}
              title="Delete Selected Node"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto max-h-80">
        {rootNodes.length === 0 ? (
          <div className="py-3 px-4 text-sm text-gray-500 italic">
            No assembly nodes found. Click &quot;Add&quot; to create one.
          </div>
        ) : (
          <div className="py-1">{rootNodes.map(node => renderNode(node))}</div>
        )}
      </div>
    </div>
  );
};
