import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Maximize2, Minimize2, Cpu, Settings, AlertTriangle, Layers, Zap } from "react-feather";
import { v4 as uuidv4 } from "uuid";
import { unifiedAIService } from "@/src/lib/ai/unifiedAIService";
import { AutonomousSession, AutonomousPreferences } from "@/src/types/autonomousTypes";
import { SessionUpdate } from "@/src/lib/ai/autonomous/continuityOrchestrator";
import { AutonomousProgressIndicator, AutonomousReport } from "@/src/components/ai/autonomous";

import { useAI } from "../AIContextProvider";
import { useContinuousAgent } from "@/src/hooks/ai/useContinuousAgent";
import {
  executeWebSearch,
  executeCADAnalysis,
  executeCAMOperation,
  executeAnalysis,
  // Database operations
  createUser,

  createProject,

  createDrawing,

  createComponent,
  updateComponent,
  deleteComponent,
  createMaterial,

  testDatabaseServer,
  // Import the re-exported types from mcpOfficialClient
  WebSearchOptions,
  CADContextForSearch
} from "@/src/lib/ai/mcp/mcpOfficialClient";

// NUOVO: Import per Vision Analysis
import type {
  VisionAnalysisType,
  ImageAnalysisRequest,
  VisionAnalysisResult
} from "@/src/types/visionTypes";
import { WebSearchHelper, SearchPattern } from "@/src/lib/ai/webSearchHelper";
import { useFeatureFlags, useAIFeatures } from "@/src/hooks/useFeatureFlags";
import { FeatureFlag } from "@/src/types/featureFlags";

import { RealTimeThinking } from "../../RealTimeThinking";
import { ProactiveSuggestions } from "../../ProactiveSuggestions";

import {
  AIAction,
  AIModelType,
  AIMessage as AIMessageType,
  AIHistoryItem,
  MessageContent,
  ThinkingStep,
  ThinkingSession,
  AIArtifact
} from "@/src/types/AITypes";
import { extendedThinkingService } from "@/src/lib/ai/ai-new/extendedThinkingService";
import { useExtendedThinking } from "@/src/hooks/useExtendedThinking";
import { useThinkingProcess, useThinkingUI } from "@/src/store/extendedThinkingStore";

import { ThinkingStatsPanel } from "./ThinkingStatsPanel";
import { AIActionHandler } from "./AIActionHandler";
import { AIMessageInput, ToolName, SelectedFileData } from "./AIMessageInput";
import { FeedbackForm } from "./FeedbackForm";

import AISettingsPanel from "../AISettingsPanel";
import AIProcessingIndicator from "../AIProcessingIndicator";
import { useElementsStore } from "@/src/store/elementsStore";
import { AIMessage as AIMessageComponent } from "./AIMessage";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/Tabs";
import { ContextAwareGenerationPanel } from "./ContextAwareGenerationPanel";
import { BarChart3, Brain, Terminal } from "lucide-react";
import { ThinkingDropdown } from "../../ThinkingDropdown";
import { WebSearchDropdown } from "./WebSearchDropdown";
import { WebSearchResult } from "@/src/lib/ai/websearch/websearchService";
import { CodeInterpreterTab, CodeInterpreterPanel } from "./CodeInterpreter";
import { CodeInterpreterResponse } from "@/src/types/codeInterpreterTypes";
import { useAutonomousAgent, UseAutonomousAgentReturn } from "@/src/hooks/ai/useAutonomousAgent";
import { ProgressReport } from "@/src/types/autonomousTypes";
import AutonomousReportModal from "./autonomous/AutonomousReportModal";
import ThinkingStepComponent from "../../ThinkingStepComponent";

// Definition for AgentHistoryExchange
interface AgentHistoryExchange {
  message: string;
  response: string;
  timestamp: Date;
  thinking?: ThinkingSession;
  // Add other potential fields from useContinuousAgent history items if they exist
}

interface ConstraintPreset {
  id: string;
  name: string;
  description: string;
  constraints: Record<string, any>;
}

interface CADAssistantOpenaiProps {
  contextData: any;
  actionHandler: any;
  onClose: () => void;
  availableModels?: AIModelType[];
  constraintPresets?: ConstraintPreset[];
  availableElementTypes?: string[];
  isProcessing: boolean;
  pendingActions: AIAction[];
  clearMessages: () => void;
  executePendingAction: (action: AIAction) => Promise<{ success: boolean; message: string }>;
}

export const CADAssistantOpenai: React.FC<CADAssistantOpenaiProps> = ({
  contextData,
  actionHandler,
  onClose,
  availableModels = ["gpt-4.1" as AIModelType],
  constraintPresets = [],
  availableElementTypes = [],
  isProcessing: legacyIsProcessingFromProps, // Renamed to avoid conflict
  pendingActions,
  clearMessages,
  executePendingAction
}) => {
  const { state, textToCAD: contextTextToCAD, sendAssistantMessage: contextSendAssistantMessage, dispatch } = useAI();

  // Feature flags
  const aiFeatures = useAIFeatures();
  const { hasFeature, checkFeature } = useFeatureFlags();

  // Check if user has access to AI Assistant
  if (!aiFeatures.hasAIAssistant) {
    const upgradeCheck = aiFeatures.checkAIAssistant();
    return (
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        className="fixed z-50 top-4 right-4 w-80 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-6"
      >
        <div className="text-center">
          <MessageCircle className="w-12 h-12 text-blue-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            AI Assistant
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            AI Assistant is available in {upgradeCheck.suggestedPlan} plan and above.
          </p>
          {upgradeCheck.upgradeRequired && (
            <button
              onClick={() => window.location.href = '/pricing'}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Upgrade to {upgradeCheck.suggestedPlan}
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  // Initialize conversationId internally
  const [internalConversationId] = useState(() => uuidv4());

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedModel, setSelectedModel] = useState<AIModelType>(
    state.currentModel || availableModels[0] || ("gpt-4.1" as AIModelType)
  );
  const [maxTokens, setMaxTokens] = useState<number>(state.settings.maxTokens || 6000);
  const [complexity, setComplexity] = useState<number>(0.5);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("custom");
  const [customMaxWidth, setCustomMaxWidth] = useState<number>(200);
  const [customMaxHeight, setCustomMaxHeight] = useState<number>(200);
  const [customMaxDepth, setCustomMaxDepth] = useState<number>(200);
  const [customPreferredTypes, setCustomPreferredTypes] = useState<string[]>([]);
  const [generationStatus, setGenerationStatus] = useState<"idle" | "generating" | "success" | "error">("idle");
  const [generationHistory, setGenerationHistory] = useState<
    Array<{
      id: string;
      description: string;
      timestamp: number;
      elements: any[];
    }>
  >([]);
  const [activeTab, setActiveTab] = useState("assistant");
  const [showCodeInterpreter, setShowCodeInterpreter] = useState(false);

  // Web Search state
  const [webSearchResults, setWebSearchResults] = useState<WebSearchResult[] | null>(null);
  const [isWebSearching, setIsWebSearching] = useState(false);
  const [webSearchQuery, setWebSearchQuery] = useState("");
  const [webSearchTime, setWebSearchTime] = useState<number | undefined>();
  const [webSearchTotalResults, setWebSearchTotalResults] = useState<number | undefined>();
  const [showWebSearchDropdown, setShowWebSearchDropdown] = useState(false);
  const [isVisionProcessing, setIsVisionProcessing] = useState(false);
  const [isCodeProcessing, setIsCodeProcessing] = useState(false);
  // Destructure directly from the hook's return
  const { elements: canvasElements, selectedElement, addElements } = useElementsStore();
  const [mcpEnabled, setMcpEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cad-assistant-mcp-enabled");
      return saved ? JSON.parse(saved) : true;
    }
    return true;
  });

  const [mcpServers, setMcpServers] = useState<string[]>(["filesystem", "specialized-tools", "cadcamfun-database"]);
  const [showMCPStatus, setShowMCPStatus] = useState(false);
  const [databaseEnabled, setDatabaseEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cad-assistant-database-enabled");
      return saved ? JSON.parse(saved) : true;
    }
    return true;
  });
  const [databaseStatus, setDatabaseStatus] = useState<"unknown" | "connected" | "disconnected" | "testing">("unknown");
  const [showDatabasePanel, setShowDatabasePanel] = useState(false);

  // Autonomous system state
  const [autonomousEnabled, setAutonomousEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cad-assistant-autonomous-enabled");
      return saved ? JSON.parse(saved) : true;
    }
    return true;
  });
  const [activeAutonomousSession, setActiveAutonomousSession] = useState<AutonomousSession | null>(null);

  // Feedback form state
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackMessageId, setFeedbackMessageId] = useState<string | null>(null);

  // Code Interpreter state
  const [codeInterpreterEnabled, setCodeInterpreterEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cad-assistant-code-interpreter-enabled");
      return saved ? JSON.parse(saved) : true;
    }
    return true;
  });

  const {
    sendMessage: sendAgentMessage,
    acceptSuggestion,
    currentThinking: agentThinking,
    proactiveSuggestions: agentSuggestions,
    conversationHistory: agentHistory,
    isProcessing: agentProcessing,
    error: agentError,
    clearHistory: clearAgentHistory,
    dismissSuggestions,
    getStatistics: getAgentStatistics
  } = useContinuousAgent(internalConversationId, {
    enableThinking: true,
    enableMCP: mcpEnabled,
    autoSuggest: true,
    persistContext: true,
    mcpServers
  });

  const {
    startThinkingSession,
    addThinkingStep,
    finalizeThinkingSession,
    currentSessions: thinkingSessions,
    thinkingOptions,
    generateProactiveSuggestions: generateLegacyProactiveSuggestions,
    updateThinkingOptions,
    getMemoryStats
  } = useExtendedThinking();

  const {
    currentThinking: unifiedCurrentThinking,
    isThinking: mainUnifiedIsThinking,
    startThinking: unifiedStartThinking,
    addStep: unifiedAddStep,
    completeThinking: unifiedCompleteThinking,
    interruptThinking: unifiedInterruptThinking
  } = useThinkingProcess();

  const {
    showDropdown: showThinkingDropdown,
    toggleDropdown: toggleThinkingDropdown,
    expandedSteps: expandedThinkingSteps,
    expandStep: expandThinkingStep,
    collapseStep: collapseThinkingStep
  } = useThinkingUI();

  const [extendedThinkingEnabled, setExtendedThinkingEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cad-assistant-extended-thinking");
      return saved ? JSON.parse(saved) : true;
    }
    return true;
  });
  const [showThinkingStats, setShowThinkingStats] = useState(false);

  const [legacyIsThinking, setLegacyIsThinking] = useState(false);
  const [legacyCurrentThinkingContent, setLegacyCurrentThinkingContent] = useState<string>("");
  const [legacyCurrentThinkingDuration, setLegacyCurrentThinkingDuration] = useState<number>(0);


  const {
    isRunning: isRunningAutonomously, // from useAutonomousAgent
    autonomousSession, // correct property name
    error: autonomousError, // for error handling and display
    finalReport, // from useAutonomousAgent
    isSessionEnded: isAutonomousSessionEnded, // from useAutonomousAgent
    startAutonomousTask,
    stopAutonomous: interruptAutonomousTask, // rename to match usage
    clearSession: clearAutonomousSession, // correct property name
    currentIteration, // for progress display
    maxIterations, // for progress display
    progressPercent, // for progress bars
    qualityScore // for quality display
  }: UseAutonomousAgentReturn = useAutonomousAgent({
    elementStoreActions: {
      addElementsToCanvas: addElements,
      replaceAllCanvasElements: (elements: any[]) => {
        // Clear existing elements and add new ones
        const { elements: currentElements } = useElementsStore.getState();
        const elementIds = currentElements.map(el => el.id);

        // Remove all current elements
        elementIds.forEach(id => {
          useElementsStore.getState().deleteElement(id);
        });

        // Add new elements
        if (elements && elements.length > 0) {
          addElements(elements);
          console.log(`🔄 Canvas replaced with ${elements.length} new elements`);
        }
      }
    }
  });

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [userInput, setUserInput] = useState(""); // This will be removed

  // Effect to dispatch report message when autonomous session ends
  useEffect(() => {
    if (isAutonomousSessionEnded && finalReport && dispatch) {
      const reportArtifact: AIArtifact = {
        id: uuidv4(),
        type: "autonomous_report", // New artifact type
        content: finalReport,
        title: "View Autonomous Session Report"
      };

      dispatch({
        type: "ADD_TO_HISTORY",
        payload: {
          id: uuidv4(),
          type: "assistant_response",
          timestamp: Date.now(),
          result: `Autonomous session completed. ${finalReport.summary || "Click to view details."}`,
          modelUsed: "Autonomous System",
          processingTime: finalReport.duration || 0,
          artifacts: [reportArtifact]
        } satisfies AIHistoryItem
      });
      // Potentially open the modal automatically or wait for button click
      // setIsReportModalOpen(true); // Example: open automatically
    }
  }, [isAutonomousSessionEnded, finalReport, dispatch]);

  const submitFeedbackHandler = async (messageId: string, comment: string) => {

    try {
      const response = await fetch("/api/ai/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ messageId, rating: "bad", comment })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit feedback");
      }
      // Close feedback form after successful submission
      setShowFeedbackForm(false);
      setFeedbackMessageId(null);

    } catch (error) {
      console.error("Error submitting feedback:", error);
    }
  };

  const handleCloseFeedbackForm = () => {
    setShowFeedbackForm(false);
    setFeedbackMessageId(null);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    const currentProcessingState = state.isProcessing || agentProcessing || mainUnifiedIsThinking || legacyIsThinking;

    if (currentProcessingState) {
      setProgress(prev => (prev === 100 ? 0 : prev));
      interval = setInterval(() => {
        setProgress(prev => {
          const increment = prev < 30 ? 5 : prev < 60 ? 3 : prev < 80 ? 1 : 0.5;
          return Math.min(prev + increment, 90);
        });
      }, 300);
    } else {
      setProgress(100);
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state.isProcessing, agentProcessing, mainUnifiedIsThinking, legacyIsThinking]);

  const handleFeedback = async (messageId: string, rating: "good" | "bad") => {
    console.log(`Feedback received for message ${messageId}: ${rating}`);
    if (rating === "good") {

      try {
        await fetch("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, rating: "good" })
        });
      } catch (error) {
        console.error("Error submitting positive feedback:", error);
      }
    } else {

      setFeedbackMessageId(messageId);
      setShowFeedbackForm(true);
    }
  };

  const handleModelChange = (model: AIModelType) => {
    setSelectedModel(model);
    dispatch({ type: "SET_MODEL", payload: model });
  };
  const handleMaxTokensChange = (tokens: number) => {
    setMaxTokens(tokens);
  };
  const handleComplexityChange = (complexity: number) => setComplexity(complexity);
  const handlePresetChange = (presetId: string) => setSelectedPresetId(presetId);
  const handleCustomMaxWidthChange = (width: number) => setCustomMaxWidth(width);
  const handleCustomMaxHeightChange = (height: number) => setCustomMaxHeight(height);
  const handleCustomMaxDepthChange = (depth: number) => setCustomMaxDepth(depth);
  const handleCustomPreferredTypesChange = (types: string[]) => setCustomPreferredTypes(types);

  useEffect(() => {
    const legacyContextData = {
      messages: state.history.slice(-50),
      lastInteraction: Date.now(),
      sessionId: sessionStorage.getItem("ai-session-id") || uuidv4(),
      thinkingSessions: Array.from(thinkingSessions.entries())
    };
    localStorage.setItem("cad-assistant-context", JSON.stringify(legacyContextData));
    sessionStorage.setItem("ai-session-id", legacyContextData.sessionId);
  }, [state.history, thinkingSessions]);

  useEffect(() => {
    localStorage.setItem("cad-assistant-mcp-enabled", JSON.stringify(mcpEnabled));
  }, [mcpEnabled]);

  useEffect(() => {
    localStorage.setItem("cad-assistant-database-enabled", JSON.stringify(databaseEnabled));
  }, [databaseEnabled]);

  useEffect(() => {
    localStorage.setItem("cad-assistant-code-interpreter-enabled", JSON.stringify(codeInterpreterEnabled));
  }, [codeInterpreterEnabled]);

  useEffect(() => {
    localStorage.setItem("cad-assistant-autonomous-enabled", JSON.stringify(autonomousEnabled));
  }, [autonomousEnabled]);

  // Monitor active autonomous sessions
  useEffect(() => {
    if (!activeAutonomousSession?.id) return;

    const checkInterval = setInterval(() => {
      const currentState = unifiedAIService.getAutonomousSessionState(activeAutonomousSession.id);
      if (currentState) {
        setActiveAutonomousSession(currentState);

        // Aggiungi risultati delle iterazioni alla storia
        if (currentState.iterations.length > activeAutonomousSession.iterations.length) {
          const newIterations = currentState.iterations.slice(activeAutonomousSession.iterations.length);

          newIterations.forEach(iteration => {
            dispatch({
              type: "ADD_TO_HISTORY",
              payload: {
                id: uuidv4(),
                type: "assistant_response",
                timestamp: Date.now(),
                result: `**Autonomous Iteration ${iteration.iteration}** (Quality: ${iteration.qualityAfter.score}%)\n\n${iteration.output}`,
                modelUsed: "Autonomous System",
                processingTime: iteration.processingTime
              } satisfies AIHistoryItem
            });
          });
        }
      }
    }, 1000); // Check ogni secondo

    return () => clearInterval(checkInterval);
  }, [activeAutonomousSession?.id, activeAutonomousSession?.iterations.length, dispatch]);

  // Test database connection when enabled
  useEffect(() => {
    if (databaseEnabled && mcpEnabled) {
      const testDatabaseConnection = async () => {
        setDatabaseStatus("testing");
        try {

          const dbTest = await testDatabaseServer();

          if (dbTest.success) {

            setDatabaseStatus("connected");
          } else {

            setDatabaseStatus("disconnected");
          }
        } catch (error) {

          setDatabaseStatus("disconnected");
        }
      };
      testDatabaseConnection();
    } else {
      setDatabaseStatus("unknown");
    }
  }, [databaseEnabled, mcpEnabled]);

  useEffect(() => {
    if (mcpEnabled) {
      const testMCPConnection = async () => {
        try {
          console.log("✅ MCP Integration ready");

          // Commento ricerca web di test per evitare chiamate inutili
          /*
          console.log('🔍 Testing MCP WebSearch Integration (via mcpOfficialClient)...');
          
          // Updated options and context for the new executeWebSearch signature
          const testOptions: WebSearchOptions = {
            maxResults: 3,
            contextAware: true,
            language: 'en',
            region: 'US'
          };
          const testCADContext: CADContextForSearch = {
            projectType: 'CAD software testing',
            technicalTerms: ['CAD', 'software', 'test']
          };

          const webSearchTest = await executeWebSearch(
            'CAD software test query', // A more descriptive test query
            testOptions,
            testCADContext
          );
          
          if (webSearchTest.success && webSearchTest.data) {
            console.log('✅ WebSearch MCP integration working. Assistant says:', webSearchTest.data.assistant_content.substring(0, 100) + "...");
            if (webSearchTest.data.results && webSearchTest.data.results.length > 0) {
              console.log(`✅ Found ${webSearchTest.data.results.length} citation(s). First citation: ${webSearchTest.data.results[0].title}`);
            }
          } else {
            console.warn('⚠️ WebSearch MCP test issues:', webSearchTest.error || 'Test failed, no data returned');
          }
          */
        } catch (error) {
          console.error("❌ MCP test failed:", error);
        }
      };
      testMCPConnection();
    }
  }, [mcpEnabled]);

  useEffect(() => {
    localStorage.removeItem("cad-assistant-demo-thinking");
    const savedContext = localStorage.getItem("cad-assistant-context");
    if (savedContext) {
      try {
        const contextData = JSON.parse(savedContext);
        const timeSinceLastInteraction = Date.now() - contextData.lastInteraction;
        if (timeSinceLastInteraction < 30 * 60 * 1000) {

        }
      } catch (error) {
        console.error("Error loading CAD Assistant conversation context:", error);
      }
    }
  }, []);

  // Helper function to detect database operations
  const isDatabaseQuery = (message: string) => {
    const lowerMessage = message.toLowerCase().trim();

    // Database operation patterns
    const dbPatterns = [
      /create\s+(user|project|drawing|component|material|tool|machine|organization|subscription)/,
      /update\s+(user|project|drawing|component|material|tool|machine|organization|subscription)/,
      /delete\s+(user|project|drawing|component|material|tool|machine|organization|subscription)/,
      /save\s+(to\s+)?database/,
      /store\s+(in\s+)?database/,
      /database\s+(save|store|create|update|delete)/,
      /manage\s+(users|projects|drawings|components|materials|tools|machines)/,
      /list\s+(users|projects|drawings|components|materials|tools|machines)/,
      /show\s+(users|projects|drawings|components|materials|tools|machines)/,
      /add\s+(to\s+)?(database|storage)/,
      /persist\s+(data|project|design)/,
      /salva\s+(nel\s+)?database/,
      /memorizza\s+(nel\s+)?database/,
      /crea\s+(utente|progetto|disegno|componente|materiale|strumento)/,
      /aggiorna\s+(utente|progetto|disegno|componente|materiale|strumento)/,
      /elimina\s+(utente|progetto|disegno|componente|materiale|strumento)/
    ];

    return dbPatterns.some(pattern => pattern.test(lowerMessage));
  };

  // Database operation handler
  const handleDatabaseOperation = async (message: string, operation?: string) => {
    if (!databaseEnabled || databaseStatus !== "connected") {
      console.error("❌ Database not available. Please check connection.");
      return;
    }

    const lowerMessage = message.toLowerCase().trim();
    let operationResult;

    try {
      // Extract operation type and data from message
      if (lowerMessage.includes("create user")) {
        const userData = extractUserDataFromMessage(message);
        operationResult = await createUser(userData);
      } else if (lowerMessage.includes("create project")) {
        const projectData = extractProjectDataFromMessage(message);
        operationResult = await createProject(projectData);
      } else if (lowerMessage.includes("create drawing")) {
        const drawingData = extractDrawingDataFromMessage(message);
        operationResult = await createDrawing(drawingData);
      } else if (lowerMessage.includes("create component")) {
        const componentData = extractComponentDataFromMessage(message);
        operationResult = await createComponent(componentData);
      } else if (lowerMessage.includes("create material")) {
        const materialData = extractMaterialDataFromMessage(message);
        operationResult = await createMaterial(materialData);
      } else if (lowerMessage.includes("test database") || lowerMessage.includes("check database")) {
        operationResult = await testDatabaseServer();
      } else {
        // Generic database operation
        operationResult = {
          success: false,
          error: 'Database operation not recognized. Try: "create user", "create project", "create drawing", etc.'
        };
      }

      // Add result to conversation
      const resultMessage = operationResult.success
        ? `✅ **Database Operation Successful**

${operationResult.success && "result" in operationResult
          ? JSON.stringify(operationResult.result, null, 2)
          : operationResult.success && "tools" in operationResult
            ? JSON.stringify(operationResult.tools, null, 2)
            : "" // Should not happen if success is true
        }`
        : `❌ **Database Operation Failed**

${operationResult.error}`;

      dispatch({
        type: "ADD_TO_HISTORY",
        payload: {
          id: uuidv4(),
          type: operationResult.success ? "assistant_response" : "assistant_error",
          timestamp: Date.now(),
          result: resultMessage,
          modelUsed: "CADCAMFUN Database",
          processingTime: 0
        } satisfies AIHistoryItem
      });

      if (operationResult.success) {

      } else {
        console.error(`❌ Database operation failed: ${operationResult.error}`);
      }
    } catch (error) {
      console.error("❌ Database operation error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      dispatch({
        type: "ADD_TO_HISTORY",
        payload: {
          id: uuidv4(),
          type: "system_error",
          timestamp: Date.now(),
          result: `🚨 **Database System Error**\n\nOperation: "${message}"\nError: ${errorMessage}`,
          modelUsed: "CADCAMFUN Database",
          processingTime: 0
        } satisfies AIHistoryItem
      });

      console.error(`🚨 Database error: ${errorMessage}`);
    }
  };

  // Helper functions to extract data from messages
  const extractUserDataFromMessage = (message: string) => {
    // Simple extraction - in real app, use more sophisticated parsing
    const emailMatch = message.match(/email[:\s]+([\w.-]+@[\w.-]+\.[\w]+)/i);
    const nameMatch = message.match(/name[:\s]+([^,\n]+)/i);

    return {
      name: nameMatch ? nameMatch[1].trim() : "New User",
      email: emailMatch ? emailMatch[1].trim() : `user${Date.now()}@example.com`
    };
  };

  const extractProjectDataFromMessage = (message: string) => {
    const nameMatch = message.match(/(?:project|nome)[:\s]+([^,\n]+)/i);
    const descMatch = message.match(/(?:description|descrizione)[:\s]+([^,\n]+)/i);

    return {
      name: nameMatch ? nameMatch[1].trim() : `New Project ${Date.now()}`,
      description: descMatch ? descMatch[1].trim() : "Created via CAD Assistant",
      ownerId: "user-from-assistant", // In real app, get from session
      isPublic: false
    };
  };

  const extractDrawingDataFromMessage = (message: string) => {
    const nameMatch = message.match(/(?:drawing|disegno|nome)[:\s]+([^,\n]+)/i);
    const descMatch = message.match(/(?:description|descrizione)[:\s]+([^,\n]+)/i);

    return {
      name: nameMatch ? nameMatch[1].trim() : `New Drawing ${Date.now()}`,
      description: descMatch ? descMatch[1].trim() : "Created via CAD Assistant",
      projectId: "default-project-id", // In real app, get from context
      data: {
        elements: contextData?.elements || [],
        metadata: {
          createdBy: "CAD Assistant",
          timestamp: Date.now()
        }
      }
    };
  };

  const extractComponentDataFromMessage = (message: string) => {
    const nameMatch = message.match(/(?:component|componente|nome)[:\s]+([^,\n]+)/i);
    const typeMatch = message.match(/(?:type|tipo)[:\s]+([^,\n]+)/i);

    return {
      name: nameMatch ? nameMatch[1].trim() : `New Component ${Date.now()}`,
      description: "Created via CAD Assistant",
      type: typeMatch ? typeMatch[1].trim() : "mechanical",
      projectId: "default-project-id", // In real app, get from context
      data: {
        geometry: contextData?.elements || [],
        properties: {
          createdBy: "CAD Assistant",
          timestamp: Date.now()
        }
      },
      isPublic: false
    };
  };

  const extractMaterialDataFromMessage = (message: string) => {
    const nameMatch = message.match(/(?:material|materiale|nome)[:\s]+([^,\n]+)/i);
    const densityMatch = message.match(/(?:density|densità)[:\s]+([\d.]+)/i);

    return {
      name: nameMatch ? nameMatch[1].trim() : `New Material ${Date.now()}`,
      description: "Created via CAD Assistant",
      properties: {
        density: densityMatch ? parseFloat(densityMatch[1]) : 1.0,
        createdBy: "CAD Assistant",
        timestamp: Date.now()
      },
      isPublic: false
    };
  };

  // Funzione per rilevare se il messaggio è una richiesta di websearch
  const isWebSearchQuery = (
    message: string
  ): { isWebSearch: boolean; confidence: number; matchedPatterns: SearchPattern[]; cleanQuery: string } => {
    const lowerMessage = message.toLowerCase().trim();
    let cleanQuery = lowerMessage;

    const definedPatterns: Array<{
      pattern: RegExp;
      confidence: number;
      description: string;
      category: "direct" | "info" | "external" | "web_keywords";
      clean?: (q: string) => string;
    }> = [
        {
          pattern: /^(cerca|search|find|look\s+up|google|ricerca)\s+/i,
          confidence: 0.9,
          description: "Direct search command",
          category: "direct",
          clean: q => q.replace(/^(cerca|search|find|look\s+up|google|ricerca)\s+/i, "").trim()
        },
        {
          pattern: /what\s+(is|are)\s+/i,
          confidence: 0.7,
          description: "What is/are question",
          category: "info",
          clean: q => q.replace(/what\s+(is|are)\s+/i, "").trim()
        },
        {
          pattern: /how\s+to\s+/i,
          confidence: 0.7,
          description: "How to question",
          category: "info",
          clean: q => q.replace(/how\s+to\s+/i, "").trim()
        },
        {
          pattern: /where\s+can\s+i\s+/i,
          confidence: 0.65,
          description: "Where can I question",
          category: "info",
          clean: q => q.replace(/where\s+can\s+i\s+/i, "").trim()
        },
        {
          pattern: /who\s+(is|are)\s+/i,
          confidence: 0.65,
          description: "Who is/are question",
          category: "info",
          clean: q => q.replace(/who\s+(is|are)\s+/i, "").trim()
        },
        {
          pattern: /when\s+(was|is)\s+/i,
          confidence: 0.65,
          description: "When was/is question",
          category: "info",
          clean: q => q.replace(/when\s+(was|is)\s+/i, "").trim()
        },
        {
          pattern: /why\s+(is|are|do|does)\s+/i,
          confidence: 0.65,
          description: "Why question",
          category: "info",
          clean: q => q.replace(/why\s+(is|are|do|does)\s+/i, "").trim()
        },
        {
          pattern: /cos[aè]\s+[èe]\s+/i,
          confidence: 0.7,
          description: "Italian 'What is' question",
          category: "info",
          clean: q => q.replace(/cos[aè]\s+[èe]\s+/i, "").trim()
        },
        {
          pattern: /come\s+(si\s+)?fa\s+/i,
          confidence: 0.7,
          description: "Italian 'How to' question",
          category: "info",
          clean: q => q.replace(/come\s+(si\s+)?fa\s+/i, "").trim()
        },
        {
          pattern: /dove\s+posso\s+/i,
          confidence: 0.65,
          description: "Italian 'Where can I' question",
          category: "info",
          clean: q => q.replace(/dove\s+posso\s+/i, "").trim()
        },
        {
          pattern: /quando\s+[èe]\s+/i,
          confidence: 0.65,
          description: "Italian 'When is' question",
          category: "info",
          clean: q => q.replace(/quando\s+[èe]\s+/i, "").trim()
        },
        {
          pattern: /perch[èe]\s+/i,
          confidence: 0.65,
          description: "Italian 'Why' question",
          category: "info",
          clean: q => q.replace(/perch[èe]\s+/i, "").trim()
        },
        {
          pattern: /latest\s+/i,
          confidence: 0.6,
          description: "Requests latest information",
          category: "external",
          clean: q => q.replace(/latest\s+/i, "").trim()
        },
        {
          pattern: /current\s+/i,
          confidence: 0.6,
          description: "Requests current information",
          category: "external",
          clean: q => q.replace(/current\s+/i, "").trim()
        },
        {
          pattern: /news\s+about\s+/i,
          confidence: 0.75,
          description: "Requests news about a topic",
          category: "external",
          clean: q => q.replace(/news\s+about\s+/i, "").trim()
        },
        {
          pattern: /reviews\s+of\s+/i,
          confidence: 0.75,
          description: "Requests reviews of something",
          category: "external",
          clean: q => q.replace(/reviews\s+of\s+/i, "").trim()
        },
        {
          pattern: /price\s+of\s+/i,
          confidence: 0.7,
          description: "Requests price of something",
          category: "external",
          clean: q => q.replace(/price\s+of\s+/i, "").trim()
        },
        {
          pattern: /cost\s+of\s+/i,
          confidence: 0.7,
          description: "Requests cost of something",
          category: "external",
          clean: q => q.replace(/cost\s+of\s+/i, "").trim()
        },
        {
          pattern: /specifications\s+of\s+/i,
          confidence: 0.7,
          description: "Requests specifications",
          category: "external",
          clean: q => q.replace(/specifications\s+of\s+/i, "").trim()
        },
        {
          pattern: /comparison\s+between\s+/i,
          confidence: 0.6,
          description: "Requests comparison",
          category: "external",
          clean: q => q.replace(/comparison\s+between\s+/i, "").trim()
        },
        {
          pattern: /best\s+practices\s+for\s+/i,
          confidence: 0.6,
          description: "Requests best practices",
          category: "external",
          clean: q => q.replace(/best\s+practices\s+for\s+/i, "").trim()
        },
        {
          pattern: /tutorial\s+for\s+/i,
          confidence: 0.6,
          description: "Requests a tutorial",
          category: "external",
          clean: q => q.replace(/tutorial\s+for\s+/i, "").trim()
        },
        {
          pattern: /guide\s+to\s+/i,
          confidence: 0.6,
          description: "Requests a guide",
          category: "external",
          clean: q => q.replace(/guide\s+to\s+/i, "").trim()
        },
        {
          pattern: /ultimd?e\s+notizie\s+/i,
          confidence: 0.75,
          description: "Italian 'Latest news'",
          category: "external",
          clean: q => q.replace(/ultimd?e\s+notizie\s+/i, "").trim()
        },
        {
          pattern: /prezzo\s+di\s+/i,
          confidence: 0.7,
          description: "Italian 'Price of'",
          category: "external",
          clean: q => q.replace(/prezzo\s+di\s+/i, "").trim()
        },
        {
          pattern: /costo\s+di\s+/i,
          confidence: 0.7,
          description: "Italian 'Cost of'",
          category: "external",
          clean: q => q.replace(/costo\s+di\s+/i, "").trim()
        },
        {
          pattern: /specifiche\s+di\s+/i,
          confidence: 0.7,
          description: "Italian 'Specifications of'",
          category: "external",
          clean: q => q.replace(/specifiche\s+di\s+/i, "").trim()
        },
        {
          pattern: /confronto\s+tra\s+/i,
          confidence: 0.6,
          description: "Italian 'Comparison between'",
          category: "external",
          clean: q => q.replace(/confronto\s+tra\s+/i, "").trim()
        },
        {
          pattern: /migliori\s+pratiche\s+/i,
          confidence: 0.6,
          description: "Italian 'Best practices'",
          category: "external",
          clean: q => q.replace(/migliori\s+pratiche\s+/i, "").trim()
        },
        {
          pattern: /tutorial\s+per\s+/i,
          confidence: 0.6,
          description: "Italian 'Tutorial for'",
          category: "external",
          clean: q => q.replace(/tutorial\s+per\s+/i, "").trim()
        },
        {
          pattern: /guida\s+a\s+/i,
          confidence: 0.6,
          description: "Italian 'Guide to'",
          category: "external",
          clean: q => q.replace(/guida\s+a\s+/i, "").trim()
        }
      ];

    const webKeywords = [
      "online",
      "website",
      "link",
      "url",
      "download",
      "buy",
      "purchase",
      "store",
      "shop",
      "market",
      "supplier",
      "vendor",
      "manufacturer",
      "documentation",
      "manual",
      "datasheet",
      "catalog",
      "standard",
      "industry",
      "trends",
      "market",
      "competitors",
      "alternative",
      "sito",
      "collegamento",
      "scaricare",
      "comprare",
      "acquistare",
      "negozio",
      "mercato",
      "fornitore",
      "produttore",
      "documentazione",
      "manuale",
      "catalogo",
      "standard",
      "settore",
      "tendenze",
      "concorrenti"
    ];

    const cadInternalKeywords = [
      "create",
      "generate",
      "make",
      "draw",
      "model",
      "design",
      "build",
      "construct",
      "add",
      "modify",
      "edit",
      "delete",
      "move",
      "rotate",
      "crea",
      "genera",
      "disegna",
      "modella",
      "progetta",
      "costruisci",
      "aggiungi",
      "modifica",
      "elimina",
      "sposta",
      "ruota"
    ];

    let totalConfidence = 0;
    const matchedPatterns: SearchPattern[] = [];

    for (const p of definedPatterns) {
      if (p.pattern.test(lowerMessage)) {
        totalConfidence = Math.max(totalConfidence, p.confidence);
        matchedPatterns.push({
          description: p.description,
          pattern: p.pattern,
          category: p.category
          // Removed p.confidence from here
        });
        if (p.clean) {
          cleanQuery = p.clean(cleanQuery);
        }
      }
    }

    const hasWebKeywords = webKeywords.some(keyword => lowerMessage.includes(keyword));
    const isInternalCAD = cadInternalKeywords.some(keyword => lowerMessage.startsWith(keyword));

    if (hasWebKeywords && !isInternalCAD) {
      const webKeywordConfidence = 0.55;
      totalConfidence = Math.max(totalConfidence, webKeywordConfidence);
      matchedPatterns.push({
        description: "Contains web-related keywords and is not a direct CAD command",
        pattern: new RegExp(webKeywords.join("|")),
        category: "web_keywords"
        // Removed webKeywordConfidence from here
      });
    }

    const isDirectSearch = matchedPatterns.some(p => p.category === "direct");
    const isWebSearch = isDirectSearch || totalConfidence > 0.6;

    return {
      isWebSearch,
      confidence: totalConfidence,
      matchedPatterns,
      cleanQuery: cleanQuery || lowerMessage
    };
  };
  // Autonomous system handlers
  const handleAutonomousUpdate = (update: SessionUpdate) => {


    if (update.type === "session_complete" && update.finalReport) {
      console.log("✅ Autonomous session completed, final report available");
      // The report will be accessible via the finalReport from useAutonomousAgent hook
    }

    // Update the active session state
    if (update.session) {
      setActiveAutonomousSession(update.session);
    }
  };

  const handleStartAutonomousSession = async (request: string) => {
    if (activeAutonomousSession?.isActive) {

      return;
    }



    const preferences: Partial<AutonomousPreferences> = {
      maxIterations: 7,
      qualityThreshold: 85,
      timeLimit: 300000, // 5 minuti
      adaptiveStrategy: true,
      allowUserInterruption: true,
      verboseReporting: true
    };

    const cadContext = {
      elements: contextData?.elements || [],
      projectName: contextData?.projectName,
      material: contextData?.material,
      machineType: contextData?.machineType
    };

    try {
      const session = await unifiedAIService.startAutonomousSession(
        request,
        cadContext,
        preferences,
        handleAutonomousUpdate
      );

      setActiveAutonomousSession(session);

      // Aggiungi messaggio iniziale alla storia
      dispatch({
        type: "ADD_TO_HISTORY",
        payload: {
          id: uuidv4(),
          type: "user_message",
          timestamp: Date.now(),
          userContent: `🤖 Autonomous: ${request}`,
          prompt: request,
          modelUsed: "Autonomous System",
          processingTime: 0
        } satisfies AIHistoryItem
      });
    } catch (error) {
      console.error("❌ Failed to start autonomous session:", error);
      setErrorMessage("Failed to start autonomous processing");
    }
  };

  const handleInterruptAutonomousSession = () => {
    if (!activeAutonomousSession?.id) return;

    const success = unifiedAIService.interruptAutonomousSession(activeAutonomousSession.id);
    if (success) {
      console.log("⏸️ Autonomous session interrupted");
    }
  };

  const handleSendMessage = async (
    messageText: string,
    filesData?: SelectedFileData[],
    activeTool?: ToolName | null
  ) => {


    // NUOVO: Handle Image Analysis tool e rilevamento automatico
    const hasImages = filesData?.some(file => file.type === "image");
    const shouldAnalyzeImages = activeTool === "imageAnalysis" ||
      (!activeTool && hasImages && (
        messageText.toLowerCase().includes("analizza") ||
        messageText.toLowerCase().includes("analyze") ||
        messageText.toLowerCase().includes("esamina") ||
        messageText.toLowerCase().includes("examine") ||
        messageText.toLowerCase().includes("misura") ||
        messageText.toLowerCase().includes("measure") ||
        messageText.toLowerCase().includes("dimensio")
      ));

    if (shouldAnalyzeImages && hasImages) {

      await handleImageAnalysis(messageText, filesData || []);
      return;
    }

    // Handle Code Interpreter tool
    if (activeTool === "codeInterpreter") {

      // Switch to code interpreter tab and pre-fill the code
      setActiveTab("code-interpreter");
      return;
    }

    // Rilevamento automatico websearch con algoritmo avanzato
    const webSearchAnalysis = isWebSearchQuery(messageText);
    const shouldUseWebSearch = activeTool === "webSearch" || (!activeTool && webSearchAnalysis.isWebSearch);

    if (shouldUseWebSearch) {
      console.log(
        `🔍 Auto-detected Web Search request (confidence: ${(webSearchAnalysis.confidence * 100).toFixed(1)}%)`
      );
      console.log(
        `🔍 Matched patterns:`,
        webSearchAnalysis.matchedPatterns.map((p: SearchPattern) => p.description)
      );
      await handleWebSearch(webSearchAnalysis.cleanQuery || messageText);
      return;
    }

    // Rileva se usare il sistema autonomo
    const autonomousKeywords = [
      "iterative",
      "improve",
      "refine",
      "perfect",
      "optimize until",
      "keep improving",
      "make it better"
    ];
    const shouldUseAutonomous =
      autonomousEnabled &&
      !activeTool &&
      autonomousKeywords.some(keyword => messageText.toLowerCase().includes(keyword));

    if (shouldUseAutonomous) {

      await handleStartAutonomousSession(messageText);
      return;
    }

    const useEnhancedAgent =
      mcpEnabled &&
      (messageText.includes("analyze") ||
        messageText.includes("optimize") ||
        messageText.includes("design") ||
        activeTool === null);

    if (useEnhancedAgent) {

      try {
        await sendAgentMessage(messageText, {
          elements: contextData?.elements || [],
          projectName: contextData?.projectName,
          currentTool: activeTool || undefined,
          userPreferences: { selectedModel, maxTokens, complexity, mcpServers }
        });

      } catch (error) {

        await handleLegacySendMessage(messageText, filesData, activeTool);
      }
    } else {

      await handleLegacySendMessage(messageText, filesData, activeTool);
    }
  };

  const handleLegacySendMessage = async (
    messageText: string,
    filesData?: SelectedFileData[],
    activeTool?: ToolName | null
  ) => {
    let textContents: string[] = [];
    let imageDataUrls: string[] = [];

    if (extendedThinkingEnabled) {
      unifiedStartThinking(messageText, `CAD Assistant - Context: ${JSON.stringify(contextData).substring(0, 200)}...`);
    }

    setLegacyIsThinking(true);
    setLegacyCurrentThinkingContent("");
    setLegacyCurrentThinkingDuration(0);

    if (filesData && filesData.length > 0) {
      if (extendedThinkingEnabled) {
        unifiedAddStep({
          type: "analysis",
          content: `Processing ${filesData.length} uploaded files`,
          confidence: 0.9,
          reasoning: "Analyzing user-provided files for context",
          relatedConcepts: ["file_processing", "user_input"],
          duration: 500
        });
      }

      filesData.forEach(fileData => {
        if (fileData.type === "text") {
          textContents.push(`--- File: ${fileData.name} ---\n${fileData.content}`);
        } else if (fileData.type === "image") {
          imageDataUrls.push(fileData.content);
        }
      });
    }

    const generationKeywords = ["create", "generate", "make", "draw", "model", "design", "build", "construct", "add"];
    const useTextToCAD =
      activeTool === "textToCAD" ||
      (!activeTool && generationKeywords.some(keyword => messageText.toLowerCase().trim().startsWith(keyword)));

    if (useTextToCAD && contextTextToCAD) {
      if (extendedThinkingEnabled) {
        unifiedAddStep({
          type: "reasoning",
          content: `Processing Text-to-CAD request: "${messageText}"`,
          confidence: 0.85,
          reasoning: "Analyzing user request for CAD generation requirements",
          relatedConcepts: ["text_to_cad", "cad_generation", "constraint_analysis"],
          duration: 800
        });
      }
      let constraintsToSend = {};
      if (selectedPresetId === "custom") {
        constraintsToSend = {
          maxDimensions: { width: customMaxWidth, height: customMaxHeight, depth: customMaxDepth },
          preferredTypes: customPreferredTypes.length > 0 ? customPreferredTypes : undefined
        };
      } else {
        const preset = constraintPresets.find(p => p.id === selectedPresetId);
        constraintsToSend = preset ? preset.constraints : {};
      }
      if (extendedThinkingEnabled) {
        unifiedAddStep({
          type: "reasoning",
          content: `Applying constraints: ${JSON.stringify(constraintsToSend)}`,
          confidence: 0.8,
          reasoning: "Configuring generation parameters based on user preferences",
          relatedConcepts: ["constraints", "parameters", "generation_config"],
          duration: 400
        });
      }
      try {
        const result = await contextTextToCAD(messageText, constraintsToSend, textContents);
        if (extendedThinkingEnabled) {
          unifiedAddStep({
            type: "conclusion",
            content: result.success ? `Successfully generated CAD elements` : `CAD generation failed: ${result.error}`,
            confidence: result.success ? 0.95 : 0.3,
            reasoning: "Text-to-CAD processing completed",
            relatedConcepts: ["text_to_cad", result.success ? "success" : "error"],
            duration: 300
          });
          unifiedCompleteThinking(
            result.success ? "CAD generation completed successfully" : "CAD generation failed",
            result.success ? "completed" : "error"
          );
        }
        if (result.success) console.log("CAD elements generated (check history)");
        else console.error(`CAD generation failed: ${result.error}`);
      } catch (error) {
        if (extendedThinkingEnabled) {
          unifiedAddStep({
            type: "conclusion",
            content: `Error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
            confidence: 0.1,
            reasoning: "Text-to-CAD processing encountered an unexpected error",
            relatedConcepts: ["text_to_cad", "error", "exception"],
            duration: 200
          });
          unifiedCompleteThinking("Text-to-CAD processing failed with error", "error");
        }
        console.error("An error occurred during CAD generation.");
      } finally {
        setLegacyIsThinking(false);
      }
    } else {
      if (extendedThinkingEnabled) {
        unifiedAddStep({
          type: "analysis",
          content: `Processing general assistant message: "${messageText.substring(0, 50)}..."`,
          confidence: 0.85,
          reasoning: "Analyzing user message for appropriate response generation",
          relatedConcepts: ["message_processing", "assistant_response", activeTool || "general"],
          duration: 600
        });
      }
      try {
        if (contextSendAssistantMessage) {
          await contextSendAssistantMessage(messageText, imageDataUrls, activeTool);
          if (extendedThinkingEnabled) {
            unifiedAddStep({
              type: "conclusion",
              content: "Message processed and response generated successfully",
              confidence: 0.9,
              reasoning: "Assistant message processing completed",
              relatedConcepts: ["message_processing", "success"],
              duration: 300
            });
            unifiedCompleteThinking("Message processing completed", "completed");
          }
        } else {
          if (extendedThinkingEnabled) {
            unifiedAddStep({
              type: "conclusion",
              content: "Error: Assistant message function not available",
              confidence: 0.1,
              reasoning: "System error - missing required context function",
              relatedConcepts: ["system_error", "context_error"],
              duration: 200
            });
            unifiedCompleteThinking("System error in message processing", "error");
          }
          console.error("Error: Could not send message.");
        }
      } finally {
        setLegacyIsThinking(false);
      }
    }
  };

  const handleWebSearch = async (query: string) => {
    if (!query.trim()) {

      return;
    }

    let cleanQuery = query
      .trim()
      .replace(/^(cerca|search|find|look up|google|ricerca)\s+/i, "")
      .trim();

    if (!cleanQuery) {
      cleanQuery = query.trim();
    }

    setIsWebSearching(true);
    setWebSearchQuery(cleanQuery);
    setShowWebSearchDropdown(true);
    setWebSearchResults(null);

    dispatch({
      type: "ADD_TO_HISTORY",
      payload: {
        id: uuidv4(),
        type: "user_message",
        timestamp: Date.now(),
        userContent: `🔍 Search: ${cleanQuery}`,
        prompt: query,
        modelUsed: "Web Search",
        processingTime: 0
      } satisfies AIHistoryItem
    });

    try {


      const cadContext = {
        projectType: contextData?.projectType || "CAD/CAM",
        materials: contextData?.materials || [],
        machineType: contextData?.machineType,
        currentOperation: contextData?.currentOperation,
        technicalTerms: [
          "CAD",
          "CAM",
          "CNC",
          "machining",
          "manufacturing",
          "engineering",
          "design",
          "modeling",
          "simulation"
        ]
      };

      // Call the refactored executeWebSearch from mcpOfficialClient
      const searchOperation = await executeWebSearch(
        cleanQuery,
        {
          maxResults: 10,
          contextAware: true,
          language: "en",
          region: "US"
        },
        cadContext
      );



      if (searchOperation.success && searchOperation.data) {
        const assistantContent = searchOperation.data.assistant_content;
        const results = searchOperation.data.results;
        const processingTime = searchOperation.processingTime;

        setWebSearchResults(results);
        setWebSearchTime(processingTime);
        setWebSearchTotalResults(results.length);

        let searchSummary = `🔍 **Web Search for "${cleanQuery}"**\n\n${assistantContent}\n\n---`;
        if (results.length > 0) {
          searchSummary += "\n\n**Cited Sources:**\n";
          results.slice(0, 5).forEach((result: WebSearchResult, index: number) => {
            searchSummary += `**${index + 1}. ${result.title}**\n`;
            searchSummary += `🔗 [${result.url}](${result.url})\n`;
            if (result.page_age) {
              searchSummary += `📅 Page Age: ${result.page_age}\n`;
            }
            searchSummary += "\n";
          });
        }

        const searchArtifact: AIArtifact = {
          id: uuidv4(),
          type: "json",
          content: {
            query: cleanQuery,
            assistantResponse: assistantContent,
            citations: results,
            processingTime: processingTime
          },
          title: `Full Web Search Report: ${cleanQuery}`
        };

        dispatch({
          type: "ADD_TO_HISTORY",
          payload: {
            id: uuidv4(),
            type: "assistant_response",
            timestamp: Date.now(),
            result: searchSummary,
            modelUsed: "Claude Web Search (MCP)",
            processingTime: processingTime || 0,
            artifacts: [searchArtifact]
          } satisfies AIHistoryItem
        });


      } else {
        const errorMessage = searchOperation.error || "No search results returned by the service";

        dispatch({
          type: "ADD_TO_HISTORY",
          payload: {
            id: uuidv4(),
            type: "assistant_error",
            timestamp: Date.now(),
            result: `❌ **Web Search Failed**\n\nQuery: "${cleanQuery}"\nError: ${errorMessage}\n\nTry rephrasing your search or check your internet connection.`,
            modelUsed: "MCP WebSearch",
            processingTime: 0
          } satisfies AIHistoryItem
        });

        console.error(`❌ Web search failed: ${errorMessage}`);
      }
    } catch (error) {
      console.error("❌ Web search error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

      dispatch({
        type: "ADD_TO_HISTORY",
        payload: {
          id: uuidv4(),
          type: "system_error",
          timestamp: Date.now(),
          result: `🚨 **Web Search System Error**\n\nQuery: "${cleanQuery}"\nError: ${errorMessage}\n\nPlease try again or contact support if the issue persists.`,
          modelUsed: "MCP WebSearch",
          processingTime: 0
        } satisfies AIHistoryItem
      });

      console.error(`🚨 Search system error: ${errorMessage}`);
    } finally {
      setIsWebSearching(false);
    }
  };

  const handleWebSearchSuggestionClick = (suggestion: string) => {
    handleWebSearch(suggestion);
  };

  // NUOVO: Handler per analisi immagini - NON modifica flussi esistenti
  const handleImageAnalysis = async (
    message: string,
    filesData: SelectedFileData[]
  ) => {
    const images = filesData.filter(file => file.type === "image");

    if (images.length === 0) {

      setErrorMessage("No images found for analysis");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    // Set vision processing state
    setIsVisionProcessing(true);


    // Aggiungi messaggio utente alla storia
    dispatch({
      type: "ADD_TO_HISTORY",
      payload: {
        id: uuidv4(),
        type: "user_message",
        timestamp: Date.now(),
        userContent: `🖼️ Image Analysis: ${message}`,
        prompt: message,
        modelUsed: "Vision Analysis",
        processingTime: 0
      } satisfies AIHistoryItem
    });

    try {
      // Inferisci tipo di analisi dal messaggio
      const analysisType = inferAnalysisTypeFromMessage(message);


      // Prepara richiesta di analisi
      const analysisRequest: ImageAnalysisRequest = {
        images: images.map(img => ({
          url: img.content,
          name: img.name,
          type: img.fileType,
          content: img.content
        })),
        prompt: message || "Analyze this image for CAD/manufacturing insights",
        cadContext: {
          elements: contextData?.elements || [],
          projectName: contextData?.projectName,
          material: contextData?.material,
          machineType: contextData?.machineType
        },
        analysisType,
        options: {
          extractDimensions: analysisType === 'measurement',
          suggestCADElements: analysisType === 'design',
          analyzeManufacturability: analysisType === 'manufacturing',
          detectMaterials: true
        }
      };

      // Chiama il servizio unificato per l'analisi
      const result = await unifiedAIService.processImageAnalysis(analysisRequest);

      if (result.success && result.data && result.data.length > 0) {
        const analysisResult = result.data[0]; // Prima (o unica) analisi

        // Costruisci messaggio di risposta
        let responseMessage = `🔍 **Image Analysis Result**\n\n${analysisResult.analysis}`;

        if (analysisResult.cadRecommendations) {
          responseMessage += `\n\n**CAD Recommendations:**\n${analysisResult.cadRecommendations}`;
        }

        if (analysisResult.manufacturingInsights) {
          responseMessage += `\n\n**Manufacturing Insights:**\n${analysisResult.manufacturingInsights}`;
        }

        if (analysisResult.extractedData?.dimensions && analysisResult.extractedData.dimensions.length > 0) {
          responseMessage += `\n\n**Detected Dimensions:**\n`;
          analysisResult.extractedData.dimensions.forEach((dim, idx) => {
            responseMessage += `- ${dim.type}: ${dim.value} ${dim.unit}\n`;
          });
        }

        if (analysisResult.extractedData?.materials && analysisResult.extractedData.materials.length > 0) {
          responseMessage += `\n\n**Detected Materials:** ${analysisResult.extractedData.materials.join(', ')}`;
        }

        if (analysisResult.suggestions && analysisResult.suggestions.length > 0) {
          responseMessage += `\n\n**Suggestions:**\n`;
          analysisResult.suggestions.forEach(suggestion => {
            responseMessage += `• ${suggestion}\n`;
          });
        }

        responseMessage += `\n\n*Confidence: ${Math.round(analysisResult.confidence * 100)}%*`;

        // Prepara artifacts se ci sono elementi estratti
        const artifacts: any[] = [];

        if (analysisResult.extractedElements && analysisResult.extractedElements.length > 0) {
          artifacts.push({
            id: uuidv4(),
            type: "cad_elements",
            content: analysisResult.extractedElements,
            title: "Extracted CAD Elements"
          });
        }

        if (analysisResult.extractedData) {
          artifacts.push({
            id: uuidv4(),
            type: "json",
            content: analysisResult.extractedData,
            title: "Extracted Data Details"
          });
        }

        // Aggiungi risposta alla storia
        dispatch({
          type: "ADD_TO_HISTORY",
          payload: {
            id: uuidv4(),
            type: "assistant_response",
            timestamp: Date.now(),
            result: responseMessage,
            modelUsed: "OpenAI Vision",
            processingTime: result.processingTime || 0,
            artifacts: artifacts.length > 0 ? artifacts : undefined
          } satisfies AIHistoryItem
        });


        // Se ci sono elementi estratti, chiedi se aggiungerli alla canvas
        if (analysisResult.extractedElements && analysisResult.extractedElements.length > 0) {
          const shouldAdd = window.confirm(
            `Found ${analysisResult.extractedElements.length} CAD elements in the image. Add them to the canvas?`
          );

          if (shouldAdd) {
            addElements(analysisResult.extractedElements);

          }
        }

      } else {
        throw new Error(result.error || "Vision analysis failed");
      }

    } catch (error) {

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      dispatch({
        type: "ADD_TO_HISTORY",
        payload: {
          id: uuidv4(),
          type: "assistant_error",
          timestamp: Date.now(),
          result: `❌ **Image Analysis Failed**\n\nError: ${errorMessage}\n\nPlease try again or check the image format.`,
          modelUsed: "Vision Analysis",
          processingTime: 0
        } satisfies AIHistoryItem
      });

      setErrorMessage(`Image analysis failed: ${errorMessage}`);
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      // Reset vision processing state regardless of success or failure
      setIsVisionProcessing(false);
    }
  };

  // Helper per inferire il tipo di analisi dal messaggio
  const inferAnalysisTypeFromMessage = (message: string): VisionAnalysisType => {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('misura') || lowerMessage.includes('dimensio') || lowerMessage.includes('measure')) {
      return 'measurement';
    }
    if (lowerMessage.includes('produzione') || lowerMessage.includes('fabbrica') || lowerMessage.includes('manufactur')) {
      return 'manufacturing';
    }
    if (lowerMessage.includes('design') || lowerMessage.includes('progett') || lowerMessage.includes('model')) {
      return 'design';
    }
    return 'general';
  };

  const handleWebSearchResultClick = (result: WebSearchResult) => {
    // Add the clicked result to the conversation
    const resultMessage = `📄 Selected Web Result:\n**${result.title}**\n${result.cited_text || "No cited text available."}\n🔗 [View Full Article](${result.url})`; // Changed from snippet

    dispatch({
      type: "ADD_TO_HISTORY",
      payload: {
        id: uuidv4(),
        type: "user_message",
        timestamp: Date.now(),
        userContent: resultMessage,
        prompt: resultMessage,
        modelUsed: "User Action",
        processingTime: 0
      } satisfies AIHistoryItem
    });

    // Open the link in a new tab
    window.open(result.url, "_blank");
  };

  const handleAddFromHistory = (historyItem: { id: string; elements: any[] }) => {
    addElements(historyItem.elements);
  };

  const handleExecuteAction = async (action: AIAction) => {
    if (!executePendingAction) {
      console.error("Cannot execute action, executePendingAction is not defined.");
      return;
    }
    const historyAssistantItemId = uuidv4();
    const startTime = Date.now();
    try {
      const result = await executePendingAction(action);
      const processingTime = Date.now() - startTime;
      if (dispatch) {
        dispatch({
          type: "ADD_TO_HISTORY",
          payload: {
            id: historyAssistantItemId,
            type: result.success ? "assistant_response" : "assistant_error",
            timestamp: Date.now(),
            result: result.message,
            modelUsed: "N/A (Tool Execution)",
            processingTime: processingTime,
            prompt: `Executed Action: ${action.type}`
          } satisfies AIHistoryItem
        });
      }
      if (result.success) console.log(`Action executed: ${action.type}`);
      else console.error(`Action failed: ${result.message}`);
    } catch (error) {
      if (dispatch) {
        dispatch({
          type: "ADD_TO_HISTORY",
          payload: {
            id: historyAssistantItemId,
            type: "system_error",
            timestamp: Date.now(),
            result: `System Error executing ${action.type}: ${error instanceof Error ? error.message : "Unknown error"}`,
            modelUsed: "N/A (System)",
            processingTime: Date.now() - startTime
          } satisfies AIHistoryItem
        });
      }
    } finally {
      if (dispatch) dispatch({ type: "CLEAR_PENDING_ACTIONS" });
    }
  };

  const mapHistoryItemToAIMessage = (item: AIHistoryItem): AIMessageType | null => {
    let role: "user" | "assistant" | "system" | null = null;
    let content: MessageContent | null = null;
    let isError = false;

    if (item.type === "user_message" && (item.userContent || item.prompt)) {
      role = "user";
      content = item.userContent || item.prompt || "";
    } else if (item.type === "assistant_response" && item.result) {
      role = "assistant";
      content = typeof item.result === "string" ? item.result : JSON.stringify(item.result);
    } else if ((item.type === "assistant_error" || item.type === "system_error") && item.result) {
      role = "assistant";
      content = typeof item.result === "string" ? item.result : JSON.stringify(item.result);
      isError = true;
    } else if (item.type === "text_to_cad") {
      return null;
    }

    if (role && content !== null) {
      const baseMessage: AIMessageType = {
        id: item.id,
        role: role,
        content: content,
        timestamp: item.timestamp,
        artifacts: item.artifacts,
        isError: isError,
        thinking: item.thinking,
        thinkingDuration: item.thinkingDuration
      };
      return baseMessage;
    }
    return null;
  };

  const mapAgentExchangeToAIMessages = (exchange: AgentHistoryExchange, index: number): AIMessageType[] => {
    const messages: AIMessageType[] = [];
    const baseId = `agent-${exchange.timestamp.getTime()}-${index}`;

    messages.push({
      id: `${baseId}-user`,
      role: "user",
      content: exchange.message,
      timestamp: exchange.timestamp.getTime()
    });

    let assistantContent = exchange.response;
    let artifacts: AIArtifact[] | undefined = undefined;
    let thinkingSummary: string | undefined = undefined;
    let thinkingDurationVal: number | undefined = undefined;

    if (exchange.thinking) {
      if (typeof exchange.thinking === "string") {
        thinkingSummary = exchange.thinking;
      } else {
        thinkingSummary = exchange.thinking.summary;
        thinkingDurationVal = exchange.thinking.totalDuration;
        if (exchange.thinking.mcpToolsUsed && exchange.thinking.mcpToolsUsed.length > 0) {
          if (!artifacts) artifacts = [];
          artifacts.push({
            id: uuidv4(),
            type: "tool_calls",
            content: exchange.thinking.mcpToolsUsed,
            title: "MCP Tools Executed"
          });
        }
      }
    }

    if (!assistantContent || assistantContent.toLowerCase() === "(no content)") {
      if (thinkingSummary) {
        if (artifacts && artifacts.find(a => a.type === "tool_calls")) {
          assistantContent = thinkingSummary || `Ho utilizzato i seguenti strumenti MCP.`;
        } else {
          assistantContent = thinkingSummary || "(Operazione MCP completata)";
        }
      } else {
        assistantContent = "(Risposta assistente non disponibile)";
      }
    }

    if (!assistantContent && artifacts && artifacts.length > 0) {
      assistantContent = "(Vedi artefatti per i dettagli)";
    }

    messages.push({
      id: `${baseId}-assistant`,
      role: "assistant",
      content: assistantContent,
      timestamp: exchange.timestamp.getTime() + 1,
      thinking: thinkingSummary,
      thinkingDuration: thinkingDurationVal,
      artifacts: artifacts
    });
    return messages;
  };

  const combinedMessages = useMemo(() => {
    const mappedStateHistory: AIMessageType[] = state.history
      .map(item => mapHistoryItemToAIMessage(item))
      .filter((msg): msg is AIMessageType => msg !== null);

    const mappedAgentHistory: AIMessageType[] = agentHistory.flatMap((exchange, index) =>
      mapAgentExchangeToAIMessages(exchange as AgentHistoryExchange, index)
    );

    const allMessages = [...mappedStateHistory, ...mappedAgentHistory];
    allMessages.sort((a, b) => a.timestamp - b.timestamp);
    return allMessages;
  }, [state.history, agentHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [combinedMessages.length]);

  const indicatorStatus =
    state.isProcessing || agentProcessing || mainUnifiedIsThinking || legacyIsThinking || isWebSearching || isVisionProcessing || isCodeProcessing
      ? "processing"
      : "idle";

  const handleStartAutonomous = () => {
    // Example: Get request from userInput or a more complex source
    if (userInput.trim()) {
      // Replace with actual context and preferences as needed
      const cadContext = { projectName: "TestProject", elements: [] };
      const preferences = { maxIterations: 5 };
      startAutonomousTask(userInput, cadContext, preferences);
    }
  };

  const handleViewReport = (report?: ProgressReport) => {
    // If a specific report is provided, use it; otherwise use the finalReport from hook
    if (report || finalReport) {
      setIsReportModalOpen(true);

    } else {
      console.warn("⚠️ No report available to display");
    }
  };

  const handleCloseReportModal = () => {
    setIsReportModalOpen(false);

  };

  // Example of how to clear the session, perhaps after viewing the report or starting a new task
  const handleStartNewTask = () => {
    clearAutonomousSession(); // Clears previous report and session state
    setUserInput(""); // Clear input for new task
    // Potentially trigger new input focus or other UI changes
  };

  // New handler for starting autonomous task from AIMessageInput
  const handleStartAutonomousTaskFromInput = (taskDescription: string) => {
    if (taskDescription.trim()) {
      // Replace with actual context and preferences as needed
      const cadContext = {
        elements: contextData?.elements || [],
        projectName: contextData?.projectName,
        material: contextData?.material,
        machineType: contextData?.machineType
      };
      const preferences: Partial<AutonomousPreferences> = {
        maxIterations: 7,
        qualityThreshold: 85,
        timeLimit: 300000, // 5 minuti
        adaptiveStrategy: true,
        allowUserInterruption: true,
        verboseReporting: true
      };
      startAutonomousTask(taskDescription, cadContext, preferences);
    } else {
      // Optionally show a toast or message if the description is empty

      // Consider setting an error message for the UI if needed
      setErrorMessage("Please enter a description for the autonomous task.");
      // Auto-clear error message after a few seconds
      setTimeout(() => setErrorMessage(null), 3000);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="cad-assistant-panel"
        initial={{ opacity: 0, x: 50 }}
        animate={{
          opacity: 1,
          x: 0,
          width: isPanelExpanded ? "520px" : "20px"
        }}
        exit={{ opacity: 0, x: 50 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={`fixed z-50 top-4 right-0 bottom-4 shadow-xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border-l border-white/20 dark:border-gray-700/50 overflow-hidden ${isPanelExpanded ? "rounded-l-2xl" : "rounded-l-2xl"}`}
      >
        {isPanelExpanded ? (
          <div className="flex flex-col h-full overflow-hidden min-w-0">
            <div
              className={`border-b bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-700 text-white dark:from-gray-700 dark:to-gray-800 dark:border-gray-600/50 backdrop-blur-sm ${isPanelExpanded ? "rounded-tl-2xl" : ""} relative`}
              style={{ minHeight: '140px' }}
            >
              {/* Glassmorphism overlay */}
              <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>

              <div className="relative z-10 p-3 space-y-3">
                {/* Title and Controls Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm flex-shrink-0">
                      <img src="/icon.png" className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-base whitespace-nowrap">CADAssistant Copilot</h3>
                  </div>

                  {/* Main Control Buttons */}
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setShowSettings(!showSettings)}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all duration-300 backdrop-blur-sm"
                      title="Settings"
                    >
                      <Settings size={15} />
                    </button>
                    <button
                      onClick={() => setIsPanelExpanded(false)}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all duration-300 backdrop-blur-sm"
                      title="Collapse"
                    >
                      <Minimize2 size={15} />
                    </button>
                    <button
                      onClick={onClose}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all duration-300 backdrop-blur-sm"
                      title="Close"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                {/* Tool Control Buttons Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => {
                        const newState = !autonomousEnabled;
                        setAutonomousEnabled(newState);
                        console.log(`Autonomous System ${newState ? "Enabled" : "Disabled"}`);
                      }}
                      className={`p-1.5 rounded-lg transition-all duration-300 backdrop-blur-sm ${autonomousEnabled
                        ? "bg-red-500/90 hover:bg-red-600 text-white shadow-md"
                        : "bg-white/10 hover:bg-white/20 text-blue-100"
                        }`}
                      title={autonomousEnabled ? "Disable Autonomous System" : "Enable Autonomous System"}
                    >
                      <Cpu size={15} />
                    </button>
                    <button
                      onClick={() => {
                        const newState = !mcpEnabled;
                        setMcpEnabled(newState);
                        console.log(`MCP Tools ${newState ? "Enabled" : "Disabled"}`);
                      }}
                      className={`p-1.5 rounded-lg transition-all duration-300 backdrop-blur-sm ${mcpEnabled
                        ? "bg-green-500/90 hover:bg-green-600 text-white shadow-md"
                        : "bg-white/10 hover:bg-white/20 text-blue-100"
                        }`}
                      title={mcpEnabled ? "Disable MCP Tools" : "Enable MCP Tools"}
                    >
                      <Zap size={15} />
                    </button>
                    <button
                      onClick={() => {
                        const newState = !extendedThinkingEnabled;
                        setExtendedThinkingEnabled(newState);
                        console.log(`Extended Thinking ${newState ? "Enabled" : "Disabled"}`);
                      }}
                      className={`p-1.5 rounded-lg transition-all duration-300 backdrop-blur-sm ${extendedThinkingEnabled
                        ? "bg-purple-500/90 hover:bg-purple-600 text-white shadow-md"
                        : "bg-white/10 hover:bg-white/20 text-blue-100"
                        }`}
                      title={extendedThinkingEnabled ? "Disable Extended Thinking" : "Enable Extended Thinking"}
                    >
                      <Brain size={15} />
                    </button>
                    <button
                      onClick={() => {
                        const newState = !codeInterpreterEnabled;
                        setCodeInterpreterEnabled(newState);
                        console.log(`Code Interpreter ${newState ? "Enabled" : "Disabled"}`);
                      }}
                      className={`p-1.5 rounded-lg transition-all duration-300 backdrop-blur-sm ${codeInterpreterEnabled
                        ? "bg-orange-500/90 hover:bg-orange-600 text-white shadow-md"
                        : "bg-white/10 hover:bg-white/20 text-blue-100"
                        }`}
                      title={codeInterpreterEnabled ? "Disable Code Interpreter" : "Enable Code Interpreter"}
                    >
                      <Terminal size={15} />
                    </button>
                  </div>

                  {/* Elements Count */}
                  <div className="text-xs text-blue-100 whitespace-nowrap">
                    <span className="font-medium">{contextData.elementCount || 0} Elements</span>
                  </div>
                </div>

                {/* Status Indicators Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 flex-wrap">
                    {mcpEnabled && (
                      <div className="flex items-center space-x-1 bg-green-500/20 px-2 py-1 rounded-md backdrop-blur-sm border border-green-400/30">
                        <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                        <span className="text-xs text-green-200 font-medium whitespace-nowrap">MCP</span>
                      </div>
                    )}
                    {extendedThinkingEnabled && (
                      <div className="flex items-center space-x-1 bg-purple-500/20 px-2 py-1 rounded-md backdrop-blur-sm border border-purple-400/30">
                        <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
                        <span className="text-xs text-purple-200 font-medium whitespace-nowrap">
                          {state.currentModel.includes("claude") ? "Extended" : "Think"}
                        </span>
                      </div>
                    )}
                    {codeInterpreterEnabled && (
                      <div className="flex items-center space-x-1 bg-orange-500/20 px-2 py-1 rounded-md backdrop-blur-sm border border-orange-400/30">
                        <div className="w-1.5 h-1.5 bg-orange-400 rounded-full"></div>
                        <span className="text-xs text-orange-200 font-medium whitespace-nowrap">Code</span>
                      </div>
                    )}
                    {autonomousEnabled && (
                      <div className="flex items-center space-x-1 bg-red-500/20 px-2 py-1 rounded-md backdrop-blur-sm border border-red-400/30">
                        <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse"></div>
                        <span className="text-xs text-red-200 font-medium whitespace-nowrap">Auto</span>
                      </div>
                    )}
                  </div>

                  {/* Overall Status Indicator */}
                  <div className="flex items-center space-x-1.5">
                    {(mcpEnabled || extendedThinkingEnabled || codeInterpreterEnabled || autonomousEnabled) && (
                      <>
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        <span className="text-xs text-green-200 font-medium whitespace-nowrap">
                          {[mcpEnabled, extendedThinkingEnabled, codeInterpreterEnabled, autonomousEnabled].filter(Boolean).length}/4
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {showSettings && (
                <div className="overflow-y-auto max-h-[80%] border-b border-gray-200/50 dark:border-gray-700/50 bg-white/5 backdrop-blur-sm">
                  <AISettingsPanel />
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className={`p-3 space-y-2 text-sm bg-gray-50/70 dark:bg-gray-800/70 backdrop-blur-sm ${isPanelExpanded ? "" : "rounded-bl-2xl"}`}>
                      <button
                        onClick={clearMessages}
                        className="flex items-center text-xs text-red-600 hover:text-red-800 transition-colors"
                      >
                        <X size={12} className="mr-1" />
                        Clear Conversation
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex flex-col dark:bg-gray-800/50 backdrop-blur-sm flex-grow min-h-0"
            >
              <TabsList className="shrink-0 border-b bg-gray-50/70 dark:bg-gray-700/70 dark:border-gray-600/50 dark:text-gray-300 backdrop-blur-sm">
                <TabsTrigger value="assistant">CAD Assistant</TabsTrigger>
                {codeInterpreterEnabled && <TabsTrigger value="code-interpreter">Code Interpreter</TabsTrigger>}
              </TabsList>

              <TabsContent value="assistant" className="flex flex-col flex-grow min-h-0 overflow-hidden mt-0">



                {(agentProcessing || mainUnifiedIsThinking || legacyIsThinking) && (
                  <div className="px-2 py-1 border-b border-gray-200 dark:border-gray-700">
                    <RealTimeThinking
                      sessionId={internalConversationId} // Correct: Use internalConversationId
                      showDetails={false}
                    />
                  </div>
                )}

                {/* Autonomous Progress Indicator */}
                {autonomousSession && (
                  <div className="px-2 py-1 border-b border-gray-200 dark:border-gray-700">
                    <AutonomousProgressIndicator
                      session={autonomousSession}
                      onInterrupt={interruptAutonomousTask}
                      compact={true}
                    />
                    {/* Enhanced progress display */}
                    <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                      <span>
                        Iteration {currentIteration}/{maxIterations}
                      </span>
                      <span>Quality: {qualityScore}%</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-16 bg-gray-200 rounded-full h-1">
                          <div
                            className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        {finalReport && (
                          <button
                            onClick={() => handleViewReport()}
                            className="px-2 py-0.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                            title="View Final Report"
                          >
                            📊 Report
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Autonomous Error Display */}
                {autonomousError && (
                  <div className="px-2 py-1 border-b border-red-200 bg-red-50 dark:border-red-700 dark:bg-red-900/20">
                    <div className="flex items-center space-x-2 text-xs text-red-700 dark:text-red-300">
                      <AlertTriangle size={12} />
                      <span>Autonomous Error: {autonomousError}</span>
                      <button
                        onClick={() => clearAutonomousSession()}
                        className="ml-auto text-red-600 hover:text-red-800"
                        title="Clear error"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {agentSuggestions.length > 0 && (
                  <div className="px-1 py-0.5 border-b border-gray-200 dark:border-gray-700">
                    <ProactiveSuggestions
                      suggestions={agentSuggestions}
                      onSuggestionClick={suggestion => {
                        handleSendMessage(suggestion);
                        dismissSuggestions();
                      }}
                      onDismiss={dismissSuggestions}
                      maxVisible={3}
                    />
                  </div>
                )}

                {/* Web Search Dropdown */}
                {(showWebSearchDropdown || isWebSearching || webSearchResults) && (
                  <div className="px-2 py-1 border-b border-gray-200 dark:border-gray-700">
                    <WebSearchDropdown
                      isOpen={showWebSearchDropdown}
                      onToggle={() => setShowWebSearchDropdown(!showWebSearchDropdown)}
                      searchResults={webSearchResults}
                      isSearching={isWebSearching}
                      searchQuery={webSearchQuery}
                      onSuggestionClick={handleWebSearchSuggestionClick}
                      onResultClick={handleWebSearchResultClick}
                      searchTime={webSearchTime}
                      totalResults={webSearchTotalResults}
                    />
                  </div>
                )}

                <div className="flex-grow overflow-y-auto overflow-x-hidden p-3 space-y-2 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 word-wrap break-words min-w-0">
                  {combinedMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                        className="relative mb-6"
                      >
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center backdrop-blur-xl border border-white/20 shadow-xl">
                          <Brain size={32} className="text-white" />
                        </div>
                        <div className="absolute -inset-2 bg-gradient-to-r from-blue-400/20 to-indigo-600/20 rounded-3xl blur-lg animate-pulse"></div>
                      </motion.div>

                      <div className="text-center mb-6">
                        <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-2">Enhanced CAD Assistant</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                          Ask me to analyze, optimize designs, or generate CAD elements using advanced AI tools.
                        </p>
                      </div>


                    </div>
                  ) : (
                    <AnimatePresence initial={false}>
                      {combinedMessages.map(message => {
                        // Try to find the full ThinkingSession for this message if available
                        // This allows ThinkingDropdown within AIMessageComponent to get the full object
                        let fullThinkingSessionForThisMessage: ThinkingSession | undefined = undefined;
                        if (message.id) {
                          if (thinkingSessions && thinkingSessions.has(message.id)) {
                            fullThinkingSessionForThisMessage = thinkingSessions.get(message.id);
                          }
                          // Check if the agentThinkingFromHook corresponds to this message
                          // This is a bit indirect; ideally, message itself would have a direct link or ID to its session
                          if (
                            !fullThinkingSessionForThisMessage &&
                            agentThinking &&
                            agentThinking.summary === message.thinking
                          ) {
                            fullThinkingSessionForThisMessage = agentThinking;
                          }
                          // Check unifiedCurrentThinking as well
                          if (
                            !fullThinkingSessionForThisMessage &&
                            unifiedCurrentThinking &&
                            unifiedCurrentThinking.summary === message.thinking
                          ) {
                            fullThinkingSessionForThisMessage = unifiedCurrentThinking;
                          }
                        }

                        return (
                          <motion.div
                            key={message.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                            className="min-w-0 w-full overflow-hidden"
                          >
                            <AIMessageComponent
                              key={message.id}
                              message={message}
                              onFeedback={handleFeedback}
                              onExecuteAction={handleExecuteAction}
                              // Pass handler for viewing the report
                              onViewReport={report => {
                                // Pass the specific report if available, otherwise use hook's finalReport
                                handleViewReport(report);
                              }}
                              thinking={message.thinking}
                              thinkingSession={fullThinkingSessionForThisMessage}
                              showExtendedThinking={extendedThinkingEnabled && message.role === "assistant"}
                            />
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {(agentProcessing || mainUnifiedIsThinking || legacyIsThinking || state.isProcessing) &&
                  !pendingActions.length && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="mx-2 mb-2 p-4 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-gray-700/80 dark:to-gray-600/80 backdrop-blur-sm border border-blue-200/50 dark:border-gray-600/50 rounded-xl shadow-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex space-x-1">
                          <motion.div
                            animate={{ y: [0, -5, 0] }}
                            transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                            className="w-2 h-2 bg-gradient-to-t from-blue-400 to-blue-600 rounded-full"
                          />
                          <motion.div
                            animate={{ y: [0, -5, 0] }}
                            transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                            className="w-2 h-2 bg-gradient-to-t from-indigo-400 to-indigo-600 rounded-full"
                          />
                          <motion.div
                            animate={{ y: [0, -5, 0] }}
                            transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                            className="w-2 h-2 bg-gradient-to-t from-purple-400 to-purple-600 rounded-full"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {agentProcessing
                              ? "Enhanced Agent Processing..."
                              : mainUnifiedIsThinking
                                ? "Unified Thinking Active..."
                                : legacyIsThinking
                                  ? "Legacy Thinking Active..."
                                  : state.isProcessing
                                    ? "Context Processing..."
                                    : "Processing..."}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            {mcpEnabled && agentProcessing && (
                              <>
                                <Zap size={10} className="text-green-500" /> <span>MCP Tools</span>
                              </>
                            )}
                            {extendedThinkingEnabled &&
                              (mainUnifiedIsThinking || legacyIsThinking || agentProcessing) && (
                                <>
                                  <Brain size={10} className="text-purple-500" /> <span>Unified Thinking</span>
                                </>
                              )}
                            {unifiedCurrentThinking && <span>Steps: {unifiedCurrentThinking.steps?.length || 0}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        {agentProcessing
                          ? "Using enhanced capabilities"
                          : mainUnifiedIsThinking
                            ? "Deep thinking mode"
                            : "Standard processing"}
                      </div>
                    </motion.div>
                  )}

                {state.pendingActions && state.pendingActions.length > 0 && handleExecuteAction && (
                  <div className="p-2 border-t border-gray-200/50 dark:border-gray-700/50 rounded-t-xl bg-gray-50/70 dark:bg-gray-900/70 backdrop-blur-sm shrink-0">
                    <AIActionHandler
                      key="action-handler-assistant-tab"
                      actions={state.pendingActions}
                      onExecute={handleExecuteAction}
                      isProcessing={state.isProcessing || agentProcessing}
                    />
                  </div>
                )}
                <div className="p-2 border-t rounded-b-3xl border-gray-200/50 dark:border-gray-700/50 backdrop-blur-sm shrink-0">
                  <AIProcessingIndicator status={indicatorStatus} progress={progress} />
                </div>

                <div
                  className={`shrink-0 border-t border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-gray-800/30 backdrop-blur-sm ${isPanelExpanded ? "rounded-bl-2xl" : ""}`}
                >
                  <AIMessageInput
                    onSendMessage={handleSendMessage}
                    isProcessing={
                      state.isProcessing ||
                      agentProcessing ||
                      mainUnifiedIsThinking ||
                      legacyIsThinking ||
                      isWebSearching
                    }
                    placeholder={
                      agentProcessing || mainUnifiedIsThinking || legacyIsThinking || isWebSearching
                        ? "Assistant is thinking..."
                        : "Type a message..."
                    }
                    // Autonomous props
                    isAutonomousModeAvailable={true} // Feature is available
                    isAutonomousModeEnabled={autonomousEnabled} // From existing state toggle
                    isRunningAutonomously={isRunningAutonomously} // From useAutonomousAgent hook
                    isLoadingAutonomously={false} // Hook doesn't provide loading state
                    onStartAutonomousTask={handleStartAutonomousTaskFromInput} // New handler
                    onInterruptAutonomousTask={interruptAutonomousTask} // From useAutonomousAgent hook
                    selectedElementContext={
                      selectedElement ? { id: selectedElement.id, type: selectedElement.type } : null
                    } // Use destructured selectedElement
                  />
                </div>
              </TabsContent>

              {codeInterpreterEnabled && (
                <TabsContent value="code-interpreter" className="flex flex-col flex-grow min-h-0 overflow-hidden mt-0">
                  <CodeInterpreterTab
                    cadElements={contextData?.elements || []}
                    onResultsAvailable={(results: CodeInterpreterResponse) => {
                      console.log("Code Interpreter Results:", results);
                      // Add results to conversation history
                      if (results.success && results.pythonOutput) {
                        // Check if there are image files for preview
                        const imageFiles = results.generatedFiles?.filter(file => 
                          file.contentType && file.contentType.startsWith("image/")
                        ) || [];
                        
                        // Build result message with image previews
                        let resultMessage = `🐍 **Code Execution Result**\n\n${results.pythonOutput}`;
                        
                        if (results.generatedFiles?.length) {
                          resultMessage += `\n\n📁 **Generated ${results.generatedFiles.length} file(s)**`;
                          
                          // Add image previews if any
                          if (imageFiles.length > 0) {
                            resultMessage += `\n\n🖼️ **Image Previews:**`;
                            imageFiles.forEach((file, index) => {
                              resultMessage += `\n\n**${file.filename}**`;
                            });
                          }
                        }

                        dispatch({
                          type: "ADD_TO_HISTORY",
                          payload: {
                            id: uuidv4(),
                            type: "assistant_response",
                            timestamp: Date.now(),
                            result: resultMessage,
                            modelUsed: "Python Code Interpreter",
                            processingTime: results.processingTime || 0,
                            artifacts: results.generatedFiles
                              ? [
                                {
                                  id: uuidv4(),
                                  type: "files",
                                  content: results.generatedFiles,
                                  title: "Generated Files"
                                }
                              ]
                              : undefined
                          } satisfies AIHistoryItem
                        });
                      }
                    }}
                  />
                </TabsContent>
              )}
            </Tabs>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-between h-full rounded-l-xl p-0.5 bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-white/20 dark:border-gray-700/50">
            <button
              onClick={() => setIsPanelExpanded(true)}
              className="p-2 mt-2 text-gray-600 dark:text-gray-300 rounded-full hover:bg-blue-500/20 transition-all duration-300 backdrop-blur-sm"
              title="Expand Assistant"
            >
              <Maximize2 size={14} />
            </button>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 [writing-mode:vertical-rl] transform rotate-180 whitespace-nowrap my-4">
              CAD Copilot
            </span>
            <button
              onClick={onClose}
              className="p-2 mb-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-full hover:bg-red-500/20 transition-all duration-300 backdrop-blur-sm"
              title="Close Assistant"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <ThinkingStatsPanel isOpen={showThinkingStats} onClose={() => setShowThinkingStats(false)} />

        <CodeInterpreterPanel
          isOpen={showCodeInterpreter}
          onClose={() => setShowCodeInterpreter(false)}
          cadElements={contextData?.elements || []}
          onResultsAvailable={(results: CodeInterpreterResponse) => {
            console.log("Code Interpreter Panel Results:", results);
            if (results.success && results.pythonOutput) {
              // Check if there are image files for preview
              const imageFiles = results.generatedFiles?.filter(file => 
                file.contentType && file.contentType.startsWith("image/")
              ) || [];
              
              // Build result message with image previews
              let resultMessage = `🐍 **Code Execution Result**\n\n${results.pythonOutput}`;
              
              if (results.generatedFiles?.length) {
                resultMessage += `\n\n📁 **Generated ${results.generatedFiles.length} file(s)**`;
                
                // Add image previews if any
                if (imageFiles.length > 0) {
                  resultMessage += `\n\n🖼️ **Image Previews:**`;
                  imageFiles.forEach((file, index) => {
                    resultMessage += `\n\n**${file.filename}**`;
                  });
                }
              }

              dispatch({
                type: "ADD_TO_HISTORY",
                payload: {
                  id: uuidv4(),
                  type: "assistant_response",
                  timestamp: Date.now(),
                  result: resultMessage,
                  modelUsed: "Python Code Interpreter",
                  processingTime: results.processingTime || 0,
                  artifacts: results.generatedFiles
                    ? [
                      {
                        id: uuidv4(),
                        type: "files",
                        content: results.generatedFiles,
                        title: "Generated Files"
                      }
                    ]
                    : undefined
                } satisfies AIHistoryItem
              });
            }
          }}
        />

        {/* Modal for displaying the report */}
        <AutonomousReportModal
          report={finalReport}
          isOpen={isReportModalOpen && !!finalReport}
          onClose={handleCloseReportModal}
        />

        {/* Feedback Form Modal */}
        {showFeedbackForm && feedbackMessageId && (
          <FeedbackForm messageId={feedbackMessageId} toastId="feedback-form-toast" onSubmit={submitFeedbackHandler} />
        )}
      </motion.div>
    </AnimatePresence>
  );
};
