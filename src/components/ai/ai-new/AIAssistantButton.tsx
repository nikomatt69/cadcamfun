// src/components/ai/AIAssistantButton.tsx
import React from 'react';
import { MessageCircle, X } from 'react-feather';
import { useAI } from './AIContextProvider';
import { AIMode } from '@/src/types/AITypes';

interface AIAssistantButtonProps {
  mode?: AIMode;
  className?: string;
  compact?: boolean;
  position?: 'fixed' | 'relative';
  fixed?: boolean;
}

/**
 * Pulsante per mostrare/nascondere l'assistente AI
 * Può essere configurato per diverse modalità e posizioni
 */
const AIAssistantButton: React.FC<AIAssistantButtonProps> = ({
  mode,
  className = '',
  compact = false,
  position = 'relative',
  fixed = false
}) => {
  const { state, showAssistant, hideAssistant, dispatch } = useAI();
  const { isVisible } = state.assistant;
  
  const handleClick = () => {
    if (isVisible) {
      hideAssistant();
    } else {
      // Imposta la modalità se specificata
      if (mode) {
        dispatch({ type: 'SET_MODE', payload: mode });
      }
      showAssistant();
    }
  };
  
  // Posizione fissa in basso a destra se fixed=true
  const fixedStyle = fixed ? 'fixed bottom-1 right-1 z-10' : '';
  
  // Dimensioni del pulsante
  const buttonSize = compact ? 'p-2' : 'p-3';
  const iconSize = compact ? 16 : 20;
  
  return (
    <button
      onClick={handleClick}
      className={`
        ${buttonSize} 
        ${isVisible ? 'bg-gray-200 text-gray-700' : 'bg-blue-600 text-white'} 
        rounded-full 
        hover:shadow-lg 
        transition-all 
        ${fixedStyle}
        ${className}
      `}
      aria-label={isVisible ? "Nascondi assistente AI" : "Mostra assistente AI"}
    >
      {isVisible ? (
        <X size={iconSize} />
      ) : (
        <MessageCircle size={iconSize} />
      )}
    </button>
  );
};

export default AIAssistantButton;