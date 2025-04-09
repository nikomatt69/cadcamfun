// src/components/library/LocalComponentLibrary.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useLocalLibraries, ComponentItem } from '@/src/hooks/useLocalLibraries';
import { Search, Tool, Trash2, ChevronDown, ChevronUp, Save, Package, Disc, Box, Layers } from 'react-feather';
import AddLibraryItem from './AddLibraryItem';

interface LocalComponentLibraryProps {
  onSelectComponent?: (component: ComponentItem) => void;
  onSaveComponent?: (component: ComponentItem) => void;
}

const LocalComponentLibrary: React.FC<LocalComponentLibraryProps> = ({ 
  onSelectComponent,
  onSaveComponent 
}) => {
  const { items: components, isLoading, error, loadItems, deleteItem, searchItems } = useLocalLibraries<ComponentItem>('components');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  
  // Function to reload library items
  const refreshLibrary = useCallback(() => {
    console.log("Refreshing component library");
    loadItems();
  }, [loadItems]);
  
  // Load components when component mounts and listen for updates
  useEffect(() => {
    loadItems();
    
    // Auto-expand categories
    const categories = components.reduce((acc: Record<string, boolean>, component) => {
      const type = component.type || 'Other';
      acc[type] = true;
      return acc;
    }, {});
    setExpandedCategories(categories);
    
    // Listen for component library updates
    const handleLibraryUpdate = () => {
      console.log("Component library updated, refreshing...");
      loadItems();
    };
    
    window.addEventListener('component-library-updated', handleLibraryUpdate);
    
    // Clean up
    return () => {
      window.removeEventListener('component-library-updated', handleLibraryUpdate);
    };
  }, [loadItems, components]);

  // Filter components based on search query
  const filteredComponents = searchQuery ? searchItems(searchQuery) : components;

  // Group components by type
  const groupedComponents = filteredComponents.reduce((groups: Record<string, ComponentItem[]>, component) => {
    const type = component.type || 'Other';
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(component);
    return groups;
  }, {});

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Handle component selection
  const handleSelectComponent = (component: ComponentItem) => {
    if (onSelectComponent) {
      onSelectComponent(component);
    }
  };

  // Handle component deletion
  const handleDeleteComponent = (event: React.MouseEvent, componentId: string) => {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this component?')) {
      deleteItem(componentId);
      // Refresh the list after deletion
      setTimeout(refreshLibrary, 100);
    }
  };

  // Handle save component
  const handleSaveComponent = (event: React.MouseEvent, component: ComponentItem) => {
    event.stopPropagation();
    if (onSaveComponent) {
      onSaveComponent(component);
    }
  };

  // Get appropriate icon for component type
  const getComponentIcon = (component: ComponentItem) => {
    const type = component.type || '';
    const elementType = component.data?.type || '';
    
    // Icons based on component type
    if (type === 'mechanical') return <Tool size={16} className="text-blue-500" />;
    if (type === 'structural') return <Layers size={16} className="text-orange-500" />;
    if (type === 'geometric') return <Disc size={16} className="text-green-500" />;
    
    // Icons based on element type
    if (elementType === 'cube') return <Box size={16} className="text-blue-500" />;
    if (elementType === 'sphere') return <Disc size={16} className="text-purple-500" />;
    if (elementType === 'cylinder') return <Box size={16} className="text-green-500" />;
    
    return <Package size={16} className="text-gray-500" />;
  };

  // Format description for display
  const formatDescription = (component: ComponentItem): string => {
    if (component.description) return component.description;
    
    const { data } = component;
    if (!data) return '';
    
    let description = `${data.type || 'Component'}`;
    
    // Add dimensions if available
    if (data.width && data.height) {
      description += ` (${data.width}×${data.height}`;
      if (data.depth) description += `×${data.depth}`;
      description += ')';
    } else if (data.radius) {
      description += ` (R=${data.radius})`;
    }
    
    return description;
  };

  // Render library content based on loading state and data
  const renderLibraryContent = () => {
    if (isLoading && components.length === 0) {
      return (
        <div className="p-2">
          <div className="animate-pulse bg-gray-200 h-6 w-3/4 mb-2 rounded"></div>
          <div className="animate-pulse bg-gray-200 h-20 w-full rounded"></div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-2 text-red-600 text-sm">
          Error loading components: {error}
        </div>
      );
    }

    return (
      <div className="p-2">
        <div className="mb-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={14} className="text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Search components..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {Object.keys(groupedComponents).length === 0 ? (
          <div className="text-center p-4 border border-dashed border-gray-300 rounded-md">
            <Tool size={24} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-500">No components yet</p>
            <p className="text-xs text-gray-400 mt-1">Save components to your library</p>
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(groupedComponents).map(([category, categoryComponents]) => (
              <div key={category} className="border border-gray-200 rounded-md overflow-hidden">
                <div
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer"
                  onClick={() => toggleCategory(category)}
                >
                  <span className="font-medium text-sm capitalize">{category}</span>
                  <div className="flex items-center">
                    <span className="text-xs text-gray-500 mr-2">{categoryComponents.length}</span>
                    <div className="text-gray-500">
                      {expandedCategories[category] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>
                {expandedCategories[category] && (
                  <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
                    {categoryComponents.map((component) => (
                      <div
                        key={component.id}
                        className="px-3 py-2 hover:bg-blue-50 flex items-center justify-between cursor-pointer"
                        onClick={() => handleSelectComponent(component)}
                      >
                        <div className="flex items-center">
                          <div className="mr-2 flex-shrink-0">
                            {getComponentIcon(component)}
                          </div>
                          <div>
                            <div className="text-sm font-medium">{component.name}</div>
                            <div className="text-xs text-gray-500 truncate max-w-xs">
                              {formatDescription(component)}
                            </div>
                          </div>
                        </div>
                        <div className="flex space-x-1">
                          {onSaveComponent && (
                            <button
                              onClick={(e) => handleSaveComponent(e, component)}
                              className="p-1 text-gray-400 hover:text-blue-500 rounded-full hover:bg-gray-100"
                              title="Save to Library"
                            >
                              <Save size={14} />
                            </button>
                          )}
                          <button
                            onClick={(e) => handleDeleteComponent(e, component.id)}
                            className="p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100"
                            title="Delete Component"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Return the main component structure
  return (
    <div className="flex flex-col" data-component="LocalComponentLibrary">
      <div className="flex-1">
        {renderLibraryContent()}
      </div>
      <AddLibraryItem type="components" onItemAdded={refreshLibrary} />
    </div>
  );
};

export default LocalComponentLibrary;