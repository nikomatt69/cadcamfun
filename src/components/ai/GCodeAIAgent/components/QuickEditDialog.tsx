// src/components/ai/GCodeAIAgent/components/QuickEditDialog.tsx
import React, { useState, useEffect, useRef } from "react";
import { Edit, X, RefreshCw } from "react-feather";

interface QuickEditDialogProps {
  selection: string;
  onSubmit: (instruction: string, selection: string) => void;
  onClose: () => void;
  isProcessing: boolean;
}

const QuickEditDialog: React.FC<QuickEditDialogProps> = ({ selection, onSubmit, onClose, isProcessing }) => {
  const [instruction, setInstruction] = useState<string>("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Listen for clicks outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Handle form submission
  const handleSubmit = () => {
    if (instruction.trim() && !isProcessing) {
      onSubmit(instruction.trim(), selection);
    }
  };

  // Display truncated selection if too long
  const getDisplaySelection = () => {
    const maxLength = 100;
    if (selection.length > maxLength) {
      return selection.substring(0, maxLength) + "...";
    }
    return selection;
  };

  // Suggestions for quick edits
  const quickSuggestions = ["Add comments", "Optimize for speed", "Add safety checks", "Fix formatting"];

  return (
    <div className="absolute right-4 top-2 inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
      <div
        ref={dialogRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-5/6 max-w-md overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <Edit className="w-5 h-5 mr-2 text-blue-500" />
            <h3 className="text-lg font-semibold">Quick Edit</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            disabled={isProcessing}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Selected Code</label>
            <div className="bg-gray-100 dark:bg-gray-900 p-2 rounded-md text-xs font-mono overflow-x-auto">
              {getDisplaySelection()}
            </div>
          </div>

          <div className="mb-4">
            <label
              htmlFor="edit-instruction"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Describe what changes to make
            </label>
            <input
              id="edit-instruction"
              ref={inputRef}
              type="text"
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder="e.g., Add comments to explain the code"
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700"
              disabled={isProcessing}
            />
          </div>

          {/* Quick suggestions */}
          <div className="mb-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Suggestions:</div>
            <div className="flex flex-wrap gap-2">
              {quickSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => setInstruction(suggestion)}
                  className="px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-sm"
                  disabled={isProcessing}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md mr-2"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!instruction.trim() || isProcessing}
            className={`px-4 py-2 text-sm rounded-md flex items-center ${
              !instruction.trim() || isProcessing
                ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                : "bg-blue-500 hover:bg-blue-600 text-white"
            }`}
          >
            {isProcessing ? (
              <>
                <RefreshCw size={16} className="animate-spin mr-2" />
                Processing...
              </>
            ) : (
              "Apply Edit"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickEditDialog;
