// src/components/ai/AIAssistant.tsx
import React, { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Maximize2, Minimize2, Cpu, Settings, AlertTriangle } from "react-feather";

import { useAIAssistant } from "../../../../hooks/useAIAssistantOpenai";
import { AIMessage } from "./AIMessage";
import { AIMessageInput } from "./AIMessageInput";
import { AIActionHandler } from "./AIActionHandler";
import { AIAction } from "../../../../types/AITypes";
import { aiActionService } from "../../../../lib/ai/aiActionService";

export const AIAssistantOpenai: React.FC = () => {
  const {
    messages,
    isProcessing,
    isOpen,
    error,
    context,
    pendingActions,
    sendMessage,
    toggleAssistant,
    clearMessages,
    setContext,
    executePendingAction
  } = useAIAssistant();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isPanelExpanded, setIsPanelExpanded] = React.useState(true);
  const [showSettings, setShowSettings] = React.useState(false);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // If the assistant is closed, render just the toggle button
  if (!isOpen) {
    return (
      <button
        onClick={toggleAssistant}
        className="fixed bottom-20 right-3.5 p-2.5 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors z-40 flex items-center space-x-1"
        aria-label="Open AI Assistant"
      >
        <MessageCircle size={20} />
      </button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className={`fixed z-50 bottom-4 right-4 shadow-xl rounded-3xl bg-white transition-all duration-200 ${
          isPanelExpanded ? "w-96 h-[500px]" : "w-96 h-[500px]"
        }`}
      >
        <div className="flex flex-col rounded-3xl h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-3xl">
            <div className="flex items-center">
              <Cpu size={18} className="mr-2" />
              <div>
                <h3 className="font-medium">AI Assistant</h3>
                <div className="text-xs text-blue-100">Context: {context}</div>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-1.5 rounded-full hover:bg-blue-500 transition-colors"
                title="Settings"
              >
                <Settings size={16} />
              </button>
              <button
                onClick={() => setIsPanelExpanded(false)}
                className="p-1.5 rounded-full hover:bg-blue-500 transition-colors"
                title="Minimize"
              >
                <Minimize2 size={16} />
              </button>
              <button
                onClick={toggleAssistant}
                className="p-1.5 rounded-full hover:bg-blue-500 transition-colors"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-b border-gray-200 overflow-hidden"
              >
                <div className="p-3 space-y-2 text-sm bg-gray-50">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Context</label>
                    <select
                      value={context}
                      onChange={e => setContext(e.target.value)}
                      className="w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-sm"
                    >
                      <option value="default">Default</option>
                      <option value="cad">CAD Design</option>
                      <option value="cam">CAM Programming</option>
                      <option value="general">General Assistance</option>
                    </select>
                  </div>

                  <button onClick={clearMessages} className="flex items-center text-xs text-red-600 hover:text-red-800">
                    <X size={12} className="mr-1" />
                    Clear Conversation
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          {error && (
            <div className="p-3 m-3 bg-red-50 border border-red-200 rounded-md flex items-center text-sm text-red-700">
              <AlertTriangle size={16} className="mr-2 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Cpu size={32} className="mb-2" />
                <p className="text-sm">How can I help you today?</p>
              </div>
            ) : (
              messages.map(message => <AIMessage key={message.id} message={message} />)
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Action Handler */}
          {pendingActions.length > 0 && (
            <AIActionHandler actions={pendingActions} onExecute={executePendingAction} isProcessing={isProcessing} />
          )}
          {/* Input Area */}
          <AIMessageInput onSendMessage={sendMessage} isProcessing={isProcessing} placeholder="Type your message..." />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
