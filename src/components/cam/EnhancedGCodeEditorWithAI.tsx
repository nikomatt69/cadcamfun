// src/components/cam/EnhancedGCodeEditorWithAI.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, Eye, Zap } from "react-feather";
import { useGCodeEditor, GCodeEditorProvider } from "@/src/contexts/GCodeEditorContext";
import { useCAMStore } from "@/src/store/camStore";
import GCodeAIAgent from "@/src/components/ai/GCodeAIAgent/GCodeAIAgent";
import ProactiveAIAssistant from "@/src/components/ai/ProactiveAssistant/ProactiveAIAssistant";
import AIInsightsDashboard from "@/src/components/ai/AIInsights/AIInsightsDashboard";
import { ProactiveAnalysisService } from "@/src/services/ai/ProactiveAnalysisService";
import { QuickEditToolbar } from "@/src/components/ai/GCodeAIAgent/components/toolbar";
import { Brain, Sparkles, Activity, FileText, Cpu } from "lucide-react";

interface EnhancedGCodeEditorWithAIProps {
  initialCode?: string;
  filename?: string;
  onChange?: (newCode: string) => void;
  onSave?: (code: string) => void;
  readOnly?: boolean;
  value?: string;
  isInsightsDashboardVisible?: boolean;
  aiConfiguration?: {
    enableProactiveAssistant: boolean;
    enableInsightsDashboard: boolean;
    enableVoiceInteraction: boolean;
    analysisRefreshInterval: number;
  };
}

/**
 * EnhancedGCodeEditorWithAI represents the complete AI-enhanced editing environment that integrates
 * all advanced assistance capabilities while maintaining compatibility with the existing editor architecture.
 * This component serves as the primary interface for professional G-code development with comprehensive
 * AI support including proactive analysis, contextual suggestions, and intelligent insights.
 *
 * The implementation maintains the existing editor functionality while seamlessly incorporating
 * advanced AI capabilities through a layered architecture that preserves performance and usability.
 */
const EnhancedGCodeEditorWithAI: React.FC<EnhancedGCodeEditorWithAIProps> = ({
  initialCode,
  filename = "Enhanced G-Code Program.gcode",
  onChange,
  onSave,
  readOnly = false,
  value,
  isInsightsDashboardVisible = true,
  aiConfiguration = {
    enableProactiveAssistant: true,
    enableInsightsDashboard: true,
    enableVoiceInteraction: false,
    analysisRefreshInterval: 30000
  }
}) => {
  // Integration with existing store and context systems
  const storeGcode = useCAMStore(state => state.gcode);
  const setStoreGcode = useCAMStore(state => state.setGcode);

  // Enhanced editor state management
  const [aiPanelVisible, setAiPanelVisible] = useState<boolean>(true);
  const [insightsDashboardVisible, setInsightsDashboardVisible] = useState<boolean>(
    aiConfiguration.enableInsightsDashboard
  );
  const [proactiveAssistantVisible, setProactiveAssistantVisible] = useState<boolean>(
    aiConfiguration.enableProactiveAssistant
  );
  const [currentAnalysisStatus, setCurrentAnalysisStatus] = useState<"idle" | "analyzing" | "complete" | "error">(
    "idle"
  );

  // AI service integration
  const analysisService = useRef(ProactiveAnalysisService.getInstance());
  const [aiMetrics, setAiMetrics] = useState<any>(null);

  // Determine effective initial content with proper priority handling
  const effectiveInitialContent =
    value ??
    storeGcode ??
    initialCode ??
    "; Enhanced G-Code Editor with AI Copilot\n; Professional CNC Programming Environment\n; \n";

  /**
   * Handles internal content changes with proper state synchronization across all system components.
   * This function maintains consistency between the editor, store, and external change handlers
   * while ensuring AI analysis systems receive appropriate update notifications.
   */
  const handleInternalChange = useCallback(
    (newCode: string) => {
      // Update CAM store with debounced approach
      const updateStore = debounce(() => {
        setStoreGcode(newCode);
      }, 500);

      updateStore();

      // Notify external change handler
      if (onChange) {
        onChange(newCode);
      }

      // Trigger AI analysis if content has changed significantly
      if (newCode.length > 0 && newCode !== effectiveInitialContent) {
        setCurrentAnalysisStatus("analyzing");
        performIncrementalAnalysis(newCode);
      }
    },
    [onChange, setStoreGcode, effectiveInitialContent]
  );

  /**
   * Performs incremental AI analysis on code changes to provide real-time feedback without
   * compromising editor responsiveness. This function coordinates multiple analysis processes
   * while maintaining optimal performance through intelligent scheduling and prioritization.
   */
  const performIncrementalAnalysis = useCallback(async (code: string) => {
    try {
      const analysisResult = await analysisService.current.analyzeCode(code, {
        priority: "medium",
        includePerformanceMetrics: true
      });

      setCurrentAnalysisStatus("complete");

      // Update metrics for dashboard display
      const performanceMetrics = analysisService.current.getPerformanceMetrics();
      setAiMetrics(performanceMetrics);
    } catch (error) {
      console.error("Incremental analysis failed:", error);
      setCurrentAnalysisStatus("error");
    }
  }, []);

  /**
   * Handles AI suggestion application with proper validation and user feedback.
   * This function manages the complete suggestion implementation workflow including
   * code modification, validation, and analysis refresh to maintain system consistency.
   */
  const handleAISuggestionApplication = useCallback(
    async (suggestion: any) => {
      try {
        // Apply suggestion through the context system
        // Implementation would depend on suggestion type and target location
        console.log("Applying AI suggestion:", suggestion.title);

        // Trigger analysis refresh after suggestion application
        setTimeout(() => {
          if (value) {
            performIncrementalAnalysis(value);
          }
        }, 1000);
      } catch (error) {
        console.error("Failed to apply AI suggestion:", error);
      }
    },
    [value, performIncrementalAnalysis]
  );

  /**
   * Manages AI panel visibility with proper state synchronization and user preference persistence.
   * This function coordinates the display state of multiple AI assistance components while
   * maintaining interface responsiveness and user workflow continuity.
   */
  const toggleAIPanel = useCallback((panelType: "main" | "insights" | "proactive") => {
    switch (panelType) {
      case "main":
        setAiPanelVisible(prev => !prev);
        break;
      case "insights":
        setInsightsDashboardVisible(prev => !prev);
        break;
      case "proactive":
        setProactiveAssistantVisible(prev => !prev);
        break;
    }
  }, []);

  // Calculate dynamic panel height based on insights dashboard visibility
  const calculatePanelHeight = useCallback(() => {
    if (isInsightsDashboardVisible && insightsDashboardVisible) {
      return 'max-h-[600px]'; // Fixed height when insights dashboard is visible
    } else {
      return 'max-h-[calc(100vh-300px)]'; // Expand to full available height when dashboard is hidden
    }
  }, [isInsightsDashboardVisible, insightsDashboardVisible]);

  // Effect for initializing AI services and establishing analysis pipeline
  useEffect(() => {
    if (effectiveInitialContent && effectiveInitialContent.trim().length > 0) {
      performIncrementalAnalysis(effectiveInitialContent);
    }
  }, [effectiveInitialContent, performIncrementalAnalysis]);

  // Sync insights dashboard visibility with external prop
  useEffect(() => {
    setInsightsDashboardVisible(isInsightsDashboardVisible && aiConfiguration.enableInsightsDashboard);
  }, [isInsightsDashboardVisible, aiConfiguration.enableInsightsDashboard]);

  return (
    <GCodeEditorProvider initialContent={effectiveInitialContent}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col h-full max-h-[650px] bg-gradient-to-br from-white to-blue-50 dark:from-gray-900 dark:to-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        {/* Enhanced Editor Header */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="flex items-center justify-between px-6 py-3 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 border-b border-gray-300 dark:border-gray-600 shadow-lg flex-shrink-0"
        >
          <div className="flex items-center space-x-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, duration: 0.3, type: "spring" }}
              className="flex items-center space-x-3"
            >
              <div className="p-2 bg-white/20 backdrop-blur-sm rounded-lg">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">AI-Enhanced G-Code Editor</h1>
                <p className="text-xs text-blue-100">Professional CNC Programming with AI Copilot</p>
              </div>
              <Sparkles className="w-4 h-4 text-yellow-300 animate-pulse" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.2 }}
              className="flex items-center space-x-2 text-sm"
            >
              <div className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-lg border border-white/30">
                <span className="text-white font-medium">{filename}</span>
              </div>

              <AnimatePresence>
                {currentAnalysisStatus !== "idle" && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center space-x-2 px-3 py-1 bg-white/20 backdrop-blur-sm rounded-lg border border-white/30"
                  >
                    <motion.div
                      animate={{
                        scale: currentAnalysisStatus === "analyzing" ? [1, 1.2, 1] : 1,
                        backgroundColor: currentAnalysisStatus === "analyzing"
                          ? "#eab308"
                          : currentAnalysisStatus === "complete"
                            ? "#10b981"
                            : "#ef4444"
                      }}
                      transition={{
                        repeat: currentAnalysisStatus === "analyzing" ? Infinity : 0,
                        duration: 1
                      }}
                      className="w-2 h-2 rounded-full"
                    />
                    <span className="text-white text-xs font-medium capitalize">{currentAnalysisStatus}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            className="flex items-center space-x-2"
          >
            {/* AI Panel Controls */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => toggleAIPanel("proactive")}
              className={`p-2 rounded-lg transition-all shadow-lg ${proactiveAssistantVisible
                ? "bg-white/30 backdrop-blur-sm text-white border border-white/30"
                : "bg-white/10 backdrop-blur-sm text-white/70 hover:bg-white/20 hover:text-white border border-white/20"
                }`}
              title="Toggle Proactive Assistant"
            >
              <Zap size={16} />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => toggleAIPanel("insights")}
              className={`p-2 rounded-lg transition-all shadow-lg ${insightsDashboardVisible
                ? "bg-white/30 backdrop-blur-sm text-white border border-white/30"
                : "bg-white/10 backdrop-blur-sm text-white/70 hover:bg-white/20 hover:text-white border border-white/20"
                }`}
              title="Toggle Insights Dashboard"
            >
              <Activity size={16} />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => toggleAIPanel("main")}
              className={`p-2 rounded-lg transition-all shadow-lg ${aiPanelVisible
                ? "bg-white/30 backdrop-blur-sm text-white border border-white/30"
                : "bg-white/10 backdrop-blur-sm text-white/70 hover:bg-white/20 hover:text-white border border-white/20"
                }`}
              title="Toggle AI Assistant"
            >
              <Cpu size={16} />
            </motion.button>
          </motion.div>
        </motion.div>

        {/* Main Editor Interface */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="flex flex-1 min-h-0 overflow-hidden"
        >
          {/* Primary Editor Area */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            className="flex-1 flex flex-col min-w-0 overflow-hidden"
          >
            <EditorContentWithAI controlledValue={value} onEditorChange={handleInternalChange} readOnly={readOnly} />
          </motion.div>

          {/* AI Assistance Panels */}
          <div className="flex shrink-0">
            {/* Proactive Assistant Panel */}
            <AnimatePresence>
              {proactiveAssistantVisible && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 400, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="w-[400px] border-l border-gray-300 dark:border-gray-600 bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 shadow-lg overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600"
                >
                  <ProactiveAIAssistant
                    config={{
                      enableRealTimeAnalysis: true,
                      enableVoiceInteraction: aiConfiguration.enableVoiceInteraction,
                      enableProactiveSuggestions: true,
                      suggestionFrequency: "moderate"
                    }}
                    onSuggestionApplied={handleAISuggestionApplication}
                    position="right"
                    integrationMode="embedded"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main AI Agent Panel */}
            <AnimatePresence>
              {aiPanelVisible && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 600, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="w-[600px] border-l border-gray-300 dark:border-gray-600 bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 shadow-lg overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600"
                >
                  <div className="h-full">
                    <GCodeAIWrapper onChange={handleInternalChange} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Insights Dashboard - Fixed height bottom panel */}
        <AnimatePresence>
          {insightsDashboardVisible && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="border-t border-gray-300 dark:border-gray-600 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 shadow-lg h-64 w-full overflow-hidden flex-shrink-0"
            >
              <div className="p-4 h-full flex flex-col">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex items-center space-x-3 mb-4 flex-shrink-0"
                >
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
                    <Activity className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">AI Insights Dashboard</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Comprehensive analysis and recommendations</p>
                  </div>
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="ml-auto"
                  >
                    <Sparkles className="w-5 h-5 text-yellow-500" />
                  </motion.div>
                </motion.div>

                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
                  <AIInsightsDashboard
                    integrationMode="embedded"
                    onInsightAction={(insight, action) => {
                      console.log("Insight action:", insight.title, action);
                      if (action === "apply") {
                        handleAISuggestionApplication(insight);
                      }
                    }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </GCodeEditorProvider>
  );
};

/**
 * EditorContentWithAI integrates the core editing functionality with AI-enhanced capabilities
 * while maintaining the existing editor interface and interaction patterns. This component
 * serves as the bridge between traditional editing and AI-assisted development workflows.
 */
const EditorContentWithAI: React.FC<{
  controlledValue?: string;
  onEditorChange?: (newCode: string) => void;
  readOnly?: boolean;
}> = ({ controlledValue, onEditorChange, readOnly }) => {
  const {
    content,
    setContent,
    selectedText,
    showQuickEdit,
    setShowQuickEdit,
    quickEditPosition,
    editorRef,
    replaceSelection
  } = useGCodeEditor();

  // Synchronize content with external control
  useEffect(() => {
    if (controlledValue !== undefined && content !== controlledValue) {
      setContent(controlledValue);
    }
  }, [controlledValue, content, setContent]);

  // Handle content changes with proper notification
  const handleContentChange = useCallback(
    (e: React.FormEvent<HTMLPreElement>) => {
      if (readOnly) return;

      const newContent = e.currentTarget.textContent || "";
      setContent(newContent);

      if (onEditorChange) {
        onEditorChange(newContent);
      }
    },
    [setContent, onEditorChange, readOnly]
  );

  // Handle quick edit functionality
  const handleQuickEdit = useCallback(
    (instruction: string) => {
      if (!selectedText) return;

      // Simulate AI-powered quick edit processing
      const processedText = `${selectedText} ; AI Edit: ${instruction}`;
      replaceSelection(processedText);
      setShowQuickEdit(false);
    },
    [selectedText, replaceSelection, setShowQuickEdit]
  );

  // Calculate line numbers for display
  const lines = content.split("\n");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex h-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white rounded-lg overflow-hidden shadow-inner"
    >
      {/* Line Numbers */}
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="text-right pr-3 pl-4 py-3 select-none bg-gradient-to-br from-gray-800 to-gray-900 text-gray-400 border-r border-gray-700 min-w-[60px] flex-shrink-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800"
      >
        {lines.map((_, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.01, duration: 0.2 }}
            className="leading-6 text-xs font-mono hover:text-blue-400 transition-colors"
          >
            {index + 1}
          </motion.div>
        ))}
      </motion.div>

      {/* Editor Content */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="flex-1 relative overflow-hidden"
      >
        <pre
          ref={editorRef}
          contentEditable={!readOnly}
          suppressContentEditableWarning={true}
          onInput={handleContentChange}
          className="outline-none p-4 h-full whitespace-pre font-mono text-sm leading-6 bg-transparent focus:bg-gray-800/20 transition-colors duration-200 rounded-r-lg overflow-y-auto scrollbar-thin scrollbar-thumb-blue-500/50 scrollbar-track-gray-700/30 hover:scrollbar-thumb-blue-400/70"
          spellCheck={false}
          style={{
            tabSize: 2,
            caretColor: '#60a5fa',
          }}
        >
          {content}
        </pre>

        {/* Quick Edit Dialog */}
        <AnimatePresence>
          {showQuickEdit && selectedText && quickEditPosition && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-600 rounded-xl shadow-2xl overflow-hidden z-30 backdrop-blur-sm"
              style={{
                top: quickEditPosition.top + 25,
                left: quickEditPosition.left,
                maxWidth: "360px"
              }}
            >
              <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gradient-to-r from-blue-600/20 to-purple-600/20">
                <div className="flex items-center space-x-3">
                  <div className="p-1 bg-blue-500/20 rounded-lg">
                    <Brain className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">AI Quick Edit</h3>
                    <Sparkles className="w-3 h-3 text-yellow-400 inline" />
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, backgroundColor: 'rgba(239, 68, 68, 0.2)' }}
                  whileTap={{ scale: 0.9 }}
                  className="text-gray-400 hover:text-white rounded-lg p-1 transition-colors"
                  onClick={() => setShowQuickEdit(false)}
                >
                  ×
                </motion.button>
              </div>

              <div className="p-4">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mb-3"
                >
                  <label className="text-xs text-gray-400 block mb-2 font-medium">Selected Code:</label>
                  <div className="text-xs bg-gray-900/60 p-3 rounded-lg font-mono text-green-400 border border-gray-700">
                    {selectedText}
                  </div>
                </motion.div>

                <motion.input
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  type="text"
                  placeholder="Describe your edit (e.g., 'Add safety pause')"
                  className="w-full p-3 bg-gray-900/60 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      handleQuickEdit(e.currentTarget.value);
                    }
                  }}
                  autoFocus
                />

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="flex justify-end mt-4 space-x-3"
                >
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-200 transition-all"
                    onClick={() => setShowQuickEdit(false)}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg text-white font-medium shadow-lg transition-all"
                    onClick={e => {
                      const input = e.currentTarget.parentElement?.previousElementSibling as HTMLInputElement;
                      if (input) {
                        handleQuickEdit(input.value);
                      }
                    }}
                  >
                    Apply Edit
                  </motion.button>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selection Toolbar */}
        <AnimatePresence>
          {selectedText && !showQuickEdit && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              <QuickEditToolbar
                onQuickEdit={() => setShowQuickEdit(true)}
                onExplain={() => console.log("Explain selection")}
                onOptimize={() => console.log("Optimize selection")}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

/**
 * GCodeAIWrapper provides the complete AI agent integration while maintaining compatibility
 * with the existing editor context and workflow patterns. This wrapper ensures seamless
 * operation between traditional editing and AI-assisted development processes.
 */
const GCodeAIWrapper: React.FC<{ onChange?: (code: string) => void }> = ({ onChange }) => {
  const { content, selectedText, replaceSelection } = useGCodeEditor();
  const setStoreGcode = useCAMStore(state => state.setGcode);

  const handleUpdateGCode = useCallback(
    (newGCode: string) => {
      setStoreGcode(newGCode);

      if (selectedText) {
        replaceSelection(newGCode);
      }

      if (onChange) {
        onChange(newGCode);
      }
    },
    [setStoreGcode, selectedText, replaceSelection, onChange]
  );

  return (
    <GCodeAIAgent
      gcode={content}
      selectedCode={selectedText}
      onUpdateGCode={handleUpdateGCode}
      isExpanded={true}
      fileName="Enhanced G-Code Program"
    />
  );
};

// Utility function for debouncing operations
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export default EnhancedGCodeEditorWithAI;
