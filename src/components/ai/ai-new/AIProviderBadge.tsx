// src/components/ai/ai-new/AIProviderBadge.tsx
import React from 'react';
import { Cpu, Zap } from 'react-feather';
import { useAI } from './AIContextProvider';
import { AI_MODELS, MODEL_CAPABILITIES } from '@/src/lib/ai/ai-new/aiConfigManager';
import { AIModelType } from '@/src/types/AITypes';

interface AIProviderBadgeProps {
  className?: string;
  showName?: boolean;
  onClick?: () => void;
}

/**
 * Badge che mostra il provider e il modello AI attualmente in uso
 */
const AIProviderBadge: React.FC<AIProviderBadgeProps> = ({
  className = '',
  showName = true,
  onClick
}) => {
  const { state } = useAI();
  const model = state.currentModel;
  
  // Determina il provider
  const provider = Object.keys(MODEL_CAPABILITIES).includes(model) 
    ? MODEL_CAPABILITIES[model as keyof typeof MODEL_CAPABILITIES]?.provider 
    : 'claude';
  
  // Ottieni informazioni sul modello
  const modelInfo = Object.keys(MODEL_CAPABILITIES).includes(model)
    ? MODEL_CAPABILITIES[model as keyof typeof MODEL_CAPABILITIES]
    : null;
  
  // Formatta il nome del modello per la visualizzazione
  const getFormattedModelName = (model: AIModelType): string => {
    // Per Claude, estrai il nome del modello (Sonnet, Opus, Haiku)
    if (model.includes('claude')) {
      const parts = model.split('-');
      return parts.length >= 3 ? parts[2] : 'Claude';
    }
    
    // Per GPT, mostra il numero di versione
    if (model.includes('gpt')) {
      return model.replace('-turbo', '');
    }
    
    return model;
  };
  
  // Colori specifici per provider
  const getProviderColors = () => {
    if (provider === 'openai') {
      return {
        bg: 'bg-green-100 dark:bg-green-900/30',
        text: 'text-green-800 dark:text-green-300',
        border: 'border-green-200 dark:border-green-800'
      };
    } else {
      return {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-800 dark:text-blue-300',
        border: 'border-blue-200 dark:border-blue-800'
      };
    }
  };
  
  const colors = getProviderColors();
  
  return (
    <div 
      className={`inline-flex items-center px-2 py-1 rounded-md ${colors.bg} ${colors.text} ${colors.border} border text-xs font-medium ${className} ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
      onClick={onClick}
    >
      {provider === 'openai' ? (
        <Zap size={12} className="mr-1" />
      ) : (
        <Cpu size={12} className="mr-1" />
      )}
      
      {showName && (
        <span>
          {provider === 'openai' ? 'OpenAI' : 'Claude'}{' '}
          <span className="opacity-75">{getFormattedModelName(model)}</span>
        </span>
      )}
      
      {!showName && (
        <span>AI</span>
      )}
    </div>
  );
};

export default AIProviderBadge;