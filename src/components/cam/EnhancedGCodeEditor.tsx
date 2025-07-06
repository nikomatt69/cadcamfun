import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGCodeEditor, GCodeEditorProvider } from "@/src/contexts/GCodeEditorContext";
import { Edit, Code, X, FileText, } from "react-feather";
import { QuickEditToolbar } from "@/src/components/ai/GCodeAIAgent/components/toolbar";
import GCodeAIAgent from "@/src/components/ai/GCodeAIAgent/GCodeAIAgent";
import { useCAMStore } from "@/src/store/camStore";

import { Sparkles } from "lucide-react";

interface EnhancedGCodeEditorProps {
  initialCode?: string;
  filename?: string;
  onChange?: (newCode: string) => void;
  onSave?: (code: string) => void;
  readOnly?: boolean;
  value?: string;
}

// Componente interno che usa il context
const EditorContent: React.FC<{
  controlledValue?: string;
  onEditorChange?: (newCode: string) => void;
  readOnly?: boolean;
}> = ({ controlledValue, onEditorChange, readOnly = false }) => {
  const {
    content,
    setContent,
    selectedText,
    showQuickEdit,
    setShowQuickEdit,
    quickEditPosition,
    editorRef,
    replaceSelection
  } = useGCodeEditor();

  // Accedi allo store CAM
  const setStoreGcode = useCAMStore(state => state.setGcode);

  // Sincronizza il context con la prop value se presente
  useEffect(() => {
    if (controlledValue !== undefined) {
      if (content !== controlledValue) {
        setContent(controlledValue);
      }
    }
  }, [controlledValue, content, setContent]);

  // Funzione per gestire l'input nell'editor
  const handleContentChange = (e: React.FormEvent<HTMLPreElement>) => {
    if (readOnly) return;

    const newContent = e.currentTarget.textContent || "";
    setContent(newContent);

    // Notifica il componente genitore (EnhancedGCodeEditor) della modifica
    if (onEditorChange) {
      onEditorChange(newContent);
    }
  };

  // Sync content with the pre element when content changes
  useEffect(() => {
    if (editorRef.current && editorRef.current.textContent !== content) {
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const startOffset = range?.startOffset || 0;

      editorRef.current.textContent = content;

      // Restore cursor position
      if (range && selection) {
        try {
          const newRange = document.createRange();
          const textNode = editorRef.current.firstChild;
          if (textNode) {
            newRange.setStart(textNode, Math.min(startOffset, textNode.textContent?.length || 0));
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        } catch (error) {
          // Ignore cursor positioning errors
        }
      }
    }
  }, [content]);

  // Funzione per il QuickEdit
  const handleQuickEdit = (instruction: string) => {
    // Qui di solito chiameresti un'API per ottenere una modifica AI
    // Per ora simuliamo una risposta
    const simulateAIEdit = () => {
      if (instruction.toLowerCase().includes("comment")) {
        return selectedText + " ; Questo è un commento aggiunto";
      } else if (instruction.toLowerCase().includes("speed")) {
        return selectedText.replace(/F\d+/, "F1000");
      } else {
        return selectedText + " ; Modifica: " + instruction;
      }
    };

    const editedText = simulateAIEdit();
    replaceSelection(editedText);
    setShowQuickEdit(false);
  };

  // Calcolo delle righe per la numerazione
  const lines = content.split("\n");
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [currentLine, setCurrentLine] = useState(1);

  // Handle synchronized scrolling
  const handleScroll = (e: React.UIEvent<HTMLPreElement>) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
    }

    // Calculate current line based on scroll position
    const element = e.currentTarget;
    const lineHeight = 24; // 1.5rem in pixels
    const scrollTop = element.scrollTop;
    const paddingTop = 16; // 1rem padding
    const lineNumber = Math.floor((scrollTop + paddingTop) / lineHeight) + 1;
    setCurrentLine(Math.max(1, Math.min(lineNumber, lines.length)));
  };

  // Handle line number area scroll (sync back to editor)
  const handleLineNumberScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (editorRef.current) {
      editorRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // Handle line number click - jump to specific line
  const handleLineNumberClick = (lineNumber: number) => {
    if (editorRef.current) {
      const lineHeight = 24; // 1.5rem in pixels
      const paddingTop = 16; // 1rem padding
      const scrollTop = (lineNumber - 1) * lineHeight - paddingTop;
      editorRef.current.scrollTop = Math.max(0, scrollTop);

      // Focus the editor and try to position cursor at the beginning of the line
      editorRef.current.focus();

      // Try to position cursor at the beginning of the clicked line
      try {
        const selection = window.getSelection();
        if (selection && editorRef.current.firstChild) {
          const textContent = editorRef.current.textContent || '';
          const linesArray = textContent.split('\n');
          let charPosition = 0;

          for (let i = 0; i < lineNumber - 1 && i < linesArray.length; i++) {
            charPosition += linesArray[i].length + 1; // +1 for newline
          }

          const range = document.createRange();
          const textNode = editorRef.current.firstChild;
          range.setStart(textNode, Math.min(charPosition, textContent.length));
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } catch (error) {
        // Ignore cursor positioning errors
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex h-full bg-gray-900 text-white rounded-lg overflow-hidden"
    >
      {/* Numerazione delle righe */}
      <motion.div
        ref={lineNumbersRef}
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="text-right pr-3 pl-4 py-4 select-none bg-gray-800 text-gray-400 border-r border-gray-700 min-w-[60px] flex-shrink-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800"
        style={{
          lineHeight: '1.5rem', // Match editor line height
        }}
        onScroll={handleLineNumberScroll}
      >
        <div className="font-mono text-sm">
          {lines.map((_, index) => {
            const lineNumber = index + 1;
            const isCurrentLine = lineNumber === currentLine;

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(index * 0.005, 0.3), duration: 0.2 }}
                className={`leading-6 transition-all cursor-pointer px-1 rounded-sm ${isCurrentLine
                  ? 'text-blue-400 bg-blue-500/20 font-semibold'
                  : 'hover:text-blue-400 hover:bg-gray-700/50'
                  }`}
                style={{ height: '1.5rem' }} // Exact match with editor line height
                onClick={() => handleLineNumberClick(lineNumber)}
                title={`Go to line ${lineNumber}`}
              >
                {lineNumber}
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Area di editing */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="flex-1 relative bg-gray-900 overflow-hidden"
      >
        <pre
          ref={editorRef}
          contentEditable={!readOnly}
          suppressContentEditableWarning={true}
          onInput={handleContentChange}
          onScroll={handleScroll}
          className="outline-none p-4 h-full w-full whitespace-pre font-mono text-sm leading-6 bg-gray-900 text-white focus:bg-gray-800/50 transition-colors duration-200 rounded-r-lg overflow-y-auto scrollbar-thin scrollbar-thumb-blue-500/50 scrollbar-track-gray-800 resize-none"
          spellCheck={false}
          style={{
            caretColor: '#60a5fa',
            backgroundColor: '#111827', // gray-900
            color: '#ffffff',
            lineHeight: '1.5rem' // Exact match with line numbers
          }}
        />

        {/* QuickEdit popup */}
        <AnimatePresence>
          {showQuickEdit && selectedText && quickEditPosition && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute bg-gray-800 border border-gray-500 rounded-xl shadow-2xl overflow-hidden z-20 backdrop-blur-sm ring-1 ring-gray-400/20"
              style={{
                top: quickEditPosition.top,
                left: quickEditPosition.left,
                maxWidth: "320px"
              }}
            >
              <div className="flex justify-between items-center p-4 border-b border-gray-600 bg-gray-700">
                <div className="flex items-center">
                  <div className="p-1 bg-blue-500/20 rounded-lg mr-2">
                    <Edit className="w-4 h-4 text-blue-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">Quick Edit</h3>
                  <Sparkles className="w-3 h-3 ml-1 text-yellow-400" />
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, backgroundColor: '#ef4444' }}
                  whileTap={{ scale: 0.9 }}
                  className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors"
                  onClick={() => setShowQuickEdit(false)}
                >
                  <X size={14} />
                </motion.button>
              </div>
              <div className="p-4">
                <input
                  type="text"
                  placeholder="Describe your edit (e.g., 'Make this spindle speed faster')"
                  className="w-full p-3 bg-gray-900 border border-gray-500 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      handleQuickEdit(e.currentTarget.value);
                    }
                  }}
                  autoFocus
                />
                <div className="flex justify-end mt-3">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white font-medium shadow-lg transition-all"
                    onClick={e => {
                      const input = e.currentTarget.parentElement?.previousSibling as HTMLInputElement;
                      handleQuickEdit(input.value);
                    }}
                  >
                    Apply
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Toolbar che appare quando viene selezionato del testo */}
      <AnimatePresence>
        {selectedText && !showQuickEdit && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
          >
            <QuickEditToolbar
              onQuickEdit={() => setShowQuickEdit(true)}
              onExplain={() => console.log("Explain selection")}
              onOptimize={() => console.log("Optimize selection")}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// Componente principale che avvolge il contenuto con il provider
const EnhancedGCodeEditor: React.FC<EnhancedGCodeEditorProps> = ({
  initialCode,
  filename = "Nuovo File.gcode",
  onChange,
  onSave,
  readOnly = false,
  value
}) => {
  const storeGcode = useCAMStore(state => state.gcode);

  // Determina il contenuto iniziale per il Provider, dando priorità a `value`.
  const effectiveInitialContent = value ?? storeGcode ?? initialCode ?? "; GCode: generato con GCode Copilot\n; [!]\n";

  // Handler interno che viene chiamato da EditorContent e GCodeAIWrapper.
  // Questo poi chiama l'onChange prop fornito a EnhancedGCodeEditor.
  const handleInternalChange = (newCode: string) => {
    if (onChange) {
      onChange(newCode);
    }
  };

  return (
    <GCodeEditorProvider initialContent={effectiveInitialContent}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col h-full border border-gray-600 rounded-xl overflow-hidden shadow-xl bg-gray-900 backdrop-blur-sm"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-600 flex-shrink-0"
        >
          <div className="flex items-center">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg mr-3">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-medium bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              {filename}
            </span>
          </div>
          <div className="flex space-x-2">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, duration: 0.2 }}
              className="px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-lg"
            >
              <span className="text-green-400 text-xs font-medium">Enhanced</span>
            </motion.div>
          </div>
        </motion.div>

        {/* Main content with editor and AI agent */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="flex flex-1 overflow-hidden min-h-0 bg-gray-900"
        >
          <div className="flex-1 min-w-0 overflow-hidden">
            <EditorContent controlledValue={value} onEditorChange={handleInternalChange} readOnly={readOnly} />
          </div>
          <div className="w-[525px] flex-shrink-0 border-l border-gray-600 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600/50 scrollbar-track-gray-800/30">
            <GCodeAIWrapper onChange={handleInternalChange} />
          </div>
        </motion.div>
      </motion.div>
    </GCodeEditorProvider>
  );
};

// Componente wrapper per l'agente AI che accede al context
const GCodeAIWrapper: React.FC<{ onChange?: (code: string) => void }> = ({ onChange }) => {
  const { content, selectedText, replaceSelection } = useGCodeEditor();
  const setStoreGcode = useCAMStore(state => state.setGcode);

  // Funzione per aggiornare il GCode dall'agente AI
  const handleUpdateGCode = (newGCode: string) => {
    // Aggiorna lo store CAM
    setStoreGcode(newGCode);

    // Aggiorna la selezione o il contenuto
    if (selectedText) {
      replaceSelection(newGCode);
    }

    // Notifica i cambiamenti all'esterno
    if (onChange) {
      onChange(newGCode);
    }
  };

  return (
    <GCodeAIAgent
      gcode={content}
      selectedCode={selectedText}
      onUpdateGCode={handleUpdateGCode}
      isExpanded={true}
      fileName="Codice GCode"
    />
  );
};

export default EnhancedGCodeEditor;
