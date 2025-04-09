// src/components/cad/UnifiedToolsBrowser.tsx
import React, { useState, useEffect } from 'react';
import { Tool, Scissors, Database, Search, RefreshCw, CornerDownRight, Circle } from 'react-feather';
import { useLocalToolsLibraryStore } from '@/src/store/localToolsLibraryStore';
import { predefinedTools } from '@/src/lib/predefinedLibraries';
import { fetchTools } from '@/src/lib/api/libraries';

export type ToolLibrarySource = 'local' | 'predefined' | 'api';

export interface ToolLibraryItem {
  id: string;
  name: string;
  description?: string;
  type?: string;
  diameter?: number;
  material?: string;
  properties?: Record<string, any>;
  data?: any;
  source: ToolLibrarySource;
}

interface UnifiedToolsBrowserProps {
  onSelectTool: (tool: ToolLibraryItem) => void;
}

const UnifiedToolsBrowser: React.FC<UnifiedToolsBrowserProps> = ({ onSelectTool }) => {
  // State
  const [tools, setTools] = useState<ToolLibraryItem[]>([]);
  const [filteredTools, setFilteredTools] = useState<ToolLibraryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeSource, setActiveSource] = useState<ToolLibrarySource | 'all'>('all');
  
  // Access local store
  const { tools: localTools, loadLibrary } = useLocalToolsLibraryStore();
  
  // Load all tools from different sources
  const loadAllTools = async () => {
    setIsLoading(true);
    try {
      // Load local tools
      loadLibrary();
      
      // Format tools from all sources
      let allTools: ToolLibraryItem[] = [];
      
      // Add local tools
      const formattedLocalTools = localTools.map(tool => ({
        ...tool,
        id: tool.id,
        source: 'local' as ToolLibrarySource
      }));
      allTools = [...allTools, ...formattedLocalTools];
      
      // Add predefined tools
      const formattedPredefined = predefinedTools.map(tool => ({
        ...tool,
        id: `predefined-${tool.name?.replace(/\s+/g, '-').toLowerCase()}`|| tool.name,
        source: 'predefined' as ToolLibrarySource,
        type: tool.type || 'unknown' // Provide default value for null type
      })) as ToolLibraryItem[];
      
      allTools = [...allTools, ...formattedPredefined];
      
      // Try to load from API if available
      try {
        const { data: apiTools } = await fetchTools();
        if (apiTools) {
          const formattedApiTools = apiTools.map((tool: any) => ({
            ...tool,
            source: 'api' as ToolLibrarySource
          }));
          allTools = [...allTools, ...formattedApiTools];
        }
      } catch (error) {
        console.log('API tools not available');
      }
      
      setTools(allTools);
      setFilteredTools(allTools);
    } catch (error) {
      console.error('Error loading tools:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Initial load
  useEffect(() => {
    loadAllTools();
  }, []);
  
  // Filter tools when search or source changes
  useEffect(() => {
    let filtered = tools;
    
    // Filter by source
    if (activeSource !== 'all') {
      filtered = filtered.filter(tool => tool.source === activeSource);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(tool => 
        tool.name.toLowerCase().includes(query) ||
        (tool.description && tool.description.toLowerCase().includes(query)) ||
        (tool.type && tool.type.toLowerCase().includes(query)) ||
        (tool.material && tool.material.toLowerCase().includes(query))
      );
    }
    
    setFilteredTools(filtered);
  }, [tools, searchQuery, activeSource]);
  
  // Get icon for tool type
  const getToolIcon = (tool: ToolLibraryItem) => {
    const type = tool.type?.toLowerCase() || '';
    
    if (type.includes('mill') || type.includes('endmill')) return <CornerDownRight className="text-blue-500" />;
    if (type.includes('drill')) return <Circle className="text-red-500" />;
    if (type.includes('cutter')) return <Scissors className="text-green-500" />;
    
    return <Tool className="text-gray-500" />;
  };
  
  // Get source badge style
  const getSourceBadgeStyle = (source: ToolLibrarySource) => {
    switch (source) {
      case 'local': return 'bg-green-100 text-green-800';
      case 'predefined': return 'bg-blue-100 text-blue-800';
      case 'api': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-gray-700">Unified Tools</h3>
        <button 
          onClick={loadAllTools}
          className="p-1 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>
      
      {/* Search and filters */}
      <div className="space-y-2">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
            <Search size={14} className="text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search tools..."
            className="block w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded-md"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex space-x-1">
          <button
            className={`px-2 py-1 text-xs rounded-md ${activeSource === 'all' ? 'bg-gray-200' : 'bg-gray-100'}`}
            onClick={() => setActiveSource('all')}
          >
            All
          </button>
          <button
            className={`px-2 py-1 text-xs rounded-md ${activeSource === 'local' ? 'bg-green-200' : 'bg-gray-100'}`}
            onClick={() => setActiveSource('local')}
          >
            Local
          </button>
          <button
            className={`px-2 py-1 text-xs rounded-md ${activeSource === 'predefined' ? 'bg-blue-200' : 'bg-gray-100'}`}
            onClick={() => setActiveSource('predefined')}
          >
            Standard
          </button>
          <button
            className={`px-2 py-1 text-xs rounded-md ${activeSource === 'api' ? 'bg-purple-200' : 'bg-gray-100'}`}
            onClick={() => setActiveSource('api')}
          >
            API
          </button>
        </div>
      </div>
      
      {/* Tools list */}
      <div className="overflow-y-auto max-h-64 border border-gray-200 rounded-md">
        {isLoading ? (
          <div className="p-4 flex justify-center">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 rounded-full border-t-transparent"></div>
          </div>
        ) : filteredTools.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">
            No tools found
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredTools.map(tool => (
              <div 
                key={`${tool.source}-${tool.id}`} 
                className="p-2 hover:bg-gray-50 cursor-pointer"
                onClick={() => onSelectTool(tool)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="p-1 bg-gray-100 rounded-md mr-2">
                      {getToolIcon(tool)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{tool.name}</div>
                      <div className="flex items-center gap-2">
                        {tool.type && (
                          <div className="text-xs text-gray-500">{tool.type}</div>
                        )}
                        {tool.diameter && (
                          <div className="text-xs text-gray-500">∅{tool.diameter}mm</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={`px-1.5 py-0.5 text-xs rounded-full ${getSourceBadgeStyle(tool.source as ToolLibrarySource)}`}>
                    {tool.source}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedToolsBrowser;