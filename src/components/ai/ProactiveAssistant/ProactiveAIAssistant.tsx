// src/components/ai/ProactiveAssistant/ProactiveAIAssistant.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CheckCircle, Zap, Eye, Settings, Minimize2, Maximize2, Volume2, VolumeX } from "react-feather";
import { useGCodeEditor } from "@/src/contexts/GCodeEditorContext";
import { useCAMStore } from "@/src/store/camStore";
import { ProactiveSuggestion, ContextualHint, ProactiveAnalysisResult, ProactiveAssistantConfig } from "./types";
import { GCodeAnalysisUtils, debounce, PerformanceMonitor } from "./utils";
import ProactiveSuggestionPanel from "./ProactiveSuggestionPanel";
import ContextualHintsProvider from "./ContextualHintsProvider";
import VoiceInteractionHandler from "./VoiceInteractionHandler";
import { Brain, Sparkles } from "lucide-react";

interface ProactiveAIAssistantProps {
  /**
   * Configuration settings for the proactive assistant behavior.
   * This includes analysis frequency, suggestion types, and interaction preferences.
   */
  config?: Partial<ProactiveAssistantConfig>;

  /**
   * Callback function that receives analysis results for external processing
   * or integration with other system components.
   */
  onAnalysisComplete?: (result: ProactiveAnalysisResult) => void;

  /**
   * Callback function triggered when user applies a suggestion.
   * This enables tracking of suggestion effectiveness and user preferences.
   */
  onSuggestionApplied?: (suggestion: ProactiveSuggestion) => void;

  /**
   * Callback function for custom suggestion handling when built-in
   * suggestion application is not sufficient for specific use cases.
   */
  onCustomSuggestionHandler?: (suggestion: ProactiveSuggestion) => Promise<boolean>;

  /**
   * Determines the initial visibility state of the assistant panel.
   * Can be controlled externally for integration with broader UI state management.
   */
  initiallyVisible?: boolean;

  /**
   * Position preference for the assistant panel within the editor interface.
   * This allows flexible positioning based on available screen real estate.
   */
  position?: "right" | "left" | "bottom" | "floating";

  /**
   * Integration mode determines how deeply the assistant integrates with the editor.
   * Embedded mode provides tight integration while overlay mode maintains separation.
   */
  integrationMode?: "embedded" | "overlay";
}

/**
 * ProactiveAIAssistant represents the core component of the enhanced AI Copilot system.
 * This component provides real-time analysis, proactive suggestions, and contextual assistance
 * while maintaining seamless integration with the existing G-code editing environment.
 *
 * The assistant operates through multiple analysis modes including syntax analysis,
 * semantic understanding, pattern recognition, and predictive assistance. It leverages
 * the existing context system while extending capabilities with proactive intelligence.
 */
const ProactiveAIAssistant: React.FC<ProactiveAIAssistantProps> = ({
  config = {},
  onAnalysisComplete,
  onSuggestionApplied,
  onCustomSuggestionHandler,
  initiallyVisible = true,
  position = "right",
  integrationMode = "embedded"
}) => {
  // Integration with existing editor context for seamless operation
  const editorContext = useGCodeEditor();
  const camStore = useCAMStore();

  // Component state management for assistant functionality
  const [isVisible, setIsVisible] = useState<boolean>(initiallyVisible);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [currentSuggestions, setCurrentSuggestions] = useState<ProactiveSuggestion[]>([]);
  const [activeHints, setActiveHints] = useState<ContextualHint[]>([]);
  const [analysisResult, setAnalysisResult] = useState<ProactiveAnalysisResult | null>(null);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(false);

  // Configuration management with intelligent defaults
  const [assistantConfig, setAssistantConfig] = useState<ProactiveAssistantConfig>({
    enableRealTimeAnalysis: true,
    enableVoiceInteraction: false,
    enableProactiveSuggestions: true,
    suggestionFrequency: "moderate",
    autoApplyLowRiskSuggestions: false,
    personalizedLearning: true,
    ...config
  });

  // Performance monitoring for optimal user experience
  const analysisTimerRef = useRef<string | null>(null);
  const lastAnalysisTime = useRef<number>(0);
  const suggestionHistoryRef = useRef<ProactiveSuggestion[]>([]);

  /**
   * Debounced analysis function that performs comprehensive code analysis
   * while maintaining optimal performance during rapid editing sessions.
   */
  const debouncedAnalysis = useCallback(
    debounce(async (code: string, cursorPosition?: number) => {
      if (!assistantConfig.enableRealTimeAnalysis || !code.trim()) {
        return;
      }

      const timerId = PerformanceMonitor.startTimer("proactive_analysis");
      setIsAnalyzing(true);

      try {
        // Perform comprehensive code analysis using utility functions
        const codeAnalysis = GCodeAnalysisUtils.analyzeCodeContext(code, cursorPosition);
        const qualityMetrics = GCodeAnalysisUtils.calculateCodeQuality(code);

        // Generate proactive suggestions based on analysis results
        const suggestions = GCodeAnalysisUtils.generateProactiveSuggestions(
          code,
          codeAnalysis,
          suggestionHistoryRef.current.map(s => s.suggestedAction)
        );

        // Create contextual hints for current editing context
        const hints = cursorPosition ? GCodeAnalysisUtils.generateContextualHints(code, cursorPosition, []) : [];

        // Compile comprehensive analysis result
        const result: ProactiveAnalysisResult = {
          suggestions,
          hints,
          codeQuality: qualityMetrics,
          predictiveInsights: {
            potentialIssues: [],
            recommendedNextSteps: [],
            performanceEstimate: {
              executionTime: 0,
              accuracy: 0.95
            }
          }
        };

        // Update component state with analysis results
        setCurrentSuggestions(suggestions);
        setActiveHints(hints);
        setAnalysisResult(result);

        // Notify external systems of completed analysis
        if (onAnalysisComplete) {
          onAnalysisComplete(result);
        }

        // Track analysis performance metrics
        lastAnalysisTime.current = Date.now();
      } catch (error) {
        console.error("Proactive analysis failed:", error);
      } finally {
        setIsAnalyzing(false);
        if (timerId) {
          PerformanceMonitor.endTimer(timerId);
        }
      }
    }, 1000),
    [assistantConfig, onAnalysisComplete]
  );

  /**
   * Effect hook for monitoring editor content changes and triggering analysis.
   * This maintains real-time awareness of code modifications while optimizing performance.
   */
  useEffect(() => {
    if (editorContext?.content && assistantConfig.enableRealTimeAnalysis) {
      const cursorPosition = editorContext.selectionRange?.start;
      debouncedAnalysis(editorContext.content, cursorPosition);
    }
  }, [editorContext?.content, editorContext?.selectionRange, debouncedAnalysis]);

  /**
   * Effect hook for monitoring selection changes to provide contextual assistance.
   * This enables the assistant to provide relevant hints based on cursor position.
   */
  useEffect(() => {
    if (editorContext?.selectedText && assistantConfig.enableProactiveSuggestions) {
      const hints = GCodeAnalysisUtils.generateContextualHints(
        editorContext.content,
        editorContext.selectionRange?.start || 0,
        []
      );
      setActiveHints(hints);
    }
  }, [editorContext?.selectedText, editorContext?.selectionRange, assistantConfig]);

  /**
   * Handles application of suggested improvements to the code.
   * This function manages both automatic and manual application of suggestions.
   */
  const handleSuggestionApply = useCallback(
    async (suggestion: ProactiveSuggestion) => {
      try {
        let applied = false;

        // Attempt custom suggestion handling first
        if (onCustomSuggestionHandler) {
          applied = await onCustomSuggestionHandler(suggestion);
        }

        // Handle built-in suggestion types if custom handler not available
        if (!applied && suggestion.autoApplicable) {
          // Implement automatic suggestion application logic
          if (suggestion.codeLocation && editorContext?.replaceSelection) {
            // Apply suggestion to specific code location
            const { line, column, length } = suggestion.codeLocation;
            editorContext.replaceSelection(suggestion.suggestedAction || "");
            applied = true;
          }
        }

        if (applied) {
          // Track successful suggestion application
          suggestionHistoryRef.current.push(suggestion);

          // Remove applied suggestion from current suggestions
          setCurrentSuggestions(prev => prev.filter(s => s.id !== suggestion.id));

          // Notify external systems of suggestion application
          if (onSuggestionApplied) {
            onSuggestionApplied(suggestion);
          }
        }
      } catch (error) {
        console.error("Failed to apply suggestion:", error);
      }
    },
    [onCustomSuggestionHandler, onSuggestionApplied, editorContext]
  );

  /**
   * Handles dismissal of suggestions that are not relevant or useful.
   * This contributes to the learning system for improved future suggestions.
   */
  const handleSuggestionDismiss = useCallback(
    (suggestionId: string) => {
      setCurrentSuggestions(prev => prev.filter(s => s.id !== suggestionId));

      // Track dismissed suggestions for learning purposes
      const dismissedSuggestion = currentSuggestions.find(s => s.id === suggestionId);
      if (dismissedSuggestion && assistantConfig.personalizedLearning) {
        // Store dismissal information for future learning
        // Implementation would integrate with learning system
      }
    },
    [currentSuggestions, assistantConfig.personalizedLearning]
  );

  /**
   * Toggles voice interaction capability based on browser support and user preference.
   * This provides hands-free interaction with the assistant during coding sessions.
   */
  const toggleVoiceInteraction = useCallback(() => {
    if ("speechRecognition" in window || "webkitSpeechRecognition" in window) {
      setVoiceEnabled(prev => !prev);
      setAssistantConfig(prev => ({
        ...prev,
        enableVoiceInteraction: !prev.enableVoiceInteraction
      }));
    }
  }, []);

  /**
   * Updates assistant configuration with new settings.
   * This allows dynamic customization of assistant behavior during operation.
   */
  const updateConfig = useCallback((newConfig: Partial<ProactiveAssistantConfig>) => {
    setAssistantConfig(prev => ({ ...prev, ...newConfig }));
  }, []);

  // Render assistant interface based on integration mode and visibility settings
  if (!isVisible) {
    return (
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ 
          scale: 1.1,
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
        }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 p-4 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white rounded-full shadow-lg backdrop-blur-sm border border-white/20 z-50"
        title="Show Proactive AI Assistant"
      >
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
        >
          <Brain size={24} />
        </motion.div>
        
        {/* Floating particles effect */}
        <motion.div
          className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.7, 1, 0.7]
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <motion.div
          className="absolute top-1 -left-1 w-2 h-2 bg-green-400 rounded-full"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5]
          }}
          transition={{ duration: 1.8, repeat: Infinity, delay: 0.3 }}
        />
      </motion.button>
    );
  }

  const containerClasses = `
    ${integrationMode === "overlay" ? "fixed" : "relative"}
    ${position === "right" ? "right-0" : ""}
    ${position === "left" ? "left-0" : ""}
    ${position === "bottom" ? "bottom-0" : ""}
    ${position === "floating" ? "top-4 right-4" : ""}
    ${integrationMode === "overlay" ? "w-80 max-h-96" : "w-full"}
    z-40
  `;

  return (
    <AnimatePresence>
      <motion.div
        key="proactive-assistant-panel"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ 
          opacity: 1, 
          scale: 1, 
          y: 0,
          height: isMinimized ? "48px" : "auto"
        }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={`${containerClasses} bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-white/20 dark:border-gray-700/50 rounded-2xl shadow-xl overflow-hidden`}
      >
      {/* Assistant Header with enhanced glassmorphism */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center h-full justify-between p-4 border-b border-white/20 dark:border-gray-700/50 bg-gradient-to-r from-blue-500 via-purple-600 to-indigo-600 text-white rounded-t-2xl relative overflow-hidden"
      >
        {/* Animated background overlay */}
        <motion.div 
          className="absolute inset-0 bg-white/10 backdrop-blur-sm"
          animate={{
            background: [
              "linear-gradient(45deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.1) 100%)",
              "linear-gradient(45deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)"
            ]
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        
        {/* Holographic shimmer */}
        <motion.div 
          className="absolute inset-0 opacity-30"
          animate={{
            background: [
              "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
              "linear-gradient(240deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)"
            ]
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="flex items-center space-x-3 relative z-10">
          <motion.div
            animate={isAnalyzing ? { 
              rotate: [0, 360],
              scale: [1, 1.2, 1]
            } : {
              rotate: [0, 5, -5, 0]
            }}
            transition={{ 
              duration: isAnalyzing ? 2 : 3, 
              repeat: Infinity,
              repeatDelay: isAnalyzing ? 0 : 2
            }}
            className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm"
          >
            {isAnalyzing ? <Sparkles size={18} /> : <Brain size={18} />}
          </motion.div>
          
          <div>
            <motion.h3 
              key={isAnalyzing ? "analyzing" : "ready"}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="font-bold text-base"
            >
              {isAnalyzing ? "Analyzing Code..." : "Proactive AI Copilot"}
            </motion.h3>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-blue-100"
            >
              {isAnalyzing ? "Deep analysis in progress" : "Ready to assist"}
            </motion.p>
          </div>
        </div>

        <div className="flex items-center space-x-2 relative z-10">
          {/* Voice interaction toggle with enhanced animation */}
          <motion.button
            onClick={toggleVoiceInteraction}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className={`p-2 rounded-lg backdrop-blur-sm border border-white/20 transition-all duration-200 ${
              voiceEnabled 
                ? "bg-green-500/30 text-green-100 shadow-green-500/20" 
                : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
            title={voiceEnabled ? "Disable Voice" : "Enable Voice"}
          >
            <motion.div
              animate={voiceEnabled ? {
                scale: [1, 1.2, 1],
                opacity: [0.7, 1, 0.7]
              } : {}}
              transition={{ duration: 1.5, repeat: voiceEnabled ? Infinity : 0 }}
            >
              {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </motion.div>
          </motion.button>

          {/* Minimize/maximize toggle */}
          <motion.button
            onClick={() => setIsMinimized(!isMinimized)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 transition-all duration-200"
            title={isMinimized ? "Expand" : "Minimize"}
          >
            <motion.div
              animate={{ rotate: isMinimized ? 180 : 0 }}
              transition={{ duration: 0.3 }}
            >
              {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
            </motion.div>
          </motion.button>

          {/* Close button */}
          <motion.button
            onClick={() => setIsVisible(false)}
            whileHover={{ scale: 1.1, backgroundColor: "rgba(239, 68, 68, 0.3)" }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg bg-white/10 hover:bg-red-500/30 backdrop-blur-sm border border-white/20 transition-all duration-200"
            title="Hide Assistant"
          >
            ×
          </motion.button>
        </div>
      </motion.div>

      {/* Assistant Content */}
      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="p-4 space-y-4 flex flex-col overflow-y-auto h-full bg-white/30 dark:bg-gray-800/30 backdrop-blur-sm"
          >
            {/* Code Quality Indicator */}
            <AnimatePresence>
              {analysisResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.9 }}
                  className="bg-white/60 dark:bg-gray-700/60 backdrop-blur-sm rounded-xl p-4 border border-white/20 dark:border-gray-600/30 shadow-lg"
                >
                  <div className="flex items-center justify-between mb-3">
                    <motion.span 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center space-x-2"
                    >
                      <CheckCircle size={16} className="text-blue-500" />
                      <span>Code Quality</span>
                    </motion.span>
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className={`text-lg font-bold px-3 py-1 rounded-full backdrop-blur-sm ${
                        analysisResult.codeQuality.score >= 0.8
                          ? "text-green-600 bg-green-100/50 border border-green-200"
                          : analysisResult.codeQuality.score >= 0.6
                            ? "text-yellow-600 bg-yellow-100/50 border border-yellow-200"
                            : "text-red-600 bg-red-100/50 border border-red-200"
                      }`}
                    >
                      {Math.round(analysisResult.codeQuality.score * 100)}%
                    </motion.span>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(analysisResult.codeQuality.metrics).map(([metric, score], index) => (
                      <motion.div 
                        key={metric} 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="capitalize text-gray-600 dark:text-gray-400 font-medium">{metric}</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-20 bg-gray-200/70 dark:bg-gray-600/70 rounded-full h-2 backdrop-blur-sm">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${score * 100}%` }}
                              transition={{ duration: 0.8, delay: index * 0.1 }}
                              className={`h-2 rounded-full ${
                                score >= 0.8 ? "bg-green-500" : score >= 0.6 ? "bg-yellow-500" : "bg-red-500"
                              }`}
                            />
                          </div>
                          <motion.span 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: index * 0.1 + 0.4 }}
                            className="text-gray-500 dark:text-gray-400 w-10 font-mono"
                          >
                            {Math.round(score * 100)}%
                          </motion.span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Proactive Suggestions Panel */}
            <AnimatePresence>
              {currentSuggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <ProactiveSuggestionPanel
                    suggestions={currentSuggestions}
                    onApply={handleSuggestionApply}
                    onDismiss={handleSuggestionDismiss}
                    config={assistantConfig}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Contextual Hints Provider */}
            <AnimatePresence>
              {activeHints.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <ContextualHintsProvider
                    hints={activeHints}
                    onHintAction={hint => {
                      // Handle contextual hint actions
                      setActiveHints(prev => prev.filter(h => h.id !== hint.id));
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Voice Interaction Handler */}
            <AnimatePresence>
              {voiceEnabled && assistantConfig.enableVoiceInteraction && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <VoiceInteractionHandler
                    isActive={voiceEnabled}
                    onCommand={command => {
                      // Handle voice commands
                      console.log("Voice command received:", command);
                    }}
                    onToggle={toggleVoiceInteraction}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Status Information */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-white/20 dark:border-gray-600/50 bg-white/30 dark:bg-gray-700/30 backdrop-blur-sm rounded-lg p-3"
            >
              <div className="flex justify-between items-center">
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center space-x-2"
                >
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span>
                    Last analysis:{" "}
                    {lastAnalysisTime.current ? new Date(lastAnalysisTime.current).toLocaleTimeString() : "Never"}
                  </span>
                </motion.span>
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center space-x-2"
                >
                  <Eye size={12} />
                  <span className="font-mono">{currentSuggestions.length}</span>
                  <span>suggestions</span>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};

export default ProactiveAIAssistant;
