import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Save,
  Upload,
  Menu,
  X,
  PlusSquare,
  MousePointer,
  ChevronDown,
  Copy,
  BookOpen,
  Maximize,
  RotateCcw,
  RotateCw,
  Moon,
  Sun,
  Tool,
  Activity
} from "react-feather";
import { useRouter } from "next/router";
import { useElementsStore } from "src/store/elementsStore";
import toast from "react-hot-toast";
import Link from "next/link";
import { Ruler } from "lucide-react";
import { usePluginClient } from "@/src/contexts/PluginClientContext";
import PluginToolbarButton from "../plugins/PluginToolbarButton";
import { useCADStore } from "src/store/cadStore";
import CADCanvasWithSimulation from "./CADCanvasWithSimulation";
import { createPortal } from "react-dom";

interface EnhancedToolbarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  handleSaveProject: () => void;
  setDialogMode: (mode: "import" | "export") => void;
  setShowImportExportDialog: (show: boolean) => void;
  setShowLibraryView: (show: boolean) => void;
  setShowUnifiedLibrary: (show: boolean) => void;
  setShowFloatingToolbar: (show: boolean) => void;
  showFloatingToolbar: boolean;
  selectedLibraryComponent: string | null;
  setSelectedLibraryComponent: (id: string | null) => void;
  setIsPlacingComponent: (placing: boolean) => void;
}

// Animation variants
const toolbarVariants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0 }
};

const buttonVariants = {
  hover: { scale: 1.05, backgroundColor: "rgba(59, 130, 246, 0.1)" },
  tap: { scale: 0.95 }
};

const menuVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -10 },
  visible: { opacity: 1, scale: 1, y: 0 }
};

// Custom plugin button component that matches your app's styling

const EnhancedToolbar: React.FC<EnhancedToolbarProps> = ({
  sidebarOpen,
  setSidebarOpen,
  handleSaveProject,
  setDialogMode,
  setShowImportExportDialog,

  setShowUnifiedLibrary,
  setShowFloatingToolbar,
  showFloatingToolbar,
  selectedLibraryComponent,
  setSelectedLibraryComponent,
  setIsPlacingComponent
}) => {
  const router = useRouter();
  const { elements, selectedElement, undo, redo, selectedElements } = useElementsStore();
  const { showDimensions, toggleDimensions } = useCADStore();
  const [showPluginsMenu, setShowPluginsMenu] = useState(false);
  const pluginsMenuRef = useRef<HTMLDivElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showSimulationModal, setShowSimulationModal] = useState(false);
  const [simulationModalPosition, setSimulationModalPosition] = useState<{ x: number; y: number } | null>(null);
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    // Implement dark/light theme
    if (isDarkMode) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    }
  };

  // Get active plugins and their toolbar contributions
  const { plugins } = usePluginClient();
  const toolbarPlugins =
    plugins?.filter(
      // Use type assertion here too as temporary fix for linter
      plugin => plugin.enabled && plugin.manifest.contributes && (plugin.manifest.contributes as any).toolbarButtons
    ) || [];

  // Create selection data
  const createSelectionData = () => {
    return {
      elements: elements.filter(element => selectedElements.includes(element.id))
    };
  };

  const [showElementsPopup, setShowElementsPopup] = useState(false);
  const elementsPopupRef = useRef<HTMLDivElement>(null);

  // Close popups when clicking outside or pressing Esc
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (elementsPopupRef.current && !elementsPopupRef.current.contains(event.target as Node)) {
        setShowElementsPopup(false);
      }
      if (pluginsMenuRef.current && !pluginsMenuRef.current.contains(event.target as Node)) {
        setShowPluginsMenu(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowSimulationModal(false);
        setSimulationModalPosition(null);
        setShowElementsPopup(false);
        setShowPluginsMenu(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Handle creating a component from selected element
  const handleCreateComponentFromSelected = () => {
    if (!selectedElement) return;

    // Save the selected element ID to localStorage so the component page can access it
    localStorage.setItem("cadSelectedElementForComponent", JSON.stringify(selectedElement));

    // Redirect to the component creation page with the selectedElement data
    router.push({
      pathname: "/components",
      query: { createFromCad: "true" }
    });

    toast.success("Element prepared for component creation");
  };

  const handleCreateComponentFromSelection = () => {
    const selectionData = createSelectionData();
    if (!selectionData || !selectionData.elements || selectionData.elements.length === 0) {
      toast.error("No elements selected");
      return;
    }

    // Save the selected elements IDs to localStorage
    localStorage.setItem("cadSelectionForComponent", JSON.stringify(selectionData));

    // Redirect to the component creation page
    router.push({
      pathname: "/components",
      query: { createFromSelection: "true" }
    });

    toast.success("Selection prepared for component creation");
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

  // Handle simulation modal positioning like ToolPanel form
  const handleSimulationButtonClick = (event: React.MouseEvent) => {
    if (showSimulationModal) {
      setShowSimulationModal(false);
      setSimulationModalPosition(null);
    } else {
      setShowSimulationModal(true);

      // Position the modal similar to ToolPanel form
      const modalWidth = Math.min(1200, window.innerWidth * 0.95); // Max 1200px or 95% viewport
      const modalHeight = Math.min(800, window.innerHeight * 0.90); // Max 800px or 90% viewport  
      const margin = 20; // Safe margin from screen edges

      // Get viewport dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Start with cursor position
      let x = event.clientX + 15;
      let y = event.clientY + 15;

      // Ensure modal fits within viewport with margin
      // Horizontal positioning
      if (x + modalWidth + margin > viewportWidth) {
        x = event.clientX - modalWidth - 15; // Try to the left of cursor
        if (x < margin) {
          x = viewportWidth - modalWidth - margin; // Far right with margin
        }
      }
      if (x < margin) {
        x = margin;
      }

      // Vertical positioning
      if (y + modalHeight + margin > viewportHeight) {
        y = event.clientY - modalHeight - 15; // Try above cursor
        if (y < margin) {
          y = viewportHeight - modalHeight - margin; // Bottom with margin
        }
      }
      if (y < margin) {
        y = margin;
      }

      // Final safety check to ensure modal is within bounds
      x = Math.max(margin, Math.min(x, viewportWidth - modalWidth - margin));
      y = Math.max(margin, Math.min(y, viewportHeight - modalHeight - margin));

      setSimulationModalPosition({ x, y });
    }
  };

  // Navigate to plugin manager

  return (
    <motion.div
      className="backdrop-blur-md bg-white/90 dark:bg-gray-900/90 border-b border-white/30 dark:border-gray-600/30 px-6 py-3 flex items-center justify-between w-full rounded-2xl text-gray-900 dark:text-white shadow-lg"
      variants={toolbarVariants}
      initial="hidden"
      animate="visible"
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <motion.div
        className="flex w-max rounded-2xl items-center backdrop-blur-sm bg-white/60 dark:bg-gray-800/60 p-2 shadow-md border border-white/30 dark:border-gray-600/30"
        variants={toolbarVariants}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <motion.button
          className="mr-2 p-3 rounded-xl hover:bg-white/80 dark:hover:bg-gray-700/80 focus:outline-none transition-all duration-200 border border-white/40 dark:border-gray-600/40 shadow-sm"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
        >
          <Menu size={20} className="text-gray-600 dark:text-gray-400" />
        </motion.button>

        <div className="ml-6 flex items-center space-x-3">
          <motion.button
            onClick={handleSaveProject}
            className="px-4 py-2 backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 border border-white/40 dark:border-gray-600/40 hover:bg-white/90 dark:hover:bg-gray-700/90 rounded-xl shadow-md flex items-center transition-all duration-200"
            title="Save Project"
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
          >
            <Save size={16} className="text-gray-600 dark:text-gray-400" />
          </motion.button>
          <motion.button
            onClick={() => {
              setDialogMode("import");
              setShowImportExportDialog(true);
            }}
            className="px-4 py-2 backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 border border-white/40 dark:border-gray-600/40 hover:bg-white/90 dark:hover:bg-gray-700/90 rounded-xl shadow-md flex items-center transition-all duration-200"
            title="Import Project"
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
          >
            <Upload size={16} className="text-gray-600 dark:text-gray-400" />
          </motion.button>
          <motion.button
            onClick={() => setShowUnifiedLibrary(true)}
            className="px-4 py-2 backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 border border-white/40 dark:border-gray-600/40 hover:bg-white/90 dark:hover:bg-gray-700/90 rounded-xl shadow-md flex items-center transition-all duration-200"
            title="Unified Library"
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
          >
            <BookOpen size={16} className="text-gray-600 dark:text-gray-400" />
          </motion.button>

          {/* Create Component from Selected Element button - only shows when element is selected */}
          {selectedElement && (
            <motion.button
              onClick={handleCreateComponentFromSelected}
              className="px-4 py-2 backdrop-blur-sm bg-green-50/90 dark:bg-green-900/90 border border-green-300/60 dark:border-green-700/60 hover:bg-green-100/90 dark:hover:bg-green-800/90 text-green-700 dark:text-green-300 rounded-xl shadow-md flex items-center transition-all duration-200"
              title="Create Component from Selected Element"
              variants={buttonVariants}
              whileHover="hover"
              whileTap="tap"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <PlusSquare size={16} className="mr-1.5" />
              <span className="text-sm font-medium">Create Component</span>
            </motion.button>
          )}

          <div className="h-6 border-l border-white/40 dark:border-gray-600/40 mx-3"></div>
          <motion.button
            title="Undo"
            onClick={undo}
            className="p-3 rounded-xl hover:bg-white/80 dark:hover:bg-gray-700/80 text-gray-600 dark:text-gray-400 dark:hover:text-white transition-all duration-200 border border-white/40 dark:border-gray-600/40 shadow-sm"
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
          >
            <RotateCcw size={18} />
          </motion.button>
          <motion.button
            title="Redo"
            onClick={redo}
            className="p-3 rounded-xl hover:bg-white/80 dark:hover:bg-gray-700/80 text-gray-600 dark:text-gray-400 dark:hover:text-white transition-all duration-200 border border-white/40 dark:border-gray-600/40 shadow-sm"
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
          >
            <RotateCw size={18} />
          </motion.button>
          <div className="h-5 border-l border-gray-300 dark:border-gray-700 mx-1"></div>

          {/* Toggle Dimensions Button */}
          <button
            onClick={toggleDimensions}
            className={`p-1.5 border shadow-sm rounded-md flex items-center ${showDimensions
              ? "bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
              : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            title={showDimensions ? "Hide Dimensions" : "Show Dimensions"}
          >
            <Maximize size={16} className="" />
          </button>

          <button
            onClick={() => setShowFloatingToolbar(!showFloatingToolbar)}
            className={`p-1.5 border shadow-sm rounded-md flex items-center ml-1 ${showFloatingToolbar
              ? "bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
              : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            title={showFloatingToolbar ? "Hide Floating Toolbar" : "Show Floating Toolbar"}
          >
            <Tool size={16} className="" />
          </button>

          <button
            onClick={toggleDarkMode}
            className={`p-1.5 border shadow-sm rounded-md flex items-center ${isDarkMode
              ? "bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
              : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            aria-label="Toggle dark mode"
          >
            {isDarkMode ? <Sun className="h-3 w-3 sm:h-4 sm:w-4" /> : <Moon className="h-3 w-3 sm:h-4 sm:w-4" />}
          </button>

          {/* Simulation Modal Button */}
          <button
            onClick={handleSimulationButtonClick}
            className={`p-1.5 border shadow-sm rounded-md flex items-center transition-all duration-200 ${showSimulationModal
              ? "bg-orange-50 dark:bg-orange-900 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300"
              : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-orange-50 dark:hover:bg-orange-900 hover:border-orange-300 text-gray-700 dark:text-gray-300 hover:text-orange-700"
              }`}
            title="Apri Simulazione FEA"
          >
            <Activity size={16} className="" />
          </button>
          <Link href="/technical">
            <button
              className={`p-1.5 border shadow-sm rounded-md flex items-center ${isDarkMode
                ? "bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
            >
              <Ruler size={16} className="mr-1.5" />
            </button>
          </Link>

          {/* CAM Link Button */}
          <Link href="/cam">
            <button
              className="p-1.5 flex items-center bg-gradient-to-r from-green-500 via-emerald-500 to-green-500 text-white hover:from-green-600 hover:via-emerald-600 hover:to-green-600 border-0 shadow-md rounded-md"
              title="Switch to CAM Editor"
            >
              <Tool size={16} />
              <span className="ml-1.5 text-sm font-medium">CAM</span>
            </button>
          </Link>

          {/* Plugin manager button */}

          {/* --- End Example --- */}

          {/* Plugin toolbar extensions - left section */}
          {toolbarPlugins.length > 0 && <div className="h-5 border-l border-gray-300 dark:border-gray-700 mx-1"></div>}
          {toolbarPlugins.flatMap(plugin => {
            // Check if contributes and toolbarButtons exist, use type assertion as temporary fix for linter
            const buttons = plugin.manifest.contributes && (plugin.manifest.contributes as any).toolbarButtons;
            if (!buttons) return []; // Return empty array if no buttons

            return buttons.map((button: any) => (
              <PluginToolbarButton
                key={`${plugin.id}-${button.command}`}
                pluginId={plugin.id}
                commandId={button.command}
              // You might want to pass a specific className if needed
              />
            ));
          })}
        </div>
      </motion.div>
      <motion.div
        className="flex items-center space-x-3"
        variants={toolbarVariants}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.8, delay: 0.4 }}
      >
        {/* Plugin toolbar extensions - right section */}

        {/* Indicator for selected component */}
        {selectedLibraryComponent && (
          <motion.div
            className="px-4 py-2 backdrop-blur-sm bg-blue-50/90 dark:bg-blue-900/90 border border-blue-200/60 dark:border-blue-800/60 rounded-xl flex items-center shadow-md"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
          >
            <span className="text-xs text-blue-700 dark:text-blue-300 mr-2">Component selected:</span>
            <span className="text-sm font-medium">Ready for placement</span>
            <motion.button
              onClick={handleStartPlacement}
              className="ml-3 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl flex items-center shadow-md transition-all duration-200"
              title="Place component"
              variants={buttonVariants}
              whileHover="hover"
              whileTap="tap"
            >
              <MousePointer size={14} className="mr-1" />
              <span className="text-xs font-medium">Place</span>
            </motion.button>
            <motion.button
              onClick={() => setSelectedLibraryComponent(null)}
              className="ml-2 p-1.5 rounded-xl hover:bg-blue-200/80 dark:hover:bg-blue-700/80 text-blue-700 dark:text-blue-300 transition-all duration-200"
              variants={buttonVariants}
              whileHover="hover"
              whileTap="tap"
            >
              <X size={14} />
            </motion.button>
          </motion.div>
        )}
        <div className="relative z-[1000]">
          <motion.button
            onClick={() => setShowElementsPopup(!showElementsPopup)}
            className="px-4 py-2 border border-white/40 dark:border-gray-600/40 rounded-xl flex items-center backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 hover:bg-white/90 dark:hover:bg-gray-700/90 cursor-pointer shadow-md transition-all duration-200"
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
          >
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">Elements:</span>
            <span className="text-sm font-medium">{elements.length}</span>
            {selectedElementsCount > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded-full">
                {selectedElementsCount} selected
              </span>
            )}
            <ChevronDown size={14} className="ml-1 text-gray-500" />
          </motion.button>

          {showElementsPopup && (
            <motion.div
              ref={elementsPopupRef}
              className="absolute top-full right-0 mt-2 w-80 backdrop-blur-md bg-white/95 dark:bg-gray-800/95 border border-white/40 dark:border-gray-600/40 rounded-2xl shadow-xl z-1000"
              variants={menuVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ duration: 0.3 }}
              style={{
                pointerEvents: "auto"
              }}
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
                      <div
                        key={selectedElement?.elements.id}
                        className="flex items-center justify-between p-1.5 bg-gray-50 dark:bg-gray-700 rounded text-xs"
                      >
                        <div className="flex items-center">
                          <div
                            className="w-3 h-3 rounded-full mr-2"
                            style={{ backgroundColor: selectedElement?.elements.id.color || "#1e88e5" }}
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
                            toast.success("Element ID copied to clipboard");
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
            </motion.div>
          )}
        </div>
        {selectedElement && (
          <motion.div
            className="px-4 py-2 border border-green-200/60 dark:border-green-800/60 rounded-xl flex items-center backdrop-blur-sm bg-green-50/90 dark:bg-green-900/90 shadow-md"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
          >
            <span className="text-xs text-green-600 dark:text-green-300 mr-2">Selected:</span>
            <span className="text-sm font-medium">{selectedElement.id.substring(0, 8)}...</span>
          </motion.div>
        )}
      </motion.div>

      {/* Simulation Modal */}
      {showSimulationModal && simulationModalPosition && (
        <>
          {createPortal(
            <motion.div
              className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => {
                setShowSimulationModal(false);
                setSimulationModalPosition(null);
              }}
            />,
            document.body
          )}

          {createPortal(
            <motion.div
              className="fixed z-[9999] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
              style={{
                top: simulationModalPosition.y,
                left: simulationModalPosition.x,
                width: Math.min(1200, window.innerWidth * 0.95),
                height: Math.min(800, window.innerHeight * 0.90),
              }}
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-lg flex items-center justify-center">
                    <Activity size={18} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Simulazione FEA Integrata
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Analisi strutturale, termica e accoppiata in tempo reale
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mr-4">
                    <span className="inline-flex items-center">
                      <div className="w-2 h-2 bg-green-400 rounded-full mr-1 animate-pulse"></div>
                      Sistema attivo
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setShowSimulationModal(false);
                      setSimulationModalPosition(null);
                    }}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Modal Body - CAD Canvas with Simulation */}
              <div className="h-[calc(100%-4rem)] overflow-hidden">
                <CADCanvasWithSimulation
                  width="100%"
                  height="100%"
                  allowDragDrop={true}
                  onElementsChange={(elements) => {
                    // Optional: sync with parent CAD canvas if needed
                    console.log('Simulation canvas elements changed:', elements);
                  }}
                />
              </div>

              {/* Modal Footer/Status Bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-gray-50 dark:bg-gray-800/50 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 px-4 py-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-4 text-gray-600 dark:text-gray-400">
                    <span className="flex items-center">
                      <div className="w-2 h-2 bg-blue-400 rounded-full mr-1"></div>
                      Canvas simulazione attivo
                    </span>
                    <span>⌨️ Ctrl+Shift+S: Toggle simulazione</span>
                    <span>⌨️ F9: Cambia modalità</span>
                    <span>⌨️ Esc: Chiudi</span>
                  </div>
                  <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                    <span>Modalità avanzata</span>
                    <div className="w-1 h-4 bg-gradient-to-t from-orange-400 to-red-500 rounded-full"></div>
                  </div>
                </div>
              </div>
            </motion.div>,
            document.body
          )}
        </>
      )}
    </motion.div>
  );
};

export default EnhancedToolbar;
