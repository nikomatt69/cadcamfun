// src/components/ai/AIAssistant.tsx
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageCircle, 
  X, 
  Maximize2, 
  Minimize2,
  Send,
  Loader,
  Cpu,
  CheckCircle,
  AlertTriangle,
  Settings,
  RefreshCw,
  ChevronRight,
  ChevronDown
} from 'react-feather';
import { useAI } from './AIContextProvider';
import { AI_MODELS } from '@/src/lib/ai/ai-new/aiConfigManager';
import { AIModelType } from '@/src/types/AITypes';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

/**
 * Componente assistente AI unificato
 * Fornisce un'interfaccia chat per interagire con l'AI
 */
const AIAssistant: React.FC = () => {
  // Stato del componente
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Contesto AI
  const { 
    state, 
    dispatch, 
    sendAssistantMessage, 
    hideAssistant, 
    toggleAssistantPanel
  } = useAI();
  
  const { isVisible, isPanelOpen } = state.assistant;
  const { currentModel, mode } = state;
  
  // Gestione dello scroll automatico quando arrivano nuovi messaggi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Aggiunge un messaggio di benvenuto quando il componente viene montato
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage = getWelcomeMessage(mode);
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: welcomeMessage,
          timestamp: Date.now()
        }
      ]);
    }
  }, [mode, messages.length]);
  
  // Ottiene un messaggio di benvenuto per il modo corrente
  const getWelcomeMessage = (mode: string): string => {
    switch (mode) {
      case 'cad':
        return "Ciao! Sono il tuo assistente CAD. Come posso aiutarti con la modellazione 3D oggi?";
      case 'cam':
        return "Ciao! Sono il tuo assistente CAM. Come posso aiutarti con la programmazione delle lavorazioni?";
      case 'gcode':
        return "Ciao! Sono il tuo assistente G-code. Come posso aiutarti con la programmazione CNC?";
      case 'toolpath':
        return "Ciao! Sono il tuo assistente per ottimizzazione dei percorsi utensile. Come posso aiutarti?";
      case 'analysis':
        return "Ciao! Sono il tuo assistente per l'analisi del design. Come posso aiutarti?";
      default:
        return "Ciao! Sono il tuo assistente AI. Come posso aiutarti oggi?";
    }
  };
  
  // Invia un messaggio all'assistente
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isTyping) return;
    
    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: inputMessage,
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsTyping(true);
    
    try {
      const response = await sendAssistantMessage(inputMessage);
      
      if (response.success && response.data) {
        const assistantMessage: Message = {
          id: `assistant_${Date.now()}`,
          role: 'assistant',
          content: response.data,
          timestamp: Date.now()
        };
        
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Aggiungi un messaggio di errore se la richiesta fallisce
        const errorMessage: Message = {
          id: `error_${Date.now()}`,
          role: 'assistant',
          content: response.error || 'Mi dispiace, ho avuto un problema nell\'elaborazione della tua richiesta. Puoi riprovare?',
          timestamp: Date.now()
        };
        
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      // Gestisci errori durante la chiamata API
      const errorMessage: Message = {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: 'Mi dispiace, si è verificato un errore durante l\'elaborazione della tua richiesta. Riprova più tardi.',
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };
  
  // Gestisce l'invio del messaggio con il tasto Invio
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  // Formatta il timestamp come ora leggibile
  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Mostra un indicatore del modello più compatto
  const getModelBadge = (model: string): string => {
    switch (model) {
      case AI_MODELS.CLAUDE_OPUS:
        return 'Opus';
      case AI_MODELS.CLAUDE_SONNET:
        return 'Sonnet';
      case AI_MODELS.CLAUDE_HAIKU:
        return 'Haiku';
      case AI_MODELS.CLAUDE_SONNET_7:
        return 'Sonnet 3.7';
      default:
        return 'AI';
    }
  };
  
  // Se l'assistente non è visibile, mostra solo il pulsante toggle
  if (!isVisible) {
    return null;
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={`fixed z-50 transition-all duration-200 shadow-xl rounded-lg bg-white ${
        isPanelOpen 
          ? 'bottom-12 right-4 w-96 h-[500px]' 
          : 'bottom-20 right-4 w-auto h-auto'
      }`}
    >
      {isPanelOpen ? (
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg">
            <div className="flex items-center">
              <Cpu size={20} className="mr-2" />
              <div>
                <h3 className="font-medium">AI Assistant</h3> 
                <div className="text-xs text-blue-100">
                  Mode: {mode.toUpperCase()} | {getModelBadge(currentModel)}
                </div>
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
                onClick={() => toggleAssistantPanel()}
                className="p-1.5 rounded-full hover:bg-blue-500 transition-colors"
                title="Minimize"
              >
                <Minimize2 size={16} />
              </button>
              <button
                onClick={() => hideAssistant()}
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
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-b border-gray-200 overflow-hidden"
              >
                <div className="p-3 space-y-2 text-sm bg-gray-50">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      AI Model
                    </label>
                    <select
                      value={currentModel}
                      onChange={(e) => dispatch({ type: 'SET_MODEL', payload: e.target.value as AIModelType })}
                      className="w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-sm"
                    >
                      <option value={AI_MODELS.CLAUDE_HAIKU}>Claude Haiku (Fast)</option>
                      <option value={AI_MODELS.CLAUDE_SONNET}>Claude Sonnet (Balanced)</option>
                      <option value={AI_MODELS.CLAUDE_OPUS}>Claude Opus (Powerful)</option>
                      <option value={AI_MODELS.CLAUDE_SONNET_7}>Claude 3.7 Sonnet (Advanced)</option>
                    </select>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-700">Automatic Suggestions</label>
                    <div className="relative inline-block w-10 align-middle select-none">
                      <input
                        type="checkbox"
                        checked={state.settings.autoSuggest}
                        onChange={(e) => dispatch({ 
                          type: 'UPDATE_SETTINGS', 
                          payload: { autoSuggest: e.target.checked } 
                        })}
                        className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer"
                      />
                      <label
                        className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${
                          state.settings.autoSuggest ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                      ></label>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-700">Cache Responses</label>
                    <div className="relative inline-block w-10 align-middle select-none">
                      <input
                        type="checkbox"
                        checked={state.settings.cacheEnabled}
                        onChange={(e) => dispatch({ 
                          type: 'UPDATE_SETTINGS', 
                          payload: { cacheEnabled: e.target.checked } 
                        })}
                        className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer"
                      />
                      <label
                        className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${
                          state.settings.cacheEnabled ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                      ></label>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => dispatch({ type: 'CLEAR_HISTORY' })}
                    className="flex items-center text-xs text-red-600 hover:text-red-800"
                  >
                    <RefreshCw size={12} className="mr-1" />
                    Clear History
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[80%] px-3 py-2 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap">
                    {msg.content}
                  </div>
                  <div 
                    className={`text-right text-xs mt-1 ${
                      msg.role === 'user' ? 'text-blue-200' : 'text-gray-500'
                    }`}
                  >
                    {formatTimestamp(msg.timestamp)}
                  </div>
                </div>
              </div>
            ))}
            
            {/* Typing indicator */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-3 py-2 rounded-lg">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '100ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '200ms' }}></div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
          
          {/* Input Area */}
          <div className="p-3 border-t">
            <div className="flex items-center">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Scrivi un messaggio..."
                className="flex-1 p-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={isTyping}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isTyping}
                className={`p-2 rounded-r-md ${
                  !inputMessage.trim() || isTyping
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isTyping ? (
                  <Loader size={18} className="animate-spin" />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Versione minimizzata
        <div className="flex items-center p-2 space-x-2">
          <button
            onClick={() => toggleAssistantPanel()}
            className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700"
            title="Expand Assistant"
          >
            <Maximize2 size={16} />
          </button>
          <span className="text-sm font-medium">AI Assistant</span>
          <button
            onClick={() => hideAssistant()}
            className="p-1 text-gray-500 hover:text-gray-700 rounded-full"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </motion.div>
  );
};

export default AIAssistant;