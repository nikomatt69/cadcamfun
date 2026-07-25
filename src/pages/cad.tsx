// src/pages/cad.tsx
import { useState, useEffect, useCallback, useMemo } from "react";

import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import StatusBar from "../components/cad/StatusBar";
import FloatingToolbar from "../components/cad/FloatingToolbar";
import {
  ChevronLeft,
  ChevronRight,
  Tool,
  EyeOff,
  Eye,
  Grid
} from "react-feather";
import { PuzzleIcon, SettingsIcon } from "lucide-react";
import { useCADStore } from "src/store/cadStore";
import { useElementsStore } from "src/store/elementsStore";
import { useLayerStore } from "src/store/layerStore";
import EnhancedSidebarCad from "../components/cad/EnanchedSidebarCad";
import MetaTags from "../components/layout/Metatags";
import { useLocalLibrary } from "../hooks/useLocalLibrary";
import { ComponentLibraryItem, ToolLibraryItem } from "@/src/hooks/useUnifiedLibrary";
import toast from "react-hot-toast";
import EnhancedToolbar from "../components/cad/EnhancedToolbar";

import { CADAssistantButton } from "../components/ai/ai-new/OpenaiAssistant/CADAssistantButton";
import { useSelectionStore } from "src/store/selectorStore";
import { usePluginClient } from "@/src/contexts/PluginClientContext";

import { PluginRegistryEntry } from "../plugins/core/registry";

// Animation variants
const pageVariants = {
  initial: { opacity: 0, y: 20 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -20 }
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 }
};

const rightSidebarVariants = {
  open: { x: 0, opacity: 1 },
  closed: { x: 300, opacity: 0.7 }
};

const panelSkeleton = <div className="h-full w-full rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />;

const DynamicDrawingEnabledCADCanvas = dynamic<any>(() => import("../components/cam/DrawingEnabledCADCanvas"), {
  ssr: false,
  loading: () => panelSkeleton
});

const DynamicPropertyPanel = dynamic<any>(() => import("../components/cad/PropertyPanel"), {
  ssr: false,
  loading: () => panelSkeleton
});

const DynamicImportExportDialog = dynamic<any>(() => import("../components/cad/ImportExportDialog"), {
  ssr: false
});

const DynamicLocalCadLibraryView = dynamic<any>(() => import("src/components/library/LocalCadLibraryView"), {
  ssr: false,
  loading: () => panelSkeleton
});

const DynamicUnifiedLibraryModal = dynamic<any>(() => import("../components/library/UnifiedLibraryModal"), {
  ssr: false
});

const DynamicPluginHostContainer = dynamic<any>(() => import("../components/plugins/PluginHostContainer"), {
  ssr: false,
  loading: () => panelSkeleton
});

const DynamicOriginControls = dynamic<any>(() => import("../components/cad/OriginControls"), { ssr: false });
const DynamicWorkpieceSetup = dynamic<any>(() => import("../components/cad/WorkpieceSetup"), { ssr: false });
const DynamicSnapSettings = dynamic<any>(() => import("../components/cad/SnapSettings"), { ssr: false });

const DynamicCADAssistantBridge = dynamic<any>(
  () => import("../components/ai/ai-new/OpenaiAssistant/CADAssistantBridge").then(mod => mod.CADAssistantBridge),
  { ssr: false }
);

export default function CADPage() {

  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState<"tools" | "layers" | "explorer">("explorer");
  const { viewMode, gridVisible, axisVisible } = useCADStore();
  const elements = useElementsStore(state => state.elements);
  const addElement = useElementsStore(state => state.addElement);
  const { layers, activeLayer } = useLayerStore();
  const [showImportExportDialog, setShowImportExportDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<"import" | "export">("export");
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(true);
  const [selectedLibraryComponent, setSelectedLibraryComponent] = useState<string | null>(null);
  const [showLibraryView, setShowLibraryView] = useState(false);
  // Add state for the unified library modal
  const [showUnifiedLibrary, setShowUnifiedLibrary] = useState(false);
  const [, setIsPlacingComponent] = useState(false);

  // Add state for CAD Assistant
  const [showCADAssistant, setShowCADAssistant] = useState(false);
  const [activeRightPanel, setActiveRightPanel] = useState<
    "proprieties" | "trasform" | "ai" | "constraints" | "simulation" | "settings"
  >("proprieties");

  const { setViewMode, toggleGrid, toggleAxis } = useCADStore();

  const { loadCadDrawing } = useLocalLibrary(); // Move the hook call to the top level
  useEffect(() => {
    const loadComponentFromStorage = async () => {
      // Only proceed if we have the loadComponent query parameter
      if (!router.query.loadComponent) return;

      const componentId = router.query.loadComponent as string;
      console.log("Loading component with ID:", componentId);

      try {
        // Get the stored component data
        const storedComponent = localStorage.getItem("componentToLoadInCAD");
        if (!storedComponent) {
          console.error("No component data found in localStorage");
          toast.error("Component data not found");
          return;
        }

        console.log("Retrieved component data from localStorage");
        const componentData = JSON.parse(storedComponent);
        console.log("Parsed component data:", componentData);

        // Validate the component data
        if (!componentData || !componentData.id || componentData.id !== componentId) {
          console.error("Invalid component data or ID mismatch");
          toast.error("Invalid component data");
          return;
        }

        // Create a new CAD element from the component
        const newElement = {
          id: `component-${Date.now()}`,
          type: "component",
          x: 0,
          y: 0,
          z: 0,
          name: componentData.name || "Unnamed Component",
          componentId: componentData.id,
          data: componentData.data,
          layerId: layers.length > 0 ? layers[0].id : "default"
        };

        console.log("Adding component as CAD element:", newElement);

        // Add the element to the canvas
        addElement(newElement);
        toast.success(`Component '${componentData.name}' loaded successfully`);

        // Clear the localStorage data
        localStorage.removeItem("componentToLoadInCAD");
        localStorage.removeItem("componentToLoadInCAD_timestamp");

        // Remove the query parameter
        const { loadComponent, loadTimestamp, ...otherParams } = router.query;
        router.replace(
          {
            pathname: router.pathname,
            query: otherParams
          },
          undefined,
          { shallow: true }
        );
      } catch (error) {
        console.error("Error loading component from localStorage:", error);
        toast.error("Failed to load component data. See console for details.");
      }
    };

    loadComponentFromStorage();
  }, [router.query.loadComponent, router.query.loadTimestamp, addElement, layers, router]);
  // Initialize with a default layer if none exists
  useEffect(() => {
    // This is just to ensure layers are displayed in the UI
    // The actual initialization happens in layerStore.ts
    console.log("Layers initialized:", layers);
  }, [layers]);

  // Function to handle file saving
  const handleSaveProject = () => {
    try {
      setDialogMode("export");
      setShowImportExportDialog(true);
    } catch (error) {
      console.error("Error preparing to save project:", error);
      toast.error("Failed to prepare project for saving.");
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
    console.log("Selected component:", component);
    setSelectedLibraryComponent(component.id);
    // Show selection notification
    toast.success(`Component '${component.name}' selected. Place it on the canvas.`);
    setShowUnifiedLibrary(false);
    // Optionally, switch to 'tools' tab if not already active
    setActiveSidebarTab("tools");
  }, []);

  // Handle component placement in canvas
  const handleComponentPlacement = useCallback((component: string, position: { x: number; y: number; z: number }) => {
    // Logic to place the component on the canvas would go here
    console.log(`Component ${component} placed at:`, position);
    toast.success("Component placed successfully!");
    // Reset selection after placement
    setSelectedLibraryComponent(null);
  }, []);

  // Add handler for tool selection from unified library
  const handleToolSelection = (tool: ToolLibraryItem) => {
    // Handle tool selection if needed
    console.log("Selected tool:", tool);
    setShowUnifiedLibrary(false);
  };

  const { plugins: clientPlugins } = usePluginClient(); // Use client context hook
  const [activePluginId, setActivePluginId] = useState<string | null>(null);
  const [sidebarPlugins, setSidebarPlugins] = useState<PluginRegistryEntry[]>([]); // Use correct type

  // Filter plugins that contribute to sidebar
  useEffect(() => {
    // Filter directly from context plugins
    const filtered = clientPlugins.filter(
      plugin =>
        plugin.enabled && // Check if enabled via context state
        plugin.manifest.contributes?.sidebar
    );

    setSidebarPlugins(filtered);

    // Auto-select the first plugin if none is selected or selected is no longer valid
    const currentSelectionValid = filtered.some(p => p.id === activePluginId);
    if (filtered.length > 0 && (!activePluginId || !currentSelectionValid)) {
      setActivePluginId(filtered[0].id);
    } else if (filtered.length === 0) {
      setActivePluginId(null); // Clear selection if no sidebar plugins are enabled
    }
  }, [activePluginId, clientPlugins]); // Depend on context plugins list

  // Reset component selection when closing library
  useEffect(() => {
    if (!showUnifiedLibrary && !sidebarOpen) {
      setSelectedLibraryComponent(null);
    }
  }, [showUnifiedLibrary, sidebarOpen]);

  // Accedi agli store Zustand
  const { selectedElementIds } = useSelectionStore();

  // Costruisci l'oggetto di contesto CAD aggiornato
  const cadContextData = useMemo(() => {
    if (!showCADAssistant) {
      return {
        totalElementCount: elements.length,
        selectedElementCount: selectedElementIds.length,
        selectedElements: [],
        activeLayer: null
      };
    }

    const selectedElementsDetails = selectedElementIds
      .map(id => elements.find(el => el.id === id))
      .filter(el => el !== undefined)
      .map(el => ({
        // Passa solo info essenziali per ridurre i token
        id: el!.id,
        type: el!.type,
        name: el!.name || "Unnamed",

        x: el!.x,
        y: el!.y,
        z: el!.z,
        rotation: el!.rotation || { x: 0, y: 0, z: 0 },
        scale: el!.scale || { x: 1, y: 1, z: 1 },
        color: el!.color || "#000000",
        linewidth: el!.linewidth || 1,
        description: el!.description || "",
        material: el!.material || "default",
        additionalProps: el!.additionalProps || {},
        operands: el!.operands || [],
        wireframe: el!.wireframe || false

        // Potresti aggiungere altre proprietà rilevanti qui se necessario
      }));

    const activeLayerDetails = layers.find(l => l.id === activeLayer);

    return {
      totalElementCount: elements.length,
      selectedElementCount: selectedElementIds.length,
      selectedElements: selectedElementsDetails, // Array con dettagli elementi selezionati
      activeLayer: activeLayerDetails ? { id: activeLayerDetails.id, name: activeLayerDetails.name } : null // Dettagli layer attivo
    };
  }, [showCADAssistant, elements, selectedElementIds, layers, activeLayer]);

  // Placeholder for getting the mesh to simulate - replace with actual logic

 

  return (
    <motion.div
      className="h-screen w-screen flex bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex-col overflow-hidden"
      variants={pageVariants}
      initial="initial"
      animate="in"
      exit="out"
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <MetaTags
        ogImage="/og-image.png"
        title="CAD Editor"
        description="Design and create 2D/3D components in our advanced CAD editor"
      />
      <motion.div
        className="flex flex-col backdrop-blur-md bg-white/80 dark:bg-gray-900/80 h-full w-full border border-white/20 dark:border-gray-700/30 shadow-xl"
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.8, delay: 0.2 }}
      >
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

        <motion.div
          className="flex flex-1 p-2 backdrop-blur-sm bg-gradient-to-br from-white/50 to-blue-50/30 dark:from-gray-800/50 dark:to-gray-900/30 border-b border-white/30 dark:border-gray-600/30 overflow-hidden w-full rounded-lg  shadow-lg"
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          {/* Enhanced left sidebar */}
          <EnhancedSidebarCad
            isOpen={sidebarOpen}
            setIsOpen={setSidebarOpen}
            activeSidebarTab={activeSidebarTab}
            setActiveSidebarTab={setActiveSidebarTab}
          />

          {/* Main content */}
          <motion.div
            className="flex-1 flex rounded-2xl bg-gradient-to-br from-white/90 to-blue-50/50 dark:from-gray-800/90 dark:to-gray-900/50 relative shadow-xl border border-white/30 mr-2 dark:border-gray-600/30 backdrop-blur-md"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            <DynamicDrawingEnabledCADCanvas
              width="100%"
              height="100%"
              previewComponent={selectedLibraryComponent}
              onComponentPlaced={(component: string, position: { x: number; y: number; z: number }) => {
                handleComponentPlacement(component, position);
                setIsPlacingComponent(false);
              }}
            />

            {/* Floating toolbar */}
            {showFloatingToolbar && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.3 }}
              >
                <FloatingToolbar initialPosition={{ x: 100, y: 100 }} onClose={() => setShowFloatingToolbar(false)} />
              </motion.div>
            )}

            {/* CAD Assistant Button - Fixed position in bottom right */}
            <motion.div
              className="absolute bottom-4 rounded-lg right-16 z-40"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1 }}
            >
              <CADAssistantButton
                isVisible={showCADAssistant}
                toggleVisibility={() => setShowCADAssistant(!showCADAssistant)}
                className="shadow-lg"
              />
            </motion.div>

            {/* CAD Assistant Bridge - Passa il contesto aggiornato */}
            {showCADAssistant && (
              <DynamicCADAssistantBridge
                isVisible={true}
                onClose={() => setShowCADAssistant(false)}
                initialContextData={cadContextData}
              />
            )}
          </motion.div>

          {/* Right sidebar for properties */}
          <motion.div
            className={`${rightSidebarOpen ? "w-80" : "w-0"
              } flex-shrink-0 backdrop-blur-md bg-white/90 dark:bg-gray-800/90 dark:text-white border border-white/30 dark:border-gray-600/30  rounded-2xl shadow-xl transition-all duration-300 ease-in-out overflow-y-auto`}
            variants={rightSidebarVariants}
            animate={rightSidebarOpen ? "open" : "closed"}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          >
            {/* Tabs for right sidebar */}
            <motion.div
              className="w-full border-b border-white/30 dark:border-gray-600/30 p-2 rounded-t-2xl bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-gray-700/50 dark:to-gray-800/50 backdrop-blur-sm flex justify-center"
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              transition={{ duration: 0.6, delay: 0.8 }}
            >
              <div className="flex justify-center w-full text-center">
                <motion.button
                  onClick={() => setActiveRightPanel("proprieties")}
                  className={`flex-1 py-3 px-3 text-sm font-medium rounded-lg transition-all duration-200 ${activeRightPanel === "proprieties"
                    ? "text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-gray-700/60 shadow-md"
                    : "text-gray-500 hover:text-gray-700 hover:bg-white/40 dark:hover:bg-gray-700/40"
                    }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-center justify-center">
                    <Tool size={16} className="mr-2" />
                    Proprieties
                  </div>
                </motion.button>
                <motion.button
                  onClick={() => setActiveRightPanel("settings")}
                  className={`flex-1 py-3 px-3 text-sm font-medium rounded-lg transition-all duration-200 ${activeRightPanel === "settings"
                    ? "text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-gray-700/60 shadow-md"
                    : "text-gray-500 hover:text-gray-700 hover:bg-white/40 dark:hover:bg-gray-700/40"
                    }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-center justify-center">
                    <SettingsIcon size={16} className="mr-2" />
                    Settings
                  </div>
                </motion.button>
                <motion.button
                  onClick={() => setActiveRightPanel("constraints")}
                  className={`flex-1 py-3 px-3 text-sm font-medium rounded-lg transition-all duration-200 ${activeRightPanel === "constraints"
                    ? "text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-gray-700/60 shadow-md"
                    : "text-gray-500 hover:text-gray-700 hover:bg-white/40 dark:hover:bg-gray-700/40"
                    }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-center justify-center">
                    <PuzzleIcon size={16} className="mr-2" />
                  </div>
                </motion.button>
              </div>
            </motion.div>

            <motion.div
              className="p-2 space-y-6 flex flex-col items-center"
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              transition={{ duration: 0.6, delay: 1 }}
            >
              {activeRightPanel === "proprieties" && <DynamicPropertyPanel />}

              {activeRightPanel === "settings" && (
                <motion.div
                  className="backdrop-blur-md bg-white/90 dark:bg-gray-800/90 dark:text-white shadow-xl border border-white/30 dark:border-gray-600/30 rounded-2xl p-6 max-h-[calc(100vh-100px)] overflow-y-auto text-center w-full"
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ duration: 0.5 }}
                >
                  <h3 className="text-lg font-medium text-gray-900 mb-4">View Settings</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">View Mode</label>
                      <div className="flex space-x-2 justify-center">
                        <button
                          onClick={() => setViewMode("2d")}
                          className={`px-3 py-2 rounded-md text-sm ${viewMode === "2d" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                        >
                          2D View
                        </button>
                        <button
                          onClick={() => setViewMode("3d")}
                          className={`px-3 py-2 rounded-md text-sm ${viewMode === "3d" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                        >
                          3D View
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Display Options</label>
                      <div className="space-y-2">
                        <button
                          onClick={toggleGrid}
                          className="w-full flex items-center dark:text-blue-400 justify-between px-3 py-2 rounded-md text-sm bg-gray-100 hover:bg-gray-200"
                        >
                          <span className="flex items-center">
                            <Grid size={16} className="mr-2" />
                            Show Grid
                          </span>
                          <span
                            className={`h-4 w-8 rounded-full ${gridVisible ? "bg-blue-600" : "bg-gray-300"} relative transition-colors duration-200 ease-in-out`}
                          >
                            <span
                              className={`absolute top-0.5 left-0.5 inline-block h-3 w-3 rounded-full bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow transform ${gridVisible ? "translate-x-4" : ""} transition-transform duration-200 ease-in-out`}
                            ></span>
                          </span>
                        </button>
                        <button
                          onClick={toggleAxis}
                          className="w-full flex items-center dark:text-blue-400 justify-between px-3 py-2 rounded-md text-sm bg-gray-100 hover:bg-gray-200"
                        >
                          <span className="flex items-center">
                            {axisVisible ? <Eye size={16} className="mr-2" /> : <EyeOff size={16} className="mr-2" />}
                            Show Axis
                          </span>
                          <span
                            className={`h-4 w-8 rounded-full ${axisVisible ? "bg-blue-600" : "bg-gray-300"} relative transition-colors duration-200 ease-in-out`}
                          >
                            <span
                              className={`absolute top-0.5 left-0.5 inline-block h-3 w-3 rounded-full bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow transform ${axisVisible ? "translate-x-4" : ""} transition-transform duration-200 ease-in-out`}
                            ></span>
                          </span>
                        </button>
                      </div>
                    </div>
                    <DynamicOriginControls />
                    <DynamicWorkpieceSetup />
                    <DynamicSnapSettings />
                  </div>
                </motion.div>
              )}

              {activeRightPanel === "constraints" && (
                <>
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {" "}
                    {/* Use flex-col here */}
                    {/* Tabs */}
                    <div className="flex-shrink-0 flex space-x-1 px-2 pt-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                      {sidebarPlugins.map(plugin => (
                        <button
                          key={plugin.id}
                          className={`px-3 py-2 rounded-t text-sm font-medium transition-colors ${activePluginId === plugin.id
                            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                            : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                          onClick={() => setActivePluginId(plugin.id)}
                        >
                          {plugin.manifest.contributes?.sidebar?.title || plugin.manifest.name}
                        </button>
                      ))}
                    </div>
                    {/* Content Host (flex-1 to fill remaining space, overflow-auto for scroll) */}
                    <div className="flex-1 p-4 overflow-auto">
                      {activePluginId && (
                        <DynamicPluginHostContainer pluginId={activePluginId} entryPoint="sidebar" />
                      )}
                      {sidebarPlugins.length === 0 && (
                        <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
                          No plugins with sidebar UI are enabled
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>

          {/* Toggle right sidebar button */}
          <motion.button
            className="absolute right-0 top-1/2 transform -translate-y-1/2 z-10 backdrop-blur-md bg-white/90 dark:bg-gray-800/90 dark:text-white p-3 rounded-l-2xl shadow-xl border border-white/30 dark:border-gray-600/30 hover:bg-white/95 dark:hover:bg-gray-700/95 transition-all duration-200"
            onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
            whileHover={{ scale: 1.05, x: -2 }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 1.2 }}
          >
            <motion.div
              animate={{ rotate: rightSidebarOpen ? 0 : 180 }}
              transition={{ duration: 0.3 }}
            >
              {rightSidebarOpen ? (
                <ChevronRight size={20} className="text-gray-600 dark:text-gray-300" />
              ) : (
                <ChevronLeft size={20} className="text-gray-600 dark:text-gray-300" />
              )}
            </motion.div>
          </motion.button>
        </motion.div>

        {/* Status bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.4 }}
        >
          <StatusBar />
        </motion.div>
      </motion.div>

      {/* Import/Export Dialog */}
      {showImportExportDialog && (
        <DynamicImportExportDialog mode={dialogMode} onClose={() => setShowImportExportDialog(false)} isOpen={true} />
      )}
      {/* Library View Modal */}
      {showLibraryView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-auto">
            <DynamicLocalCadLibraryView onClose={() => setShowLibraryView(false)} onSelectDrawing={handleSelectDrawing} />
          </div>
        </div>
      )}

      {/* Unified Library Modal */}
      <DynamicUnifiedLibraryModal
        isOpen={showUnifiedLibrary}
        onClose={() => setShowUnifiedLibrary(false)}
        onSelectComponent={handleComponentSelection}
        onSelectTool={handleToolSelection}
        defaultTab="components"
      />

      {/* Chat Panel Toggle Button */}
    </motion.div>
  );
}
