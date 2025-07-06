import React, { useState, useEffect, useCallback, useRef } from "react";
import { Element, useElementsStore } from "@/src/store/elementsStore";
import {
  unifiedAIOrchestrator,
  ApplicationContext,
  OrchestratorResponse,
  UserPreferences,
  UserAction,
  IntentAnalysis,
  AIAction as OrchestratorAIAction,
  ResponseArtifact
} from "@/src/lib/ai/orchestrator/UnifiedAIOrchestrator";
import {
  Send,
  Loader,
  AlertTriangle,
  ArrowDown,
  XCircle,
  Zap,
  Edit3,
  HelpCircle,
  Settings,
  BarChart
} from "react-feather";

interface UnifiedAIAgentProps {
  onElementsGenerated?: (elements: Element[]) => void;
  availableElements?: Element[];
  className?: string;
}

interface DisplayMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  actions?: OrchestratorAIAction[];
  artifacts?: OrchestratorResponse["artifacts"];
  suggestions?: OrchestratorResponse["suggestions"];
  timestamp: number;
  error?: boolean;
}

export const UnifiedAIAgent: React.FC<UnifiedAIAgentProps> = ({
  onElementsGenerated,
  availableElements = [],
  className = ""
}) => {
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orchestratorRef = useRef<typeof unifiedAIOrchestrator | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { addElements } = useElementsStore();
  useEffect(() => {
    // Initialize orchestrator on client-side
    if (typeof window !== "undefined") {
      orchestratorRef.current = unifiedAIOrchestrator;
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSendMessage = useCallback(async () => {
    if (!userInput.trim() || isLoading || !orchestratorRef.current) return;

    const newUserMessage: DisplayMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: userInput,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, newUserMessage]);
    setUserInput("");
    setIsLoading(true);
    setError(null);

    try {
      const currentContext: Partial<ApplicationContext> = {
        elements: {
          total: availableElements,
          selected: availableElements.filter(el => el.isSelected),
          visible: availableElements.filter(el => el.isVisible),
          types: availableElements.reduce(
            (acc, el) => {
              acc[el.type] = (acc[el.type] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          )
          // boundingBox needs calculation if required by orchestrator for initial context
        },
        // Mock or fetch other context parts if needed
        page: orchestratorRef.current.getCurrentContext()?.page || { route: "/", section: "cad", mode: "design" },
        user: orchestratorRef.current.getCurrentContext()?.user || {
          recentActions: [] as UserAction[],
          preferences: {
            preferredModel: "claude-sonnet-4-20250514",
            responseStyle: "detailed",
            complexityLevel: "moderate",
            language: "en",
            autoSuggestions: true,
            contextSensitivity: "high"
          } as UserPreferences,
          skillLevel: "intermediate",
          workingStyle: "systematic"
        },
        viewport: orchestratorRef.current.getCurrentContext()?.viewport || {
          camera: { x: 0, y: 0, z: 100, zoom: 1 },
          view: "iso",
          grid: true,
          units: "mm"
        },
        session: orchestratorRef.current.getCurrentContext()?.session || {
          startTime: new Date(),
          totalActions: 0,
          successfulOperations: 0
        }
      };

      const response = await orchestratorRef.current.processRequest(userInput, currentContext);

      const aiResponseMessage: DisplayMessage = {
        id: `ai-${Date.now()}`,
        sender: "ai",
        text: response.content,
        actions: response.actions as OrchestratorAIAction[] | undefined,
        artifacts: response.artifacts,
        suggestions: response.suggestions,
        timestamp: Date.now(),
        error: !response.success
      };
      setMessages(prev => [...prev, aiResponseMessage]);

      if (response.success && response.artifacts) {
        const generatedElements = response.artifacts
          .filter(art => art.type === "elements")
          .flatMap(art => art.content as Element[]);
        if (generatedElements.length > 0 && onElementsGenerated) {
          onElementsGenerated(generatedElements);
          addElements(generatedElements);
        }
      }
      if (!response.success && response.error) {
        setError(response.error);
      }
    } catch (err: any) {
      console.error("Error processing AI request:", err);
      const errorMessage: DisplayMessage = {
        id: `error-${Date.now()}`,
        sender: "ai",
        text: err.message || "An unexpected error occurred.",
        timestamp: Date.now(),
        error: true
      };
      setMessages(prev => [...prev, errorMessage]);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [userInput, isLoading, availableElements, onElementsGenerated]);

  const renderArtifact = (artifact: ResponseArtifact) => (
    <div key={artifact.id} className="mt-2 p-2 border rounded-md bg-gray-50 dark:bg-gray-700">
      <p className="font-semibold text-sm text-blue-600 dark:text-blue-400">{artifact.title}</p>
      <p className="text-xs text-gray-600 dark:text-gray-300">{artifact.description}</p>
      {artifact.type === "preview" && artifact.content?.previewType === "creation" && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Preview: {artifact.content.elementCount} elements ready.
        </p>
      )}
      {/* Add more specific artifact rendering as needed */}
    </div>
  );

  const renderAction = (action: OrchestratorAIAction) => {
    const IconComponent = iconMap[action.type as IntentAnalysis["primaryIntent"]] || iconMap.default;
    const TypedIconComponent = IconComponent as React.ComponentType<{ size?: number; className?: string }>;
    return (
      <button
        key={action.type + (action.payload?.description || action.description || Date.now())}
        onClick={() => alert(`Action: ${action.description || action.type}`)}
        className="mt-1 mr-1 px-3 py-1.5 text-xs bg-blue-100 hover:bg-blue-200 dark:bg-blue-800 dark:hover:bg-blue-700 text-blue-700 dark:text-blue-200 rounded-md transition-colors flex items-center shadow-sm"
      >
        <TypedIconComponent size={16} className="mr-1.5" />
        {action.description || action.type}
      </button>
    );
  };

  const iconMap: Record<IntentAnalysis["primaryIntent"] | "default", React.ElementType> = {
    create: Edit3,
    modify: Edit3,
    analyze: Zap,
    optimize: Zap,
    export: ArrowDown,
    learn: HelpCircle,
    chat: HelpCircle,
    generate: Edit3,
    default: HelpCircle
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${className}`}>
      {/* Message display area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] p-3 rounded-lg shadow ${
                msg.sender === "user"
                  ? "bg-blue-500 text-white rounded-br-none"
                  : msg.error
                    ? "bg-red-100 dark:bg-red-700 text-red-700 dark:text-red-100 rounded-bl-none"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-none"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              {msg.artifacts && msg.artifacts.length > 0 && (
                <div className="mt-2 border-t pt-2">
                  <h4 className="text-xs font-semibold mb-1">Artifacts:</h4>
                  {(msg.artifacts || []).map(renderArtifact)}
                </div>
              )}
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-2 border-t pt-2">
                  <h4 className="text-xs font-semibold mb-1">Suggested Actions:</h4>
                  {msg.actions.map(renderAction)}
                </div>
              )}
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="mt-2 border-t pt-2">
                  <h4 className="text-xs font-semibold mb-1">Suggestions:</h4>
                  {msg.suggestions.map((sugg, i) => (
                    <button
                      key={i}
                      onClick={() => setUserInput(sugg)}
                      className="mt-1 mr-1 px-2 py-1 text-xs bg-green-100 hover:bg-green-200 dark:bg-green-700 dark:hover:bg-green-600 text-green-700 dark:text-green-200 rounded-md transition-colors"
                    >
                      {sugg}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs mt-1 opacity-70 text-right">{new Date(msg.timestamp).toLocaleTimeString()}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="p-2 text-center text-sm bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200 flex items-center justify-center">
          <AlertTriangle size={16} className="mr-2" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto p-1 hover:bg-red-200 dark:hover:bg-red-700 rounded-full"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center bg-gray-100 dark:bg-gray-750 rounded-lg p-1">
          <textarea
            rows={1}
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            onKeyPress={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask AI... (Shift+Enter for newline)"
            className="flex-1 p-2 bg-transparent resize-none focus:outline-none text-sm placeholder-gray-500 dark:placeholder-gray-400"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !userInput.trim()}
            className="p-2 rounded-md text-blue-500 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-gray-600 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
            title="Send Message"
          >
            {isLoading ? <Loader size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
};
