// src/components/ai/GCodeAIAgent/components/GCodeAutocomplete.tsx
import React, { useState, useEffect, useRef } from "react";
import { ChevronRight, Code, HelpCircle } from "react-feather";
import { GCodeCompletion } from "@/src/hooks/useGCodeAI";

interface GCodeAutocompleteProps {
  input: string;
  position: { top: number; left: number } | null;
  suggestions: GCodeCompletion[];
  isLoading: boolean;
  onSelect: (completion: string) => void;
  onClose: () => void;
  contextMode: "normal" | "gather" | "agent";
}

const GCodeAutocomplete: React.FC<GCodeAutocompleteProps> = ({
  input,
  position,
  suggestions,
  isLoading,
  onSelect,
  onClose,
  contextMode
}) => {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });
    }
  }, [activeIndex]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Keyboard navigation handler
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (suggestions[activeIndex]) {
        onSelect(suggestions[activeIndex].text);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Add keyboard listener
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown, suggestions, activeIndex]);

  // If no position or no suggestions, don't render
  if (!position || suggestions.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="absolute z-50 w-64 max-h-64 overflow-y-auto bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`
      }}
    >
      {/* Header */}
      <div className="sticky top-0 bg-gray-100 dark:bg-gray-700 px-3 py-2 border-b border-gray-200 dark:border-gray-600 text-sm font-medium flex justify-between items-center">
        <div className="flex items-center">
          <Code size={14} className="mr-2 text-blue-500" />
          <span>G-Code Suggestions</span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {contextMode === "normal" ? "Standard" : contextMode === "gather" ? "Learning" : "Smart"}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="p-3 text-center text-sm text-gray-500 dark:text-gray-400">Loading suggestions...</div>
      )}

      {/* Suggestions */}
      {!isLoading && suggestions.length > 0 && (
        <div>
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              ref={index === activeIndex ? selectedRef : null}
              className={`px-3 py-2 cursor-pointer ${
                index === activeIndex ? "bg-blue-50 dark:bg-blue-900" : "hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
              onClick={() => onSelect(suggestion.text)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <div className="flex items-center text-sm">
                <ChevronRight
                  size={14}
                  className={`mr-1 ${index === activeIndex ? "text-blue-500" : "text-gray-400"}`}
                />
                <span className="font-mono">{suggestion.text}</span>
              </div>
              {suggestion.description && (
                <div className="ml-5 mt-1 text-xs text-gray-500 dark:text-gray-400">{suggestion.description}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && suggestions.length === 0 && (
        <div className="p-3 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          <HelpCircle size={14} className="mr-2" />
          <span>No suggestions available</span>
        </div>
      )}

      {/* Footer */}
      <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-700 px-3 py-2 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex justify-between">
          <span>↑↓ to navigate</span>
          <span>Tab to complete</span>
        </div>
      </div>
    </div>
  );
};

export default GCodeAutocomplete;
