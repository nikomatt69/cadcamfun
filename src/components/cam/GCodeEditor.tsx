// src/components/cam/GCodeEditor.tsx
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";


import { useCAMStore } from "@/src/store/camStore";
import { ChevronLeft, ChevronRight, Cpu, Minus, Pause, Play, Plus, Brain, Zap, Code2, Sparkles } from "lucide-react";
import axios from "axios";

import ProactiveAIAssistant from "@/src/components/ai/ProactiveAssistant/ProactiveAIAssistant";
import AIInsightsDashboard from "@/src/components/ai/AIInsights/AIInsightsDashboard";
import EnhancedGCodeEditor from "./EnhancedGCodeEditor";

interface GCodeEditorProps {
  height?: string;
  value: string;
  onChange: (code: string) => void;
  enableAICopilot?: boolean;
  aiConfiguration?: {
    enableProactiveAssistant: boolean;
    enableInsightsDashboard: boolean;
    enableVoiceInteraction: boolean;
    analysisRefreshInterval: number;
  };
}

/**
 * GCodeEditor serves as the main editor component for G-code in the CAM application.
 * This is a wrapper component that uses the new EnhancedGCodeEditor with AI capabilities.
 */
const GCodeEditor: React.FC<GCodeEditorProps> = ({
  height = "100%",
  value,
  onChange,
  enableAICopilot = true,
  aiConfiguration = {
    enableProactiveAssistant: true,
    enableInsightsDashboard: true,
    enableVoiceInteraction: false,
    analysisRefreshInterval: 30000
  }
}) => {
  const setStoreGcode = useCAMStore(state => state.setGcode);
  // Stato locale per il valore dell'editor
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playSpeed, setPlaySpeed] = useState<number>(1);
  const [highlight, setHighlight] = useState<{ line: number; color: string } | null>(null);
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [isAnalyzingToolpath, setIsAnalyzingToolpath] = useState<boolean>(false);
  const [isAIMode, setIsAIMode] = useState<boolean>(enableAICopilot);
  const [aiModeConfig, setAiModeConfig] = useState(aiConfiguration);

  // Context menu states for right-click functionality
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    position: { x: 0, y: 0 },
    selectedCode: ""
  });

  // Riferimenti ai componenti principali per lo scroll
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const codeViewerRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const lastAnalyzedCodeRef = useRef<string>("");

  useEffect(() => {
    if (value) {
      const splitLines = value.split("\n").filter(line => line.trim());
      setLines(splitLines);
      setCurrentLine(0);

      // Check if code has changed significantly since last analysis
      if (!lastAnalyzedCodeRef.current || Math.abs(value.length - lastAnalyzedCodeRef.current.length) > 200) {
        // Analyze the toolpath with AI
        analyzeToolpath(value);
        lastAnalyzedCodeRef.current = value;
      }
    } else {
      setLines([]);
    }
  }, [value]);

  useEffect(() => {
    // Gestione dell'evento di scroll per mostrare/nascondere il pulsante "torna su"
    const handleScroll = () => {
      if (mainContainerRef.current) {
        setShowScrollTop(mainContainerRef.current.scrollTop > 300);
      }
    };

    const mainContainer = mainContainerRef.current;
    if (mainContainer) {
      mainContainer.addEventListener("scroll", handleScroll);
    }

    return () => {
      if (mainContainer) {
        mainContainer.removeEventListener("scroll", handleScroll);
      }
    };
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isPlaying && lines.length > 0) {
      timer = setTimeout(() => {
        if (currentLine < lines.length - 1) {
          setCurrentLine(prev => prev + 1);

          // Parse line for specific commands that might need visualization
          parseCurrentLine(lines[currentLine]);

          // Auto-scroll alla linea corrente
          scrollToCurrentLine();
        } else {
          setIsPlaying(false);
        }
      }, 1000 / playSpeed);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentLine, lines, playSpeed]);

  // Analyze toolpath with Claude AI
  const analyzeToolpath = async (gcode: string) => {
    if (!gcode || gcode.length < 50) return;

    setIsAnalyzingToolpath(true);

    try {
      // Call Claude API through a proxy endpoint
      const response = await axios.post("/api/ai/toolpath-analysis", {
        gcode,
        model: "claude-sonnet-4-20250514",
        max_tokens: 300
      });

      setAiInsights(response.data.insights);
    } catch (error) {
      console.error("Error analyzing toolpath:", error);
      setAiInsights(null);
    } finally {
      setIsAnalyzingToolpath(false);
    }
  };

  const parseCurrentLine = (line: string) => {
    // Reset highlight
    setHighlight(null);

    // Check if the line has a G or M code
    if (line.includes("G") || line.includes("M")) {
      // Highlight G-code commands
      if (line.includes("G0") || line.includes("G00")) {
        setHighlight({ line: currentLine, color: "bg-blue-100" }); // Rapid movement
      } else if (line.includes("G1") || line.includes("G01")) {
        setHighlight({ line: currentLine, color: "bg-green-100" }); // Linear movement
      } else if (line.match(/G2|G02|G3|G03/)) {
        setHighlight({ line: currentLine, color: "bg-purple-100" }); // Circular movement
      } else if (line.includes("M") && !line.match(/^\s*;/)) {
        setHighlight({ line: currentLine, color: "bg-yellow-100" }); // Machine functions
      }
    }
  };

  const handleTextChange = (newText: string) => {
    onChange(newText);
  };

  const handleApplyOptimized = (optimizedCode: string) => {
    onChange(optimizedCode);
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const nextLine = () => {
    if (currentLine < lines.length - 1) {
      setCurrentLine(currentLine + 1);
      parseCurrentLine(lines[currentLine + 1]);
      scrollToCurrentLine();
    }
  };

  const prevLine = () => {
    if (currentLine > 0) {
      setCurrentLine(currentLine - 1);
      parseCurrentLine(lines[currentLine - 1]);
      scrollToCurrentLine();
    }
  };

  const increaseSpeed = () => {
    if (playSpeed < 10) {
      setPlaySpeed(prev => prev + 0.5);
    }
  };

  const decreaseSpeed = () => {
    if (playSpeed > 0.5) {
      setPlaySpeed(prev => prev - 0.5);
    }
  };

  // Function to handle right-click in the editor or code viewer
  const handleContextMenu = (event: React.MouseEvent, code?: string) => {
    event.preventDefault();

    let selectedCode = code || "";

    // If no code is provided directly, try to get the selection from the browser
    if (!selectedCode) {
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        selectedCode = selection.toString();
      }
    }

    // Only show context menu if there's selected code
    if (selectedCode.trim()) {
      setContextMenu({
        visible: true,
        position: { x: event.clientX, y: event.clientY },
        selectedCode
      });
    }
  };

  // Close the context menu
  const closeContextMenu = () => {
    setContextMenu({
      ...contextMenu,
      visible: false
    });
  };

  // Funzione per scorrere alla linea corrente
  const scrollToCurrentLine = () => {
    if (codeViewerRef.current) {
      const tableRows = codeViewerRef.current.querySelectorAll("tr");
      if (tableRows[currentLine]) {
        tableRows[currentLine].scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  const handleApplySuggestion = (updatedCode: string) => {
    onChange(updatedCode);
  };

  // Funzione per tornare all'inizio della pagina
  const scrollToTop = () => {
    if (mainContainerRef.current) {
      mainContainerRef.current.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }
  };

  // Analisi G-code
  const rapidMoves = lines.filter(line => line.includes("G0") || line.includes("G00")).length;
  const linearMoves = lines.filter(line => line.includes("G1") || line.includes("G01")).length;
  const circularMoves = lines.filter(line => line.match(/G2|G02|G3|G03/)).length;
  const machineFunctions = lines.filter(line => line.includes("M") && !line.match(/^\s*;/)).length;

  // Check if it's Fanuc G-code
  const isFanucGCode = lines.some(
    line => line.includes("%") || line.includes("O") || line.match(/N\d+/) || line.includes("M30")
  );

  // Sincronizza lo stato locale SOLO quando il prop value cambia
  useEffect(() => {
    if (value !== localValue) {
      setLocalValue(value);
    }
  }, [value]);

  // Debounce: aggiorna lo store e il parent solo dopo 500ms di inattività
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setStoreGcode(localValue);
      onChange(localValue);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localValue]);

  // Quando l'utente scrive, aggiorna solo lo stato locale
  const handleChange = (newCode: string) => {
    setLocalValue(newCode);
  };

  // Toggle AI Mode between standard and enhanced
  const toggleAIMode = () => {
    setIsAIMode(prev => !prev);
  };

  // Update AI configuration
  const updateAIConfiguration = (newConfig: Partial<typeof aiConfiguration>) => {
    setAiModeConfig(prev => ({ ...prev, ...newConfig }));
  };

  // Render appropriate editor based on AI mode selection
  const renderEditor = () => {
    if (isAIMode) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="h-full"
        >
          <EnhancedGCodeEditor value={localValue} onChange={handleChange} />
        </motion.div>
      );
    } else {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="w-full h-full overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-900"
        >
          <div className="h-full p-2">
            <EnhancedGCodeEditor value={localValue} onChange={handleChange} />
          </div>
        </motion.div>
      );
    }
  };

  return (
    <motion.div
      ref={mainContainerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col h-full overflow-hidden border border-gray-200 shadow-xl bg-gradient-to-br from-white to-indigo-50 dark:from-gray-800 dark:to-gray-900 rounded-xl dark:border-gray-700"
    >
      {/* Header con gradiente */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-slate-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 dark:border-gray-700 flex-shrink-0"
      >
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-100 rounded-lg dark:bg-indigo-900">
              <Code2 size={24} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text">
                G-Code Editor
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {isAIMode ? "AI-Enhanced Editor with Copilot" : "Standard Code Editor"}
              </p>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleAIMode}
            disabled={true}
            className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-md hover:shadow-lg ${isAIMode
              ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white"
              : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
              }`}
          >
            <motion.div
              animate={{ rotate: isAIMode ? 360 : 0 }}
              transition={{ duration: 0.3 }}
              className="mr-2"
            >
              {isAIMode ? <Brain size={16} /> : <Cpu size={16} />}
            </motion.div>
            {isAIMode ? "AI Enhanced" : "Standard"}
            {isAIMode && <Sparkles size={14} className="ml-1" />}
          </motion.button>
        </div>

        <AnimatePresence>
          {isAIMode && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="flex items-center space-x-2"
            >
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() =>
                  updateAIConfiguration({ enableProactiveAssistant: !aiModeConfig.enableProactiveAssistant })
                }
                className={`p-2 rounded-lg transition-all shadow-sm hover:shadow-md ${aiModeConfig.enableProactiveAssistant
                  ? "bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                  }`}
                title="Toggle Proactive Assistant"
              >
                <Zap size={16} />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => updateAIConfiguration({ enableInsightsDashboard: !aiModeConfig.enableInsightsDashboard })}
                className={`p-2 rounded-lg transition-all shadow-sm hover:shadow-md ${aiModeConfig.enableInsightsDashboard
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                  }`}
                title="Toggle Insights Dashboard"
              >
                <Brain size={16} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Editor Container */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="flex-1 p-4 overflow-hidden"
        ref={editorContainerRef}
      >
        <div className="h-full bg-white border border-gray-200 rounded-lg shadow-lg dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
          {renderEditor()}
        </div>
      </motion.div>

      {/* Scroll to Top Button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={scrollToTop}
            className="fixed z-50 p-3 text-white transition-all duration-300 border rounded-full shadow-lg bottom-6 right-6 bg-gradient-to-r from-indigo-500 to-purple-600 hover:shadow-xl backdrop-blur-sm border-white/20"
            title="Scroll to top"
          >
            <ChevronLeft className="w-5 h-5 transform -rotate-90" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Legacy AI Features - Only shown in standard mode */}
    </motion.div>
  );
};

export default GCodeEditor;
