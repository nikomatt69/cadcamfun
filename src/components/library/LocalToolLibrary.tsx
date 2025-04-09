// src/components/library/LocalToolLibrary.tsx
import React, { useState, useEffect } from 'react';
import { useLocalLibraries, ToolItem } from '@/src/hooks/useLocalLibraries';
import { Search, Tool, Trash2, ChevronDown, ChevronUp } from 'react-feather';
import AddLibraryItem from './AddLibraryItem';

interface LocalToolLibraryProps {
  onSelectTool?: (tool: ToolItem) => void;
}

const LocalToolLibrary: React.FC<LocalToolLibraryProps> = ({ onSelectTool }) => {
  const { items: tools, isLoading, error, loadItems, deleteItem, searchItems } = useLocalLibraries<ToolItem>('tools');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  
  // Load tools when component mounts
  useEffect(() => {
    loadItems();
    
    // Listen for tool library updates
    const handleLibraryUpdate = () => {
      console.log("Tool library updated, refreshing...");
      loadItems();
    };
    
    window.addEventListener('tool-library-updated', handleLibraryUpdate);
    
    // Clean up
    return () => {
      window.removeEventListener('tool-library-updated', handleLibraryUpdate);
    };
  }, [loadItems]);

  // Filter tools based on search query
  const filteredTools = searchQuery ? searchItems(searchQuery) : tools;

  // Group tools by type
  const groupedTools = filteredTools.reduce((groups: Record<string, ToolItem[]>, tool) => {
    const type = tool.type || 'Other';
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(tool);
    return groups;
  }, {});

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Handle tool selection
  const handleSelectTool = (tool: ToolItem) => {
    if (onSelectTool) {
      onSelectTool(tool);
    }
  };

  // Handle tool deletion
  const handleDeleteTool = (event: React.MouseEvent, toolId: string) => {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this tool?')) {
      deleteItem(toolId);
    }
  };

  // Get icon for tool type
  const getToolIcon = (type: string) => {
    switch (type) {
      case 'endmill': return '🔄';
      case 'ballendmill': return '🔵';
      case 'drillbit': return '🔨';
      case 'chamfermill': return '🔺';
      case 'facemill': return '⬛';
      case 'engraver': return '✏️';
      case 'turningTool': return '⚙️';
      case 'threadingTool': return '🔩';
      default: return '🧩';
    }
  };

  // Render library content based on loading state and data
  const renderLibraryContent = () => {
    if (isLoading && tools.length === 0) {
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
          Error loading tools: {error}
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
              placeholder="Search tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {Object.keys(groupedTools).length === 0 ? (
          <div className="text-center p-4 border border-dashed border-gray-300 rounded-md">
            <Tool size={24} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-500">No tools yet</p>
            <p className="text-xs text-gray-400 mt-1">Add tools to your library</p>
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(groupedTools).map(([category, categoryTools]) => (
              <div key={category} className="border border-gray-200 rounded-md overflow-hidden">
                <div
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer"
                  onClick={() => toggleCategory(category)}
                >
                  <span className="font-medium text-sm capitalize">{category}</span>
                  <div className="flex items-center">
                    <span className="text-xs text-gray-500 mr-2">{categoryTools.length}</span>
                    <div className="text-gray-500">
                      {expandedCategories[category] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>
                {expandedCategories[category] && (
                  <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
                    {categoryTools.map((tool) => (
                      <div
                        key={tool.id}
                        className="px-3 py-2 hover:bg-blue-50 flex items-center justify-between cursor-pointer"
                        onClick={() => handleSelectTool(tool)}
                      >
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-2">
                            <span className="text-base">{getToolIcon(tool.type)}</span>
                          </div>
                          <div>
                            <div className="text-sm font-medium">{tool.name}</div>
                            <div className="text-xs text-gray-500">
                              ⌀{tool.diameter}mm • {tool.material}
                              {tool.numberOfFlutes && ` • ${tool.numberOfFlutes} flutes`}
                            </div>
                          </div>
                        </div>
                        <div className="flex space-x-1">
                          <button
                            onClick={(e) => handleDeleteTool(e, tool.id)}
                            className="p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100"
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
    <div className="flex flex-col">
      <div className="flex-1">
        {renderLibraryContent()}
      </div>
      <AddLibraryItem type="tools" onItemAdded={loadItems} />
    </div>
  );
};

export default LocalToolLibrary;