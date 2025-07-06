import React, { useRef, useEffect, useState, useMemo } from "react";
import PluginSidebar from "../plugins/PluginSidebar";
import { AIAssistantOpenai } from "../ai/ai-new/OpenaiAssistant/AIAssistantOpenai";
import { useAIAssistant } from "src/hooks/useAIAssistantOpenai";

import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Maximize2, Minimize2, Cpu, Settings, AlertTriangle } from "react-feather";

import { AIMessage } from "../ai/ai-new/OpenaiAssistant/AIMessage";
import { AIMessageInput } from "../ai/ai-new/OpenaiAssistant/AIMessageInput";
import { AIActionHandler } from "../ai/ai-new/OpenaiAssistant/AIActionHandler";
import { CADAssistantBridge } from "../ai/ai-new/OpenaiAssistant/CADAssistantBridge";
import { useElementsStore } from "@/src/store/elementsStore";
import { useLayerStore } from "@/src/store/layerStore";
import { useSelectionStore } from "@/src/store/selectorStore";
import { ChevronDownSquare } from "lucide-react";
import AISettingsPanel from "../ai/ai-new/AISettingsPanel";

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { elements, selectedElement, selectElement, undo, redo } = useElementsStore();
  const { layers, activeLayer } = useLayerStore();
  const { addElements, addElement } = useElementsStore();
  const { selectedElementIds } = useSelectionStore();
  const {
    messages,
    isProcessing,

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
  const [showCADAssistant, setShowCADAssistant] = useState(false);

  const cadContextData = useMemo(() => {
    const selectedElementsDetails = selectedElementIds
      .map(id => elements.find(el => el.id === id))
      .filter(el => el !== undefined)
      .map(el => ({
        // Passa solo info essenziali per ridurre i token
        id: el!.id,
        type: el!.type,
        name: el!.name || "Unnamed",

        x: el!.x,
        y: el!.y,
        z: el!.z,
        rotation: el!.rotation || { x: 0, y: 0, z: 0 },
        scale: el!.scale || { x: 1, y: 1, z: 1 },
        color: el!.color || "#000000",
        linewidth: el!.linewidth || 1,
        description: el!.description || "",
        material: el!.material || "default",
        additionalProps: el!.additionalProps || {},
        operands: el!.operands || [],
        wireframe: el!.wireframe || false

        // Potresti aggiungere altre proprietà rilevanti qui se necessario
      }));

    const activeLayerDetails = layers.find(l => l.id === activeLayer);

    return {
      totalElementCount: elements.length,
      selectedElementCount: selectedElementIds.length,
      selectedElements: selectedElementsDetails, // Array con dettagli elementi selezionati
      activeLayer: activeLayerDetails ? { id: activeLayerDetails.id, name: activeLayerDetails.name } : null // Dettagli layer attivo
    };
  }, [elements, selectedElementIds, layers, activeLayer]);
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  return (
    <div
      className={`h-full bg-gray-100 rounded-xl border border-gray-200 dark:bg-gray-800 shadow-lg p-1 transition-all duration-300 ease-in-out flex flex-col ${isOpen ? "w-90 sm:w-90" : "w-10 sm:hidden xs:hidden"}`}
      style={{ overflow: "hidden" }} // Per evitare che il contenuto appaia durante la transizione della larghezza a 0
    >
      {isOpen && (
        <>
          <div className="flex justify-between items-center mb-6 flex-shrink-0">
            <button
              onClick={onClose}
              className="text-gray-600 mt-1.5 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            >
              <img src="/icon.png" className="mr-2 w-8 h-8" />
            </button>
          </div>
          <div className="flex-grow bg-gray-100 rounded-xl border border-gray-200 dark:bg-gray-800 shadow-lg overflow-y-auto">
            {/* Contenuto della chat qui */}

            <div className="flex flex-col  h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-3 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded">
                <div className="flex items-center">
                  <img src="/icon.png" className="mr-2 w-6 h-6" />
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
                </div>
              </div>

              {/* Settings Panel */}
              <AnimatePresence>
                {showSettings && (
                  <div className="overflow-y-auto max-h-[80%] border-b border-gray-200 dark:border-gray-700">
                    <AISettingsPanel />
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 space-y-2 rounded-b-2xl text-sm bg-gray-50">
                        <button
                          onClick={clearMessages}
                          className="flex items-center text-xs text-red-600 hover:text-red-800"
                        >
                          <X size={12} className="mr-1" />
                          Clear Conversation
                        </button>
                      </div>
                    </motion.div>
                  </div>
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
                  messages.map((message: any) => <AIMessage key={message.id} message={message} />)
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Action Handler */}
              {pendingActions.length > 0 && (
                <AIActionHandler
                  actions={pendingActions}
                  onExecute={executePendingAction}
                  isProcessing={isProcessing}
                />
              )}
              {/* Input Area */}
              <AIMessageInput
                onSendMessage={sendMessage}
                isProcessing={isProcessing}
                placeholder="Type your message..."
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatPanel;
