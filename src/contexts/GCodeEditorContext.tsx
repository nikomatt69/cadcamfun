import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { GCodeAutocompletion } from "@/src/hooks/useGCodeAutoComplete";

// Definizione del tipo per il contesto del GCode Editor
export interface GCodeEditorContextType {
  // Contenuto e selezione
  content: string;
  setContent: (content: string) => void;
  selectedText: string;
  setSelectedText: (text: string) => void;
  selectionRange: { start: number; end: number } | null;
  setSelectionRange: (range: { start: number; end: number } | null) => void;

  // Autocompletamento
  showAutoComplete: boolean;
  setShowAutoComplete: (show: boolean) => void;
  autoCompleteOptions: GCodeAutocompletion[];
  setAutoCompleteOptions: (options: GCodeAutocompletion[]) => void;
  autoCompletePosition: { top: number; left: number } | null;
  setAutoCompletePosition: (position: { top: number; left: number } | null) => void;

  // QuickEdit
  showQuickEdit: boolean;
  setShowQuickEdit: (show: boolean) => void;
  quickEditPosition: { top: number; left: number } | null;
  setQuickEditPosition: (position: { top: number; left: number } | null) => void;

  // Helper functions
  insertTextAtSelection: (text: string) => void;
  replaceSelection: (text: string) => void;
  getContextAroundSelection: (linesBefore?: number, linesAfter?: number) => string;
  getLineAtPosition: (position: number) => {
    lineNumber: number;
    lineContent: string;
    lineStart: number;
    lineEnd: number;
  };

  // Editor riferimenti
  editorRef: React.RefObject<HTMLPreElement>;
}

// Creazione del contesto con valori predefiniti
const defaultContext: GCodeEditorContextType = {
  content: "",
  setContent: () => {},
  selectedText: "",
  setSelectedText: () => {},
  selectionRange: null,
  setSelectionRange: () => {},

  showAutoComplete: false,
  setShowAutoComplete: () => {},
  autoCompleteOptions: [],
  setAutoCompleteOptions: () => {},
  autoCompletePosition: null,
  setAutoCompletePosition: () => {},

  showQuickEdit: false,
  setShowQuickEdit: () => {},
  quickEditPosition: null,
  setQuickEditPosition: () => {},

  insertTextAtSelection: () => {},
  replaceSelection: () => {},
  getContextAroundSelection: () => "",
  getLineAtPosition: () => ({ lineNumber: 0, lineContent: "", lineStart: 0, lineEnd: 0 }),

  editorRef: { current: null }
};

// Creazione del context
export const GCodeEditorContext = createContext<GCodeEditorContextType>(defaultContext);

// Hook per utilizzare il context
export const useGCodeEditor = () => useContext(GCodeEditorContext);

// Provider component
interface GCodeEditorProviderProps {
  children: ReactNode;
  initialContent?: string;
}

export const GCodeEditorProvider: React.FC<GCodeEditorProviderProps> = ({ children, initialContent = "" }) => {
  // State per il contenuto e la selezione
  const [content, setContent] = useState<string>(initialContent);
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);

  // State per l'autocompletamento
  const [showAutoComplete, setShowAutoComplete] = useState<boolean>(false);
  const [autoCompleteOptions, setAutoCompleteOptions] = useState<GCodeAutocompletion[]>([]);
  const [autoCompletePosition, setAutoCompletePosition] = useState<{ top: number; left: number } | null>(null);

  // State per il QuickEdit
  const [showQuickEdit, setShowQuickEdit] = useState<boolean>(false);
  const [quickEditPosition, setQuickEditPosition] = useState<{ top: number; left: number } | null>(null);

  // Ref per l'editor
  const editorRef = React.useRef<HTMLPreElement>(null);

  // Inserisci testo nella posizione corrente del cursore
  const insertTextAtSelection = useCallback(
    (text: string) => {
      if (selectionRange) {
        const newContent = content.substring(0, selectionRange.start) + text + content.substring(selectionRange.end);

        setContent(newContent);

        // Aggiorna la posizione del cursore dopo l'inserimento
        const newPosition = selectionRange.start + text.length;
        setSelectionRange({ start: newPosition, end: newPosition });
      }
    },
    [content, selectionRange]
  );

  // Sostituisci il testo selezionato
  const replaceSelection = useCallback(
    (text: string) => {
      if (selectionRange) {
        const newContent = content.substring(0, selectionRange.start) + text + content.substring(selectionRange.end);

        setContent(newContent);

        // Posiziona il cursore alla fine del testo inserito
        const newPosition = selectionRange.start + text.length;
        setSelectionRange({ start: newPosition, end: newPosition });
      }
    },
    [content, selectionRange]
  );

  // Ottieni il contesto intorno alla selezione (utile per l'AI)
  const getContextAroundSelection = useCallback(
    (linesBefore = 3, linesAfter = 3) => {
      if (!selectionRange) return "";

      const lines = content.split("\n");
      const selectionStartInfo = getLineAtPosition(selectionRange.start);
      const selectionEndInfo = getLineAtPosition(selectionRange.end);

      const startLineIndex = Math.max(0, selectionStartInfo.lineNumber - linesBefore);
      const endLineIndex = Math.min(lines.length - 1, selectionEndInfo.lineNumber + linesAfter);

      return lines.slice(startLineIndex, endLineIndex + 1).join("\n");
    },
    [content, selectionRange]
  );

  // Ottieni informazioni sulla linea a una determinata posizione
  const getLineAtPosition = useCallback(
    (position: number) => {
      const lines = content.split("\n");
      let currentPos = 0;

      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length + 1; // +1 per il carattere newline
        if (position >= currentPos && position < currentPos + lineLength) {
          return {
            lineNumber: i,
            lineContent: lines[i],
            lineStart: currentPos,
            lineEnd: currentPos + lineLength - 1
          };
        }
        currentPos += lineLength;
      }

      // Fallback al caso in cui la posizione sia oltre l'ultima riga
      return {
        lineNumber: lines.length - 1,
        lineContent: lines[lines.length - 1] || "",
        lineStart: content.length - (lines[lines.length - 1]?.length || 0),
        lineEnd: content.length
      };
    },
    [content]
  );

  // Gestisci l'evento di selezione del testo nell'editor
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (selection && editorRef.current?.contains(selection.anchorNode)) {
        if (selection.toString().trim()) {
          setSelectedText(selection.toString());

          // Questa è una semplificazione, in un editor reale avresti bisogno
          // di determinare le posizioni precise nel testo completo
          const range = selection.getRangeAt(0);
          const preCaretRange = range.cloneRange();
          preCaretRange.selectNodeContents(editorRef.current);
          preCaretRange.setEnd(range.startContainer, range.startOffset);
          const start = preCaretRange.toString().length;

          preCaretRange.setEnd(range.endContainer, range.endOffset);
          const end = preCaretRange.toString().length;

          setSelectionRange({ start, end });

          // Calcola la posizione per il popup QuickEdit
          const rect = range.getBoundingClientRect();
          const editorRect = editorRef.current.getBoundingClientRect();

          const position = {
            top: rect.bottom - editorRect.top,
            left: rect.left - editorRect.left
          };

          setQuickEditPosition(position);
        } else {
          setSelectedText("");
          setSelectionRange(null);
          setShowQuickEdit(false);
        }
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, []);

  // Aggiorna il selectedText quando cambia il selectionRange
  useEffect(() => {
    if (selectionRange) {
      setSelectedText(content.substring(selectionRange.start, selectionRange.end));
    }
  }, [content, selectionRange]);

  // Valore del context
  const contextValue: GCodeEditorContextType = {
    content,
    setContent,
    selectedText,
    setSelectedText,
    selectionRange,
    setSelectionRange,

    showAutoComplete,
    setShowAutoComplete,
    autoCompleteOptions,
    setAutoCompleteOptions,
    autoCompletePosition,
    setAutoCompletePosition,

    showQuickEdit,
    setShowQuickEdit,
    quickEditPosition,
    setQuickEditPosition,

    insertTextAtSelection,
    replaceSelection,
    getContextAroundSelection,
    getLineAtPosition,

    editorRef
  };

  return <GCodeEditorContext.Provider value={contextValue}>{children}</GCodeEditorContext.Provider>;
};
