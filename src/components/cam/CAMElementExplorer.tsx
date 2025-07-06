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
  Tool,
  Code,
  Play,
  Cpu,
  Database,
  Copy,
  Trash2,
  Move,
  RefreshCw,
  List,
  Edit3,
  X
} from "react-feather";
import { useElementsStore } from "src/store/elementsStore";
import { useLayerStore } from "src/store/layerStore";
import { useSelectionStore } from "src/store/selectorStore";
import { motion, AnimatePresence } from "framer-motion";
import { generateToolpathFromEntities } from "src/lib/toolpathGenerator";
import { generateGcode } from "src/lib/gcodeGenerator";

interface ToolpathData {
  id: string;
  elementId: string;
  toolpath: any;
  gcode: string;
  isVisible: boolean;
}

interface CAMElementExplorerProps {
  width?: number;
  onElementSelect?: (id: string) => void;
  onViewToolpath?: (toolpathData: ToolpathData) => void;
}

interface ElementNode {
  id: string;
  name: string;
  type: string;
  children: ElementNode[];
  visible?: boolean;
  layerId: string;
  toolId?: string;
  materialId?: string;
  gcodeTemplate?: string;
  toolpathPoints?: any[];
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

const CAMElementExplorer: React.FC<CAMElementExplorerProps> = ({ width = 280, onElementSelect, onViewToolpath }) => {
  const { elements, deleteElement, updateElement, selectElement: selectElementInStore } = useElementsStore();
  const { layers } = useLayerStore();
  const { selectedElementIds, selectElement, clearSelection } = useSelectionStore();

  const [expandedElements, setExpandedElements] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [multiSelectEnabled, setMultiSelectEnabled] = useState(false);
  const [activeDetailPanel, setActiveDetailPanel] = useState<"tool" | "material" | "gcode" | null>(null);

  // State for tool properties panel (CAM specific)
  const [showToolProperties, setShowToolProperties] = useState(false);

  // Stati per gestire tool, materiale e gcode per ogni elemento
  const [elementTools, setElementTools] = useState<Record<string, string>>({});
  const [elementMaterials, setElementMaterials] = useState<Record<string, string>>({});
  const [elementGcodes, setElementGcodes] = useState<Record<string, string>>({});
  const [elementToolpaths, setElementToolpaths] = useState<Record<string, ToolpathData>>({});

  // Additional state for toolpath parameters
  const [toolpathParams, setToolpathParams] = useState<Record<string, any>>({});

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
        toolId: elementTools[element.id] || undefined,
        materialId: elementMaterials[element.id] || undefined,
        gcodeTemplate: elementGcodes[element.id] || undefined,
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
        element.type === "composite" ||
        element.type === "component" ||
        element.type === "custom"
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
  }, [elements, elementTools, elementMaterials, elementGcodes]);

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
      // Select in elements store (for properties panel in CAM)
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
        // Show tool properties panel for single selection
        setShowToolProperties(true);
      }

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

  // Handle tool assignment to element
  const handleAssignTool = (elementId: string, toolId: string) => {
    setElementTools(prev => ({
      ...prev,
      [elementId]: toolId
    }));
    // Qui eventualmente aggiornare lo store o inviare i dati all'API
  };

  // Handle material assignment to element
  const handleAssignMaterial = (elementId: string, materialId: string) => {
    setElementMaterials(prev => ({
      ...prev,
      [elementId]: materialId
    }));
    // Qui eventualmente aggiornare lo store o inviare i dati all'API
  };

  // Map tool IDs to actual tool parameters
  const toolParams: Record<string, any> = {
    "endmill-3mm": { diameter: 3, type: "endmill", name: "Endmill 3mm" },
    "endmill-6mm": { diameter: 6, type: "endmill", name: "Endmill 6mm" },
    "ballnose-3mm": { diameter: 3, type: "ballnose", name: "Ballnose 3mm" },
    "v-bit-60deg": { diameter: 6, type: "v-bit", angle: 60, name: "V-bit 60°" }
  };

  // Map material IDs to actual material parameters
  const materialParams: Record<string, any> = {
    "wood-oak": { name: "Wood - Oak", hardness: "medium", feedrateFactor: 1.0 },
    "wood-maple": { name: "Wood - Maple", hardness: "hard", feedrateFactor: 0.8 },
    "aluminum": { name: "Aluminum", hardness: "hard", feedrateFactor: 0.5 },
    "acrylic": { name: "Acrylic", hardness: "medium", feedrateFactor: 0.7 }
  };

  // Default parameters for toolpath generation
  const defaultToolpathParams = {
    depth: 5,
    stepover: 40,
    feedrate: 1000,
    plungerate: 300,
    tolerance: 0.01,
    safeHeight: 5,
    clearanceHeight: 10,
    spindleSpeed: 12000,
    coolant: false,
    optimization: { removeRedundantMoves: true }
  };

  // Function to generate toolpath for an element
  const handleGenerateToolpath = (elementId: string) => {
    const element = elements.find(el => el.id === elementId);
    if (!element) return;

    const toolId = elementTools[elementId];
    const materialId = elementMaterials[elementId];

    if (!toolId || !materialId) {
      alert("Please assign both tool and material first");
      return;
    }

    // Get tool and material parameters
    const tool = toolParams[toolId];
    const material = materialParams[materialId];

    if (!tool || !material) {
      alert("Invalid tool or material");
      return;
    }

    // Get or create toolpath parameters for this element
    const params = toolpathParams[elementId] || { ...defaultToolpathParams };

    // Adjust parameters based on material
    params.feedrate = defaultToolpathParams.feedrate * material.feedrateFactor;
    params.plungerate = defaultToolpathParams.plungerate * material.feedrateFactor;
    params.tool = tool;

    // Generate operation type based on element type
    let operation = "contour";
    if (element.type === "rectangle" || element.type === "circle") {
      operation = "pocket";
    } else if (element.type === "point") {
      operation = "drill";
    }

    try {
      // Generate the toolpath
      const toolpath = generateToolpathFromEntities([element], {
        tool: toolId,
        operation,
        depth: params.depth,
        stepover: params.stepover,
        feedrate: params.feedrate,
        plungerate: params.plungerate,
        tolerance: params.tolerance
      });

      // Generate the G-code from the toolpath
      const gcode = generateGcode(toolpath, {
        ...params,
        machineType: "mill",
        useInches: false,
        coordinateSystem: "G54"
      });

      // Store the generated toolpath and gcode
      const toolpathData: ToolpathData = {
        id: `tp-${elementId}`,
        elementId,
        toolpath,
        gcode,
        isVisible: true
      };

      setElementToolpaths(prev => ({
        ...prev,
        [elementId]: toolpathData
      }));

      // Also update the gcode text view
      setElementGcodes(prev => ({
        ...prev,
        [elementId]: gcode
      }));

      // If there's a callback for viewing the toolpath, call it
      if (onViewToolpath) {
        onViewToolpath(toolpathData);
      }
    } catch (error) {
      console.error("Error generating toolpath:", error);
      alert(`Error generating toolpath: ${error}`);
    }
  };

  // Function to view/edit toolpath in the editor
  const handleViewToolpathInEditor = (elementId: string) => {
    const toolpathData = elementToolpaths[elementId];
    if (!toolpathData) {
      alert("No toolpath generated for this element yet. Generate it first.");
      return;
    }

    if (onViewToolpath) {
      onViewToolpath(toolpathData);
    } else {
      alert("Toolpath view functionality not available");
    }
  };

  // Function to update toolpath parameters
  const updateToolpathParam = (elementId: string, paramName: string, value: any) => {
    setToolpathParams(prev => {
      const currentParams = prev[elementId] || { ...defaultToolpathParams };
      return {
        ...prev,
        [elementId]: {
          ...currentParams,
          [paramName]: value
        }
      };
    });
  };

  // Replace the existing handleGenerateGCode function
  const handleGenerateGCode = (elementId: string) => {
    // Now calls our new function
    handleGenerateToolpath(elementId);
  };

  // Recursive function to render a node and its children
  const renderNode = (node: ElementNode, depth = 0) => {
    const isExpanded = expandedElements[node.id] || false;
    const isSelected = selectedElementIds.includes(node.id);
    const hasChildren = node.children.length > 0;
    const layer = layers.find(l => l.id === node.layerId);
    const layerVisible = layer ? layer.visible !== false : true;
    const isVisible = node.visible && layerVisible;

    // Stato CAM dell'elemento
    const hasTool = !!node.toolId;
    const hasMaterial = !!node.materialId;
    const hasGcode = !!node.gcodeTemplate;

    // Get toolpath parameters for this element
    const elementParams = toolpathParams[node.id] || defaultToolpathParams;
    const hasToolpath = !!elementToolpaths[node.id];

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

          {/* CAM Status indicators */}
          <div className="flex items-center space-x-1 mr-2">
            <span
              className={`h-2 w-2 rounded-full ${hasTool ? "bg-green-500" : "bg-gray-300"} inline-block`}
              title={hasTool ? "Tool assigned" : "No tool"}
            />
            <span
              className={`h-2 w-2 rounded-full ${hasMaterial ? "bg-blue-500" : "bg-gray-300"} inline-block`}
              title={hasMaterial ? "Material assigned" : "No material"}
            />
            <span
              className={`h-2 w-2 rounded-full ${hasGcode ? "bg-purple-500" : "bg-gray-300"} inline-block`}
              title={hasGcode ? "GCode generated" : "No GCode"}
            />
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

        {/* Se l'elemento è selezionato, mostriamo i dettagli CAM */}
        {isSelected && (
          <div className="pl-10 py-1 bg-gray-50 dark:bg-gray-700/30 border-l-2 border-blue-300 dark:border-blue-600/50 ml-5 text-xs overflow-visible">
            <div className="flex justify-between mb-1">
              <div className="flex space-x-4">
                <button
                  className={`flex items-center ${activeDetailPanel === "tool" ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-300"}`}
                  onClick={() => setActiveDetailPanel(activeDetailPanel === "tool" ? null : "tool")}
                >
                  <Tool size={12} className="mr-1" />
                  <span>Tool</span>
                </button>
                <button
                  className={`flex items-center ${activeDetailPanel === "material" ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-300"}`}
                  onClick={() => setActiveDetailPanel(activeDetailPanel === "material" ? null : "material")}
                >
                  <Database size={12} className="mr-1" />
                  <span>Material</span>
                </button>
              </div>
            </div>

            {/* Pannelli di dettaglio */}
            <AnimatePresence>
              {activeDetailPanel === "tool" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-2 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 overflow-visible"
                >
                  <div className="flex flex-col">
                    <span className="text-gray-600 dark:text-gray-300 mb-1">Select Tool:</span>
                    <select
                      className="text-xs p-1 border rounded"
                      value={node.toolId || ""}
                      onChange={e => handleAssignTool(node.id, e.target.value)}
                    >
                      <option value="">-- Select Tool --</option>
                      <option value="endmill-3mm">Endmill 3mm</option>
                      <option value="endmill-6mm">Endmill 6mm</option>
                      <option value="ballnose-3mm">Ballnose 3mm</option>
                      <option value="v-bit-60deg">V-bit 60°</option>
                    </select>

                    {/* Add toolpath parameters */}
                    {node.toolId && (
                      <div className="mt-3 border-t pt-2 border-gray-200 dark:border-gray-700">
                        <h4 className="font-medium mb-1">Toolpath Parameters:</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-gray-600 dark:text-gray-400 text-xs">Depth (mm)</label>
                            <input
                              type="number"
                              className="w-full text-xs p-1 border rounded"
                              value={elementParams.depth}
                              onChange={e => updateToolpathParam(node.id, "depth", parseFloat(e.target.value))}
                              min="0.1"
                              step="0.5"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-600 dark:text-gray-400 text-xs">Stepover (%)</label>
                            <input
                              type="number"
                              className="w-full text-xs p-1 border rounded"
                              value={elementParams.stepover}
                              onChange={e => updateToolpathParam(node.id, "stepover", parseFloat(e.target.value))}
                              min="10"
                              max="90"
                              step="5"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-600 dark:text-gray-400 text-xs">Feedrate (mm/min)</label>
                            <input
                              type="number"
                              className="w-full text-xs p-1 border rounded"
                              value={elementParams.feedrate}
                              onChange={e => updateToolpathParam(node.id, "feedrate", parseFloat(e.target.value))}
                              min="100"
                              step="100"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-600 dark:text-gray-400 text-xs">Plunge (mm/min)</label>
                            <input
                              type="number"
                              className="w-full text-xs p-1 border rounded"
                              value={elementParams.plungerate}
                              onChange={e => updateToolpathParam(node.id, "plungerate", parseFloat(e.target.value))}
                              min="50"
                              step="50"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeDetailPanel === "material" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-2 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 overflow-visible"
                >
                  <div className="flex flex-col">
                    <span className="text-gray-600 dark:text-gray-300 mb-1">Select Material:</span>
                    <select
                      className="text-xs p-1 border rounded"
                      value={node.materialId || ""}
                      onChange={e => handleAssignMaterial(node.id, e.target.value)}
                    >
                      <option value="">-- Select Material --</option>
                      <option value="wood-oak">Wood - Oak</option>
                      <option value="wood-maple">Wood - Maple</option>
                      <option value="aluminum">Aluminum</option>
                      <option value="acrylic">Acrylic</option>
                    </select>

                    {/* Show material information when selected */}
                    {node.materialId && materialParams[node.materialId] && (
                      <div className="mt-3 border-t pt-2 border-gray-200 dark:border-gray-700">
                        <h4 className="font-medium mb-1">Material Properties:</h4>
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Type:</span>
                            <span className="font-medium">{materialParams[node.materialId].name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Hardness:</span>
                            <span className="font-medium capitalize">{materialParams[node.materialId].hardness}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Feed Rate Factor:</span>
                            <span className="font-medium">{materialParams[node.materialId].feedrateFactor}</span>
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 dark:text-gray-400 text-xs">Material Thickness (mm):</span>
                            <input
                              type="number"
                              className="w-16 text-xs p-1 border rounded"
                              value={(toolpathParams[node.id]?.depth || defaultToolpathParams.depth) * 1.2}
                              onChange={e =>
                                updateToolpathParam(node.id, "workpiece", {
                                  ...(toolpathParams[node.id]?.workpiece || {}),
                                  thickness: parseFloat(e.target.value)
                                })
                              }
                              min="1"
                              step="1"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

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
            onClick={() => { }}
            title="Refresh Elements"
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
              title="Assign Tool"
              onClick={() => setActiveDetailPanel("tool")}
            >
              <Tool size={14} className="mr-1" />
              Tool
            </button>

            <button
              className="p-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-md text-gray-700 dark:text-gray-300 flex items-center justify-center text-xs border border-gray-200 dark:border-gray-600 transition-colors"
              title="Assign Material"
              onClick={() => setActiveDetailPanel("material")}
            >
              <Database size={14} className="mr-1" />
              Material
            </button>

            <button
              className="p-2 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-md text-green-600 dark:text-green-400 flex items-center justify-center text-xs border border-green-200 dark:border-green-800 transition-colors"
              onClick={() => {
                selectedElementIds.forEach(id => handleGenerateToolpath(id));
              }}
              title="Generate Toolpath"
            >
              <Code size={14} className="mr-1" />
              Generate
            </button>
          </div>
        </div>
      )}

      {/* Element tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {filteredElements.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400 italic">
            {searchQuery ? "No elements match your search" : "No elements found in project"}
          </div>
        ) : (
          <div className="py-1">{filteredElements.map(node => renderNode(node))}</div>
        )}
      </div>

      {/* Tool Properties Panel - Shows when an element is selected */}
      {selectedElementIds.length === 1 && showToolProperties && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        >
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Tool Assignment</h4>
              <button
                onClick={() => setShowToolProperties(false)}
                className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X size={14} />
              </button>
            </div>

            {(() => {
              const selectedElement = elements.find(e => e.id === selectedElementIds[0]);
              const assignedToolId = elementTools[selectedElementIds[0]];
              const assignedTool = assignedToolId ? toolParams[assignedToolId] : null;

              return (
                <div className="space-y-3">
                  {/* Element Info */}
                  <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Selected Element</div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {selectedElement?.name || 'Unknown Element'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Type: {selectedElement?.type || 'Unknown'}
                    </div>
                  </div>

                  {/* Current Tool Assignment */}
                  <div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Current Tool</div>
                    {assignedTool ? (
                      <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                        <div className="font-medium text-green-700 dark:text-green-300">
                          {assignedTool.name}
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                          Type: {assignedTool.type} | Diameter: {assignedTool.diameter}mm
                        </div>
                      </div>
                    ) : (
                      <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                        <div className="text-yellow-700 dark:text-yellow-300 text-sm">
                          No tool assigned
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tool Selection */}
                  <div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Available Tools</div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {Object.entries(toolParams).map(([toolId, tool]) => (
                        <button
                          key={toolId}
                          onClick={() => handleAssignTool(selectedElementIds[0], toolId)}
                          className={`w-full p-2 text-left rounded-md border transition-colors ${assignedToolId === toolId
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                            : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                            }`}
                        >
                          <div className="font-medium text-sm">{tool.name}</div>
                          <div className="text-xs opacity-75">
                            {tool.type} | ⌀{tool.diameter}mm
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => handleGenerateToolpath(selectedElementIds[0])}
                      disabled={!assignedTool}
                      className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors"
                    >
                      <Code size={14} className="inline mr-1" />
                      Generate Toolpath
                    </button>
                    <button
                      onClick={() => {
                        if (assignedToolId) {
                          setElementTools(prev => {
                            const newTools = { ...prev };
                            delete newTools[selectedElementIds[0]];
                            return newTools;
                          });
                        }
                      }}
                      disabled={!assignedTool}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md text-sm transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default CAMElementExplorer;
