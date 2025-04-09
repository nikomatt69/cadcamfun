// src/components/ai/ai-new/AIProviderSelector.tsx
import React, { useState, useEffect } from 'react';
import { Cpu, Settings, Check } from 'react-feather';
import { useAI } from './AIContextProvider';
import { AI_MODELS, AI_PROVIDERS, MODEL_CAPABILITIES } from '@/src/lib/ai/ai-new/aiConfigManager';
import { AIModelType } from '@/src/types/AITypes';

interface AIProviderSelectorProps {
  onChange?: (providerKey: string, modelKey: AIModelType) => void;
  className?: string;
  compact?: boolean;
}

/**
 * Componente per selezionare il provider AI e il modello da utilizzare
 */
const AIProviderSelector: React.FC<AIProviderSelectorProps> = ({
  onChange,
  className = '',
  compact = false
}) => {
  const { state, dispatch } = useAI();
  const [selectedProvider, setSelectedProvider] = useState<string>(() => {
    // Determina il provider iniziale dal modello corrente
    const currentModel = state.currentModel;
    const modelCaps = MODEL_CAPABILITIES[currentModel as AIModelType];
    return modelCaps?.provider || AI_PROVIDERS.CLAUDE;
  });

  // Quando il provider cambia, aggiorna la lista dei modelli disponibili
  const availableModels = React.useMemo(() => {
    return Object.entries(MODEL_CAPABILITIES)
      .filter(([_, capability]) => capability.provider === selectedProvider)
      .map(([model]) => model as AIModelType);
  }, [selectedProvider]);

  // Assicurati che il modello selezionato sia compatibile con il provider
  useEffect(() => {
    // Se il modello corrente non è compatibile con il provider selezionato, scegli il primo disponibile
    if (!availableModels.includes(state.currentModel)) {
      if (availableModels.length > 0) {
        dispatch({ type: 'SET_MODEL', payload: availableModels[0] });
        if (onChange) {
          onChange(selectedProvider, availableModels[0]);
        }
      }
    }
  }, [selectedProvider, availableModels, state.currentModel, dispatch, onChange]);

  // Cambia provider
  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    // Viene gestito l'aggiornamento del modello nell'effetto sopra
  };

  // Cambia modello
  const handleModelChange = (model: AIModelType) => {
    dispatch({ type: 'SET_MODEL', payload: model });
    if (onChange) {
      onChange(selectedProvider, model);
    }
  };

  // Rendering compatto
  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <select
          value={state.currentModel}
          onChange={(e) => handleModelChange(e.target.value as AIModelType)}
          className="text-xs p-1 border border-gray-300 dark:border-gray-600 rounded shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        >
          {availableModels.map((modelKey) => (
            <option key={modelKey} value={modelKey}>
              {modelKey.split('-')[0]} {modelKey.includes('gpt') ? modelKey.split('-')[1] : ''}
            </option>
          ))}
        </select>
        
        <div className="flex border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
          <button
            onClick={() => handleProviderChange(AI_PROVIDERS.CLAUDE)}
            className={`px-2 py-1 text-xs ${
              selectedProvider === AI_PROVIDERS.CLAUDE 
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200' 
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Claude
          </button>
          <button
            onClick={() => handleProviderChange(AI_PROVIDERS.OPENAI)}
            className={`px-2 py-1 text-xs ${
              selectedProvider === AI_PROVIDERS.OPENAI 
                ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            OpenAI
          </button>
        </div>
      </div>
    );
  }

  // Rendering normale
  return (
    <div className={`p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center mb-3">
        <Cpu className="mr-2 text-blue-500" size={16} />
        Provider AI
      </h3>
      
      <div className="mb-4">
        <div className="flex space-x-2 mb-3">
          <button
            onClick={() => handleProviderChange(AI_PROVIDERS.CLAUDE)}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedProvider === AI_PROVIDERS.CLAUDE 
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-700' 
                : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span>Claude by Anthropic</span>
              {selectedProvider === AI_PROVIDERS.CLAUDE && <Check size={16} className="text-blue-500" />}
            </div>
          </button>
          
          <button
            onClick={() => handleProviderChange(AI_PROVIDERS.OPENAI)}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedProvider === AI_PROVIDERS.OPENAI 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-700' 
                : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span>OpenAI GPT</span>
              {selectedProvider === AI_PROVIDERS.OPENAI && <Check size={16} className="text-green-500" />}
            </div>
          </button>
        </div>
        
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Modello
          </label>
          <select
            value={state.currentModel}
            onChange={(e) => handleModelChange(e.target.value as AIModelType)}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {availableModels.map((modelKey) => {
              const capability = MODEL_CAPABILITIES[modelKey];
              return (
                <option key={modelKey} value={modelKey}>
                  {modelKey} - {capability.costTier} ({capability.bestFor.join(', ')})
                </option>
              );
            })}
          </select>
        </div>
        
        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          <p>
            <span className="font-medium">Capacità:</span> {MODEL_CAPABILITIES[state.currentModel as AIModelType].supportedFeatures.join(', ')}
          </p>
          <p>
            <span className="font-medium">Tokens:</span> {MODEL_CAPABILITIES[state.currentModel as AIModelType].maxTokens.toLocaleString()}
          </p>
          <p>
            <span className="font-medium">Costo:</span> {MODEL_CAPABILITIES[state.currentModel as AIModelType].costTier}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AIProviderSelector;