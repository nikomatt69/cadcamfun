import { Wand } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { X, RefreshCw, AlertCircle, Check } from "react-feather";

interface Position {
  top: number;
  left: number;
}

interface QuickEditPopupProps {
  selectedText: string;
  position: Position;
  onSubmit: (instruction: string, selectedText: string) => void;
  onClose: () => void;
  isProcessing?: boolean;
  error?: string;
  success?: boolean;
}

const QuickEditPopup: React.FC<QuickEditPopupProps> = ({
  selectedText,
  position,
  onSubmit,
  onClose,
  isProcessing = false,
  error,
  success = false
}) => {
  const [instruction, setInstruction] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the input when the popup appears
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (instruction.trim() && !isProcessing) {
      onSubmit(instruction.trim(), selectedText);
    }
  };

  // Alcune opzioni di quick edit comuni
  const quickOptions = [
    "Aggiungi commenti",
    "Ottimizza velocità",
    "Ottimizza qualità",
    "Correggi sintassi",
    "Aggiungi controlli di sicurezza"
  ];

  return (
    <div
      className="absolute z-50 shadow-lg rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: "320px"
      }}
    >
      <div className="flex justify-between items-center p-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center">
          <Wand size={16} className="text-indigo-600 dark:text-indigo-400" />
          <span className="ml-2 text-sm font-medium">Modifica con AI</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
          <X size={14} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-2">
        <input
          ref={inputRef}
          type="text"
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          placeholder="Descrivi come modificare la selezione..."
          className="w-full px-3 py-2 mb-2 text-sm rounded bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400"
          disabled={isProcessing}
        />

        {error && (
          <div className="mb-2 px-2 py-1.5 text-xs rounded flex items-center bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400">
            <AlertCircle size={14} className="mr-1" />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-2 px-2 py-1.5 text-xs rounded flex items-center bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400">
            <Check size={14} className="mr-1" />
            Modifiche applicate con successo!
          </div>
        )}

        {/* Quick options */}
        <div className="mb-2">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Suggerimenti:</div>
          <div className="flex flex-wrap gap-1">
            {quickOptions.map((option, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setInstruction(option)}
                className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          {selectedText.length > 50
            ? `Selezionati ${selectedText.length} caratteri`
            : `"${selectedText.substring(0, 50)}${selectedText.length > 50 ? "..." : ""}"`}
        </div>

        <button
          type="submit"
          disabled={!instruction.trim() || isProcessing}
          className={`w-full px-3 py-1.5 rounded text-sm font-medium flex items-center justify-center ${
            isProcessing
              ? "bg-indigo-400 dark:bg-indigo-700 text-white cursor-wait"
              : instruction.trim()
                ? "bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed"
          }`}
        >
          {isProcessing ? (
            <>
              <RefreshCw size={14} className="mr-2 animate-spin" />
              Elaborazione...
            </>
          ) : (
            "Applica Modifica"
          )}
        </button>
      </form>
    </div>
  );
};

export default QuickEditPopup;
