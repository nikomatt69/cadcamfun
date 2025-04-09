import React, { useState } from 'react';
import { Search, Folder, Package, ChevronDown, ChevronRight, X } from 'react-feather';
import { predefinedTools } from '@/src/lib/predefinedLibraries';

interface LibraryMenuToolsProps {
  onSelectTool: (tool: any) => void;
  onClose?: () => void;
}

const LibraryMenuTools: React.FC<LibraryMenuToolsProps> = ({ onSelectTool, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['endmill','miscellaneous']);
  
  // Organizza i componenti per categoria
  const organizeByCategory = () => {
    const toolTypes: Record<string, any[]> = {};
    
    predefinedTools.forEach(tool => {   
      const toolType = (tool as any).type || 'miscellaneous';
        if (!toolTypes[toolType]) {
        toolTypes[toolType] = [];
      }
      toolTypes[toolType].push(tool);
    });
    
    return toolTypes;
  };
  
  const toolTypes = organizeByCategory();
  
  // Filtra componenti in base alla ricerca
  const filterComponents = () => {
    if (!searchTerm.trim()) {
      return toolTypes;
    }
    
    const filteredCategories: Record<string, any[]> = {};
    const search = searchTerm.toLowerCase();
    
        Object.entries(toolTypes).forEach(([toolType, tools]) => {
      const filtered = tools.filter(tool => 
        tool.name.toLowerCase().includes(search) || 
        tool.description?.toLowerCase().includes(search) ||
        tool.tags?.some((tag: string) => tag.toLowerCase().includes(search))
      );
      
      if (filtered.length > 0) {
        filteredCategories[toolType] = filtered;
      }
    });
    
    return filteredCategories;
  };
  
  const filteredCategories = filterComponents();
  
  // Toggle espansione categoria
  const toggleCategory = (toolType: string) => {
    setExpandedCategories(prev => 
      prev.includes(toolType) 
        ? prev.filter(t => t !== toolType) 
        : [...prev, toolType]
    );
  };
  
  // Gestisci l'inizio del drag
  const handleDragStart = (event: React.DragEvent, tool: any) => {
    event.dataTransfer.setData('tool/id', tool.data || tool.name);
    event.dataTransfer.setData('tool/type', tool.type);
    event.dataTransfer.effectAllowed = 'copy';
    
    // Crea un'immagine personalizzata per il drag
    const dragPreview = document.createElement('div');
    dragPreview.className = 'bg-blue-500 text-white px-3 py-2 rounded';
            dragPreview.textContent = tool.name;
    document.body.appendChild(dragPreview);
    
    // Posiziona fuori dallo schermo per nasconderla (Firefox)
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-1000px';
    
    // Imposta come immagine di drag
    event.dataTransfer.setDragImage(dragPreview, 15, 15);
    
    // Rimuovere l'elemento dopo che il drag è iniziato
    setTimeout(() => {
      document.body.removeChild(dragPreview);
    }, 0);
  };
  
  return (
    <div className="w-full h-full bg-white dark:bg-gray-900 flex flex-col">
      <div className="flex justify-between items-center p-3 border-b dark:border-gray-700">
            <h2 className="text-lg font-semibold dark:text-white">Tool Library</h2>
        {onClose && (
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X size={20} />
          </button>
        )}
      </div>
      
      <div className="p-3 border-b dark:border-gray-700">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tools..."
            className="w-full px-10 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          />
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          {searchTerm && (
            <button 
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              onClick={() => setSearchTerm('')}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        {Object.keys(filteredCategories).length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No tools match your search
          </div>
        ) : (
          Object.entries(filteredCategories).map(([toolType, tools]) => (
            <div key={toolType} className="mb-2">
              <div 
                className="flex items-center p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md"
                onClick={() => toggleCategory(toolType)}
              >
                <Folder size={18} className="text-blue-500 mr-2" />
                <span className="flex-1 font-medium capitalize dark:text-white">{toolType}</span>
                {expandedCategories.includes(toolType) ? (
                  <ChevronDown size={18} className="text-gray-400" />
                ) : (
                  <ChevronRight size={18} className="text-gray-400" />
                )}
              </div>
              
              {expandedCategories.includes(toolType) && (
                <div className="ml-6 space-y-1 mt-1">
                  {tools.map((tool) => (
                    <div 
                      key={tool.data || tool.name}
                      className="flex items-center p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md group"
                        onClick={() => onSelectTool(tool)}
                      draggable
                      onDragStart={(e) => handleDragStart(e, tool)}
                    >
                      <Package size={16} className="text-gray-500 mr-2" />
                      <div className="flex-1">
                        <div className="text-sm dark:text-white">{tool.name}</div>
                        {tool.description && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                            {tool.description}
                          </div>
                        )}
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 text-xs bg-blue-500 text-white px-2 py-0.5 rounded">
                        Drag
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LibraryMenuTools;