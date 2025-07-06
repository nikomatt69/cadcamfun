import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Maximize2, Minimize2, Cpu, Settings, AlertTriangle } from "react-feather";
import { useCAMAssistant } from "../ai/CAMAssistant/CAMAssistantBridge";
import toast from "react-hot-toast";
import ToolpathAnalysisPanel from "../ai/CAMAssistant/ToolpathAnalysisPanel";

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChatPanelCam: React.FC<ChatPanelProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [inputValue, setInputValue] = useState("");
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get CAM Assistant context
  const camAssistant = useCAMAssistant();

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle sending a message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim() || isProcessing) return;

    // Add user message
    const userMessage = { role: "user" as const, content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsProcessing(true);

    try {
      // Process user request
      let response: any = null;
      const activeToolpath = camAssistant.state.activeToolpath;
      const activeTool = camAssistant.state.activeTool;
      const activeMaterial = camAssistant.state.activeMaterial;

      // Simple keyword-based processing for demo purposes
      if (inputValue.toLowerCase().includes("analyze") && activeToolpath) {
        response = await camAssistant.analyzeToolpath(activeToolpath, activeTool, activeMaterial);

        // Add assistant message
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: `Analysis complete. Found ${response?.issues?.length || 0} issues.`
          }
        ]);
      } else if (inputValue.toLowerCase().includes("optimize") && activeToolpath) {
        const optimizedToolpath = await camAssistant.optimizeToolpath(
          activeToolpath,
          ["time", "quality"],
          activeTool,
          activeMaterial
        );

        // Add assistant message
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: optimizedToolpath
              ? `Toolpath optimized successfully. New toolpath created: ${optimizedToolpath.name}`
              : "Failed to optimize toolpath."
          }
        ]);
      } else {
        // Default response
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: "I can help analyze or optimize toolpaths. Please select an active toolpath first."
          }
        ]);
      }
    } catch (error) {
      console.error("Error processing request:", error);
      toast.error("Error processing your request");

      // Add error message
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error processing your request."
        }
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const togglePanelSize = () => {
    setIsPanelExpanded(!isPanelExpanded);
  };

  // Render placeholder if CAM Assistant is not available
  if (!camAssistant) {
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: isPanelExpanded ? 400 : 320, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="h-full bg-gray-100 rounded-xl border border-gray-200 dark:bg-gray-800 shadow-lg flex flex-col overflow-hidden"
        >
          <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <Cpu className="w-5 h-5 mr-2 text-blue-500" />
              <h2 className="text-lg font-semibold">CAM Assistant</h2>
            </div>
            <div className="flex space-x-2">
              <button onClick={togglePanelSize} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
                {isPanelExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              <button onClick={onClose} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="flex-grow overflow-y-auto p-4 space-y-4">
            <ToolpathAnalysisPanel />
          </div>
          <div className="flex-grow overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <MessageCircle size={40} className="mb-2" />
                <p>Ask about CAM operations or toolpaths</p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg max-w-[85%] ${
                    message.role === "user" ? "bg-blue-100 dark:bg-blue-900 ml-auto" : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  {message.content}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder="Ask about CAM operations..."
                className="flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                disabled={isProcessing}
              />
              <button
                type="submit"
                disabled={isProcessing}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isProcessing ? "..." : "Send"}
              </button>
            </div>
            {camAssistant.state.activeTool && (
              <div className="mt-2 text-sm text-gray-500">Active tool: {camAssistant.state.activeTool.name}</div>
            )}
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ChatPanelCam;
