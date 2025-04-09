import React, { useState, useRef, useEffect } from 'react';
import { 
  Save, 
  Upload, 
  Book, 
  Menu, 
  ArrowLeft, 
  ArrowRight, 
  Tool, 
  X,
  PlusSquare,
  MousePointer,
  ChevronDown,
  Copy,
  BookOpen,
  Package,
  Settings,
  ExternalLink
} from 'react-feather';
import { useRouter } from 'next/router';
import { useElementsStore } from 'src/store/elementsStore';
import { useCADSelection } from 'src/hooks/useCadSelection';
import toast from 'react-hot-toast';
import Link from 'next/link';
import Image from 'next/image';
import AIAssistantButton from '../ai/ai-new/AIAssistantButton';
import AIModal from '../components/AIModal';
import { isMobile } from 'react-device-detect';
import AIBottomSheet from '../components/AIBottomSheet';

import { useToolState } from '@/src/store/toolStore';
import { usePluginRegistry } from '@/src/hooks/usePluginRegistry';

interface EnhancedToolbarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  handleSaveProject: () => void;
  setDialogMode: (mode: 'import' | 'export') => void;
  setShowImportExportDialog: (show: boolean) => void;
  setShowLibraryView: (show: boolean) => void;
  setShowUnifiedLibrary: (show: boolean) => void;
  setShowFloatingToolbar: (show: boolean) => void;
  showFloatingToolbar: boolean;
  selectedLibraryComponent: string | null;
  setSelectedLibraryComponent: (componentId: string | null) => void;
  setIsPlacingComponent?: (isPlacing: boolean) => void;
}

// Custom plugin button component that matches your app's styling

const EnhancedToolbar: React.FC<EnhancedToolbarProps> = ({
  sidebarOpen,
  setSidebarOpen,
  handleSaveProject,
  setDialogMode,
  setShowImportExportDialog,
  setShowLibraryView,
  setShowUnifiedLibrary,
  setShowFloatingToolbar,
  showFloatingToolbar,
  selectedLibraryComponent,
  setSelectedLibraryComponent,
  setIsPlacingComponent
}) => {
  const router = useRouter();
  const { elements, selectedElement, undo, redo, selectedElements } = useElementsStore();
  const [showPluginsMenu, setShowPluginsMenu] = useState(false);
  const pluginsMenuRef = useRef<HTMLDivElement>(null);
  
  // Get active plugins
  const { plugins, registry } = usePluginRegistry();
  const activePlugins = plugins?.filter((p: any) => p.state === 'active') || [];
  
  // Create selection data
  const createSelectionData = () => {
    return {
      elements: elements.filter(element => selectedElements.includes(element.id)),
    };
  };
  
  const [showElementsPopup, setShowElementsPopup] = useState(false);
  const elementsPopupRef = useRef<HTMLDivElement>(null);
  
  // Close popups when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (elementsPopupRef.current && !elementsPopupRef.current.contains(event.target as Node)) {
        setShowElementsPopup(false);
      }
      if (pluginsMenuRef.current && !pluginsMenuRef.current.contains(event.target as Node)) {
        setShowPluginsMenu(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle creating a component from selected element
  const handleCreateComponentFromSelected = () => {
    if (!selectedElement) return;
    
    // Save the selected element ID to localStorage so the component page can access it
    localStorage.setItem('cadSelectedElementForComponent', JSON.stringify(selectedElement));
    
    // Redirect to the component creation page with the selectedElement data
    router.push({
      pathname: '/components',
      query: { createFromCad: 'true' }
    });
    
    toast.success('Element prepared for component creation');
  };

  const handleCreateComponentFromSelection = () => {
    const selectionData = createSelectionData();
    if (!selectionData || !selectionData.elements || selectionData.elements.length === 0) {
      toast.error('No elements selected');
      return;
    }
    
    // Save the selected elements IDs to localStorage
    localStorage.setItem('cadSelectionForComponent', JSON.stringify(selectionData));
    
    // Redirect to the component creation page
    router.push({
      pathname: '/components',
      query: { createFromSelection: 'true' }
    });
    
    toast.success('Selection prepared for component creation');
    setShowElementsPopup(false);
  };

  const handleStartPlacement = () => {
    if (setIsPlacingComponent && selectedLibraryComponent) {
      setIsPlacingComponent(true);
    }
  };

  // Get selected elements data
  const selectionData = createSelectionData();
  const selectedElementsCount = selectionData?.elements?.length || 0;
  
  // Navigate to plugin manager
  

  return (
    <div className="bg-white dark:bg-gray-900 border-b w-full px-4 py-2 rounded-xl flex items-center justify-between">
      <div className="flex w-max rounded-xl items-center">
        <button
          className="mr-2 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <Menu size={20} className="text-gray-600 dark:text-gray-400" />
        </button>
        {isMobile ? 
          <Link href="/" className="">
            <div className=""></div>
          </Link> 
        : 
          <Link href="/" className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <img
                className="h-14 w-auto"
                src="/logo.png"
                alt="CAD/CAM FUN"
              />
            </div>
          </Link>
        }
        <div className="ml-6 flex items-center space-x-2">
          <button
            onClick={handleSaveProject}
            className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md shadow-sm flex items-center"
            title="Save Project"
          >
            <Save size={16} className="text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={() => { setDialogMode('import'); setShowImportExportDialog(true); }}
            className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md shadow-sm flex items-center"
            title="Import Project"
          >
            <Upload size={16} className="text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={() => setShowUnifiedLibrary(true)}
            className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md shadow-sm flex items-center"
            title="Unified Library"
          >
            <BookOpen size={16} className="text-gray-600 dark:text-gray-400" />
          </button>
          
          {/* Create Component from Selected Element button - only shows when element is selected */}
          {selectedElement && (
            <button
              onClick={handleCreateComponentFromSelected}
              className="px-3 py-1.5 bg-green-50 dark:bg-green-900 border border-green-300 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-800 text-green-700 dark:text-green-300 rounded-md shadow-sm flex items-center animate-pulse"
              title="Create Component from Selected Element"
            >
              <PlusSquare size={16} className="mr-1.5" />
              <span className="text-sm">Create Component</span>
            </button>
          )}
          
          <div className="h-5 border-l border-gray-300 dark:border-gray-700 mx-1"></div>
          <button
            onClick={undo}
            className="p-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md shadow-sm"
            title="Undo"
          >
            <ArrowLeft size={16} className="text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={redo}
            className="p-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md shadow-sm"
            title="Redo"
          >
            <ArrowRight size={16} className="text-gray-600 dark:text-gray-400" />
          </button>
          <div className="h-5 border-l border-gray-300 dark:border-gray-700 mx-1"></div>
          <button
            onClick={() => setShowFloatingToolbar(!showFloatingToolbar)}
            className={`px-3 py-1.5 border shadow-sm rounded-md flex items-center ${
              showFloatingToolbar 
                ? 'bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300' 
                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
            title={showFloatingToolbar ? "Hide Floating Toolbar" : "Show Floating Toolbar"}
          >
            <Tool size={16} className="" />
          </button>
          
          {/* Plugin manager button */}
          <div className="relative">
            <button
              onClick={() => setShowPluginsMenu(!showPluginsMenu)}
              className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md shadow-sm flex items-center"
              title="Plugins"
            >
              <Package size={16} className="text-gray-600 dark:text-gray-400 mr-1" />
              <span className="text-sm">Plugins</span>
              <ChevronDown size={14} className="ml-1 text-gray-500" />
              {activePlugins.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-xs text-white">
                  {activePlugins.length}
                </span>
              )}
            </button>
            
           </div>
          {/* --- End Example --- */}
          
          <AIBottomSheet />
          
          {/* Plugin toolbar extensions - left section */}

         
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {/* Plugin toolbar extensions - right section */}

        {/* Indicator for selected component */}
        {selectedLibraryComponent && (
          <div className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-800 rounded-md flex items-center">
            <span className="text-xs text-blue-700 dark:text-blue-300 mr-2">Component selected:</span>
            <span className="text-sm font-medium">Ready for placement</span>
            <button 
              onClick={handleStartPlacement}
              className="ml-2 px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md flex items-center"
              title="Place component"
            >
              <MousePointer size={14} className="mr-1" />
              <span className="text-xs">Place</span>
            </button>
            <button 
              onClick={() => setSelectedLibraryComponent(null)}
              className="ml-2 p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-700 text-blue-700 dark:text-blue-300"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="relative">
          <button
            onClick={() => setShowElementsPopup(!showElementsPopup)}
            className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-md flex items-center bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">Elements:</span>
            <span className="text-sm font-medium">{elements.length}</span>
            {selectedElementsCount > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded-full">
                {selectedElementsCount} selected
              </span>
            )}
            <ChevronDown size={14} className="ml-1 text-gray-500" />
          </button>
          
          {showElementsPopup && (
            <div 
              ref={elementsPopupRef}
              className="absolute top-full right-0 mt-1 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50"
            >
              <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Selected Elements ({selectedElementsCount})
                </h3>
                {selectedElementsCount > 0 && (
                  <button
                    onClick={handleCreateComponentFromSelection}
                    className="px-2 py-1 bg-green-500 hover:bg-green-600 text-white text-xs rounded-md flex items-center"
                  >
                    <PlusSquare size={14} className="mr-1" />
                    Create Component
                  </button>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto p-2">
                {selectedElementsCount > 0 ? (
                  <div className="space-y-1">
                    {selectedElement?.elements?.map((element: any, index: number) => (
                      <div key={selectedElement?.elements.id} className="flex items-center justify-between p-1.5 bg-gray-50 dark:bg-gray-700 rounded text-xs">
                        <div className="flex items-center">
                          <div 
                            className="w-3 h-3 rounded-full mr-2" 
                            style={{ backgroundColor: selectedElement?.elements.id.color || '#1e88e5' }}
                          />
                          <span className="font-medium">{element.type}</span>
                          <span className="ml-2 text-gray-500 dark:text-gray-400 font-mono">
                            {element.id.substring(0, 12)}...
                          </span>
                        </div>
                        <button 
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                          onClick={() => {
                            navigator.clipboard.writeText(element.id);
                            toast.success('Element ID copied to clipboard');
                          }}
                          title="Copy ID"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                    {selectedElement?.elements?.map && (
                      <div className="px-3 py-1.5 border border-green-200 dark:border-green-800 rounded-md flex items-center bg-green-50 dark:bg-green-900">
                        <span className="text-xs text-green-600 dark:text-green-300 mr-2">Selected:</span>
                        <span className="text-sm font-medium">{selectedElement.id.substring(0, 8)}...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {selectedElement && (
          <div className="px-3 py-1.5 border border-green-200 dark:border-green-800 rounded-md flex items-center bg-green-50 dark:bg-green-900">
            <span className="text-xs text-green-600 dark:text-green-300 mr-2">Selected:</span>
            <span className="text-sm font-medium">{selectedElement.id.substring(0, 8)}...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedToolbar;