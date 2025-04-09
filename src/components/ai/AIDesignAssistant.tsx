import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle, Cpu, Loader, RefreshCw, Zap } from 'react-feather';
import { useElementsStore } from '../../store/elementsStore';
import { AIDesignSuggestion } from '../../types/ai';
import { aiDesignAnalyzer } from '@/src/lib/aiDesignAnalizer';

const AIDesignAssistant: React.FC = () => {
  const [suggestions, setSuggestions] = useState<AIDesignSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { elements, addAISuggestion } = useElementsStore();

  const performAIAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const aiSuggestions = await aiDesignAnalyzer.analyzeDesign(elements);
      setSuggestions(aiSuggestions);
      
      // Add suggestions to elements
      aiSuggestions.forEach(suggestion => {
        elements.forEach(element => {
          addAISuggestion(element.id, suggestion);
        });
      });
    } catch (error) {
      console.error('AI Analysis Error', error);
      setError('Failed to analyze design. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyAISuggestion = (suggestion: AIDesignSuggestion) => {
    // Logic to apply suggestions
    console.log('Applying suggestion:', suggestion);
  };

  const getSuggestionTypeColor = (type: string) => {
    switch (type) {
      case 'optimization':
        return 'text-blue-500';
      case 'improvement':
        return 'text-green-500';
      case 'warning':
        return 'text-yellow-500';
      case 'critical':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 space-y-6">
      <div className="flex items-center justify-between flex-col">
        <div className="flex items-center space-x-3">
          <Cpu className="text-blue-500" size={24} />
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">AI Design Assistant</h1>
        </div>
        
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={performAIAnalysis}
          disabled={isAnalyzing || elements.length === 0}
          className={`
            flex items-center space-x-2 px-1 py-1 rounded-lg font-medium 
            ${isAnalyzing 
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700'
              : 'bg-blue-500 text-white hover:bg-blue-600 dark:hover:bg-blue-400'
            }
            transition-colors duration-200
            ${elements.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {isAnalyzing ? (
            <>
              <Loader className="animate-spin" size={18} />
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <Zap size={18} />
              <span>Analyze</span>
            </>
          )}
        </motion.button>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center space-x-2 p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-200 rounded-lg"
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </motion.div>
      )}

      {elements.length === 0 && (
        <div className="flex items-center justify-center p-8 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <p>Add elements to your design to get AI suggestions</p>
        </div>
      )}

      <AnimatePresence>
        {suggestions.map((suggestion, index) => (
          <motion.div
            key={suggestion.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: index * 0.1 }}
            className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className={`font-semibold ${getSuggestionTypeColor(suggestion.type)}`}>
                {suggestion.type.charAt(0).toUpperCase() + suggestion.type.slice(1)}
              </h3>
              <div className="flex items-center space-x-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Confidence:</span>
                <span className={`font-medium ${
                  suggestion.confidence > 0.8 ? 'text-green-500' : 
                  suggestion.confidence > 0.6 ? 'text-yellow-500' : 'text-red-500'
                }`}>
                  {Math.round(suggestion.confidence * 100)}%
                </span>
              </div>
            </div>

            <p className="text-gray-700 dark:text-gray-300">{suggestion.description}</p>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center space-x-2">
                <Zap className="text-yellow-500" size={16} />
                <span className="text-gray-600 dark:text-gray-400">Performance Gain:</span>
                <span className="font-medium text-green-500">
                  +{suggestion.potentialImpact.performanceGain}%
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <RefreshCw className="text-blue-500" size={16} />
                <span className="text-gray-600 dark:text-gray-400">Cost Reduction:</span>
                <span className="font-medium text-green-500">
                  -{suggestion.potentialImpact.costReduction}%
                </span>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => applyAISuggestion(suggestion)}
              className="w-full mt-2 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors duration-200"
            >
              <CheckCircle size={18} />
              <span>Apply Suggestion</span>
            </motion.button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default AIDesignAssistant;