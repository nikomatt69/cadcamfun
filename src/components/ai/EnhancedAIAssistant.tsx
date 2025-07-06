import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useThinkingProcess, useThinkingUI, useThinkingSettings } from "../../store/extendedThinkingStore";
import { useAIAssistantStore } from "../../store/aiAssistantStore";
import { useMCPTools } from "../../hooks/useMCPIntegration";
import ThinkingControls from "./ThinkingControls";
import ThinkingHistory from "./ThinkingHistory";
import { ThinkingDropdown } from "../ai/ThinkingDropdown";

interface EnhancedAIAssistantProps {
  className?: string;
  showThinkingHistory?: boolean;
  allowThinkingControls?: boolean;
}

const EnhancedAIAssistant: React.FC<EnhancedAIAssistantProps> = ({
  className = "",
  showThinkingHistory = false,
  allowThinkingControls = true
}) => {
  const { isVisible, currentMode, selectedModel, messageHistory, toggle, setVisible, addMessage, clearMessages } =
    useAIAssistantStore();

  const { currentThinking, isThinking, startThinking, addStep, completeThinking, interruptThinking } =
    useThinkingProcess();

  const { showDropdown, toggleDropdown, setDropdown } = useThinkingUI();

  const { depth, autoShow, realTime, speed } = useThinkingSettings();

  const { availableTools, executeToolByName } = useMCPTools();

  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageHistory]);

  // Auto-show thinking dropdown when thinking starts
  useEffect(() => {
    if (isThinking && autoShow) {
      setDropdown(true);
    }
  }, [isThinking, autoShow, setDropdown]);

  // Simulate thinking process based on depth
  const simulateThinkingProcess = async (userQuery: string, context: string) => {
    const depthConfig = {
      shallow: { steps: 2, baseDelay: 300 },
      medium: { steps: 4, baseDelay: 500 },
      deep: { steps: 6, baseDelay: 700 },
      comprehensive: { steps: 8, baseDelay: 900 }
    };

    const config = depthConfig[depth];
    const speedMultiplier = speed === "fast" ? 0.5 : speed === "slow" ? 1.5 : 1;

    startThinking(userQuery, context);

    // Simulate thinking steps
    const thinkingSteps = [
      {
        type: "analysis" as const,
        content: `Analyzing the user's request: "${userQuery}"`,
        confidence: 0.9,
        reasoning: "Initial analysis of user intent and requirements",
        duration: config.baseDelay * speedMultiplier,
        relatedConcepts: ["user_intent", "analysis"]
      },
      {
        type: "reasoning" as const,
        content: "Considering available information and context from previous messages",
        confidence: 0.8,
        reasoning: "Evaluating context and determining appropriate response strategy",
        duration: config.baseDelay * speedMultiplier * 1.2,
        relatedConcepts: ["context", "strategy"]
      },
      {
        type: "hypothesis" as const,
        content: "Formulating potential solutions and approaches",
        confidence: 0.7,
        reasoning: "Generating multiple possible responses and evaluating their merits",
        duration: config.baseDelay * speedMultiplier * 0.8,
        relatedConcepts: ["solutions", "approaches"]
      },
      {
        type: "analysis" as const,
        content: "Checking if MCP tools are needed for this task",
        confidence: 0.85,
        reasoning: "Determining if external tools or resources should be utilized",
        duration: config.baseDelay * speedMultiplier * 0.6,
        relatedConcepts: ["mcp_tools", "external_resources"]
      },
      {
        type: "reasoning" as const,
        content: "Evaluating response quality and completeness",
        confidence: 0.9,
        reasoning: "Ensuring the response meets user expectations and requirements",
        duration: config.baseDelay * speedMultiplier * 0.7,
        relatedConcepts: ["quality", "completeness"]
      },
      {
        type: "conclusion" as const,
        content: "Finalizing response with optimal balance of detail and clarity",
        confidence: 0.95,
        reasoning: "Preparing the final response for delivery",
        duration: config.baseDelay * speedMultiplier * 0.5,
        relatedConcepts: ["finalization", "clarity"]
      }
    ];

    // Add steps based on depth
    for (let i = 0; i < Math.min(config.steps, thinkingSteps.length); i++) {
      if (realTime) {
        await new Promise(resolve => setTimeout(resolve, thinkingSteps[i].duration));
      }
      addStep(thinkingSteps[i]);
    }

    // Complete thinking
    const summary = `Analyzed "${userQuery}" using ${depth} thinking depth with ${Math.min(config.steps, thinkingSteps.length)} reasoning steps`;
    completeThinking(summary, "completed");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userMessage = input.trim();
    setInput("");
    setIsProcessing(true);

    // Add user message
    addMessage("user", userMessage, currentMode);

    try {
      // Start thinking process
      await simulateThinkingProcess(
        userMessage,
        messageHistory
          .slice(-5)
          .map(m => m.content)
          .join("\n")
      );

      // Simulate AI processing (replace with actual AI call)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Generate response (this would be replaced with actual AI integration)
      let aiResponse = `I understand you're asking about: "${userMessage}". `;

      // Check if MCP tools might be helpful
      if (availableTools.length > 0) {
        const toolSuggestions = availableTools
          .flatMap(server => server.tools)
          .slice(0, 3)
          .join(", ");
        aiResponse += `I have access to tools like ${toolSuggestions} that might help with this request. `;
      }

      aiResponse += `Based on my ${depth} analysis, here's my response...`;

      // Add AI response
      addMessage("assistant", aiResponse, currentMode);
    } catch (error) {
      console.error("Error processing message:", error);
      addMessage("system", "Sorry, there was an error processing your request.", currentMode);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const getMessageTypeColor = (role: string) => {
    switch (role) {
      case "user":
        return "bg-blue-500 text-white";
      case "assistant":
        return "bg-gray-100 text-gray-900";
      case "system":
        return "bg-yellow-100 text-yellow-800 border border-yellow-200";
      default:
        return "bg-gray-100 text-gray-900";
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 w-96 bg-white border border-gray-200 rounded-lg shadow-xl z-50 ${className}`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              {isThinking ? (
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                  <div
                    className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                </div>
              ) : (
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              )}
              <h3 className="text-sm font-semibold text-gray-900">Enhanced AI Assistant</h3>
            </div>
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">{currentMode}</span>
          </div>

          <div className="flex items-center space-x-1">
            {/* Thinking toggle */}
            <button
              onClick={toggleDropdown}
              className={`p-1 rounded transition-colors ${
                showDropdown ? "text-blue-600 bg-blue-100" : "text-gray-400 hover:text-gray-600"
              }`}
              title="Toggle thinking view"
            >
              🧠
            </button>

            {/* Controls toggle */}
            {allowThinkingControls && (
              <button
                onClick={() => setShowControls(!showControls)}
                className={`p-1 rounded transition-colors ${
                  showControls ? "text-purple-600 bg-purple-100" : "text-gray-400 hover:text-gray-600"
                }`}
                title="Thinking controls"
              >
                ⚙️
              </button>
            )}

            {/* History toggle */}
            {showThinkingHistory && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-1 rounded transition-colors ${
                  showHistory ? "text-green-600 bg-green-100" : "text-gray-400 hover:text-gray-600"
                }`}
                title="Thinking history"
              >
                📚
              </button>
            )}

            {/* Minimize */}
            <button
              onClick={() => setVisible(false)}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mode selector */}
        <div className="mt-2">
          <select
            value={currentMode}
            onChange={e => {
              /* Handle mode change */
            }}
            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="general">General</option>
            <option value="cad">CAD Design</option>
            <option value="cam">CAM Programming</option>
            <option value="gcode">G-Code</option>
            <option value="toolpath">Toolpath</option>
          </select>
        </div>
      </div>

      {/* Thinking Dropdown */}
      <div className="relative">
        <AnimatePresence>
          {showDropdown && (
            <div className="absolute bottom-full left-0 right-0 mb-2 z-10">
              <ThinkingDropdown
                thinkingSession={(currentThinking as any) || null}
                isOpen={showDropdown}
                onToggle={toggleDropdown}
              />
            </div>
          )}
        </AnimatePresence>

        {/* Controls Panel */}
        <AnimatePresence>
          {showControls && (
            <div className="absolute bottom-full left-0 right-0 mb-2 z-10">
              <ThinkingControls onToggle={() => setShowControls(false)} />
            </div>
          )}
        </AnimatePresence>

        {/* History Panel */}
        <AnimatePresence>
          {showHistory && (
            <div className="absolute bottom-full left-0 right-0 mb-2 z-10 max-w-2xl">
              <ThinkingHistory
                compact={false}
                onSelectThinking={thinking => {
                  console.log("Selected thinking:", thinking);
                }}
              />
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Messages */}
      <div className="h-80 overflow-y-auto p-4 space-y-3">
        {messageHistory.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <div className="text-4xl mb-2">🤖</div>
            <p className="text-sm">Start a conversation with your enhanced AI assistant</p>
            <p className="text-xs text-gray-400 mt-1">With {depth} thinking depth and real-time reasoning</p>
          </div>
        ) : (
          messageHistory.map((message, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`
                max-w-[80%] p-3 rounded-lg text-sm
                ${message.role === "user" ? "ml-auto" : "mr-auto"}
                ${getMessageTypeColor(message.role)}
              `}
            >
              <div className="text-xs opacity-70 mb-1">
                {message.role} • {new Date(message.timestamp).toLocaleTimeString()}
              </div>
              <div>{message.content}</div>
            </motion.div>
          ))
        )}

        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center space-x-2 text-gray-500 text-sm"
          >
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
            </div>
            <span>AI is thinking...</span>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Ask anything... (${depth} thinking mode)`}
            className="w-full p-3 pr-12 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={2}
            disabled={isProcessing}
          />

          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="absolute bottom-2 right-2 p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>

        {/* Quick actions */}
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-3">
            <span>Depth: {depth}</span>
            {availableTools.length > 0 && <span>Tools: {availableTools.length} available</span>}
            {isThinking && <span className="text-blue-600">Thinking active</span>}
          </div>

          <div className="flex items-center space-x-2">
            {messageHistory.length > 0 && (
              <button onClick={clearMessages} className="hover:text-gray-700 transition-colors">
                Clear
              </button>
            )}
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Enter</kbd>
          </div>
        </div>
      </form>
    </div>
  );
};

export default EnhancedAIAssistant;
