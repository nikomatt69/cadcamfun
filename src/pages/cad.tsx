// src/pages/cad.tsx
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { logger, metrics } from '@/src/lib';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { ChevronLeft, ChevronRight, Tool, Box, Cpu } from 'react-feather';
import PropertyPanel from '../components/cad/PropertyPanel';
import StatusBar from '../components/cad/StatusBar';
import TransformToolbar from '../components/cad/TrasformToolbar';
import FloatingToolbar from '../components/cad/FloatingToolbar';
import LocalCadLibraryView from 'src/components/library/LocalCadLibraryView';
import ImportExportDialog from 'src/components/cad/ImportExportDialog';
import { useCADStore } from 'src/store/cadStore';
import { useElementsStore } from 'src/store/elementsStore';
import { useLayerStore } from 'src/store/layerStore';
import EnhancedSidebar from '../components/cad/EnanchedSidebar';
import AIDesignAssistant from '../components/ai/AIDesignAssistant';
import Loading from '../components/ui/Loading';
import EnhancedSidebar2 from '../components/cam/EnanchedSidebar2';
import MetaTags from '../components/layout/Metatags';
import { useLocalLibrary } from '../hooks/useLocalLibrary';
import UnifiedLibraryModal from '../components/library/UnifiedLibraryModal';
import { ComponentLibraryItem, ToolLibraryItem } from '@/src/hooks/useUnifiedLibrary';
import toast from 'react-hot-toast';
import EnhancedToolbar from '../components/cad/EnhancedToolbar';
import { useAI } from '../components/ai/ai-new/AIContextProvider';
import PluginSidebar from '../components/plugins/PluginSidebar';

const DrawingEnabledCADCanvas = dynamic(() => import('../components/cam/DrawingEnabledCADCanvas'), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800"><Loading /></div>
});


// Define structure for cross-window subscription
interface CrossWindowSubscription {
  pluginId: string;
  eventType: string;
  handlerId: string;
  sourceWindow: Window;
}

// Add interface for window augmentation (if not already present globally)
// This is needed for the component exposure workaround
interface CustomWindow extends Window {
  __pluginComponents?: Record<string, Record<string, React.ComponentType<any>>>;
}
declare const window: CustomWindow;

export default function CADPage() {
  // Enterprise: Track page views
  useEffect(() => {
    logger.info('Page viewed', { 
      page: window.location.pathname,
      timestamp: new Date().toISOString() 
    });
    metrics.increment('page.views');
  }, []);

  const { data: session, status } = useSession();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'tools' | 'layers' | 'settings' >('tools');
  const { viewMode, gridVisible, axisVisible } = useCADStore();
  const { elements, selectedElement, selectElement, undo, redo, addElement } = useElementsStore();
  const { layers } = useLayerStore();
  const [showImportExportDialog, setShowImportExportDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'import' | 'export'>('export');
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(true);
  const [selectedLibraryComponent, setSelectedLibraryComponent] = useState<string | null>(null);
  const [showLibraryView, setShowLibraryView] = useState(false);
  // Add state for the unified library modal
  const [showUnifiedLibrary, setShowUnifiedLibrary] = useState(false);
  const [isPlacingComponent, setIsPlacingComponent] = useState(false);
  const [description, setDescription] = useState('');
  
  const { addElements } = useElementsStore();
  
  const [showPluginSidebar, setShowPluginSidebar] = useState(false);
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  
  
  // State to manage subscriptions from plugin windows
  const [crossWindowSubscriptions, setCrossWindowSubscriptions] = useState<CrossWindowSubscription[]>([]);
  const [activeRightPanel, setActiveRightPanel] = useState<'proprieties' | 'trasform' | 'ai'>('proprieties');
  // Get state management functions from Zustand stores
  const { 
    elements: getElementsState, 
    updateElement: updateElementState, 
    deleteElement: deleteElementState, 
  } = useElementsStore.getState(); // Get non-reactive state functions
  const subscribeToAppEvents = (eventType: string, handler: (event: any) => void): (() => void) => {
    logger.warn(`PluginManager: Subscribing to ${eventType}`);
    return () => {
      logger.warn(`PluginManager: Unsubscribing from ${eventType}`);
    };
  };



 
  const [prompt, setPrompt] = useState('');
  const { textToCAD, state } = useAI();
  const [statuss, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  
  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    setStatus('processing');
    
    try {
      const result = await textToCAD(prompt);
      
      if (result.success) {
        setStatus('success');
        // Usa result.data...
      } else {
        setStatus('error');
      }
    } catch (error) {
      setStatus('error');
    }
  };
  
  const { loadCadDrawing } = useLocalLibrary();  // Move the hook call to the top level
  useEffect(() => {
    const loadComponentFromStorage = async () => {
      if (!router.query.loadComponent) return;
      
      const componentId = router.query.loadComponent as string;
      logger.debug('Loading component with ID:', componentId);
      
      try {
        const storedComponent = localStorage.getItem('componentToLoadInCAD');
        if (!storedComponent) {
          logger.error('No component data found in localStorage');
          toast.error('Component data not found');
          return;
        }
        
        logger.debug('Retrieved component data from localStorage');
        const componentData = JSON.parse(storedComponent);
        logger.debug('Parsed component data:', componentData);
        
        if (!componentData || !componentData.id || componentData.id !== componentId) {
          logger.error('Invalid component data or ID mismatch');
          toast.error('Invalid component data');
          return;
        }
        
        const newElement = {
          id: `component-${Date.now()}`,
          type: 'component',
          x: 0,
          y: 0,
          z: 0,
          name: componentData.name || 'Unnamed Component',
          componentId: componentData.id,
          data: componentData.data,
          layerId: layers.length > 0 ? layers[0].id : 'default'
        };
        
        logger.debug('Adding component as CAD element:', newElement);
        
        addElement(newElement);
        toast.success(`Component '${componentData.name}' loaded successfully`);
        
        localStorage.removeItem('componentToLoadInCAD');
        localStorage.removeItem('componentToLoadInCAD_timestamp');
        
        const { loadComponent, loadTimestamp, ...otherParams } = router.query;
        router.replace({
          pathname: router.pathname,
          query: otherParams
        }, undefined, { shallow: true });
        
      } catch (error) {
        logger.error('Error loading component from localStorage:', error);
        toast.error('Failed to load component data. See console for details.');
      }
    };
    
    loadComponentFromStorage();
  }, [router.query.loadComponent, router.query.loadTimestamp, addElement, layers, router]);

  const handleSaveProject = () => {
    try {
      setDialogMode('export');
      setShowImportExportDialog(true);
    } catch (error) {
      logger.error('Error preparing to save project:', error);
      toast.error('Failed to prepare project for saving.');
    }
  };
  
  // Handle loading a drawing from the library
  const handleSelectDrawing = (drawingId: string) => {
    if (loadCadDrawing) {
      loadCadDrawing(drawingId);
    }
    setShowLibraryView(false);
  };

  // Handle component selection from unified library or sidebar
  const handleComponentSelection = useCallback((component: ComponentLibraryItem) => {
    logger.debug("Selected component:", component);
    setSelectedLibraryComponent(component.id);
    toast.success(`Component '${component.name}' selected. Place it on the canvas.`);
    setShowUnifiedLibrary(false);
    setActiveSidebarTab('tools');
  }, []);

  // Handle component placement in canvas
  const handleComponentPlacement = useCallback((component: string, position: {x: number, y: number, z: number}) => {
    logger.debug(`Component ${component} placed at:`, position);
    toast.success('Component placed successfully!');
    setSelectedLibraryComponent(null);
  }, []);

  // Add handler for tool selection from unified library
  const handleToolSelection = (tool: ToolLibraryItem) => {
    logger.debug("Selected tool:", tool);
    setShowUnifiedLibrary(false);
  };
  const handleGenerateElements = async () => {
    const result = await textToCAD(description);
    if (result.success && result.data) {
      addElements(result.data);
    }
  };

  // Reset component selection when closing library
  useEffect(() => {
    if (!showUnifiedLibrary && !sidebarOpen) {
      setSelectedLibraryComponent(null);
    }
  }, [showUnifiedLibrary, sidebarOpen]);

  // Effect to handle communication with external plugin UI windows
  

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading/>
      </div>
    );
  }

  
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
 
  
  return (
    <div className="h-screen w-screen flex bg-gradient-to-b from-[#2A2A2A] to-[#303030] flex-col rounded-xl overflow-hidden">
      <MetaTags 
        title="CAD Editor" 
        description="Design and create 2D/3D components in our advanced CAD editor"
      />
      <div className="flex rounded-xl flex-col h-full w-full">
        {/* Enhanced Top Toolbar */}
        <EnhancedToolbar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          handleSaveProject={handleSaveProject}
          setDialogMode={setDialogMode}
          setShowImportExportDialog={setShowImportExportDialog}
          setShowLibraryView={setShowLibraryView}
          setShowUnifiedLibrary={setShowUnifiedLibrary}
          setShowFloatingToolbar={setShowFloatingToolbar}
          showFloatingToolbar={showFloatingToolbar}
          selectedLibraryComponent={selectedLibraryComponent}
          setSelectedLibraryComponent={setSelectedLibraryComponent}
          setIsPlacingComponent={setIsPlacingComponent}
        />

        <div className="flex flex-1 p-0.5 bg-gradient-to-b from-[#2A2A2A] to-[#303030] overflow-hidden w-full">
       
        
        
        {/* Plugin sidebar toggle */}
       
          {/* Enhanced left sidebar */}
          <EnhancedSidebar2 
            isOpen={sidebarOpen} 
            setIsOpen={setSidebarOpen}
            activeSidebarTab={activeSidebarTab}
            setActiveSidebarTab={setActiveSidebarTab}
          />
          
          {/* Main content */}
          <div className="flex-1 flex rounded-xl bg-gradient-to-b from-[#2A2A2A] to-[#303030] relative">
          <DrawingEnabledCADCanvas 
            width="100%" 
            height="100%" 
            previewComponent={selectedLibraryComponent}
            onComponentPlaced={(component, position) => {
            handleComponentPlacement(component, position);
            setIsPlacingComponent(false);
           }}
          />
            
            {/* Floating toolbar */}
            {showFloatingToolbar && (
              <FloatingToolbar 
                initialPosition={{ x: 100, y: 100 }} 
                onClose={() => setShowFloatingToolbar(false)}
              />
            )}
       
          </div>
          <><PluginSidebar 
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      /></>
          {/* Right sidebar for properties */}
          

      <div 
            className={`${
              rightSidebarOpen ? 'w-80' : 'w-0'
            } flex-shrink-0 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-xl border-2 border-l ml-0.5 transition-all duration-300 ease-in-out overflow-y-auto`}
          >
            {/* Tabs for right sidebar */}
            <div className="px-2 pt-1 pb-1 border-b">
              <div className="flex space-x-1">
                <button
                  onClick={() => setActiveRightPanel('proprieties')}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                    activeRightPanel === 'proprieties'
                      ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <Tool size={16} className="mr-1" />
                  Proprieties
                </button>
                <button
                  onClick={() => setActiveRightPanel('trasform')}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                    activeRightPanel === 'trasform'
                      ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <Box size={16} className="mr-1" />
                  Trasform
                  Controls
                </button>
                <button
                  onClick={() => setActiveRightPanel('ai')}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                    activeRightPanel === 'ai'
                      ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <Cpu size={16} className="mr-1" />
                  Ai Design
                </button>
              </div>
            </div>

            <div className="p-4 space-y-6">
              {activeRightPanel === 'proprieties' && (
                 <PropertyPanel />
              )}
              
              {activeRightPanel === 'trasform' && (
               <>
                <TransformToolbar />
                
                </>
              )}
              
              {activeRightPanel === 'ai' && (
                <>
                <AIDesignAssistant />
                </>
              )}
            </div>
          </div>
          
          {/* Toggle right sidebar button */}
          <button
            className="absolute right-0 top-1/2 transform -translate-y-1/2 z-10 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white p-2 rounded-l-md shadow-md"
            onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
          >
            {rightSidebarOpen ? <ChevronRight size={20} className="text-gray-600" /> : <ChevronLeft size={20} className="text-gray-600" />}
          </button>
        </div>
        
        {/* Status bar */}
        <StatusBar />
      </div>

      {/* Import/Export Dialog */}
      {showImportExportDialog && (
        <ImportExportDialog
          mode={dialogMode}
          onClose={() => setShowImportExportDialog(false)}
          isOpen={true}
        />
      )}
      {/* Library View Modal */}
      {showLibraryView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-auto">
            <LocalCadLibraryView 
              onClose={() => setShowLibraryView(false)}
              onSelectDrawing={handleSelectDrawing}
            />
          </div>
        </div>
      )}

      {/* Unified Library Modal */}
      <UnifiedLibraryModal
        isOpen={showUnifiedLibrary}
        onClose={() => setShowUnifiedLibrary(false)}
        onSelectComponent={handleComponentSelection}
        onSelectTool={handleToolSelection}
        defaultTab="components"
      />
    </div>
  );
}
 