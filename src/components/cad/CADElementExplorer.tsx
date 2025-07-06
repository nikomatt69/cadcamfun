import React, { useState, useEffect, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Folder,
  Box,
  Circle,
  Square,
  Lock,
  Unlock,
  Copy,
  Trash2,
  Move,
  RefreshCw,
  List,
  X
} from "react-feather";
import { useElementsStore } from "src/store/elementsStore";
import { useLayerStore } from "src/store/layerStore";
import { useSelectionStore } from "src/store/selectorStore";
import { motion, AnimatePresence } from "framer-motion";

interface CADElementExplorerProps {
  width?: number;
  onElementSelect?: (id: string) => void;
}

interface ElementNode {
  id: string;
  name: string;
  type: string;
  children: ElementNode[];
  visible?: boolean;
  layerId: string;
  metadata?: any;
}

// Helper function to get element icon based on type
const getElementIcon = (type: string) => {
  switch (type.toLowerCase()) {
    case "group":
    case "assembly":
      return <Folder size={16} className="text-blue-400" />;
    case "cube":
    case "box":
      return <Box size={16} className="text-orange-400" />;
    case "circle":
    case "sphere":
      return <Circle size={16} className="text-green-400" />;
    case "rectangle":
      return <Square size={16} className="text-yellow-400" />;
    default:
      return <Box size={16} className="text-gray-400" />;
  }
};

const CADElementExplorer: React.FC<CADElementExplorerProps> = ({ width, onElementSelect }) => {
  const { elements, deleteElement, updateElement, selectElement: selectElementInStore } = useElementsStore();
  const { layers } = useLayerStore();
  const { selectedElementIds, selectElement, clearSelection } = useSelectionStore();

  const [expandedElements, setExpandedElements] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [multiSelectEnabled, setMultiSelectEnabled] = useState(false);
  const [groupByLayer, setGroupByLayer] = useState(true);
  const [selectedElementForProperties, setSelectedElementForProperties] = useState<string | null>(null);
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(false);

  // Build element hierarchy
  const elementHierarchy = useMemo(() => {
    // First, map elements to nodes
    const nodes: Record<string, ElementNode> = {};
    const rootNodes: ElementNode[] = [];

    // Create nodes for all elements
    elements.forEach(element => {
      nodes[element.id] = {
        id: element.id,
        name: element.name || `${element.type}-${element.id.slice(0, 6)}`,
        type: element.type,
        children: [],
        visible: element.visible !== false,
        layerId: element.layerId,
        metadata: element
      };
    });

    // Build the hierarchy
    elements.forEach(element => {
      // Check if this is a child element (part of a group or assembly)
      if (element.parentId) {
        if (nodes[element.parentId]) {
          nodes[element.parentId].children.push(nodes[element.id]);
        } else {
          // Parent not found, add to root
          rootNodes.push(nodes[element.id]);
        }
      }
      // Check if this is a group element with children
      else if (
        element.type === "group" ||
        element.type === "component" ||
        element.type === "custom" ||
        element.type === "composite"
      ) {
        if (element.childrenIds && element.childrenIds.length > 0) {
          element.childrenIds.forEach((childId: string | number) => {
            if (nodes[childId]) {
              nodes[element.id].children.push(nodes[childId]);
            }
          });
        }
        rootNodes.push(nodes[element.id]);
      }
      // It's a standalone element
      else {
        rootNodes.push(nodes[element.id]);
      }
    });

    // Filter out any nodes that are already children of other nodes
    // to avoid duplicates in the tree
    const childIds = new Set<string>();
    Object.values(nodes).forEach(node => {
      node.children.forEach(child => {
        childIds.add(child.id);
      });
    });

    return rootNodes.filter(node => !childIds.has(node.id));
  }, [elements]);

  // Filter elements based on search query
  const filteredElements = useMemo(() => {
    if (!searchQuery) return elementHierarchy;

    const lowerQuery = searchQuery.toLowerCase();

    // Helper function to check if node or any children match
    const nodeMatches = (node: ElementNode): boolean => {
      if (node.name.toLowerCase().includes(lowerQuery) || node.type.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      // Check if any children match
      return node.children.some(child => nodeMatches(child));
    };

    return elementHierarchy.filter(node => nodeMatches(node));
  }, [elementHierarchy, searchQuery]);

  // Toggle node expansion
  const toggleExpand = (nodeId: string) => {
    setExpandedElements(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  // Expand all parent nodes of a selected element
  useEffect(() => {
    if (selectedElementIds.length > 0) {
      // Find all parent groups containing this element
      const findParents = (nodeId: string): string[] => {
        const element = elements.find(el => el.id === nodeId);
        if (!element) return [];

        if (!element.parentId) return [];

        const parentElement = elements.find(el => el.id === element.parentId);
        if (!parentElement) return [];

        return [parentElement.id, ...findParents(parentElement.id)];
      };

      // Expand all parent nodes
      const parentsToExpand = findParents(selectedElementIds[0]);
      if (parentsToExpand.length > 0) {
        setExpandedElements(prev => {
          const newExpanded = { ...prev };
          parentsToExpand.forEach(id => {
            newExpanded[id] = true;
          });
          return newExpanded;
        });
      }
    }
  }, [selectedElementIds, elements]);

  // Handle element selection
  const handleElementSelect = (nodeId: string, event?: React.MouseEvent) => {
    // Find the element to select
    const element = elements.find(e => e.id === nodeId);

    if (element) {
      // Select in elements store (for properties panel in CAD)
      selectElementInStore(nodeId);

      // Also select in selection store (for multi-selection)
      if (event && (event.ctrlKey || event.metaKey || multiSelectEnabled)) {
        // Toggle selection of this element
        if (selectedElementIds.includes(nodeId)) {
          const newSelection = selectedElementIds.filter(id => id !== nodeId);
          // Update selection state
          if (newSelection.length > 0) {
            selectElement(newSelection[0]);
          } else {
            clearSelection();
          }
        } else {
          // Add to existing selection
          selectElement(nodeId);
        }
      } else {
        // Single selection
        selectElement(nodeId);
      }

      // Set for properties panel
      setSelectedElementForProperties(nodeId);
      setShowPropertiesPanel(true);

      if (onElementSelect) {
        onElementSelect(nodeId);
      }
    }
  };

  // Handle element visibility toggle
  const handleToggleVisibility = (nodeId: string, isVisible: boolean) => {
    updateElement(nodeId, { visible: !isVisible });
  };

  // Delete selected elements
  const handleDeleteSelected = () => {
    if (selectedElementIds.length === 0) return;

    if (window.confirm(`Delete ${selectedElementIds.length} selected element(s)?`)) {
      selectedElementIds.forEach(id => {
        deleteElement(id);
      });
      clearSelection();
    }
  };

  // Handle hiding selected elements
  const handleHideSelected = () => {
    selectedElementIds.forEach(id => {
      updateElement(id, { visible: false });
    });
  };

  // Recursive function to render a node and its children
  const renderNode = (node: ElementNode, depth = 0) => {
    const isExpanded = expandedElements[node.id] || false;
    const isSelected = selectedElementIds.includes(node.id);
    const hasChildren = node.children.length > 0;
    const layer = layers.find(l => l.id === node.layerId);
    const layerVisible = layer ? layer.visible !== false : true;
    const isVisible = node.visible && layerVisible;

    return (
      <div key={node.id} className="select-none">
        <div
          className={`flex items-center px-2 py-2 cursor-pointer text-sm group transition-all duration-150 border-l-2
            ${isSelected
              ? "bg-blue-50 dark:bg-blue-900/30 border-l-blue-500 text-blue-700 dark:text-blue-300"
              : "hover:bg-gray-50 dark:hover:bg-gray-800/60 border-l-transparent text-gray-700 dark:text-gray-300"
            }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={e => handleElementSelect(node.id, e)}
        >
          {/* Expand/Collapse */}
          <button
            className="mr-2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            onClick={e => {
              e.stopPropagation();
              if (hasChildren) {
                toggleExpand(node.id);
              }
            }}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown size={14} className="text-gray-500 dark:text-gray-400" />
              ) : (
                <ChevronRight size={14} className="text-gray-500 dark:text-gray-400" />
              )
            ) : (
              <div className="w-[14px]" />
            )}
          </button>

          {/* Icon */}
          <div className="mr-2 flex-shrink-0">{getElementIcon(node.type)}</div>

          {/* Name */}
          <span className="flex-1 truncate font-medium text-gray-900 dark:text-gray-100">{node.name}</span>

          {/* Type badge */}
          <span className="mr-2 px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400 flex-shrink-0">
            {node.type}
          </span>

          {/* Status indicators */}
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {!isVisible && (
              <EyeOff size={12} className="text-gray-400" />
            )}
          </div>

          {/* Quick actions */}
          <div className="flex items-center space-x-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={e => {
                e.stopPropagation();
                handleToggleVisibility(node.id, !!isVisible);
              }}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title={isVisible ? "Hide" : "Show"}
            >
              {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {hasChildren && isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.1 }}
            >
              {node.children.map(childNode => renderNode(childNode, depth + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // Handle search input
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Expand all nodes
  const expandAll = () => {
    const newExpanded: Record<string, boolean> = {};
    const addAllNodes = (nodes: ElementNode[]) => {
      nodes.forEach(node => {
        newExpanded[node.id] = true;
        if (node.children.length > 0) {
          addAllNodes(node.children);
        }
      });
    };

    addAllNodes(elementHierarchy);
    setExpandedElements(newExpanded);
  };

  // Collapse all nodes
  const collapseAll = () => {
    setExpandedElements({});
  };

  // Get element properties for panel
  const getElementProperties = (elementId: string) => {
    const element = elements.find(e => e.id === elementId);
    if (!element) return null;

    const layer = layers.find(l => l.id === element.layerId);

    return {
      id: element.id,
      name: element.name || `${element.type}-${element.id.slice(0, 6)}`,
      type: element.type,
      layer: layer?.name || "Unknown Layer",
      visible: element.visible !== false,
      locked: (element as any).locked || false,
      position: {
        x: (element as any).x || 0,
        y: (element as any).y || 0,
        z: (element as any).z || 0
      },
      rotation: element.rotation || { x: 0, y: 0, z: 0 },
      scale: element.scale || { x: 1, y: 1, z: 1 },
      dimensions: {
        width: (element as any).width,
        height: (element as any).height,
        depth: (element as any).depth,
        radius: (element as any).radius
      },
      material: (element as any).material || "Default",
      color: (element as any).color || "#1e88e5",
      opacity: (element as any).opacity || 1
    };
  };

  // Render properties panel
  const renderPropertiesPanel = () => {
    if (!selectedElementForProperties) return null;

    const properties = getElementProperties(selectedElementForProperties);
    if (!properties) return null;

    return (
      <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Properties</h4>
          <button
            onClick={() => setShowPropertiesPanel(false)}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-3 max-h-64 overflow-y-auto space-y-3">
          {/* Basic Info */}
          <div>
            <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Basic Information</h5>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Name:</span>
                <span className="text-gray-900 dark:text-gray-100 font-medium">{properties.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Type:</span>
                <span className="text-gray-900 dark:text-gray-100">{properties.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Layer:</span>
                <span className="text-gray-900 dark:text-gray-100">{properties.layer}</span>
              </div>
            </div>
          </div>

          {/* Transform */}
          <div>
            <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Transform</h5>
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-gray-500 block">X:</span>
                  <span className="text-gray-900 dark:text-gray-100 font-mono">{properties.position.x.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Y:</span>
                  <span className="text-gray-900 dark:text-gray-100 font-mono">{properties.position.y.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Z:</span>
                  <span className="text-gray-900 dark:text-gray-100 font-mono">{properties.position.z.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Dimensions */}
          {(properties.dimensions.width || properties.dimensions.height || properties.dimensions.radius) && (
            <div>
              <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Dimensions</h5>
              <div className="space-y-2 text-xs">
                {properties.dimensions.width && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Width:</span>
                    <span className="text-gray-900 dark:text-gray-100 font-mono">{properties.dimensions.width.toFixed(2)}</span>
                  </div>
                )}
                {properties.dimensions.height && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Height:</span>
                    <span className="text-gray-900 dark:text-gray-100 font-mono">{properties.dimensions.height.toFixed(2)}</span>
                  </div>
                )}
                {properties.dimensions.radius && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Radius:</span>
                    <span className="text-gray-900 dark:text-gray-100 font-mono">{properties.dimensions.radius.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Material & Appearance */}
          <div>
            <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Appearance</h5>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Material:</span>
                <span className="text-gray-900 dark:text-gray-100">{properties.material}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Color:</span>
                <div className="flex items-center space-x-2">
                  <div
                    className="w-4 h-4 rounded border border-gray-300"
                    style={{ backgroundColor: properties.color }}
                  />
                  <span className="text-gray-900 dark:text-gray-100 font-mono">{properties.color}</span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Opacity:</span>
                <span className="text-gray-900 dark:text-gray-100 font-mono">{(properties.opacity * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>

          {/* Status */}
          <div>
            <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Status</h5>
            <div className="flex space-x-4 text-xs">
              <div className="flex items-center space-x-1">
                {properties.visible ? (
                  <Eye size={12} className="text-green-500" />
                ) : (
                  <EyeOff size={12} className="text-gray-400" />
                )}
                <span className={properties.visible ? "text-green-700 dark:text-green-400" : "text-gray-500"}>
                  {properties.visible ? "Visible" : "Hidden"}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                {properties.locked ? (
                  <Lock size={12} className="text-orange-500" />
                ) : (
                  <Unlock size={12} className="text-gray-400" />
                )}
                <span className={properties.locked ? "text-orange-700 dark:text-orange-400" : "text-gray-500"}>
                  {properties.locked ? "Locked" : "Unlocked"}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-2 gap-2">
              <button className="px-3 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                Edit
              </button>
              <button className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                Duplicate
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="flex flex-col h-full w-full bg-white/90 dark:bg-gray-800/90 dark:text-white"
    >
      {/* Header with title */}
      <div className="p-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center">
          <List size={18} className="text-gray-600 dark:text-gray-400 mr-2" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Elements
          </h3>
          <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
            {elements.length}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            onClick={() => setGroupByLayer(!groupByLayer)}
            title={groupByLayer ? "Group by type" : "Group by layer"}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <input
            type="text"
            placeholder="Search elements..."
            className="w-full pl-3 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md 
                      bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      {/* Expand/Collapse buttons */}
      <div className="flex justify-center px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <button
          className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mr-4 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          onClick={expandAll}
        >
          Expand All
        </button>
        <button
          className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          onClick={collapseAll}
        >
          Collapse All
        </button>
      </div>

      {/* Selection info */}
      {selectedElementIds.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm text-center font-medium">
          {selectedElementIds.length} {selectedElementIds.length === 1 ? "element" : "elements"} selected
        </div>
      )}

      {/* Tools for selected elements */}
      {selectedElementIds.length > 0 && (
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="grid grid-cols-2 gap-2">
            <button
              className="p-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-md text-gray-700 dark:text-gray-300 flex items-center justify-center text-xs border border-gray-200 dark:border-gray-600 transition-colors"
              onClick={() => setMultiSelectEnabled(!multiSelectEnabled)}
              title={multiSelectEnabled ? "Disable Multi-select" : "Enable Multi-select"}
            >
              <span className="w-3 h-3 rounded-sm border mr-2 border-gray-400 dark:border-gray-500 flex items-center justify-center">
                {multiSelectEnabled && <span className="w-2 h-2 bg-blue-500 rounded-sm"></span>}
              </span>
              Multi
            </button>

            <button
              className="p-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-md text-gray-700 dark:text-gray-300 flex items-center justify-center text-xs border border-gray-200 dark:border-gray-600 transition-colors"
              onClick={handleHideSelected}
              title="Hide selected elements"
            >
              <EyeOff size={14} className="mr-1" />
              Hide
            </button>

            <button
              className="p-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-md text-gray-700 dark:text-gray-300 flex items-center justify-center text-xs border border-gray-200 dark:border-gray-600 transition-colors"
              title="Duplicate selected elements"
            >
              <Copy size={14} className="mr-1" />
              Copy
            </button>

            <button
              className="p-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md text-red-600 dark:text-red-400 flex items-center justify-center text-xs border border-red-200 dark:border-red-800 transition-colors"
              onClick={handleDeleteSelected}
              title="Delete selected elements"
            >
              <Trash2 size={14} className="mr-1" />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Element tree */}
      <div className="flex-1 overflow-y-auto">
        {filteredElements.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400 italic">
            {searchQuery ? "No elements match your search" : "No elements found in project"}
          </div>
        ) : (
          <div className="py-1">{filteredElements.map(node => renderNode(node))}</div>
        )}
      </div>

      {/* Properties Panel */}
      {showPropertiesPanel && renderPropertiesPanel()}
    </div>
  );
};

export default CADElementExplorer;
