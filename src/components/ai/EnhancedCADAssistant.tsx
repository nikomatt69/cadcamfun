// src/components/ai/EnhancedCADAssistant.tsx
import React, { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Send, MessageSquare, Settings, BarChart3, Trash2, RefreshCw } from "lucide-react";
import { useContinuousAgent } from "@/src/hooks/ai/useContinuousAgent";
import { ThinkingDropdown } from "./ThinkingDropdown";
import { RealTimeThinking } from "./RealTimeThinking";
import { ProactiveSuggestions } from "./ProactiveSuggestions";

interface EnhancedCADAssistantProps {
  cadElements?: any[];
  projectName?: string;
  currentTool?: string;
  userPreferences?: Record<string, any>;
  className?: string;
  onToolCall?: (tool: string, params: any) => void;
}

export const EnhancedCADAssistant: React.FC<EnhancedCADAssistantProps> = ({
  cadElements = [],
  projectName,
  currentTool,
  userPreferences = {},
  className = "",
  onToolCall
}) => {
  // State
  const [conversationId] = useState(() => uuidv4());
  const [message, setMessage] = useState("");
  const [showThinkingDetails, setShowThinkingDetails] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Continuous agent hook
  const {
    sendMessage,
    acceptSuggestion,
    currentThinking,
    proactiveSuggestions,
    conversationHistory,
    isProcessing,
    error,
    clearHistory,
    dismissSuggestions,
    getStatistics
  } = useContinuousAgent(conversationId, {
    enableThinking: true,
    enableMCP: true,
    autoSuggest: true,
    persistContext: true,
    mcpServers: ["cad-tools", "cam-tools", "analysis-tools"]
  });

  // Auto scroll to bottom
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversationHistory, autoScroll]);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSendMessage = async () => {
    if (!message.trim() || isProcessing) return;

    const currentMessage = message;
    setMessage("");

    try {
      await sendMessage(currentMessage, {
        elements: cadElements,
        projectName,
        currentTool,
        userPreferences
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setMessage(suggestion);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleAcceptSuggestion = async (suggestion: string) => {
    try {
      await acceptSuggestion(suggestion, {
        elements: cadElements,
        projectName,
        currentTool,
        userPreferences
      });
      dismissSuggestions();
    } catch (error) {
      console.error("Error accepting suggestion:", error);
    }
  };

  const statistics = getStatistics();

  return (
    <div
      className={`enhanced-cad-assistant flex flex-col h-full bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          <div>
            <h3 className="font-semibold text-gray-800">Enhanced CAD Assistant</h3>
            <p className="text-xs text-gray-600">
              {projectName ? `Project: ${projectName}` : "No active project"} •{cadElements.length} elements • MCP +
              Extended Thinking enabled
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Statistics"
          >
            <BarChart3 className="w-4 h-4 text-gray-600" />
          </button>

          <button
            onClick={clearHistory}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-red-600"
            title="Clear conversation"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Statistics Panel */}
      {showSettings && (
        <div className="p-3 bg-gray-50 border-b border-gray-200 text-sm">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="font-medium text-gray-800">{statistics.totalExchanges}</p>
              <p className="text-xs text-gray-600">Exchanges</p>
            </div>
            <div>
              <p className="font-medium text-gray-800">{statistics.thinkingSessions}</p>
              <p className="text-xs text-gray-600">Thinking Sessions</p>
            </div>
            <div>
              <p className="font-medium text-gray-800">{statistics.avgProcessingTime}ms</p>
              <p className="text-xs text-gray-600">Avg Processing</p>
            </div>
            <div>
              <p className="font-medium text-gray-800">{statistics.memoryStats.totalConversations}</p>
              <p className="text-xs text-gray-600">Memory Entries</p>
            </div>
          </div>
        </div>
      )}

      {/* Thinking Visualization */}
      {currentThinking && (
        <div className="p-3 border-b border-gray-200">
          <ThinkingDropdown
            thinkingSession={currentThinking}
            isOpen={showThinkingDetails}
            onToggle={() => setShowThinkingDetails(!showThinkingDetails)}
            showRealTime={isProcessing}
          />
        </div>
      )}

      {/* Real-time Thinking Indicator */}
      {isProcessing && (
        <div className="p-2 border-b border-gray-200">
          <RealTimeThinking sessionId={conversationId} showDetails={false} />
        </div>
      )}

      {/* Proactive Suggestions */}
      {proactiveSuggestions.length > 0 && (
        <div className="p-3 border-b border-gray-200">
          <ProactiveSuggestions
            suggestions={proactiveSuggestions}
            onSuggestionClick={handleSuggestionClick}
            onDismiss={dismissSuggestions}
            maxVisible={3}
          />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {conversationHistory.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium">Start a conversation with your CAD Assistant</p>
            <p className="text-xs mt-1">Ask about design, analysis, toolpaths, or get proactive suggestions</p>
          </div>
        ) : (
          conversationHistory.map((exchange, index) => (
            <div key={index} className="space-y-3">
              {/* User Message */}
              <div className="flex justify-end">
                <div className="max-w-[80%] bg-blue-600 text-white rounded-lg px-4 py-2">
                  <p className="text-sm">{exchange.message}</p>
                  <p className="text-xs text-blue-100 mt-1">{exchange.timestamp.toLocaleTimeString()}</p>
                </div>
              </div>

              {/* Assistant Response */}
              <div className="flex justify-start">
                <div className="max-w-[80%] bg-gray-100 rounded-lg px-4 py-2">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{exchange.response}</p>

                  {/* Thinking Summary */}
                  {exchange.thinking && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-600">
                        🧠 Thinking: {exchange.thinking.steps.length} steps •
                        {Math.round(exchange.thinking.totalDuration)}ms
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-gray-500 mt-1">{exchange.timestamp.toLocaleTimeString()}</p>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Loading indicator */}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-2 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-gray-600" />
              <span className="text-sm text-gray-600">Processing with MCP tools...</span>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">❌ {error}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me about CAD design, analysis, toolpaths, or anything else..."
            disabled={isProcessing}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />

          <button
            onClick={handleSendMessage}
            disabled={!message.trim() || isProcessing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span>Enhanced with MCP tools and Extended Thinking</span>
          <span>{message.length}/1000</span>
        </div>
      </div>
    </div>
  );
};

export default EnhancedCADAssistant;
