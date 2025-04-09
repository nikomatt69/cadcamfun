// src/components/ai/AIHub.tsx
import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Layers, 
  PenTool, 
  Tool, 
  Code, 
  Settings, 
  X, 
  ChevronRight,
  BarChart2
} from 'react-feather';
import { motion, AnimatePresence } from 'framer-motion';
import { useAI } from './AIContextProvider';
import { aiAnalytics } from '@/src/lib/ai/ai-new/aiAnalytics';
import { MODEL_CAPABILITIES } from '@/src/lib/ai/ai-new/aiConfigManager';

import TextToCADPanel from './TextToCADPanel';


import AISettingsPanel from './AISettingsPanel';
import { AIModelType } from '@/src/types/AITypes';
import AIDesignAssistant from '../AIDesignAssistant';
import AIToolpathOptimizer from '../AIToolpathOptimizer';
import MCPInsightsPanel from './MCPSettingsPage';
import OpenAISetupPanel from './OpenAISetupPanel';
import AIProviderBadge from './AIProviderBadge';
import AIProviderSelector from './AIProviderSelector';


// Tipi di tool AI disponibili
type AITool = 'textToCad' | 'designAssistant' | 'toolpathOptimizer' | 'settings' | 'analytics' | 'mpc' | 'openai' | 'badge' | 'provider';

interface AIHubProps {
  initialTool?: AITool;
  className?: string;
  onClose?: () => void;
}

/**
 * Hub centrale per accedere a tutte le funzionalità AI
 * Fornisce una navigazione laterale e mostra gli strumenti selezionati
 */
const AIHub: React.FC<AIHubProps> = ({ 
  initialTool = 'textToCad',
  className = '',
  onClose
}) => {
  const { state, dispatch } = useAI();
  const [performance, setPerformance] = useState(aiAnalytics.getStats());
  const [activeTool, setActiveTool] = useState<AITool>(initialTool);
  const [isOpen, setIsOpen] = useState(true);
  
  // Aggiorna le statistiche di performance periodicamente
  useEffect(() => {
    const interval = setInterval(() => {
      setPerformance(aiAnalytics.getStats());
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  // Configurazione degli strumenti AI disponibili
  const tools = [
    { 
      id: 'textToCad' as AITool, 
      name: 'Text to CAD', 
      icon: <PenTool size={15} />,
      description: 'Convert text descriptions to 3D elements'
    },
    { 
      id: 'designAssistant' as AITool, 
      name: 'Design Assistant', 
      icon: <Cpu size={15} />,
      description: 'Get AI suggestions for your designs'
    },
    { 
      id: 'toolpathOptimizer' as AITool, 
      name: 'Toolpath Optimizer', 
      icon: <Tool size={15} />,
      description: 'Optimize machining parameters'
    },
    { 
      id: 'analytics' as AITool, 
      name: 'Analytics AI', 
      icon: <BarChart2 size={15} />,
      description: 'View AI usage statistics'
    },
    { 
      id: 'settings' as AITool, 
      name: 'AI Settings', 
      icon: <Settings size={15} />,
      description: 'Configure AI behavior'
    },
    { 
      id: 'mpc' as AITool, 
      name: 'MPC Settings', 
      icon: <Settings size={15} />,
      description: 'Configure MPC AI behavior'
    },
    { 
      id: 'openai' as AITool, 
      name: 'OpenAI Setup', 
      icon: <Settings size={15} />,
      description: 'Configure OpenAI AI behavior'
    },
    { 
      id: 'provider' as AITool, 
      name: 'AI Provider', 
      icon: <Settings size={15} />,
      description: 'Configure AI provider behavior'
    }
  ];

  // Indicatore di performance colorato
  const renderPerformanceIndicator = () => (
    <div className="absolute top-8 left-3 flex p-2 items-center space-x-2">
      <div className={`h-2 w-2 rounded-full ${
        performance.successRate > 98 ? 'bg-green-500' :
        performance.successRate > 95 ? 'bg-yellow-500' : 'bg-red-500'
      }`} />
      <span className={`text-xs text-gray-500 rounded-xl  dark:text-gray-400 `}>
        {Math.round(performance.successRate)}% Status
      </span>
    </div>
  );

  // Selettore del modello AI
  const renderModelSelector = () => (
    <div className="mb-4 flex flex-col px-4">
      <label className="text-xs text-gray-600 dark:text-gray-400 mb-1">AI Model</label>
      <select
        value={state.currentModel}
        onChange={(e) => dispatch({ 
          type: 'SET_MODEL', 
          payload: e.target.value as AIModelType 
        })}
        className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200"
      >
        {Object.entries(MODEL_CAPABILITIES).map(([model, capabilities]) => (
          <option key={model} value={model}>
            {model.split('-').slice(-2, -1)[0] || 'Claude'} ({capabilities.bestFor.join(', ')})
          </option>
        ))}
      </select>
    </div>
  );
  
  // Rendering del tool attivo
  const renderTool = () => {
    switch (activeTool) {
      case 'textToCad':
        return <TextToCADPanel />; 
      case 'designAssistant':
        return <AIDesignAssistant />;
      case 'toolpathOptimizer':
        return <AIToolpathOptimizer />;
        case 'mpc':
          return <MCPInsightsPanel />;
      case 'settings':
        return <AISettingsPanel />;
      case 'openai':
        return <OpenAISetupPanel />;
      case 'provider':
        return <AIProviderSelector />;
      case 'analytics':
        return (
          <div className="p-4 space-y-4">
            <h2 className="text-lg font-semibold flex items-center">
              <BarChart2 size={20} className="mr-2 text-blue-500" />
              AI Statistics
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Average Response Time</h3>
                <p className="text-2xl font-bold">{Math.round(performance.averageResponseTime)}ms</p>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Success Rate</h3>
                <p className="text-2xl font-bold">{Math.round(performance.successRate)}%</p>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Token Used</h3>
                <p className="text-2xl font-bold">{performance.tokenUsage.toLocaleString()}</p>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Requests</h3>
                <p className="text-2xl font-bold">{performance.totalRequests || 0}</p>
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Model Usage</h3>
              <div className="space-y-2">
                {Object.entries(MODEL_CAPABILITIES).map(([model, _]) => {
                  const usageCount = performance.modelUsage?.[model as AIModelType] || 0;
                  const percentage = performance.totalRequests ? (usageCount / performance.totalRequests) * 100 : 0;
                  
                  return (
                    <div key={model} className="flex items-center">
                      <span className="text-xs w-40 truncate">{model.split('-').slice(-2)[0]}</span>
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500" 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <span className="text-xs ml-2">{Math.round(percentage)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      case 'settings':
        return <AISettingsPanel />;
      default:
        return <div>Select an AI tool</div>;
    }
  };
  
  return (
    <div className={`relative bg-white dark:bg-gray-800 rounded-lg border-0 flex h-[800px] ${className || ''}`}>
      
      
      {/* Pulsante di collasso/espansione */}
      <button
        className="absolute -left-1 top-24 transform -translate-y-1/2 bg-blue-600 text-white rounded-full p-1 shadow-md z-10"
        onClick={() => setIsOpen(!isOpen)}
        title={isOpen ? "Hide Panel" : "Show Panel"}
      >
        <ChevronRight size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {/* Navigazione laterale */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 160, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-gray-50 dark:bg-gray-900 flex-shrink-0 overflow-hidden"
          >
            <div className="p-2 flex flex-col h-full">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <Cpu className="text-blue-600 mr-2" size={20} />
                  <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200">AI Tools</h2>
                 <span>{renderPerformanceIndicator()}</span>
                </div>
                {onClose && (
                  <button
                    onClick={onClose}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    title="Close"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
              
              {renderModelSelector()}
              <nav className="space-y-1 flex-1 overflow-y-auto">
                {tools.map((tool) => (
                  <button
                    key={tool.id}
                    className={`w-full flex items-center px-2 py-1 rounded-md transition-colors ${
                      activeTool === tool.id
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => setActiveTool(tool.id)}
                  >
                    <span className="mr-3">{tool.icon}</span>
                    <span>{tool.name}</span>
                  </button>
                ))}
              </nav>
              
              {/* Descrizione dello strumento */}
              <div className="mt-6 p-3 bg-white dark:bg-gray-800 rounded-md shadow-sm">
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                  {tools.find(t => t.id === activeTool)?.name}
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {tools.find(t => t.id === activeTool)?.description}
                </p>
              </div>
            </div>
            
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Area contenuto */}
      <div className="flex-grow p-4 bg-gray-50 rounded-xl  overflow-auto">
        {renderTool()}
      </div>
    </div>
  );
};

export default AIHub;