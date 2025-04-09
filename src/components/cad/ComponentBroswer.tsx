// src/components/library/ComponentBrowser.tsx
import React, { useState, useEffect } from 'react';
import { useLibrary } from '../../hooks/useLibrary';
import { useCADComponent } from '../../hooks/useCADComponent';

import { Package, Search, Grid, X, Plus, ChevronDown, ChevronRight } from 'react-feather';
import { createComponentPreview } from '../../lib/libraryTransform';
import { LibraryItem } from '../cam/LibraryManagerUI';

interface ComponentBrowserProps {
  onComponentAdded?: (componentId: string) => void;
}

export const ComponentBrowser: React.FC<ComponentBrowserProps> = ({ onComponentAdded }) => {
  // Library hooks
  const { 
    cadComponents, 
    userComponents, 
    predefinedComponents,
    isLoadingCadComponents,
    isLoadingUserComponents,
    isLoadingPredefinedComponents,
    searchCadComponents,
    searchUserComponents,
    addComponentToCAD
  } = useLibrary();
  
  const { addComponentToCad } = useCADComponent();
  
  // Local state
  const [activeTab, setActiveTab] = useState<'cad' | 'user' | 'predefined'>('cad');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredComponents, setFilteredComponents] = useState<LibraryItem[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [selectedComponent, setSelectedComponent] = useState<LibraryItem | null>(null);
  
  // Effect to filter components when tab changes or search query changes
  useEffect(() => {
    if (searchQuery) {
      // Perform search based on active tab
      switch (activeTab) {
        case 'cad':
          setFilteredComponents(searchCadComponents(searchQuery));
          break;
        case 'user':
          setFilteredComponents(searchUserComponents(searchQuery));
          break;
        case 'predefined':
          setFilteredComponents(
            predefinedComponents.filter(comp => 
              comp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              comp.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              comp.tags?.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
            )
          );
          break;
      }
    } else {
      // No search query, show all components for the active tab
      switch (activeTab) {
        case 'cad':
          setFilteredComponents(cadComponents);
          break;
        case 'user':
          setFilteredComponents(userComponents);
          break;
        case 'predefined':
          setFilteredComponents(predefinedComponents);
          break;
      }
    }
  }, [
    activeTab, 
    searchQuery, 
    cadComponents, 
    userComponents, 
    predefinedComponents,
    searchCadComponents,
    searchUserComponents
  ]);
  
  // Group components by type
  const groupedComponents = filteredComponents.reduce<Record<string, LibraryItem[]>>((groups, component) => {
    const type = component.type || 'other';
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(component);
    return groups;
  }, {});
  
  // Handle adding component to CAD
  const handleAddComponent = (component: LibraryItem) => {
    const elementId = addComponentToCAD(component);
    
    if (elementId && onComponentAdded) {
      onComponentAdded(elementId);
    }
    
    return elementId;
  };
  
  // Handle adding component from CAD library by ID
  const handleAddCADComponent = (componentId: string) => {
    const elementId = addComponentToCad(componentId);
    
    if (elementId && onComponentAdded) {
      onComponentAdded(elementId);
    }
    
    return elementId;
  };
  
  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };
  
  return (
    <div className="component-browser flex flex-col pt-5 h-full bg-gray-50 rounded-lg">
      <h1 className='py-1 px-1'>Componenti Predefiniti</h1>
      <div className="flex items-center flex-col border-b border-gray-200 bg-white p-2 rounded-t-lg">
        <button
          className={`px-3 py-2 rounded-md mr-2 text-sm font-medium ${
            activeTab === 'cad'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          onClick={() => setActiveTab('cad')}
        >
          CAD Components
        </button>
        <button
          className={`px-3 py-2 rounded-md mr-2 text-sm font-medium ${
            activeTab === 'user'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          onClick={() => setActiveTab('user')}
        >
          My Components
        </button>
        <button
          className={`px-3 py-2 rounded-md text-sm font-medium ${
            activeTab === 'predefined'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          onClick={() => setActiveTab('predefined')}
        >
          Predefined
        </button>
      </div>
      
      {/* Search */}
      <div className="p-3 border-b border-gray-200 bg-white">
        <div className="relative rounded-md shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-10 py-2 sm:text-sm border-gray-300 rounded-md"
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <button
                onClick={() => setSearchQuery('')}
                className="text-gray-400 hover:text-gray-500"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Component list */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Loading states */}
        {(
          (activeTab === 'cad' && isLoadingCadComponents) ||
          (activeTab === 'user' && isLoadingUserComponents) ||
          (activeTab === 'predefined' && isLoadingPredefinedComponents)
        ) && (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            <p className="mt-2 text-gray-500">Loading components...</p>
          </div>
        )}
        
        {/* Empty states */}
        {!isLoadingCadComponents && !isLoadingUserComponents && !isLoadingPredefinedComponents && 
         filteredComponents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full">
            <Package size={48} className="text-gray-300" />
            <p className="mt-2 text-gray-500">
              {searchQuery 
                ? 'No components found for your search'
                : activeTab === 'user'
                  ? 'You haven\'t created any components yet'
                  : 'No components available'}
            </p>
          </div>
        )}
        
        {/* Component groups */}
        {Object.entries(groupedComponents).map(([category, components]) => (
          <div key={category} className="mb-4">
            <div 
              className="flex items-center flex justify-between px-2 py-1 bg-gray-100 rounded-md mb-2 cursor-pointer"
              onClick={() => toggleCategory(category)}
            >
              <div className="flex items-center">
                <span className="font-medium text-gray-700 capitalize">{category}</span>
                <span className="ml-2 text-xs text-gray-500">({components.length})</span>
              </div>
              {expandedCategories[category] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
            
            {expandedCategories[category] && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-2">
                {components.map((component) => (
                  <div 
                    key={component.id}
                    className="flex items-center justify-between p-2 bg-white rounded-md shadow-sm hover:shadow transition-all cursor-pointer"
                    onClick={() => setSelectedComponent(component)}
                  >
                    <div className="flex items-center">
                      <div className="mr-2 text-blue-500">
                        <ComponentIcon type={component.type} />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{component.name}</div>
                        
                      </div>
                    </div>
                    <button
                      className="p-1 hover:bg-blue-100 rounded"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddComponent(component);
                      }}
                    >
                      <Plus size={16} className="text-blue-600" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Selected component preview */}
      {selectedComponent && (
        <div className="border-t border-gray-200 p-4 bg-white">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-medium text-md">{selectedComponent.name}</h3>
              {selectedComponent.description && (
                <p className="text-sm text-gray-500 mt-1">{selectedComponent.description}</p>
              )}
              
              {/* Tags */}
              {selectedComponent.tags && selectedComponent.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedComponent.tags.map((tag, index) => (
                    <span 
                      key={index}
                      className="inline-block px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            <button
              className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
              onClick={() => handleAddComponent(selectedComponent)}
            >
              Add to CAD
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Component icon based on type
const ComponentIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'workpiece':
      return <Grid size={20} />;
    case 'line':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>;
    case 'circle':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="8" />
      </svg>;
    case 'rectangle':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="6" width="16" height="12" />
      </svg>;
    case 'cube':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="6" width="16" height="12" />
        <line x1="4" y1="6" x2="8" y2="2" />
        <line x1="20" y1="6" x2="16" y2="2" />
        <line x1="4" y1="18" x2="8" y2="22" />
        <line x1="20" y1="18" x2="16" y2="22" />
        <line x1="8" y1="2" x2="16" y2="2" />
        <line x1="8" y1="22" x2="16" y2="22" />
      </svg>;
    case 'sphere':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="8" />
        <line x1="12" y1="4" x2="12" y2="20" />
        <line x1="4" y1="12" x2="20" y2="12" />
      </svg>;
    default:
      return <Package size={20} />;
  }
};

export default ComponentBrowser;