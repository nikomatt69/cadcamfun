// src/components/library/PredefinedToolpathsLibrary.tsx
import React, { useState, useEffect } from 'react';
import { X, Search, Filter, Download } from 'react-feather';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface PredefinedLibraryProps {
  libraryType: string;
  onSelectItem: (item: any) => void;
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

const PredefinedToolpathsLibrary: React.FC<PredefinedLibraryProps> = ({ 
  libraryType, 
  onSelectItem, 
  isOpen, 
  onClose,
  projectId 
}) => {
  const [items, setItems] = useState<any[]>([]);
  const [filteredItems, setFilteredItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    type: '',
    operationType: '',
    category: ''
  });
  
  // Fetch library items
  useEffect(() => {
    const fetchLibraryItems = async () => {
      setIsLoading(true);
      
      try {
        // Build query params
        const query = new URLSearchParams();
        if (filters.type) query.append('type', filters.type);
        if (filters.operationType) query.append('operationType', filters.operationType);
        if (filters.category) query.append('category', filters.category);
        if (searchTerm) query.append('search', searchTerm);
        query.append('projectId', projectId);
        
        const response = await fetch(`/api/${libraryType}/library?${query.toString()}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch ${libraryType} library`);
        }
        
        const data = await response.json();
        // Ensure we have an array of items
        const itemsArray = Array.isArray(data) ? data : [];
        setItems(itemsArray);
        setFilteredItems(itemsArray);
      } catch (error) {
        console.error(`Error fetching ${libraryType} library:`, error);
        toast.error(`Failed to load ${libraryType} library`);
      } finally {
        setIsLoading(false);
      }
    };
    
    if (isOpen) {
      fetchLibraryItems();
    }
  }, [isOpen, libraryType, filters, searchTerm, projectId]);
  
  // Filter items based on search term
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };
  
  // Handle filter changes
  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <motion.div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Standard {libraryType === 'toolpaths' ? 'Toolpaths' : 'Components'} Library
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex flex-col md:flex-row md:space-x-4 space-y-4 md:space-y-0">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={handleSearch}
                placeholder="Search library..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            {libraryType === 'toolpaths' && (
              <>
                <div className="w-full md:w-40">
                  <select
                    name="type"
                    value={filters.type}
                    onChange={handleFilterChange}
                    className="block w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Types</option>
                    <option value="mill">Mill</option>
                    <option value="lathe">Lathe</option>
                    <option value="3dprinter">3D Printer</option>
                  </select>
                </div>
                
                <div className="w-full md:w-40">
                  <select
                    name="operationType"
                    value={filters.operationType}
                    onChange={handleFilterChange}
                    className="block w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Operations</option>
                    <option value="contour">Contour</option>
                    <option value="pocket">Pocket</option>
                    <option value="drill">Drill</option>
                    <option value="profile">3D Profile</option>
                  </select>
                </div>
              </>
            )}
            
            <div className="w-full md:w-40">
              <select
                name="category"
                value={filters.category}
                onChange={handleFilterChange}
                className="block w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Categories</option>
                <option value="basic">Basic</option>
                <option value="advanced">Advanced</option>
                <option value="manufacturing">Manufacturing</option>
                <option value="education">Education</option>
              </select>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <Filter size={48} className="mx-auto mb-4 text-gray-400 dark:text-gray-600" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No items found</h3>
              <p className="text-gray-500 dark:text-gray-400">
                Try adjusting your search or filters to find what you are looking for.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {filteredItems.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => onSelectItem(item)}
                  >
                    <div className="h-40 bg-gray-100 dark:bg-gray-800 flex items-center justify-center relative">
                      {item.thumbnail ? (
                        <img 
                          src={item.thumbnail} 
                          alt={item.name} 
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="text-gray-400 dark:text-gray-600 text-6xl font-thin">
                          {libraryType === 'toolpaths' ? '⚙️' : '📦'}
                        </div>
                      )}
                      
                      {item.type && (
                        <span className="absolute top-2 right-2 px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300">
                          {item.type}
                        </span>
                      )}
                      
                      {item.operationType && (
                        <span className="absolute top-2 left-2 px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300">
                          {item.operationType}
                        </span>
                      )}
                    </div>
                    
                    <div className="p-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 truncate">
                        {item.name}
                      </h3>
                      
                      {item.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {item.tags.slice(0, 3).map((tag: string, index: number) => (
                            <span 
                              key={index}
                              className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                            >
                              {tag}
                            </span>
                          ))}
                          {item.tags.length > 3 && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                              +{item.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                      
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {item.category || 'Standard'}
                        </span>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectItem(item);
                          }}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                          Use This
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default PredefinedToolpathsLibrary;