// src/components/ai/AISettingsPanel.tsx
import React, { useState, useEffect } from 'react';
import { Sliders, Database, RefreshCw, Cpu, Zap, DollarSign, Save, AlertTriangle, Server, Clock, Shield } from 'react-feather';

import { AIModelType } from '@/src/types/AITypes';
import { useAI } from './AIContextProvider';
import { aiCache } from '@/src/lib/ai/ai-new/aiCache';
import { AI_MODELS, MODEL_COSTS } from '@/src/lib/ai/ai-new/aiConfigManager';
import { MCPClient } from '@/src/lib/ai/mcpClient';


/**
 * Pannello di impostazioni per configurare il comportamento dell'AI
 */
const AISettingsPanel: React.FC = () => {
  const { state, dispatch } = useAI();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMCPSettings, setShowMCPSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [mcpTestStatus, setMcpTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [mcpTestResult, setMcpTestResult] = useState<string | null>(null);
  
  // Gestisce la pulizia della cache
  const handleClearCache = () => {
    aiCache.clear();
    // Mostra un messaggio di successo
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };
  
  // Salva le impostazioni
  const handleSaveSettings = () => {
    setIsSaving(true);
    
    // Simula un'operazione asincrona
    setTimeout(() => {
      try {
        // Salva nei localStorage
        localStorage.setItem('aiSettings', JSON.stringify({
          model: state.currentModel,
          temperature: state.temperature,
          settings: state.settings
        }));
        
        setSaveSuccess(true);
      } catch (error) {
        console.error('Failed to save AI settings:', error);
      } finally {
        setIsSaving(false);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    }, 500);
  };
  
  // Funzione per testare la connessione all'endpoint MCP
  const testMCPConnection = async () => {
    setMcpTestStatus('testing');
    setMcpTestResult('');
    
    try {
      const client = new MCPClient({
        mcpEndpoint: state.settings.mcpEndpoint || '/api/mcp-protocol',
        mcpApiKey: state.settings.mcpApiKey,
        mcpStrategy: state.settings.mcpStrategy || 'balanced',
        mcpCacheLifetime: state.settings.mcpCacheLifetime || 86400000
      });
      
      const result = await client.testConnection();
      
      setMcpTestStatus(result.success ? 'success' : 'error');
      setMcpTestResult(result.message);
    } catch (error) {
      setMcpTestStatus('error');
      setMcpTestResult(`Errore durante il test della connessione: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Carica le impostazioni iniziali
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('aiSettings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        
        // Imposta il modello
        if (parsed.model) {
          dispatch({ type: 'SET_MODEL', payload: parsed.model });
        }
        
        // Imposta la temperatura
        if (parsed.temperature !== undefined) {
          dispatch({ type: 'SET_TEMPERATURE', payload: parsed.temperature });
        }
        
        // Imposta altre impostazioni
        if (parsed.settings) {
          dispatch({ type: 'UPDATE_SETTINGS', payload: parsed.settings });
        }
      }
    } catch (error) {
      console.error('Failed to load AI settings:', error);
    }
  }, [dispatch]);
  
  // Calcola il costo stimato per 1000 token per il modello selezionato
  const calculateCost = (model: AIModelType) => {
    const costs = MODEL_COSTS[model] || MODEL_COSTS[AI_MODELS.CLAUDE_SONNET];
    return ((costs.input + costs.output) / 2).toFixed(3);
  };
  
  // Calcola il risparmio stimato con MCP
  const calculateMCPSavings = () => {
    if (!state.settings.mcpEnabled) return 0;
    
    // Stima basata sulla strategia MCP
    const strategyEfficiency: Record<'aggressive' | 'balanced' | 'conservative', number> = {
      'aggressive': 0.5, // Risparmio del 50%
      'balanced': 0.35,  // Risparmio del 35%
      'conservative': 0.2 // Risparmio del 20%
    };
    
    const mcpStrategy = (state.settings.mcpStrategy || 'balanced') as 'aggressive' | 'balanced' | 'conservative';
    const efficiency = strategyEfficiency[mcpStrategy];
    const modelCost = parseFloat(calculateCost(state.currentModel));
    
    return (modelCost * efficiency).toFixed(3);
  };
  
  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold flex items-center">
          <Sliders className="mr-2 text-blue-500" size={20} />
          AI Settings
        </h2>
        
        <div className="flex space-x-2">
          <button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? (
              <RefreshCw size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Save size={14} className="mr-1.5" />
            )}
            Save Settings
          </button>
        </div>
      </div>
      
      {saveSuccess && (
        <div className="p-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm rounded flex items-center">
          <Cpu size={14} className="mr-2" />
          Settings saved successfully!
        </div>
      )}
      
      <div className="space-y-4">
        <div>
          <label htmlFor="ai-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            AI Model
          </label>
          <select
            id="ai-model"
            value={state.currentModel}
            onChange={(e) => dispatch({ type: 'SET_MODEL', payload: e.target.value as AIModelType })}
            className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
          >
            <option value={AI_MODELS.CLAUDE_HAIKU}>Claude Haiku (Fast, ${calculateCost(AI_MODELS.CLAUDE_HAIKU)}$/1K token)</option> 
            <option value={AI_MODELS.CLAUDE_SONNET}>Claude Sonnet (Balanced, ${calculateCost(AI_MODELS.CLAUDE_SONNET)}$/1K token)</option>
            <option value={AI_MODELS.CLAUDE_OPUS}>Claude Opus (Powerful, ${calculateCost(AI_MODELS.CLAUDE_OPUS)}$/1K token)</option>
            <option value={AI_MODELS.CLAUDE_SONNET_7}>Claude 3.7 Sonnet (Advanced, ${calculateCost(AI_MODELS.CLAUDE_SONNET_7)}$/1K token)</option>
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Select the AI model most suitable for your needs. More powerful models offer better results but at higher costs.
          </p>
        </div>
        
        <div>
          <label htmlFor="ai-temperature" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Temperature: {state.temperature.toFixed(1)}
          </label>
          <input
            id="ai-temperature"
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={state.temperature}
            onChange={(e) => dispatch({ 
              type: 'SET_TEMPERATURE', 
              payload: parseFloat(e.target.value) 
            })}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span>Preciso (0.0)</span>
            <span>Equilibrato (0.5)</span>
            <span>Creativo (1.0)</span>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Control the randomness of responses. Lower values produce more consistent results, higher values more creative.
          </p>
        </div>
        
        {/* MCP (Model-Completions-Protocol) Section */}
        <div className="pt-4 pb-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                <Server size={16} className="mr-1.5 text-blue-500" />
                Model-Completions-Protocol (MCP)
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Optimize AI requests with advanced semantic caching
              </p>
            </div>
            <div className="relative inline-block w-12 align-middle select-none">
              <input
                type="checkbox"
                checked={state.settings.mcpEnabled}
                onChange={(e) => dispatch({ 
                  type: 'UPDATE_SETTINGS', 
                  payload: { mcpEnabled: e.target.checked } 
                })}
                className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-gray-300 border-4 border-gray-300 dark:border-gray-600 appearance-none cursor-pointer"
              />
              <label
                className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                  state.settings.mcpEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-800'
                }`}
              ></label>
            </div>
          </div>
          
          {state.settings.mcpEnabled && (
            <div className="mt-3">
              <button
                onClick={() => setShowMCPSettings(!showMCPSettings)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center"
              >
                {showMCPSettings ? 'Hide' : 'Show'} MCP settings
                <svg className={`ml-1 w-4 h-4 transform transition-transform ${showMCPSettings ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {showMCPSettings && (
                <div className="mt-3 space-y-3 pl-2 border-l-2 border-blue-200 dark:border-blue-800">
                  <div>
                    <label htmlFor="mcp-endpoint" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      MCP Endpoint
                    </label>
                    <input
                      type="text"
                      id="mcp-endpoint"
                      placeholder="/api/mcp-protocol"
                      value={state.settings.mcpEndpoint || '/api/mcp-protocol'}
                      onChange={(e) => dispatch({
                        type: 'UPDATE_SETTINGS',
                        payload: { mcpEndpoint: e.target.value }
                      })}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Default: uses the application&apos;s local endpoint.
                    </p>
                  </div>
                  
                  <div>
                    <label htmlFor="mcp-api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      API Key MCP
                    </label>
                    <input
                      type="password"
                      id="mcp-api-key"
                      placeholder="Enter your MCP API key"
                      value={state.settings.mcpApiKey || ''}
                      onChange={(e) => dispatch({
                        type: 'UPDATE_SETTINGS',
                        payload: { mcpApiKey: e.target.value }
                      })}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="mcp-strategy" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      MCP Strategy
                    </label>
                    <select
                      id="mcp-strategy"
                      value={state.settings.mcpStrategy || 'balanced'}
                      onChange={(e) => dispatch({
                        type: 'UPDATE_SETTINGS',
                        payload: { mcpStrategy: e.target.value as 'aggressive' | 'balanced' | 'conservative' }
                      })}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
                    >
                      <option value="aggressive">Aggressiva (massimo risparmio)</option>
                      <option value="balanced">Bilanciata (predefinita)</option>
                      <option value="conservative">Conservativa (massima precisione)</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      The strategy determines when to reuse similar responses from previous requests.
                    </p>
                  </div>
                  
                  <div>
                    <label htmlFor="mcp-cache-lifetime" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      MCP Cache Lifetime: {(state.settings.mcpCacheLifetime || 86400000) / (1000 * 60 * 60)} hours
                    </label>
                    <input
                      id="mcp-cache-lifetime"
                      type="range"
                      min="3600000"
                      max="604800000"
                      step="3600000"
                      value={state.settings.mcpCacheLifetime || 86400000}
                      onChange={(e) => dispatch({
                        type: 'UPDATE_SETTINGS',
                        payload: { mcpCacheLifetime: parseInt(e.target.value) }
                      })}
                      className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span>1 hour</span>
                      <span>1 day</span>
                      <span>1 week</span>
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    <button
                      onClick={testMCPConnection}
                      disabled={mcpTestStatus === 'testing'}
                      className="flex items-center text-sm px-3 py-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                    >
                      {mcpTestStatus === 'testing' ? (
                        <RefreshCw size={14} className="mr-1.5 animate-spin" />
                      ) : (
                        <Server size={14} className="mr-1.5" />
                      )}
                      Test MCP connection
                    </button>
                    
                    {mcpTestStatus !== 'idle' && mcpTestResult && (
                      <div className={`mt-2 p-2 text-xs rounded ${
                        mcpTestStatus === 'success' 
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' 
                          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                      }`}>
                        {mcpTestResult}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Automatic suggestions</label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Show suggestions based on context</p>
              </div>
              <div className="relative inline-block w-12 align-middle select-none">
                <input
                  type="checkbox"
                  checked={state.settings.autoSuggest}
                  onChange={(e) => dispatch({ 
                    type: 'UPDATE_SETTINGS', 
                    payload: { autoSuggest: e.target.checked } 
                  })}
                  className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-gray-300 border-4 border-gray-300 dark:border-gray-600 appearance-none cursor-pointer"
                />
                <label
                  className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                    state.settings.autoSuggest ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-800'
                  }`}
                ></label>
              </div>
            </div>
            
            <div className="flex justify-between items-center">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Cache</label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cache AI responses for reuse</p>
              </div>
              <div className="relative inline-block w-12 align-middle select-none">
                <input
                  type="checkbox"
                  checked={state.settings.cacheEnabled}
                  onChange={(e) => dispatch({ 
                    type: 'UPDATE_SETTINGS', 
                    payload: { cacheEnabled: e.target.checked } 
                  })}
                  className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-gray-300 border-4 border-gray-300 dark:border-gray-600 appearance-none cursor-pointer"
                />
                <label
                  className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                    state.settings.cacheEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-800'
                  }`}
                ></label>
              </div>
            </div>
            
            <div className="flex justify-between items-center">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Analytics</label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Track usage and performance</p>
              </div>
              <div className="relative inline-block w-12 align-middle select-none">
                <input
                  type="checkbox"
                  checked={state.settings.analyticsEnabled}
                  onChange={(e) => dispatch({ 
                    type: 'UPDATE_SETTINGS', 
                    payload: { analyticsEnabled: e.target.checked } 
                  })}
                  className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-gray-300 border-4 border-gray-300 dark:border-gray-600 appearance-none cursor-pointer"
                />
                <label
                  className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                    state.settings.analyticsEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-800'
                  }`}
                ></label>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Automatic Model Selection</label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Use the best model for each task</p>
              </div>
              <div className="relative inline-block w-12 align-middle select-none">
                <input
                  type="checkbox"
                  checked={state.settings.autoModelSelection}
                  onChange={(e) => dispatch({ 
                    type: 'UPDATE_SETTINGS', 
                    payload: { autoModelSelection: e.target.checked } 
                  })}
                  className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-gray-300 border-4 border-gray-300 dark:border-gray-600 appearance-none cursor-pointer"
                />
                <label
                  className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                    state.settings.autoModelSelection ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-800'
                  }`}
                ></label>
              </div>
            </div>
            
            <div className="flex justify-between items-center">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Cost Optimization</label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Balance performance and costs</p>
              </div>
              <div className="relative inline-block w-12 align-middle select-none">
                <input
                  type="checkbox"
                  checked={state.settings.costOptimization}
                  onChange={(e) => dispatch({ 
                    type: 'UPDATE_SETTINGS', 
                    payload: { costOptimization: e.target.checked } 
                  })}
                  className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-gray-300 border-4 border-gray-300 dark:border-gray-600 appearance-none cursor-pointer"
                />
                <label
                  className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                    state.settings.costOptimization ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-800'
                  }`}
                ></label>
              </div>
            </div>
          </div>
        </div>
        
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center"
        >
          {showAdvanced ? 'Hide' : 'Show'} advanced settings
          <svg className={`ml-1 w-4 h-4 transform transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {showAdvanced && (
          <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
            <div>
              <label htmlFor="ai-max-tokens" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Tokens: {state.settings.maxTokens}
              </label>
              <input
                id="ai-max-tokens"
                type="range"
                min="1000"
                max="8000"
                step="500"
                value={state.settings.maxTokens}
                onChange={(e) => dispatch({ 
                  type: 'UPDATE_SETTINGS', 
                  payload: { maxTokens: parseInt(e.target.value) } 
                })}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>1000</span>
                <span>4000</span>
                <span>8000</span>
              </div>
            </div>
            
            <div>
              <label htmlFor="ai-suggestion-threshold" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Suggestion Threshold: {state.settings.suggestThreshold}
              </label>
              <input
                id="ai-suggestion-threshold"
                type="range"
                min="0.1"
                max="0.9"
                step="0.1"
                value={state.settings.suggestThreshold}
                onChange={(e) => dispatch({ 
                  type: 'UPDATE_SETTINGS', 
                  payload: { suggestThreshold: parseFloat(e.target.value) } 
                })}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>More suggestions (0.1)</span>
                <span>Balanced (0.5)</span>
                <span>Only relevant (0.9)</span>
              </div>
            </div>
            
            <div className="flex justify-between">
              <button
                onClick={handleClearCache}
                className="flex items-center text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
              >
                <Database size={14} className="mr-1" />
                Clear AI cache
              </button>
              
              <button
                onClick={() => dispatch({ type: 'CLEAR_HISTORY' })}
                className="flex items-center text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
              >
                <RefreshCw size={14} className="mr-1" />
                Clear AI history
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Informazioni riassuntive sulle prestazioni */}
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 mt-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
          <Zap size={16} className="mr-1 text-yellow-500" />
          AI Stats
        </h3>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Average response time</p>
            <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{Math.round(state.performance.averageResponseTime)} ms</p>
          </div>
          
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Success rate</p>
            <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{Math.round(state.performance.successRate)}%</p>
          </div>
        </div>
        
        {state.settings.mcpEnabled && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
              <Server size={12} className="mr-1 text-blue-500" />
              MCP Statistics
            </h4>
            <div className="flex space-x-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Estimated savings</p>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">${calculateMCPSavings()}/1K token</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Strategy</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{state.settings.mcpStrategy || 'balanced'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cache</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {((state.settings.mcpCacheLifetime || 86400000) / (1000 * 60 * 60)).toFixed(0)}h
                </p>
              </div>
            </div>
          </div>
        )}
        
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
              <DollarSign size={12} className="mr-1" />
              Estimated cost per 1K token: ${calculateCost(state.currentModel)}
            </div>
            <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
              <Clock size={12} className="mr-1" />
                Last update: {new Date(state.performance.lastSync).toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-xs rounded-lg flex items-start">
        <AlertTriangle size={14} className="mr-2 flex-shrink-0 mt-0.5" />
        <p>
          Advanced settings can affect performance and costs. 
          The MCP protocol helps reduce costs and improve performance by optimizing requests through semantic caching.
        </p>
      </div>
      
      {state.settings.mcpEnabled && (
        <div className="p-3 mt-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 text-xs rounded-lg flex items-start">
          <Shield size={14} className="mr-2 flex-shrink-0 mt-0.5" />
          <p>
            The MCP (Model-Completions-Protocol) is active. AI requests will be optimized through semantic caching, 
            resulting in faster responses and reduced costs. The {state.settings.mcpStrategy || 'balanced'} strategy is 
            configured to {state.settings.mcpStrategy === 'aggressive' ? 'maximize savings' : 
            state.settings.mcpStrategy === 'conservative' ? 'maximize precision' : 'balance costs and precision'}.
          </p>
        </div>
      )}
    </div>
  );
};

export default AISettingsPanel;