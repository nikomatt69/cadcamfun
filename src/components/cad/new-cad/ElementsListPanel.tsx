// src/components/cad/ElementsListPanel.tsx
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Eye, EyeOff, Lock, Unlock, Trash2, Edit, Layers, X, Search, Settings, ChevronDown, ChevronRight, RefreshCw } from 'react-feather';
import { motion, AnimatePresence } from 'framer-motion';
import { useElementsStore } from 'src/store/elementsStore';
import { useLayerStore } from 'src/store/layerStore';
import { useSelectionStore } from 'src/store/selectorStore';
import { Element } from 'src/store/elementsStore';

interface ElementsListPanelProps {
  onClose?: () => void;
  width?: number;
}

const ElementsListPanel: React.FC<ElementsListPanelProps> = ({ 
  onClose,
  width = 300
}) => {
  const { elements, deleteElement, updateElement } = useElementsStore();
  const { layers } = useLayerStore();
  const { selectedElementIds, selectElement, selectMultiple, clearSelection } = useSelectionStore();
  const [filter, setFilter] = useState('');
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'type' | 'layer'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [expandedLayers, setExpandedLayers] = useState<Record<string, boolean>>({});
  const [groupByLayer, setGroupByLayer] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  
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
      filtered = elements.filter(elem => 
        (elem.name?.toLowerCase().includes(lowerFilter)) || 
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
        case 'name':
          valueA = a.name || `${a.type}-${a.id.slice(0, 6)}`;
          valueB = b.name || `${b.type}-${b.id.slice(0, 6)}`;
          break;
        case 'type':
          valueA = a.type;
          valueB = b.type;
          break;
        case 'layer':
          valueA = a.layerId;
          valueB = b.layerId;
          break;
        default:
          valueA = a.name || '';
          valueB = b.name || '';
      }
      
      // Apply sort direction
      return sortDirection === 'asc' 
        ? valueA.localeCompare(valueB)
        : valueB.localeCompare(valueA);
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
  
  // Handle element selection
  const handleSelectElement = useCallback((id: string, event: React.MouseEvent) => {
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
  }, [processedElements, selectedElementIds, selectElement, selectMultiple]);
  
  // Get element icon based on type
  const getElementIcon = (type: string) => {
    switch (type) {
      case 'rectangle': return <div className="w-4 h-3 border border-current" />;
      case 'circle': return <div className="w-4 h-4 rounded-full border border-current" />;
      case 'line': return <div className="w-4 h-0.5 bg-current" />;
      case 'cube': return <div className="w-4 h-4 bg-current opacity-30" />;
      case 'sphere': return <div className="w-4 h-4 rounded-full bg-current opacity-30" />;
      case 'cylinder': return <div className="w-3 h-4 bg-current opacity-30 rounded-sm" />;
      case 'cone': return <div className="w-0 h-0 border-left-4 border-right-4 border-bottom-8 border-solid border-current opacity-50" />;
      case 'component': return <div className="w-4 h-4 border border-current border-dashed" />;
      default: return <div className="w-4 h-4 border border-current rounded-sm" />;
    }
  };
  
  // Reset sorting
  const resetSorting = () => {
    setSortBy('name');
    setSortDirection('asc');
    setFilter('');
    setSelectedLayer(null);
  };
  
  // Render element item
  const renderElementItem = (element: Element) => {
    const isSelected = selectedElementIds.includes(element.id);
    const layer = layers.find(l => l.id === element.layerId);
    
    return (
      <motion.div
        key={element.id}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        className={`mb-1 rounded ${
          isSelected ? 'bg-blue-100 dark:bg-blue-800' : 'bg-white dark:bg-gray-700'
        } border ${isSelected ? 'border-blue-500' : 'border-gray-200'} 
        shadow-sm hover:shadow transition-all duration-150`}
      >
        <div 
          className="flex items-center p-2 cursor-pointer"
          onClick={(e) => handleSelectElement(element.id, e)}
        >
          <div className="flex-shrink-0 mr-2 text-gray-500">
            {getElementIcon(element.type)}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {element.name || `${element.type}-${element.id.slice(0, 6)}`}
            </div>
            <div className="text-xs text-gray-500 flex items-center">
              <span className="truncate flex items-center">
                <div 
                  className="w-2 h-2 rounded-full mr-1" 
                  style={{ backgroundColor: layer?.color || '#ccc' }} 
                />
                <span className="mr-2">{layer?.name || 'No Layer'}</span>
                <span className="italic opacity-60">{element.type}</span>
              </span>
            </div>
          </div>
          
          <div className="flex-shrink-0 flex items-center space-x-1">
            <button 
              className={`p-1 rounded ${element.visible ? 'hover:bg-gray-200' : 'bg-gray-200 text-gray-500'}`}
              onClick={(e) => {
                e.stopPropagation();
                updateElement(element.id, { visible: !element.visible });
              }}
              title={element.visible ? 'Hide' : 'Show'}
            >
              {element.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            
            <button 
              className={`p-1 rounded ${!element.locked ? 'hover:bg-gray-200' : 'bg-gray-200 text-gray-500'}`}
              onClick={(e) => {
                e.stopPropagation();
                updateElement(element.id, { locked: !element.locked });
              }}
              title={element.locked ? 'Unlock' : 'Lock'}
            >
              {element.locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
            
            <button 
              className="p-1 hover:bg-gray-200 rounded text-red-500"
              onClick={(e) => {
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
  };
  
  return (
    <div 
      className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-lg rounded-lg flex flex-col"
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
      
      {/* Search and filter */}
      <div className="p-3 border-b">
        <div className="relative">
          <input
            type="text"
            placeholder="Search elements..."
            className="w-full px-3 py-2 pl-8 border rounded"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <Search size={16} className="absolute left-2.5 top-3 text-gray-400" />
          {filter && (
            <button 
              className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
              onClick={() => setFilter('')}
              title="Clear Search"
            >
              <X size={16} />
            </button>
          )}
        </div>
        
        {showSettings && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-3 p-3 bg-white dark:bg-gray-700 rounded border overflow-hidden"
          >
            <div className="text-sm font-medium mb-2">View Settings</div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm">Group by Layer</label>
                <input 
                  type="checkbox" 
                  checked={groupByLayer}
                  onChange={(e) => setGroupByLayer(e.target.checked)}
                  className="h-4 w-4 text-blue-500"
                />
              </div>
              
              <div>
                <label className="text-sm block mb-1">Sort By</label>
                <div className="flex space-x-2">
                  <select 
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="text-sm border rounded p-1 flex-1"
                  >
                    <option value="name">Name</option>
                    <option value="type">Type</option>
                    <option value="layer">Layer</option>
                  </select>
                  
                  <select 
                    value={sortDirection}
                    onChange={(e) => setSortDirection(e.target.value as any)}
                    className="text-sm border rounded p-1 w-20"
                  >
                    <option value="asc">Asc</option>
                    <option value="desc">Desc</option>
                  </select>
                </div>
              </div>
              
              <div className="flex justify-end">
                <button 
                  className="text-xs flex items-center text-gray-600 hover:text-gray-800"
                  onClick={resetSorting}
                >
                  <RefreshCw size={12} className="mr-1" />
                  Reset
                </button>
              </div>
            </div>
          </motion.div>
        )}
        
        <div className="flex mt-2 space-x-2 overflow-x-auto scrollbar-thin">
          <button
            className={`px-3 py-1 text-xs rounded-full whitespace-nowrap ${
              !selectedLayer ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'
            }`}
            onClick={() => setSelectedLayer(null)}
          >
            All Layers
          </button>
          
          {layers.map(layer => (
            <button
              key={layer.id}
              className={`px-3 py-1 text-xs rounded-full whitespace-nowrap ${
                selectedLayer === layer.id ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'
              }`}
              onClick={() => setSelectedLayer(layer.id)}
              style={{ borderColor: layer.color }}
            >
              <div className="flex items-center">
                <div 
                  className="w-2 h-2 rounded-full mr-1" 
                  style={{ backgroundColor: layer.color }} 
                />
                {layer.name}
              </div>
            </button>
          ))}
        </div>
      </div>
      
      {/* Elements list */}
      <div className="flex-1 overflow-y-auto p-2">
        {processedElements.length === 0 ? (
          <div className="text-center p-4 text-gray-500 dark:text-gray-400">
            No elements found.
          </div>
        ) : !groupByLayer ? (
          // Flat list view
          <AnimatePresence>
            {processedElements.map(element => renderElementItem(element))}
          </AnimatePresence>
        ) : (
          // Grouped by layer
          <div>
            {Object.entries(processedLayerGroups).map(([layerId, layerElements]) => {
              const layer = layers.find(l => l.id === layerId);
              if (!layer) return null;
              
              const isExpanded = expandedLayers[layerId];
              
              return (
                <div key={layerId} className="mb-3">
                  <button
                    className="w-full flex items-center p-2 bg-gray-100 dark:bg-gray-700 rounded text-left"
                    onClick={() => toggleLayerExpansion(layerId)}
                  >
                    <div className="mr-1 text-gray-500">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                    <div 
                      className="w-3 h-3 rounded-full mr-2" 
                      style={{ backgroundColor: layer.color }} 
                    />
                    <div className="text-sm font-medium">
                      {layer.name} ({layerElements.length})
                    </div>
                  </button>
                  
                  {isExpanded && (
                    <div className="ml-4 mt-1">
                      <AnimatePresence>
                        {layerElements.map(element => renderElementItem(element))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Actions for multiple selection */}
      {selectedElementIds.length > 1 && (
        <div className="p-3 border-t bg-blue-50 dark:bg-blue-900">
          <div className="text-sm mb-2">
            {selectedElementIds.length} elements selected
          </div>
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
                const targetLayer = window.prompt('Move to layer (enter layer ID):');
                if (targetLayer) {
                  const layerExists = layers.some(l => l.id === targetLayer);
                  if (layerExists) {
                    useSelectionStore.getState().moveSelectionToLayer(targetLayer);
                  } else {
                    alert('Layer not found');
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