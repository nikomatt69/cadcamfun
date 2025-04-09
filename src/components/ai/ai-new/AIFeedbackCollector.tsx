// src/components/ai/AIFeedbackCollector.tsx
import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, MessageCircle, X } from 'react-feather';
import { aiAnalytics } from 'src/lib/ai/ai-new/aiAnalytics'; 

interface AIFeedbackCollectorProps {
  requestId: string;
  onFeedbackSubmitted?: (rating: number, comment?: string) => void;
  compact?: boolean;
  className?: string;
}

/**
 * Componente per raccogliere feedback sulle risposte AI
 * Permette agli utenti di valutare la qualità delle risposte e fornire commenti
 */
const AIFeedbackCollector: React.FC<AIFeedbackCollectorProps> = ({
  requestId,
  onFeedbackSubmitted,
  compact = false,
  className = ''
}) => {
  const [rating, setRating] = useState<number | null>(null);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  
  // Gestisce il click sul feedback (positivo o negativo)
  const handleFeedback = (value: number) => {
    setRating(value);
    
    // Traccia il feedback di base senza commenti
    aiAnalytics.trackFeedback(requestId, value);
    
    // Se il feedback è negativo, mostra il form per i commenti
    if (value < 4) {
      setShowCommentForm(true);
    } else {
      // Altrimenti considera il feedback come già inviato
      setSubmitted(true);
      if (onFeedbackSubmitted) onFeedbackSubmitted(value);
    }
  };
  
  // Gestisce l'invio del commento
  const submitComment = () => {
    if (rating !== null) {
      // Traccia il feedback completo con il commento
      aiAnalytics.trackFeedback(requestId, rating, comment);
      
      // Notifica il componente padre
      if (onFeedbackSubmitted) onFeedbackSubmitted(rating, comment);
      
      // Aggiorna lo stato
      setSubmitted(true);
      setShowCommentForm(false);
    }
  };
  
  // Chiude il form dei commenti senza inviare
  const cancelComment = () => {
    setShowCommentForm(false);
    setSubmitted(true);
  };
  
  // Visualizza un messaggio di ringraziamento se il feedback è stato inviato
  if (submitted) {
    return compact ? (
      <div className={`text-xs text-green-600 dark:text-green-400 ${className}`}>
        Grazie per il tuo feedback!
      </div>
    ) : (
      <div className={`p-2 text-sm text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30 rounded-md ${className}`}>
        Grazie per il tuo feedback!
      </div>
    );
  }
  
  return (
    <div className={`${compact ? "text-xs" : "text-sm"} ${className}`}>
      {!showCommentForm ? (
        <div className="flex items-center space-x-2">
          <span className="text-gray-500 dark:text-gray-400">È stato utile?</span>
          <button
            onClick={() => handleFeedback(5)}
            className="p-1 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-full"
            aria-label="Utile"
            title="Sì, è stato utile"
          >
            <ThumbsUp size={compact ? 14 : 18} className="text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400" />
          </button>
          <button
            onClick={() => handleFeedback(1)}
            className="p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full"
            aria-label="Non utile"
            title="No, non è stato utile"
          >
            <ThumbsDown size={compact ? 14 : 18} className="text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400" />
          </button>
        </div>
      ) : (
        <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium text-blue-700 dark:text-blue-300">Come potremmo migliorare?</span>
            <button
              onClick={cancelComment}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              aria-label="Chiudi"
            >
              <X size={16} />
            </button>
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Il tuo feedback ci aiuta a migliorare..."
            className="w-full p-2 border border-blue-200 dark:border-blue-700 rounded-md text-sm mt-1 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
            rows={3}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={submitComment}
              className="flex items-center px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              <MessageCircle size={14} className="mr-1" />
              Invia Feedback
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIFeedbackCollector;