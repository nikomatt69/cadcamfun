// src/components/ai/ProactiveSuggestions.tsx
import React, { useState } from "react";
import { Lightbulb, X, ArrowRight, Sparkles } from "lucide-react";

interface ProactiveSuggestionsProps {
  suggestions: string[];
  onSuggestionClick?: (suggestion: string) => void;
  onDismiss?: () => void;
  className?: string;
  maxVisible?: number;
}

export const ProactiveSuggestions: React.FC<ProactiveSuggestionsProps> = ({
  suggestions,
  onSuggestionClick,
  onDismiss,
  className = "",
  maxVisible = 3
}) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (isDismissed || !suggestions || suggestions.length === 0) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    if (onDismiss) {
      onDismiss();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (onSuggestionClick) {
      onSuggestionClick(suggestion);
    }
  };

  const visibleSuggestions = suggestions.slice(0, maxVisible);

  return (
    <div className={`w-full ${className}`}>
      <div className="p-3 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-900/20 dark:via-yellow-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-lg shadow-sm">
        {/* Compact Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Proactive Suggestions</h4>
          </div>

          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-full transition-colors duration-200"
            aria-label="Dismiss suggestions"
          >
            <X className="w-3 h-3 text-gray-400 dark:text-gray-500" />
          </button>
        </div>

        {/* Compact Suggestions List */}
        <div className="space-y-1.5">
          {visibleSuggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="w-full text-left p-2 bg-white/60 dark:bg-gray-800/60 border border-amber-100 dark:border-amber-800/50 rounded-md hover:bg-white dark:hover:bg-gray-800 hover:border-amber-200 dark:hover:border-amber-700 hover:shadow-sm transition-all duration-200 group"
            >
              <div className="flex items-center gap-2">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 flex-shrink-0" />
                <p className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 flex-1 leading-relaxed">
                  {suggestion}
                </p>
                <ArrowRight
                  className={`w-3 h-3 text-amber-500 dark:text-amber-400 transition-transform duration-200 ${
                    hoveredIndex === index ? "translate-x-0.5" : ""
                  }`}
                />
              </div>
            </button>
          ))}
        </div>

        {/* Compact Footer */}
        <div className="mt-2 pt-2 border-t border-amber-200/50 dark:border-amber-800/50">
          {suggestions.length > maxVisible && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center mb-1">
              +{suggestions.length - maxVisible} more suggestions
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">💡 Context-aware suggestions</p>
        </div>
      </div>
    </div>
  );
};

export default ProactiveSuggestions;
