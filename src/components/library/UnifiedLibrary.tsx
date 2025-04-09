// src/components/library/UnifiedLibrary.tsx
import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Grid, 
  List, 
  Database, 
  HardDrive, 
  Book, 
  Plus, 
  Tool, 
  Layers, 
  Package, 
  Filter, 
  RefreshCw,
  ChevronDown
} from 'react-feather';
import {
  useUnifiedLibrary,
  LibraryItem,
  ComponentLibraryItem,
  MaterialLibraryItem,
  ToolLibraryItem,
  LibrarySource,
  LibraryEntityType,
  LibraryFilter
} from '@/src/hooks/useUnifiedLibrary';

// Define tabs for the library sources
const LIBRARY_SOURCES: Array<{ id: LibrarySource; label: string; icon: React.ReactNode }> = [
  { id: 'api', label: 'Main Library', icon: <Database size={16} /> },
  { id: 'local', label: 'Local Library', icon: <HardDrive size={16} /> },
  { id: 'predefined', label: 'Standard Library', icon: <Book size={16} /> }
];

interface UnifiedLibraryProps<T extends LibraryItem> {
  entityType: LibraryEntityType;
  onSelectItem?: (item: T) => void;
  onSaveItem?: (item: T) => void;
  showCloseButton?: boolean;
  onClose?: () => void;
  initialSource?: LibrarySource;
}

export default function UnifiedLibrary<T extends LibraryItem>({
  entityType,
  onSelectItem,
  onSaveItem,
  showCloseButton = false,
  onClose,
  initialSource = 'api'
}: UnifiedLibraryProps<T>) {
  // State for UI
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<LibraryFilter>({});
  
  // Get library data from the hook
  const {
    items,
    isLoading,
    error,
    activeSource,
    setActiveSource,
    refreshLibrary,
    sourceStats
  } = useUnifiedLibrary<T>(entityType, initialSource);
  
  // Apply search filter
  const filteredItems = searchQuery
    ? items.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : items;
  
  // Handle item selection
  const handleSelectItem = (item: T) => {
    if (onSelectItem) {
      onSelectItem(item);
    }
  };
  
  // Handle item saving to local library
  const handleSaveItem = (item: T) => {
    if (onSaveItem) {
      onSaveItem(item);
    }
  };
  
  // Handle search input
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };
  
  // Handle filter change
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };
  
  // Get icon for item based on entity type
  const getItemIcon = (item: T) => {
    if (entityType === 'components') {
      const component = item as unknown as ComponentLibraryItem;
      const itemType = component.type || '';
      
      if (itemType === 'mechanical') return <Tool size={20} className="text-blue-500" />;
      if (itemType === 'electronic') return <Package size={20} className="text-green-500" />;
      if (itemType === 'fixture') return <Grid size={20} className="text-purple-500" />;
      
      return <Package size={20} className="text-gray-500" />;
    }
    
    if (entityType === 'materials') {
      const material = item as unknown as MaterialLibraryItem;
      return (
        <div 
          className="w-5 h-5 rounded-md border border-gray-300"
          style={{ backgroundColor: material.color || '#ccc' }}
        ></div>
      );
    }
    
    if (entityType === 'tools') {
      const tool = item as unknown as ToolLibraryItem;
      const toolType = tool.type || '';
      
      if (toolType === 'endmill') return <Tool size={20} className="text-blue-500" />;
      if (toolType === 'drillbit') return <Tool size={20} className="text-green-500" />;
      if (toolType === 'facemill') return <Tool size={20} className="text-orange-500" />;
      
      return <Tool size={20} className="text-gray-500" />;
    }
    
    return <Package size={20} className="text-gray-500" />;
  };
  
  // Render library header
  const renderHeader = () => (
    <div className="bg-gray-50 border-b border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-800">
          {entityType === 'components' ? 'Components Library' : 
           entityType === 'materials' ? 'Materials Library' : 
           'Tools Library'}
        </h2>
        
        {showCloseButton && onClose && (
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      
      <div className="flex flex-col space-y-3">
        {/* Search bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={`Search ${entityType}...`}
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
        
        {/* Library source tabs */}
        <div className="flex border border-gray-300 rounded-md overflow-hidden">
          {LIBRARY_SOURCES.map(source => (
            <button
              key={source.id}
              className={`flex-1 py-2 px-3 text-sm flex items-center justify-center space-x-1
                ${activeSource === source.id 
                  ? 'bg-blue-50 text-blue-600 font-medium' 
                  : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              onClick={() => setActiveSource(source.id)}
            >
              {source.icon}
              <span>{source.label}</span>
              <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded-full">
                {sourceStats[source.id]}
              </span>
            </button>
          ))}
        </div>
        
        {/* View controls */}
        <div className="flex justify-between">
          <div className="flex items-center space-x-2">
            <button
              className={`p-2 rounded-md ${viewMode === 'grid' 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-gray-500 hover:bg-gray-100'}`}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <Grid size={16} />
            </button>
            <button
              className={`p-2 rounded-md ${viewMode === 'list' 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-gray-500 hover:bg-gray-100'}`}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <List size={16} />
            </button>
            <button
              className={`p-2 rounded-md ${showFilters 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-gray-500 hover:bg-gray-100'}`}
              onClick={() => setShowFilters(!showFilters)}
              title="Filter"
            >
              <Filter size={16} />
            </button>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-md"
              onClick={() => refreshLibrary()}
              title="Refresh Library"
              disabled={isLoading}
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        
        {/* Filters panel */}
        {showFilters && (
          <div className="p-3 border border-gray-200 rounded-md bg-white">
            <h3 className="font-medium text-sm mb-2">Filters</h3>
            
            <div className="grid grid-cols-2 gap-3">
              {/* Type filter - for components and tools */}
              {(entityType === 'components' || entityType === 'tools') && (
                <div>
                  <label htmlFor="type" className="block text-xs font-medium text-gray-700 mb-1">
                    Type
                  </label>
                  <select
                    id="type"
                    name="type"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                    value={filters.type || ''}
                    onChange={handleFilterChange}
                  >
                    <option value="">All Types</option>
                    {entityType === 'components' && (
                      <>
                        <option value="mechanical">Mechanical</option>
                        <option value="electronic">Electronic</option>
                        <option value="fixture">Fixture</option>
                        <option value="enclosure">Enclosure</option>
                      </>
                    )}
                    {entityType === 'tools' && (
                      <>
                        <option value="endmill">End Mill</option>
                        <option value="ballendmill">Ball End Mill</option>
                        <option value="drillbit">Drill Bit</option>
                        <option value="chamfermill">Chamfer Mill</option>
                      </>
                    )}
                  </select>
                </div>
              )}
              
              {/* Material filter - for tools */}
              {entityType === 'tools' && (
                <div>
                  <label htmlFor="material" className="block text-xs font-medium text-gray-700 mb-1">
                    Material
                  </label>
                  <select
                    id="material"
                    name="material"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                    value={filters.material || ''}
                    onChange={handleFilterChange}
                  >
                    <option value="">All Materials</option>
                    <option value="HSS">HSS</option>
                    <option value="Carbide">Carbide</option>
                    <option value="Cobalt">Cobalt</option>
                    <option value="Diamond">Diamond</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
  
  // Render library content
  const renderContent = () => {
    if (isLoading && filteredItems.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64 py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-500">Loading library items...</p>
        </div>
      );
    }
    
    if (error) {
      return (
        <div className="bg-red-50 p-4 rounded-md m-4">
          <h3 className="text-red-800 font-medium mb-1">Error</h3>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      );
    }
    
    if (filteredItems.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4">
          {searchQuery ? (
            <>
              <Search size={32} className="text-gray-400 mb-3" />
              <p className="text-gray-500 mb-1">No items match your search</p>
              <p className="text-gray-400 text-sm">Try adjusting your search or filters</p>
            </>
          ) : (
            <>
              {entityType === 'components' && <Package size={32} className="text-gray-400 mb-3" />}
              {entityType === 'materials' && <Layers size={32} className="text-gray-400 mb-3" />}
              {entityType === 'tools' && <Tool size={32} className="text-gray-400 mb-3" />}
              <p className="text-gray-500 mb-1">No items in this library</p>
              <p className="text-gray-400 text-sm">
                {activeSource === 'local' 
                  ? `Add ${entityType} to your local library` 
                  : `No ${entityType} available`}
              </p>
            </>
          )}
        </div>
      );
    }
    
    // Grid view
    if (viewMode === 'grid') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {filteredItems.map(item => (
            <div
              key={item.id}
              className="border border-gray-200 rounded-md bg-white shadow-sm hover:shadow transition-shadow overflow-hidden cursor-pointer"
              onClick={() => handleSelectItem(item)}
            >
              <div className="h-32 bg-gray-50 flex items-center justify-center">
                
                  
                  <div className="flex items-center justify-center w-16 h-16">
                    {getItemIcon(item)}
                  </div>
            
              </div>
              
              <div className="p-3">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-medium text-gray-900 truncate">{item.name}</h3>
                  {item.type && (
                    <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                      {item.type}
                    </span>
                  )}
                </div>
                
                {item.description && (
                  <p className="text-gray-500 text-sm line-clamp-2">{item.description}</p>
                )}
                
                {/* Item-specific details */}
                {entityType === 'tools' && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                      ⌀{(item as unknown as ToolLibraryItem).diameter}mm
                    </span>
                    {(item as unknown as ToolLibraryItem).numberOfFlutes && (
                      <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        {(item as unknown as ToolLibraryItem).numberOfFlutes} flutes
                      </span>
                    )}
                    <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                      {(item as unknown as ToolLibraryItem).material}
                    </span>
                  </div>
                )}
                
                {entityType === 'materials' && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(item as unknown as MaterialLibraryItem).density !== undefined && (
                      <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        {(item as unknown as MaterialLibraryItem).density} g/cm³
                      </span>
                    )}
                    {(item as unknown as MaterialLibraryItem).hardness !== undefined && (
                      <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        {(item as unknown as MaterialLibraryItem).hardness} HRC
                      </span>
                    )}
                  </div>
                )}
                
                {/* Action buttons - show only in API or predefined views */}
                {(activeSource === 'api' || activeSource === 'predefined') && onSaveItem && (
                  <div className="mt-3 pt-2 border-t border-gray-100 flex justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveItem(item);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      <HardDrive size={12} className="mr-1" />
                      Save to Library
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    }
    
    // List view
    return (
      <div className="overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              {(entityType === 'components' || entityType === 'tools') && (
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
              )}
              {entityType === 'tools' && (
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              )}
              {entityType === 'materials' && (
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Properties
                </th>
              )}
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredItems.map(item => (
              <tr 
                key={item.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => handleSelectItem(item)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center">
                      {getItemIcon(item)}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{item.name}</div>
                      {item.description && (
                        <div className="text-sm text-gray-500 truncate max-w-xs">{item.description}</div>
                      )}
                    </div>
                  </div>
                </td>
                
                {/* Type column for components and tools */}
                {(entityType === 'components' || entityType === 'tools') && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    {item.type && (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {item.type}
                      </span>
                    )}
                  </td>
                )}
                
                {/* Tool-specific details */}
                {entityType === 'tools' && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        ⌀{(item as unknown as ToolLibraryItem).diameter}mm
                      </span>
                      <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        {(item as unknown as ToolLibraryItem).material}
                      </span>
                    </div>
                  </td>
                )}
                
                {/* Material-specific details */}
                {entityType === 'materials' && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {(item as unknown as MaterialLibraryItem).color && (
                        <div 
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: (item as unknown as MaterialLibraryItem).color || '#ccc' }}
                        ></div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {(item as unknown as MaterialLibraryItem).density !== undefined && (
                          <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                            {(item as unknown as MaterialLibraryItem).density} g/cm³
                          </span>
                        )}
                        {(item as unknown as MaterialLibraryItem).hardness !== undefined && (
                          <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                            {(item as unknown as MaterialLibraryItem).hardness} HRC
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                )}
                
                {/* Actions column */}
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {(activeSource === 'api' || activeSource === 'predefined') && onSaveItem && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveItem(item);
                      }}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Save to Library
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  
  // Add new item button (only for local library)
  const renderAddButton = () => {
    if (activeSource !== 'local') return null;
    
    return (
      <div className="p-4 border-t">
        <button
          className="w-full flex items-center justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          onClick={() => {
            // This would open a form to add a new item to the local library
            // Implementation would depend on your application flow
          }}
        >
          <Plus size={16} className="mr-1" />
          Add New {entityType === 'components' ? 'Component' : entityType === 'materials' ? 'Material' : 'Tool'}
        </button>
      </div>
    );
  };
  
  return (
    <div className="flex flex-col h-full border border-gray-200 rounded-lg overflow-hidden bg-white shadow-md">
      {renderHeader()}
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
      {renderAddButton()}
    </div>
  );
}