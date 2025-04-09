import dynamic from 'next/dynamic';

// CAD Components
export const DynamicCADCanvas = dynamic(() => import('./cad/CADCanvas'), {
  ssr: false, // Three.js components need to be client-side only
  loading: () => <div className="w-full h-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
});

export const DynamicToolPanel = dynamic(() => import('./cad/ToolPanel'), {
  ssr: true,
  loading: () => <div className="w-64 h-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
});

export const DynamicPropertyPanel = dynamic(() => import('./cad/PropertyPanel'), {
  ssr: true,
  loading: () => <div className="w-64 h-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
});

export const DynamicFloatingToolbar = dynamic(() => import('./cad/FloatingToolbar'), {
  ssr: true,
  loading: () => <div className="h-12 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
});

// Modals and Dialogs
export const DynamicSaveProjectDialog = dynamic(() => import('./cad/SaveProjectDialog'), {
  ssr: false // Modals often interact with browser APIs
});

export const DynamicImportExportDialog = dynamic(() => import('./cad/ImportExportDialog'), {
  ssr: false
});

export const DynamicShortcutsDialog = dynamic(() => import('./ShortcutsDialog'), {
  ssr: false
});

// Heavy UI Components
export const DynamicMachineConfigManager = dynamic(() => import('./cad/MachineConfigManager'), {
  ssr: true,
  loading: () => <div className="w-full h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
});

export const DynamicWorkpieceSetup = dynamic(() => import('./cad/WorkpieceSetup'), {
  ssr: true,
  loading: () => <div className="w-full h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
});

// Library Components
export const DynamicUnifiedLibraryBrowser = dynamic(() => import('./cad/UnifiedLibraryBrowser'), {
  ssr: true,
  loading: () => <div className="w-full h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
});

export const DynamicUnifiedMaterialsBrowser = dynamic(() => import('./cad/UnifiedMaterialsBrowser'), {
  ssr: true,
  loading: () => <div className="w-full h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
});

export const DynamicUnifiedToolsBrowser = dynamic(() => import('./cad/UnifiedToolsBrowser'), {
  ssr: true,
  loading: () => <div className="w-full h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
});

// Layer Management
export const DynamicLayerManager = dynamic(() => import('./cad/LayerManager'), {
  ssr: true,
  loading: () => <div className="w-64 h-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
});

// Save/Export Components
export const DynamicSaveElementToLibrary = dynamic(() => import('./cad/SaveElementToLibrary'), {
  ssr: false
});

export const DynamicSaveCADAsProjectModal = dynamic(() => import('./cad/SaveCADAsProjectModal'), {
  ssr: false
});

// CAM Components
export const DynamicToolpathGenerator = dynamic(() => import('./cam/ToolpathGenerator'), {
  ssr: false, // Heavy Three.js component
  loading: () => <div className="w-full h-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
});

export const DynamicToolpathVisualizer = dynamic(() => import('./cam/ToolpathVisualizer2'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
});

export const DynamicGCodeEditor = dynamic(() => import('./cam/GCodeEditor'), {
  ssr: true,
  loading: () => <div className="w-full h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
});

export const DynamicMachineControl = dynamic(() => import('./cam/MachineControl'), {
  ssr: true,
  loading: () => <div className="w-full h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
});

export const DynamicAIEnhancedEditor = dynamic(() => import('./cam/AIEnhancedEditor'), {
  ssr: false // AI components often need browser APIs
});

export const DynamicDrawingEnabledCADCanvas = dynamic(() => import('./cam/DrawingEnabledCADCanvas'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
});

export const DynamicMachineCycles = dynamic(() => import('./cam/MachineCycles'), {
  ssr: true,
  loading: () => <div className="w-full h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
});

export const DynamicPostProcessors = {
  Fanuc: dynamic(() => import('./cam/FanucPostProcessor'), { ssr: true }),
  Heidenhain: dynamic(() => import('./cam/HeidenhainPostProcessor'), { ssr: true })
};

export const DynamicGCodeViewer = dynamic(() => import('./cam/GCodeViewer'), {
  ssr: true,
  loading: () => <div className="w-full h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
});

export const DynamicCamWorkpieceSetup = dynamic(() => import('./cam/CamWorkpieceSetup'), {
  ssr: true,
  loading: () => <div className="w-full h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
});

export const DynamicLayout = dynamic(() => import('./layout/Layout'), {
  ssr: true,
  loading: () => <div className="w-full min-h-screen bg-gray-100 dark:bg-gray-800 animate-pulse" />
}); 