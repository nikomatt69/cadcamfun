import React, { useState, useEffect, useRef } from "react";
import { Element } from "@/src/store/elementsStore";
import {
  TaskStatus,
  TaskPriority,
  ProgressStage,
  AgentTaskType
} from "@/src/lib/ai/generation/progressiveGeneratorService";

interface ContinuousAgentInterfaceProps {
  onElementsGenerated?: (elements: Element[]) => void;
  className?: string;
  availableElements?: Element[]; // For contextual generation
  onCADAction?: (actionType: string, payload: any) => void;
  onCAMAction?: (actionType: string, payload: any) => void;
}

interface AgentMessage {
  id: string;
  type: "thinking" | "progress" | "result" | "error" | "status" | "connected" | "heartbeat";
  content: string;
  timestamp: Date;
  taskId?: string;
  data?: any;
}

interface TaskInfo {
  id: string;
  type: AgentTaskType;
  description: string;
  status: TaskStatus;
  progress: number;
  stage?: ProgressStage;
}

export const ContinuousAgentInterface: React.FC<ContinuousAgentInterfaceProps> = ({
  onElementsGenerated,
  className = "",
  availableElements = [],
  onCADAction,
  onCAMAction
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isAgentActive, setIsAgentActive] = useState(false);
  const [currentTask, setCurrentTask] = useState<TaskInfo | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected" | "error">(
    "disconnected"
  );
  const [currentThinking, setCurrentThinking] = useState("");
  const [actionMode, setActionMode] = useState<"generate" | "cad" | "cam" | "contextual" | "message">("generate");

  // Form states for different action types
  const [cadActionType, setCadActionType] = useState("handleGenerateCADElement");
  const [camActionType, setCamActionType] = useState("ANALYZE_TOOLPATH");
  const [contextualOptions, setContextualOptions] = useState({
    positioning: "smart",
    useCache: true,
    fallbackOnError: true
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Set up streaming connection
  useEffect(() => {
    if (connectionStatus === "connecting") {
      connectToAgent();
    }

    return () => {
      disconnectFromAgent();
    };
  }, [connectionStatus]);

  const connectToAgent = () => {
    try {
      eventSourceRef.current = new EventSource("/api/ai/continuous-agent?type=stream");

      eventSourceRef.current.onopen = () => {
        console.log("Agent stream connected");
        setConnectionStatus("connected");
        setIsConnected(true);
      };

      eventSourceRef.current.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          handleStreamUpdate(data);
        } catch (error) {
          console.error("Error parsing stream data:", error);
        }
      };

      eventSourceRef.current.addEventListener("error", event => {
        console.error("Stream error:", event);
        setConnectionStatus("error");
        setIsConnected(false);

        // Try to reconnect after 5 seconds
        setTimeout(() => {
          if (connectionStatus !== "disconnected") {
            setConnectionStatus("connecting");
          }
        }, 5000);
      });
    } catch (error) {
      console.error("Failed to connect to agent:", error);
      setConnectionStatus("error");
    }
  };

  const disconnectFromAgent = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
    setConnectionStatus("disconnected");
  };

  const handleStreamUpdate = (update: any) => {
    const message: AgentMessage = {
      id: `${Date.now()}-${Math.random()}`,
      type: update.type || "status",
      content: update.data?.message || update.message || JSON.stringify(update.data || {}),
      timestamp: new Date(update.timestamp || Date.now()),
      taskId: update.taskId,
      data: update.data
    };

    setMessages(prev => [...prev, message]);

    // Handle specific update types
    switch (update.type) {
      case "thinking":
        setCurrentThinking(update.data?.thinking || "");
        break;
      case "progress":
        if (update.data?.task) {
          setCurrentTask({
            id: update.data.task.id,
            type: update.data.task.type,
            description: update.data.task.description,
            status: update.data.task.status,
            progress: update.data.task.progress,
            stage: update.data.task.stage
          });
        }
        break;
      case "result":
        // Handle generated elements
        if (update.data?.elements && onElementsGenerated) {
          onElementsGenerated(update.data.elements);
        }
        // Handle CAD/CAM action results
        if (update.data?.result && onCADAction && update.taskId) {
          // This could be enhanced to determine if it's a CAD or CAM action
        }
        break;
      case "status":
        if (update.data?.isActive !== undefined) {
          setIsAgentActive(update.data.isActive);
        }
        break;
    }
  };

  const addMessage = (message: Partial<AgentMessage>) => {
    const fullMessage: AgentMessage = {
      id: `${Date.now()}-${Math.random()}`,
      type: "status",
      content: "",
      timestamp: new Date(),
      ...message
    };
    setMessages(prev => [...prev, fullMessage]);
  };

  const startAgent = async () => {
    try {
      const response = await fetch("/api/ai/continuous-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" })
      });

      if (response.ok) {
        setConnectionStatus("connecting");
        addMessage({ type: "status", content: "Agent starting..." });
      }
    } catch (error) {
      console.error("Failed to start agent:", error);
      addMessage({ type: "error", content: "Failed to start agent" });
    }
  };

  const stopAgent = async () => {
    try {
      const response = await fetch("/api/ai/continuous-agent", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" })
      });

      if (response.ok) {
        disconnectFromAgent();
        setIsAgentActive(false);
        addMessage({ type: "status", content: "Agent stopped" });
      }
    } catch (error) {
      console.error("Failed to stop agent:", error);
      addMessage({ type: "error", content: "Failed to stop agent" });
    }
  };

  const executeAction = async () => {
    if (!inputValue.trim() || !isConnected) return;

    try {
      let requestBody: any = {};

      switch (actionMode) {
        case "generate":
          requestBody = {
            action: "generateCAD",
            request: {
              description: inputValue,
              constraints: {},
              style: "precise",
              complexity: "moderate"
            }
          };
          break;

        case "cad":
          requestBody = {
            action: "executeCADAction",
            actionType: cadActionType,
            payload: { description: inputValue }
          };
          break;

        case "cam":
          requestBody = {
            action: "executeCAMAction",
            actionType: camActionType,
            payload: { description: inputValue }
          };
          break;

        case "contextual":
          requestBody = {
            action: "generateContextual",
            description: inputValue,
            existingElements: availableElements,
            constraints: {},
            options: contextualOptions
          };
          break;

        case "message":
          requestBody = {
            action: "sendMessage",
            message: inputValue,
            context: { availableElements: availableElements.length }
          };
          break;
      }

      const response = await fetch("/api/ai/continuous-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        setInputValue("");
        addMessage({
          type: "status",
          content: `${actionMode} action submitted: ${inputValue}`
        });
      } else {
        const error = await response.json();
        addMessage({
          type: "error",
          content: `Failed to execute action: ${error.message || "Unknown error"}`
        });
      }
    } catch (error) {
      console.error("Failed to execute action:", error);
      addMessage({ type: "error", content: "Failed to execute action" });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      executeAction();
    }
  };

  const clearMessages = () => {
    setMessages([]);
    setCurrentThinking("");
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.COMPLETED:
        return "text-green-500";
      case TaskStatus.FAILED:
        return "text-red-500";
      case TaskStatus.EXECUTING:
        return "text-blue-500";
      case TaskStatus.THINKING:
        return "text-purple-500";
      default:
        return "text-gray-500";
    }
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case "thinking":
        return "🧠";
      case "progress":
        return "⚡";
      case "result":
        return "✅";
      case "error":
        return "❌";
      case "connected":
        return "🔗";
      default:
        return "ℹ️";
    }
  };

  return (
    <div className={`flex flex-col h-full bg-white rounded-lg shadow-lg ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-200 rounded-t-lg">
        <div className="flex items-center space-x-3">
          <h2 className="text-lg font-semibold text-gray-800">Continuous AI Agent</h2>
          <div
            className={`w-3 h-3 rounded-full ${
              connectionStatus === "connected"
                ? "bg-green-500"
                : connectionStatus === "connecting"
                  ? "bg-yellow-500"
                  : "bg-red-500"
            }`}
          />
          <span className="text-sm text-gray-600 capitalize">{connectionStatus}</span>
        </div>

        <div className="flex items-center space-x-2">
          {!isAgentActive ? (
            <button
              onClick={startAgent}
              disabled={connectionStatus === "connecting"}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
            >
              Start Agent
            </button>
          ) : (
            <button onClick={stopAgent} className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">
              Stop Agent
            </button>
          )}
          <button onClick={clearMessages} className="px-3 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600">
            Clear
          </button>
        </div>
      </div>

      {/* Action Mode Selector */}
      <div className="p-3 bg-gray-50 border-b border-gray-200">
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { key: "generate", label: "Generate CAD" },
            { key: "cad", label: "CAD Action" },
            { key: "cam", label: "CAM Action" },
            { key: "contextual", label: "Contextual" },
            { key: "message", label: "Message" }
          ].map(mode => (
            <button
              key={mode.key}
              onClick={() => setActionMode(mode.key as any)}
              className={`px-3 py-1 rounded-md text-sm ${
                actionMode === mode.key ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Action-specific options */}
        {actionMode === "cad" && (
          <select
            value={cadActionType}
            onChange={e => setCadActionType(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="handleGenerateCADElement">Generate Element</option>
            <option value="handleUpdateCADElement">Update Element</option>
            <option value="handleRemoveCADElement">Remove Element</option>
            <option value="handleGroupCADElements">Group Elements</option>
            <option value="handleAutoQuoteCADElements">Auto Quote</option>
            <option value="handleGenerate2DTechnicalDrawings">Generate 2D Drawings</option>
          </select>
        )}

        {actionMode === "cam" && (
          <select
            value={camActionType}
            onChange={e => setCamActionType(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="ANALYZE_TOOLPATH">Analyze Toolpath</option>
            <option value="OPTIMIZE_TOOLPATH">Optimize Toolpath</option>
            <option value="ANALYZE_TOOL">Analyze Tool</option>
            <option value="ANALYZE_MATERIAL">Analyze Material</option>
            <option value="CALCULATE_COST">Calculate Cost</option>
            <option value="ANALYZE_GCODE">Analyze G-code</option>
            <option value="GENERATE_GCODE_FROM_TEXT">Generate G-code</option>
          </select>
        )}

        {actionMode === "contextual" && (
          <div className="flex items-center space-x-3 text-sm">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={contextualOptions.useCache}
                onChange={e => setContextualOptions(prev => ({ ...prev, useCache: e.target.checked }))}
                className="mr-1"
              />
              Use Cache
            </label>
            <select
              value={contextualOptions.positioning}
              onChange={e => setContextualOptions(prev => ({ ...prev, positioning: e.target.value }))}
              className="p-1 border border-gray-300 rounded"
            >
              <option value="smart">Smart</option>
              <option value="adjacent">Adjacent</option>
              <option value="centered">Centered</option>
              <option value="origin">Origin</option>
            </select>
          </div>
        )}
      </div>

      {/* Current Task Status */}
      {currentTask && (
        <div className="p-3 bg-blue-50 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Current Task:</span>
            <span className={`text-sm ${getStatusColor(currentTask.status)}`}>{currentTask.status}</span>
          </div>
          <div className="text-sm text-gray-600 mb-2">{currentTask.description}</div>
          {currentTask.stage && <div className="text-xs text-gray-500 mb-2">Stage: {currentTask.stage}</div>}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${currentTask.progress}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">{currentTask.progress}% complete</div>
        </div>
      )}

      {/* Thinking Display */}
      {currentThinking && (
        <div className="p-3 bg-purple-50 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="animate-pulse text-purple-500">🧠</div>
            <span className="text-sm font-medium text-purple-700">Thinking...</span>
          </div>
          <div className="text-sm text-purple-600 mt-1">{currentThinking}</div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p>No messages yet. Start the agent to begin.</p>
          </div>
        ) : (
          messages.map(message => (
            <div
              key={message.id}
              className={`p-3 rounded-lg border-l-4 ${
                message.type === "error"
                  ? "bg-red-50 border-red-400"
                  : message.type === "thinking"
                    ? "bg-purple-50 border-purple-400"
                    : message.type === "result"
                      ? "bg-green-50 border-green-400"
                      : message.type === "progress"
                        ? "bg-blue-50 border-blue-400"
                        : "bg-gray-50 border-gray-400"
              }`}
            >
              <div className="flex items-start space-x-3">
                <span className="text-lg">{getMessageIcon(message.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-sm font-medium capitalize text-gray-700">{message.type}</span>
                    <span className="text-xs text-gray-500">{message.timestamp.toLocaleTimeString()}</span>
                    {message.taskId && <span className="text-xs text-gray-400">Task: {message.taskId.slice(-8)}</span>}
                  </div>
                  <div className="text-sm text-gray-600 break-words">{message.content}</div>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
        <div className="flex space-x-2">
          <textarea
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={`Enter ${actionMode} request...`}
            className="flex-1 p-3 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            rows={2}
          />
          <button
            onClick={executeAction}
            className="px-6 py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Execute
          </button>
        </div>
        <div className="text-xs text-gray-500 mt-1">Press Enter to execute • Shift+Enter for new line</div>
      </div>
    </div>
  );
};
