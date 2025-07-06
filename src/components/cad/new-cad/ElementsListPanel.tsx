// src/components/cad/ElementsListPanel.tsx
import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Edit,
  Layers,
  X,
  Search,
  Settings,
  ChevronDown,
  ChevronRight,
  RefreshCw
} from "react-feather";
import { motion, AnimatePresence } from "framer-motion";
import { useElementsStore } from "src/store/elementsStore";
import { useLayerStore } from "src/store/layerStore";
import { useSelectionStore } from "src/store/selectorStore";
import { Element } from "src/store/elementsStore";

interface ElementsListPanelProps {
  onClose?: () => void;
  width?: number;
}

const ElementsListPanel: React.FC<ElementsListPanelProps> = ({ onClose, width = 300 }) => {
  const { elements, deleteElement, updateElement } = useElementsStore();
  const { layers } = useLayerStore();
  const { selectedElementIds, selectElement, selectMultiple, clearSelection } = useSelectionStore();
  const [filter, setFilter] = useState("");
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "type" | "layer">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [expandedLayers, setExpandedLayers] = useState<Record<string, boolean>>({});
  const [groupByLayer, setGroupByLayer] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [focusedElementIndex, setFocusedElementIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Initialize expanded layers
  useEffect(() => {
    const initialExpanded: Record<string, boolean> = {};
    layers.forEach(layer => {
      initialExpanded[layer.id] = true;
    });
    setExpandedLayers(initialExpanded);
  }, [layers]);

  // Toggle layer expansion
  const toggleLayerExpansion = (layerId: string) => {
    setExpandedLayers(prev => ({
      ...prev,
      [layerId]: !prev[layerId]
    }));
  };

  // Group elements by layer
  const elementsByLayer = useMemo(() => {
    const grouped: Record<string, Element[]> = {};

    layers.forEach(layer => {
      grouped[layer.id] = elements.filter(elem => elem.layerId === layer.id);
    });

    return grouped;
  }, [elements, layers]);

  // Handle filtering and sorting
  const processedElements = useMemo(() => {
    // First, filter by search term
    let filtered = elements;

    if (filter) {
      const lowerFilter = filter.toLowerCase();
      filtered = elements.filter(
        elem =>
          elem.name?.toLowerCase().includes(lowerFilter) ||
          elem.type.toLowerCase().includes(lowerFilter) ||
          elem.id.toLowerCase().includes(lowerFilter)
      );
    }

    // Then filter by selected layer if needed
    if (selectedLayer) {
      filtered = filtered.filter(elem => elem.layerId === selectedLayer);
    }

    // Sort elements
    const sorted = [...filtered].sort((a, b) => {
      let valueA: string;
      let valueB: string;

      switch (sortBy) {
        case "name":
          valueA = a.name || `${a.type}-${a.id.slice(0, 6)}`;
          valueB = b.name || `${b.type}-${b.id.slice(0, 6)}`;
          break;
        case "type":
          valueA = a.type;
          valueB = b.type;
          break;
        case "layer":
          valueA = a.layerId;
          valueB = b.layerId;
          break;
        default:
          valueA = a.name || "";
          valueB = b.name || "";
      }

      // Apply sort direction
      return sortDirection === "asc" ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
    });

    return sorted;
  }, [elements, filter, selectedLayer, sortBy, sortDirection]);

  // Create layer groups if needed
  const processedLayerGroups = useMemo(() => {
    if (!groupByLayer) return {};

    const groups: Record<string, Element[]> = {};

    processedElements.forEach(element => {
      const layerId = element.layerId;
      if (!groups[layerId]) {
        groups[layerId] = [];
      }
      groups[layerId].push(element);
    });

    return groups;
  }, [processedElements, groupByLayer]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!searchInputRef.current || document.activeElement !== searchInputRef.current) {
        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setFocusedElementIndex(prev => Math.min(prev + 1, processedElements.length - 1));
            break;
          case "ArrowUp":
            e.preventDefault();
            setFocusedElementIndex(prev => Math.max(prev - 1, 0));
            break;
          case "Enter":
            if (processedElements[focusedElementIndex]) {
              selectElement(processedElements[focusedElementIndex].id);
            }
            break;
          case "Escape":
            clearSelection();
            setFocusedElementIndex(0);
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedElementIndex, processedElements, selectElement, clearSelection]);

  // Auto-scroll to focused element
  useEffect(() => {
    if (scrollContainerRef.current && processedElements[focusedElementIndex]) {
      const container = scrollContainerRef.current;
      const elementHeight = 60; // Approximate height of each element
      const scrollPosition = focusedElementIndex * elementHeight;

      container.scrollTo({
        top: scrollPosition,
        behavior: "smooth"
      });
    }
  }, [focusedElementIndex, processedElements]);

  // Handle element selection
  const handleSelectElement = useCallback(
    (id: string, event: React.MouseEvent) => {
      if (event.ctrlKey || event.metaKey) {
        // Toggle selection
        if (selectedElementIds.includes(id)) {
          const newSelection = selectedElementIds.filter(elementId => elementId !== id);
          selectMultiple(newSelection);
        } else {
          selectMultiple([...selectedElementIds, id]);
        }
      } else if (event.shiftKey && selectedElementIds.length > 0) {
        // Range selection
        const allElementIds = processedElements.map(elem => elem.id);
        const lastSelectedId = selectedElementIds[selectedElementIds.length - 1];
        const lastIndex = allElementIds.indexOf(lastSelectedId);
        const currentIndex = allElementIds.indexOf(id);

        if (lastIndex >= 0 && currentIndex >= 0) {
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex) + 1;
          const rangeIds = allElementIds.slice(start, end);
          selectMultiple([...selectedElementIds.filter(id => !rangeIds.includes(id)), ...rangeIds]);
        }
      } else {
        // Simple selection
        selectElement(id);
      }
    },
    [processedElements, selectedElementIds, selectElement, selectMultiple]
  );

  // Get element icon based on type
  const getElementIcon = (type: string) => {
    switch (type) {
      case "rectangle":
        return <div className="w-4 h-3 border border-current" />;
      case "circle":
        return <div className="w-4 h-4 rounded-full border border-current" />;
      case "line":
        return <div className="w-4 h-0.5 bg-current" />;
      case "cube":
        return <div className="w-4 h-4 bg-current opacity-30" />;
      case "sphere":
        return <div className="w-4 h-4 rounded-full bg-current opacity-30" />;
      case "cylinder":
        return <div className="w-3 h-4 bg-current opacity-30 rounded-sm" />;
      case "cone":
        return (
          <div className="w-0 h-0 border-left-4 border-right-4 border-bottom-8 border-solid border-current opacity-50" />
        );
      case "component":
        return <div className="w-4 h-4 border border-current border-dashed" />;
      default:
        return <div className="w-4 h-4 border border-current rounded-sm" />;
    }
  };

  // Reset sorting
  const resetSorting = () => {
    setSortBy("name");
    setSortDirection("asc");
    setFilter("");
    setSelectedLayer(null);
  };

  // Render element item
  const renderElementItem = useCallback(
    (element: Element, index?: number) => {
      const isSelected = selectedElementIds.includes(element.id);
      const isFocused = index !== undefined && index === focusedElementIndex;
      const layer = layers.find(l => l.id === element.layerId);

      return (
        <motion.div
          key={element.id}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0 }}
          className={`rounded ${
            isSelected
              ? "bg-blue-100 dark:bg-blue-800"
              : isFocused
                ? "bg-gray-100 dark:bg-gray-600"
                : "bg-white dark:bg-gray-700"
          } border ${
            isSelected ? "border-blue-500" : isFocused ? "border-blue-300 dark:border-blue-500" : "border-gray-200"
          } shadow-sm hover:shadow transition-all duration-150 will-change-transform`}
          layout
        >
          <div className="flex items-center p-2 cursor-pointer" onClick={e => handleSelectElement(element.id, e)}>
            <div className="flex-shrink-0 mr-2 text-gray-500">{getElementIcon(element.type)}</div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {element.name || `${element.type}-${element.id.slice(0, 6)}`}
              </div>
              <div className="text-xs text-gray-500 flex items-center">
                <span className="truncate flex items-center">
                  <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: layer?.color || "#ccc" }} />
                  <span className="mr-2">{layer?.name || "No Layer"}</span>
                  <span className="italic opacity-60">{element.type}</span>
                </span>
              </div>
            </div>

            <div className="flex-shrink-0 flex items-center space-x-1">
              <button
                className={`p-1 rounded ${element.visible ? "hover:bg-gray-200" : "bg-gray-200 text-gray-500"}`}
                onClick={e => {
                  e.stopPropagation();
                  updateElement(element.id, { visible: !element.visible });
                }}
                title={element.visible ? "Hide" : "Show"}
              >
                {element.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>

              <button
                className={`p-1 rounded ${!element.locked ? "hover:bg-gray-200" : "bg-gray-200 text-gray-500"}`}
                onClick={e => {
                  e.stopPropagation();
                  updateElement(element.id, { locked: !element.locked });
                }}
                title={element.locked ? "Unlock" : "Lock"}
              >
                {element.locked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>

              <button
                className="p-1 hover:bg-gray-200 rounded text-red-500"
                onClick={e => {
                  e.stopPropagation();
                  deleteElement(element.id);

                  // If this element was selected, remove it from selection
                  if (selectedElementIds.includes(element.id)) {
                    const newSelection = selectedElementIds.filter(id => id !== element.id);
                    selectMultiple(newSelection);
                  }
                }}
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      );
    },
    [selectedElementIds, focusedElementIndex, layers, updateElement, deleteElement, selectMultiple, handleSelectElement]
  );

  return (
    <div
      className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-lg rounded-lg flex flex-col h-full max-h-[80vh]"
      style={{ width: `${width}px` }}
    >
      <div className="flex justify-between items-center p-3 border-b">
        <h3 className="font-medium text-md">Elements List ({elements.length})</h3>
        <div className="flex items-center space-x-1">
          <button
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            onClick={() => setShowSettings(!showSettings)}
            title="List Settings"
          >
            <Settings size={18} />
          </button>
          {onClose && (
            <button
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              onClick={onClose}
              title="Close Panel"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-gray-200 dark:border-gray-600">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search elements... (↑↓ navigate, Enter select, Esc clear)"
            className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 dark:border-gray-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-black dark:text-white"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <Search size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Layer/Sort Controls */}
      <div className="p-2 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between text-xs">
        <div>
          <label className="mr-2">Group by:</label>
          <button
            className={`px-2 py-1 rounded ${groupByLayer ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-600"}`}
            onClick={() => setGroupByLayer(!groupByLayer)}
          >
            Layer
          </button>
        </div>
        <button
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
          onClick={resetSorting}
          title="Reset filters & sorting"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Elements List */}
      <div
        ref={scrollContainerRef}
        className="flex-grow overflow-y-auto p-2 min-h-0 scrollbar scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 dark:scrollbar-thumb-gray-600 dark:scrollbar-track-gray-800 hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-500 scroll-smooth"
        tabIndex={0}
      >
        <AnimatePresence>
          {groupByLayer ? (
            Object.entries(processedLayerGroups).map(([layerId, layerElements]) => {
              const layer = layers.find(l => l.id === layerId);
              const isExpanded = expandedLayers[layerId];

              if (!layer || layerElements.length === 0) return null;

              return (
                <div key={layerId} className="mb-2">
                  <div
                    className="flex items-center justify-between p-1.5 bg-gray-100 dark:bg-gray-700 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 sticky top-0 z-10"
                    onClick={() => toggleLayerExpansion(layerId)}
                  >
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: layer.color || "#ccc" }} />
                      <span className="font-semibold text-sm">
                        {layer.name} ({layerElements.length})
                      </span>
                    </div>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="pl-3 pt-1 space-y-1"
                    >
                      {layerElements.map((element, index) => renderElementItem(element, index))}
                    </motion.div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="space-y-1">
              {processedElements.map((element, index) => renderElementItem(element, index))}
            </div>
          )}
        </AnimatePresence>

        {/* Scroll indicator for bottom */}
        {processedElements.length > 0 && (
          <div className="text-center py-2 text-xs text-gray-400 sticky bottom-0 bg-gradient-to-t from-[#F8FBFF] dark:from-gray-800 to-transparent">
            Total: {processedElements.length} elements
            {focusedElementIndex >= 0 && processedElements.length > 0 && (
              <span className="ml-2">
                | Selected: {focusedElementIndex + 1}/{processedElements.length}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions for multiple selection */}
      {selectedElementIds.length > 1 && (
        <div className="p-3 border-t bg-blue-50 dark:bg-blue-900">
          <div className="text-sm mb-2">{selectedElementIds.length} elements selected</div>
          <div className="flex space-x-2">
            <button
              className="flex items-center px-3 py-1.5 bg-blue-500 text-white rounded text-sm"
              onClick={() => {
                useSelectionStore.getState().saveAsComponent();
              }}
            >
              <Layers size={14} className="mr-1" />
              Create Component
            </button>

            <button
              className="flex items-center px-3 py-1.5 bg-gray-200 dark:bg-gray-700 rounded text-sm"
              onClick={() => {
                // Open layer selection dialog
                const targetLayer = window.prompt("Move to layer (enter layer ID):");
                if (targetLayer) {
                  const layerExists = layers.some(l => l.id === targetLayer);
                  if (layerExists) {
                    useSelectionStore.getState().moveSelectionToLayer(targetLayer);
                  } else {
                    alert("Layer not found");
                  }
                }
              }}
            >
              <Layers size={14} className="mr-1" />
              Move to Layer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ElementsListPanel;
