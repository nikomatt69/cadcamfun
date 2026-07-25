// src/pages/cam.tsx
import React, { useState, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import { AIConfigurationService } from "src/services/ai/AIConfigurationService";
import StatusBar from "src/components/cad/StatusBar";
import { ComponentLibraryItem, MaterialLibraryItem, ToolLibraryItem } from "@/src/hooks/useUnifiedLibrary";
import {
  Save,
  Upload,
  Menu,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Eye,
  Code,
  Tool,
  Settings,
  Box,
  Folder,
  X,
  DollarSign,
  Sun,
  Moon,
  Grid,
  Zap
} from "react-feather";
import { Brain, PanelRightIcon, PanelRightInactiveIcon } from "lucide-react";
import EnhancedSidebarCam from "../components/cam/EnanchedSidebarCam";
import MetaTags from "../components/layout/Metatags";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCAMStore } from "@/src/store/camStore";

// Tipi di post-processor supportati
type PostProcessorType = "fanuc" | "heidenhain" | "siemens" | "haas" | "mazak" | "okuma" | "generic";

const fullPanelSkeleton = <div className="w-full h-full bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl" />;

const DynamicGCodeViewer = dynamic<any>(() => import("src/components/cam/GCodeViewer"), {
  ssr: false,
  loading: () => fullPanelSkeleton
});

const DynamicGCodeEditor = dynamic<any>(() => import("src/components/cam/GCodeEditor"), {
  ssr: false,
  loading: () => fullPanelSkeleton
});

const DynamicOptimizedToolpathVisualizer = dynamic<any>(() => import("src/components/cam/OptimizedToolpathVisualizer"), {
  ssr: false,
  loading: () => fullPanelSkeleton
});

const DynamicMachineCycles = dynamic<any>(() => import("src/components/cam/MachineCycles"), {
  ssr: false,
  loading: () => fullPanelSkeleton
});

const DynamicFixedCyclesUIRenderer = dynamic<any>(() => import("src/components/cam/FixedCyclesUIRenderer"), {
  ssr: false
});

const DynamicGenericPostProcessor = dynamic<any>(
  () => import("../components/cam/postprocessor/GenericPostProcessor"),
  { ssr: false, loading: () => fullPanelSkeleton }
);

const DynamicLocalCamLibraryView = dynamic<any>(() => import("src/components/library/LocalCamLibraryView"), {
  ssr: false,
  loading: () => fullPanelSkeleton
});

const DynamicUnifiedLibraryModal = dynamic<any>(() => import("../components/library/UnifiedLibraryModal"), {
  ssr: false
});

const DynamicProductionCostsManager = dynamic<any>(
  () => import("@/src/components/production-costs/ProductionCostsManager"),
  { ssr: false, loading: () => fullPanelSkeleton }
);

export const DynamicToolpathGenerator = dynamic(() => import("src/components/cam/ToolpathGenerator"), {
  ssr: false, // Heavy Three.js component
  loading: () => <div className="w-full h-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
});

export const DynamicPostProcessors = {
  Fanuc: dynamic<any>(() => import("src/components/cam/postprocessor/FanucPostProcessor"), { ssr: false }),
  Heidenhain: dynamic<any>(() => import("src/components/cam/postprocessor/HeidenhainPostProcessor"), { ssr: false })
};

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

const toolbarVariants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0 }
};

const sidebarVariants = {
  open: { x: 0, opacity: 1 },
  closed: { x: -300, opacity: 0.7 }
};

const rightSidebarVariants = {
  open: { x: 0, opacity: 1 },
  closed: { x: 300, opacity: 0.7 }
};

const tabVariants = {
  active: {
    scale: 1.02,
    backgroundColor: "rgba(37, 99, 235, 1)",
    color: "white"
  },
  inactive: {
    scale: 1,
    backgroundColor: "rgba(156, 163, 175, 0.2)",
    color: "rgba(55, 65, 81, 1)"
  }
};

export default function CAMPage() {

  const router = useRouter();
  const syncWorkpieceFromCAD = useCAMStore(state => state.syncWorkpieceFromCAD);

  // Sincronizza il workpiece dal CAD quando si carica la pagina CAM
  useEffect(() => {
    console.log("CAM Page mounted - sincronizzazione workpiece dal CAD");
    syncWorkpieceFromCAD();
  }, [syncWorkpieceFromCAD]);

  // Stati per il CAM editor
  const [activeTab, setActiveTab] = useState<"preview" | "editor" | "visualizer" | "post-processor">("editor");
  const [aiEnhancedMode, setAiEnhancedMode] = useState<boolean>(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState<"machine" | "layers" | "settings" | "explorer">("machine");
  const [gcode, setGcode] = useState<string>("");
  const [processedGcode, setProcessedGcode] = useState<string>("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [selectedPostProcessor, setSelectedPostProcessor] = useState<PostProcessorType>("fanuc");
  const [activeRightPanel, setActiveRightPanel] = useState<"generator" | "cycles" | "control" | "analysis">(
    "generator"
  );
  const [selectedLibraryTool, setSelectedLibraryTool] = useState<string | null>(null);
  const [showChatPanel, setShowChatPanel] = useState(true);

  // AI Configuration Management
  const aiConfigService = useMemo(() => AIConfigurationService.getInstance(), []);
  const [aiConfiguration, setAiConfiguration] = useState(() => aiConfigService.getConfiguration());
  // Setup AI configuration listener for dynamic updates
  useEffect(() => {
    const unsubscribe = aiConfigService.registerConfigurationListener(newConfig => {
      setAiConfiguration(newConfig);
    });

    return unsubscribe;
  }, [aiConfigService]);

  // AI Configuration Update Handler
  const updateAIConfiguration = (updates: any) => {
    aiConfigService.updateConfiguration(updates, {
      validate: true,
      persist: true,
      notify: true
    });
  };

  // Toggle AI Enhanced Mode
  const toggleAIEnhancedMode = () => {
    setAiEnhancedMode(prev => {
      const newMode = !prev;
      updateAIConfiguration({
        proactiveAssistant: {
          ...aiConfiguration.proactiveAssistant,
          enabled: newMode
        }
      });
      return newMode;
    });
  };

  // Nuovo stato per la libreria CAM
  const [showLibrary, setShowLibrary] = useState(false);
  // Add state for the unified library modal
  const [showUnifiedLibrary, setShowUnifiedLibrary] = useState(false);
  // Add state for production costs manager modal
  const [showCostsManager, setShowCostsManager] = useState(false);
  const cadElements = useMemo<any[]>((() => []), []);
  // Add useEffect to load toolpath from localStorage when URL contains loadToolpath parameter
  useEffect(() => {
    const loadToolpathFromStorage = async () => {
      // Only proceed if we have the loadToolpath query parameter
      if (!router.query.loadToolpath) return;

      const toolpathId = router.query.loadToolpath as string;
      console.log("Loading toolpath with ID:", toolpathId);

      try {
        // Get the stored toolpath data
        const storedToolpath = localStorage.getItem("toolpathToLoadInCAM");
        if (!storedToolpath) {
          console.error("No toolpath data found in localStorage");
          toast.error("Toolpath data not found");
          return;
        }

        console.log("Retrieved toolpath data from localStorage");
        const toolpathData = JSON.parse(storedToolpath);
        console.log("Parsed toolpath data:", toolpathData);

        // Validate the toolpath data
        if (!toolpathData || !toolpathData.id || toolpathData.id !== toolpathId) {
          console.error("Invalid toolpath data or ID mismatch");
          toast.error("Invalid toolpath data");
          return;
        }

        // Set the toolpath data in the CAM state
        if (toolpathData.gcode) {
          console.log("Setting G-code in CAM editor");
          setGcode(toolpathData.gcode);
          // Switch to the editor tab to show the loaded code first
          setActiveTab("editor");

          // Show a toast message suggesting to check the visualizer
          setTimeout(() => {
            toast.success('Switch to the "Percorso Utensile" tab to view the toolpath visualization', {
              duration: 5000
            });
          }, 1500);
        }

        toast.success(`Toolpath '${toolpathData.name}' loaded successfully`);

        // Clear the localStorage data
        localStorage.removeItem("toolpathToLoadInCAM");

        // Remove the query parameter
        const { loadToolpath, ...otherParams } = router.query;
        router.replace(
          {
            pathname: router.pathname,
            query: otherParams
          },
          undefined,
          { shallow: true }
        );
      } catch (error) {
        console.error("Error loading toolpath from localStorage:", error);
        toast.error("Failed to load toolpath data. See console for details.");
      }
    };

    loadToolpathFromStorage();
  }, [router.query.loadToolpath, router]);

  // Add useEffect to load tool from localStorage when URL contains loadTool parameter
  useEffect(() => {
    const loadToolFromStorage = async () => {
      // Only proceed if we have the loadTool query parameter
      if (!router.query.loadTool) return;

      const toolId = router.query.loadTool as string;
      console.log("Loading tool with ID:", toolId);

      try {
        // Get the stored tool data
        const storedTool = localStorage.getItem("toolToLoadInCAM");
        if (!storedTool) {
          console.error("No tool data found in localStorage");
          toast.error("Tool data not found");
          return;
        }

        console.log("Retrieved tool data from localStorage");
        const toolData = JSON.parse(storedTool);
        console.log("Parsed tool data:", toolData);

        // Validate the tool data
        if (!toolData || !toolData.id || toolData.id !== toolId) {
          console.error("Invalid tool data or ID mismatch");
          toast.error("Invalid tool data");
          return;
        }

        // Set the selected tool
        setSelectedLibraryTool(toolData.id);
        setActiveRightPanel("generator"); // Switch to generator panel where the tool will be used

        toast.success(`Tool '${toolData.name}' loaded successfully`);

        // Clear the localStorage data
        localStorage.removeItem("toolToLoadInCAM");

        // Remove the query parameter
        const { loadTool, ...otherParams } = router.query;
        router.replace(
          {
            pathname: router.pathname,
            query: otherParams
          },
          undefined,
          { shallow: true }
        );
      } catch (error) {
        console.error("Error loading tool from localStorage:", error);
        toast.error("Failed to load tool data. See console for details.");
      }
    };

    loadToolFromStorage();
  }, [router.query.loadTool, router]);

  // Handler for tool selection from unified library
  const handleToolSelection = (tool: ToolLibraryItem) => {
    setSelectedLibraryTool(tool.id);
    setShowUnifiedLibrary(false);
  };

  // Handler for material selection from unified library
  const handleMaterialSelection = (material: MaterialLibraryItem) => {
    // Handle material selection if needed
    console.log("Selected material:", material);
    setShowUnifiedLibrary(false);
  };

  // Funzione che gestisce il caricamento di un file G-code
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const content = e.target?.result as string;
        setGcode(content);
      } catch (err) {
        console.error("Failed to read the file", err);
      }
    };
    reader.readAsText(file);
  };

  // Funzione per salvare il G-code
  const handleSaveGcode = () => {
    // Se siamo nella tab post-processor e abbiamo codice processato, salviamo quello
    const codeToSave = activeTab === "post-processor" && processedGcode ? processedGcode : gcode;

    if (!codeToSave) return;

    const fileExtension = selectedPostProcessor === "heidenhain" ? ".h" : ".nc";

    const blob = new Blob([codeToSave], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "toolpath-" + new Date().toISOString().slice(0, 10) + fileExtension;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Funzione per avviare/arrestare la simulazione
  const toggleSimulation = () => {
    setIsSimulating(!isSimulating);
  };

  // Funzione per gestire il G-code processato dal post-processor
  const handleProcessedGcode = (processedCode: string, validationResults?: any) => {
    setProcessedGcode(processedCode);
    console.log("Validation results:", validationResults);
  };

  // Funzione per gestire il G-code generato dai cicli macchina
  const handleCycleCodeGenerated = (cycleCode: string) => {
    // Aggiunge il codice del ciclo al gcode esistente o lo sostituisce
    if (activeTab === "editor") {
      // Se siamo nell'editor, appendiamo il ciclo al codice esistente
      setGcode(prevGcode => {
        return prevGcode ? `${prevGcode}\n\n${cycleCode}` : cycleCode;
      });
    } else {
      // Altrimenti impostiamo direttamente il nuovo codice
      setGcode(cycleCode);
    }

    // Passa automaticamente alla tab editor per vedere il codice generato
    setActiveTab("editor");
  };

  // Funzione per gestire il caricamento di un progetto dalla libreria
  const handleLoadProjectFromLibrary = (projectId: string) => {
    // In una implementazione reale, caricheresti il progetto con l'ID specificato
    console.log("Loading project:", projectId);
    setShowLibrary(false);

    // Qui andrà implementata la logica per caricare il progetto
    // usando useLocalLibrary hook o simili
  };

  const [isDarkMode, setIsDarkMode] = useState(false);

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

  return (
    <motion.div
      className="h-screen w-screen flex bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex-col overflow-hidden"
      variants={pageVariants}
      initial="initial"
      animate="in"
      exit="out"
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <>
        <MetaTags ogImage="/og-image.png" title="CAM FUN" />
      </>

      <motion.div
        className="flex flex-col backdrop-blur-md bg-white/80 dark:bg-gray-900/80 h-full w-full border border-white/20 dark:border-gray-700/30 shadow-xl"
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        {/* Top toolbar */}
        <motion.div
          className="backdrop-blur-md bg-white/90 dark:bg-gray-900/90 border-b border-white/30 dark:border-gray-600/30 rounded-2xl w-full px-6 py-3 flex items-center justify-between shadow-lg"
          variants={toolbarVariants}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <motion.div
            className="flex rounded-2xl w-max items-center backdrop-blur-sm bg-white/60 dark:bg-gray-800/60 p-2 shadow-md border border-white/30 dark:border-gray-600/30"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            <motion.button
              className="mr-2 p-3 rounded-xl hover:bg-white/80 dark:hover:bg-gray-700/80 focus:outline-none transition-all duration-200 border border-white/40 dark:border-gray-600/40 shadow-sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Menu size={20} className="text-gray-600 dark:text-gray-400" />
            </motion.button>

            <div className="ml-6 flex items-center space-x-2">
              <button
                onClick={handleSaveGcode}
                className="btn btn-sm btn-outline dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 flex items-center cursor-pointer"
                title="Salva G-Code"
                disabled={!(activeTab === "post-processor" ? processedGcode : gcode)}
              >
                <Save size={16} className="mr-1" />
              </button>
              <label className="btn btn-sm btn-outline flex items-center cursor-pointer" title="Importa G-Code">
                <Upload size={16} className="mr-1 dark:text-gray-300" />

                <input type="file" className="hidden" accept=".nc,.gcode,.cnc,.txt" onChange={handleFileUpload} />
              </label>
              <button
                onClick={toggleSimulation}
                className={`btn btn-sm ${isSimulating ? "btn-danger dark:bg-red-600 dark:hover:bg-red-700" : "btn-success dark:bg-green-600 dark:hover:bg-green-700"} flex items-center`}
                title={isSimulating ? "Arresta Simulazione" : "Avvia Simulazione"}
              >
                {isSimulating ? <Pause size={16} /> : <Play size={16} />}
                <span className="ml-1">{isSimulating ? "Stop" : "Play"}</span>
              </button>
              {/* CAD Link Button */}
              <Link href="/cad">
                <button
                  className="btn btn-sm flex items-center bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 text-white hover:from-blue-600 hover:via-indigo-600 hover:to-purple-600 border-0 shadow-md"
                  title="Switch to CAD Editor"
                >
                  <Grid size={16} className="mr-1" />
                  <span>CAD Editor</span>
                </button>
              </Link>
              {/* Unified Library button */}
              <button
                onClick={() => setShowUnifiedLibrary(true)}
                className="btn btn-sm btn-outline dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 flex items-center"
                title="Unified Library"
              >
                <Folder size={16} className="mr-1" />
                Library
              </button>
              {/* Production Costs Manager button */}
              <button
                onClick={() => setShowCostsManager(true)}
                className="btn btn-sm btn-outline dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 flex items-center"
                title="Gestione Costi di Produzione"
              >
                <DollarSign size={16} className="mr-1" />
                Costi
              </button>
              <button
                onClick={toggleAIEnhancedMode}
                className={`p-1.5 border shadow-sm rounded-md flex items-center mr-2 ${aiEnhancedMode
                  ? "bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                  : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  }`}
                aria-label="Toggle AI Copilot"
                title={aiEnhancedMode ? "Disable AI Copilot" : "Enable AI Copilot"}
              >
                {aiEnhancedMode ? (
                  <Brain className="h-3 w-3 sm:h-4 sm:w-4" />
                ) : (
                  <Zap className="h-3 w-3 sm:h-4 sm:w-4" />
                )}
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
            </div>
          </motion.div>

          {/* Tab buttons */}
          <motion.div
            className="flex space-x-3"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.6, delay: 0.8 }}
          >
            <motion.button
              onClick={() => setActiveTab("preview")}
              className={`flex items-center px-4 py-2 rounded-xl text-sm font-medium backdrop-blur-sm transition-all duration-200 ${activeTab === "preview"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white/70 dark:bg-gray-700/70 text-gray-700 dark:text-gray-300 hover:bg-white/90 dark:hover:bg-gray-600/90 border border-white/40 dark:border-gray-600/40"
                }`}
              variants={tabVariants}
              animate={activeTab === "preview" ? "active" : "inactive"}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Eye size={16} className="mr-1" />
              Preview
            </motion.button>
            <motion.button
              onClick={() => setActiveTab("editor")}
              className={`flex items-center px-4 py-2 rounded-xl text-sm font-medium backdrop-blur-sm transition-all duration-200 ${activeTab === "editor"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white/70 dark:bg-gray-700/70 text-gray-700 dark:text-gray-300 hover:bg-white/90 dark:hover:bg-gray-600/90 border border-white/40 dark:border-gray-600/40"
                }`}
              variants={tabVariants}
              animate={activeTab === "editor" ? "active" : "inactive"}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Code size={16} className="mr-1" />
              Editor G-Code
            </motion.button>
            <motion.button
              onClick={() => setActiveTab("visualizer")}
              className={`flex items-center px-4 py-2 rounded-xl text-sm font-medium backdrop-blur-sm transition-all duration-200 ${activeTab === "visualizer"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white/70 dark:bg-gray-700/70 text-gray-700 dark:text-gray-300 hover:bg-white/90 dark:hover:bg-gray-600/90 border border-white/40 dark:border-gray-600/40"
                }`}
              variants={tabVariants}
              animate={activeTab === "visualizer" ? "active" : "inactive"}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Tool size={16} className="mr-1" />
              Toolpath
            </motion.button>
            <motion.button
              onClick={() => setActiveTab("post-processor")}
              className={`flex items-center px-4 py-2 rounded-xl text-sm font-medium backdrop-blur-sm transition-all duration-200 ${activeTab === "post-processor"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white/70 dark:bg-gray-700/70 text-gray-700 dark:text-gray-300 hover:bg-white/90 dark:hover:bg-gray-600/90 border border-white/40 dark:border-gray-600/40"
                }`}
              variants={tabVariants}
              animate={activeTab === "post-processor" ? "active" : "inactive"}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Settings size={16} className="mr-1" />
              Post-Processor
            </motion.button>
            <motion.button
              onClick={() => setShowChatPanel(!showChatPanel)}
              className="flex items-center px-3 py-2 text-sm font-medium bg-gradient-to-r from-blue-400 to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white rounded-xl shadow-lg transition-all duration-200"
              aria-label={showChatPanel ? "Close Chat Panel" : "Open Chat Panel"}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {showChatPanel ? <PanelRightIcon size={16} /> : <PanelRightInactiveIcon size={16} />}
            </motion.button>
          </motion.div>
        </motion.div>

        <motion.div
          className="flex flex-1 backdrop-blur-sm bg-gradient-to-br from-white/50 to-blue-50/30 dark:from-gray-800/50 dark:to-gray-900/30 p-1 overflow-hidden w-full rounded-lg m-0.5 shadow-lg border-0 border-white/30 dark:border-gray-600/30"
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.6, delay: 1.0 }}
        >
          {/* Enhanced left sidebar */}
          <EnhancedSidebarCam
            isOpen={sidebarOpen}
            setIsOpen={setSidebarOpen}
            activeSidebarTab={activeSidebarTab}
            setActiveSidebarTab={setActiveSidebarTab}
          />

          {/* Main content */}
          <motion.div
            className="flex-1 relative rounded-2xl bg-gradient-to-br from-white/90 to-blue-50/50 dark:from-gray-800/90 dark:to-gray-900/50 shadow-xl border border-white/30 dark:border-gray-600/30 mx-2 backdrop-blur-md"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.8, delay: 1.2 }}
          >
            {activeTab === "preview" && (
              <div className="h-full">
                <DynamicGCodeViewer width="100%" height="100%" gcode={gcode} isSimulating={isSimulating} />
              </div>
            )}

            {activeTab === "editor" && (
              <div className="h-full">
                <DynamicGCodeEditor
                  height="100%"
                  value={gcode}
                  onChange={setGcode}
                  enableAICopilot={aiEnhancedMode}
                  aiConfiguration={{
                    enableProactiveAssistant: aiConfiguration.proactiveAssistant.enabled,
                    enableInsightsDashboard: aiConfiguration.insights.enabled,
                    enableVoiceInteraction: aiConfiguration.voiceInteraction.enabled,
                    analysisRefreshInterval: aiConfiguration.insights.refreshInterval
                  }}
                />
              </div>
            )}

            {activeTab === "visualizer" && (
              <div className="h-full rounded-xl">
                <DynamicOptimizedToolpathVisualizer
                  width="100%"
                  height="100%"
                  gcode={gcode}
                  isSimulating={isSimulating}
                  selectedTool={selectedLibraryTool}
                  showWorkpiece={true}
                  cadElements={cadElements}
                  onSimulationComplete={() => {
                    // Handle simulation complete
                    setIsSimulating(false);
                  }}
                  onSimulationProgress={(progress: number) => {
                    // Update progress if needed
                    console.log(`Simulation progress: ${progress}%`);
                  }}
                  optimizationOptions={{
                    targetFps: 60,
                    adaptiveResolution: true,
                    enableLod: true,
                    enableFrustumCulling: true,
                    enableGeometryOptimization: true,
                    enableInstancing: true,
                    memoryManagement: true,
                    monitorPerformance: true
                  }}
                />
              </div>
            )}

            {activeTab === "post-processor" && (
              <div className="h-full rounded-xl overflow-y-auto">
                {/* Selettore del tipo di post-processor */}
                <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white border-b p-4 flex items-center justify-between">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Post-Processor</h2>
                  <div className="flex items-center space-x-2">
                    <label
                      htmlFor="post-processor-type"
                      className="text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Controller Type:
                    </label>
                    <select
                      id="post-processor-type"
                      className="ml-2 block w-48 pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-500 dark:focus:border-blue-500 sm:text-sm rounded-md"
                      value={selectedPostProcessor}
                      onChange={e => setSelectedPostProcessor(e.target.value as PostProcessorType)}
                    >
                      <option value="fanuc">Fanuc</option>
                      <option value="heidenhain">Heidenhain</option>
                      <option value="siemens">Siemens</option>
                      <option value="haas">Haas</option>
                      <option value="mazak">Mazak</option>
                      <option value="okuma">Okuma</option>
                      <option value="generic">Generic</option>
                    </select>
                  </div>
                </div>

                {/* Componente post-processor in base alla selezione */}
                <div className="p-4 rounded-b-xl bg-gray-50 dark:bg-gray-900">
                  {selectedPostProcessor === "fanuc" && (
                    <DynamicPostProcessors.Fanuc initialGcode={gcode} onProcessedGcode={handleProcessedGcode} />
                  )}

                  {selectedPostProcessor === "heidenhain" && (
                    <DynamicPostProcessors.Heidenhain initialGcode={gcode} onProcessedGcode={handleProcessedGcode} />
                  )}

                  {["siemens", "haas", "mazak", "okuma", "generic"].includes(selectedPostProcessor) && (
                    <DynamicGenericPostProcessor
                      initialGcode={gcode}
                      controllerType={selectedPostProcessor}
                      onProcessedGcode={handleProcessedGcode}
                    />
                  )}
                </div>
              </div>
            )}
          </motion.div>

          {/* Right sidebar for controls */}
          <motion.div
            className={`${rightSidebarOpen ? "w-80" : "w-20"
              } flex-shrink-0 backdrop-blur-md bg-white/90 dark:bg-gray-800/90 dark:text-white border border-white/30 dark:border-gray-600/30 ml-0.5 rounded-2xl shadow-xl transition-all duration-300 ease-in-out h-full flex flex-col`}
            variants={rightSidebarVariants}
            animate={rightSidebarOpen ? "open" : "closed"}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          >
            {/* Tabs for right sidebar */}
            <motion.div
              className="w-full border-b rounded-t-2xl border-white/30 dark:border-gray-600/30 backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 flex justify-center shadow-md"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <AnimatePresence mode="wait">
                {rightSidebarOpen ? (
                  <motion.div
                    className="flex justify-center w-full text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <motion.button
                      className={`flex-1 py-4 px-3 text-sm font-medium glass-hover-light rounded-xl transition-all duration-200 ${activeRightPanel === "generator"
                        ? "text-[#007ACC] bg-blue-50/80 dark:bg-blue-900/30 border-b-2 border-[#007ACC] shadow-md"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-700/40"
                        }`}
                      whileHover="hover"
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setActiveRightPanel("generator")}
                    >
                      <motion.div
                        className="flex items-center justify-center"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.2 }}
                      >
                        <motion.div
                          whileHover={{ scale: 1.1, rotate: 5 }}
                          transition={{ duration: 0.2 }}
                        >
                          <Tool size={16} className="mr-2" />
                        </motion.div>
                        Generator
                      </motion.div>
                    </motion.button>
                    <motion.button
                      className={`flex-1 py-4 px-3 text-sm font-medium glass-hover-light rounded-xl transition-all duration-200 ${activeRightPanel === "cycles"
                        ? "text-[#007ACC] bg-blue-50/80 dark:bg-blue-900/30 border-b-2 border-[#007ACC] shadow-md"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-700/40"
                        }`}
                      whileHover="hover"
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setActiveRightPanel("cycles")}
                    >
                      <motion.div
                        className="flex items-center justify-center"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.3 }}
                      >
                        <motion.div
                          whileHover={{ scale: 1.1, rotate: -5 }}
                          transition={{ duration: 0.2 }}
                        >
                          <Box size={16} className="mr-2" />
                        </motion.div>
                        Cycles
                      </motion.div>
                    </motion.button>

                  </motion.div>
                ) : (
                  <motion.div
                    className="flex flex-col w-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <motion.button
                      className={`w-full py-5 flex flex-col items-center justify-center rounded-xl transition-all duration-200 ${activeRightPanel === "generator"
                        ? "text-[#007ACC] bg-blue-50/80 dark:bg-blue-900/30 border-b-2 border-[#007ACC] shadow-md"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-700/40"
                        }`}
                      whileHover="hover"
                      whileTap="tap"
                      onClick={() => setActiveRightPanel("generator")}
                      title="Generator"
                    >
                      <motion.div
                        whileHover={{ scale: 1.2, rotate: 10 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Tool size={20} />
                      </motion.div>
                    </motion.button>
                    <motion.button
                      className={`w-full py-5 flex flex-col items-center justify-center rounded-xl transition-all duration-200 ${activeRightPanel === "cycles"
                        ? "text-[#007ACC] bg-blue-50/80 dark:bg-blue-900/30 border-b-2 border-[#007ACC] shadow-md"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-700/40"
                        }`}
                      whileHover="hover"
                      whileTap="tap"
                      onClick={() => setActiveRightPanel("cycles")}
                      title="Fixed Cycles"
                    >
                      <motion.div
                        whileHover={{ scale: 1.2, rotate: -10 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Box size={20} />
                      </motion.div>
                    </motion.button>

                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            <div className=" space-y-6 flex-1 rounded-xl overflow-y-auto">
              {activeRightPanel === "generator" && <DynamicToolpathGenerator onGCodeGenerated={setGcode} />}

              {activeRightPanel === "cycles" && (
                <>
                  <DynamicMachineCycles
                    controllerType={selectedPostProcessor as "fanuc" | "heidenhain"}
                    onCycleCodeGenerated={handleCycleCodeGenerated}
                  />
                  <DynamicFixedCyclesUIRenderer gCodeLine={gcode} />
                </>
              )}


            </div>
          </motion.div>

          {/* Toggle right sidebar button */}
          <motion.button
            className="absolute right-0 top-1/2 transform -translate-y-1/2 z-10 glass-interactive backdrop-blur-md bg-white/90 dark:bg-gray-800/90 p-3 rounded-l-2xl shadow-xl border border-white/30 dark:border-gray-600/30 hover:bg-white/95 dark:hover:bg-gray-700/95 transition-all duration-200"
            onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
            whileHover={{ scale: 1.05, x: -2 }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 1.4 }}
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
          transition={{ duration: 0.5, delay: 1.6 }}
        >
          <StatusBar />
        </motion.div>
      </motion.div>

      {/* Modal della libreria CAM */}
      {showLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
          <div className="w-full max-w-6xl max-h-[90vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-xl">
            <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold dark:text-white">Libreria CAM</h2>
              <button
                onClick={() => setShowLibrary(false)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X size={20} className="dark:text-gray-300" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <DynamicLocalCamLibraryView
                onSelectProject={handleLoadProjectFromLibrary}
                onClose={() => setShowLibrary(false)}
                showCloseButton={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* Unified Library Modal */}
      <DynamicUnifiedLibraryModal
        isOpen={showUnifiedLibrary}
        onClose={() => setShowUnifiedLibrary(false)}
        onSelectTool={handleToolSelection}
        onSelectMaterial={handleMaterialSelection}
        onSelectComponent={(_component: ComponentLibraryItem) => {
          /* Placeholder if needed */
        }}
        defaultTab="tools"
      />

      {/* Production Costs Manager Modal */}
      {showCostsManager && (
        <div className="fixed inset-0 z-50 dark:bg flex items-center justify-center bg-black bg-opacity-75 p-4">
          <div className="w-full max-w-7xl max-h-[70vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-xl">
            <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl dark:text-blue-400 font-bold ">Production Costs Manager</h2>
              <button
                onClick={() => setShowCostsManager(false)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X size={20} className="dark:text-gray-300" />
              </button>
            </div>
            <div className="flex-1 rounded-xl overflow-y-auto">
              <DynamicProductionCostsManager />
            </div>
          </div>
        </div>
      )}

      {/* Chat Panel Toggle Button */}

      {/* Chat Panel */}
    </motion.div>
  );
}
