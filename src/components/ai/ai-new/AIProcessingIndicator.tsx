// src/components/ai/AIProcessingIndicator.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { Cpu, Loader, AlertTriangle, CheckCircle } from 'react-feather';

export type AIProcessingStatus = 'idle' | 'processing' | 'success' | 'error';

interface AIProcessingIndicatorProps {
  status: AIProcessingStatus;
  message?: string;
  progress?: number; // 0-100
  showDetails?: boolean;
  className?: string;
  onRetry?: () => void;
}

/**
 * Indicatore di stato per le operazioni AI
 * Visualizza informazioni di stato e progresso per le richieste AI
 */
const AIProcessingIndicator: React.FC<AIProcessingIndicatorProps> = ({
  status,
  message,
  progress = 0,
  showDetails = false,
  className = '',
  onRetry
}) => {
  // Configurazione per i diversi stati
  const statusConfig = {
    idle: {
      icon: <Cpu size={18} className="text-blue-500" />,
      color: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
      textColor: 'text-blue-700 dark:text-blue-300'
    },
    processing: {
      icon: <Loader size={18} className="text-blue-500 animate-spin" />,
      color: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
      textColor: 'text-blue-700 dark:text-blue-300'
    },
    success: {
      icon: <CheckCircle size={18} className="text-green-500" />,
      color: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
      textColor: 'text-green-700 dark:text-green-300'
    },
    error: {
      icon: <AlertTriangle size={18} className="text-red-500" />,
      color: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
      textColor: 'text-red-700 dark:text-red-300'
    }
  };
  
  const { icon, color, textColor } = statusConfig[status];
  
  // Messaggi predefiniti per ogni stato
  const getDefaultMessage = (status: AIProcessingStatus): string => {
    switch (status) {
      case 'idle':
        return 'Assistente AI pronto';
      case 'processing':
        return 'Elaborazione in corso...';
      case 'success':
        return 'Elaborazione completata';
      case 'error':
        return 'Si è verificato un errore durante l\'elaborazione';
    }
  };
  
  const displayMessage = message || getDefaultMessage(status);
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`p-3 flex items-start border rounded-md ${color} ${className}`}
    >
      <div className="mr-3 flex-shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1">
        <p className={`text-sm font-medium ${textColor}`}>
          {displayMessage}
        </p>
        
        {/* Barra di progresso per lo stato "processing" */}
        {status === 'processing' && (
          <div className="mt-2 w-full bg-blue-100 dark:bg-blue-800 rounded-full h-1.5">
            <motion.div 
              className="bg-blue-500 h-1.5 rounded-full" 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        )}
        
        {/* Pulsante "Riprova" per lo stato di errore */}
        {status === 'error' && onRetry && (
          <button 
            onClick={onRetry}
            className="mt-2 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium"
          >
            Riprova
          </button>
        )}
        
        {/* Dettagli opzionali per lo stato di errore */}
        {showDetails && status === 'error' && (
          <button 
            className="mt-1 text-xs underline text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
            onClick={() => console.log('Show error details')}
          >
            Mostra dettagli
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default AIProcessingIndicator;