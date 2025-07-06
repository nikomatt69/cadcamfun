import { useState, useCallback, useEffect } from "react";
import { useGCodeEditor } from "@/src/contexts/GCodeEditorContext";

// Tipi per l'autocompletamento
export interface GCodeAutocompletion {
  text: string;
  description?: string;
  type: "command" | "parameter" | "value";
}

// Opzioni per la generazione di autocompletamento
interface GCodeCompletionOptions {
  maxResults?: number;
  includeDescriptions?: boolean;
  contextScope?: number; // Quante righe di contesto includere
}

// Database di comandi GCode comuni
const GCODE_COMMANDS = [
  { command: "G0", description: "Rapid positioning" },
  { command: "G1", description: "Linear move" },
  { command: "G2", description: "Clockwise arc" },
  { command: "G3", description: "Counter-clockwise arc" },
  { command: "G4", description: "Dwell" },
  { command: "G17", description: "XY plane select" },
  { command: "G18", description: "XZ plane select" },
  { command: "G19", description: "YZ plane select" },
  { command: "G20", description: "Set units to inches" },
  { command: "G21", description: "Set units to millimeters" },
  { command: "G28", description: "Return to home position" },
  { command: "G90", description: "Absolute positioning" },
  { command: "G91", description: "Relative positioning" },
  { command: "G92", description: "Set position" },
  { command: "M0", description: "Program stop" },
  { command: "M1", description: "Optional program stop" },
  { command: "M2", description: "Program end" },
  { command: "M3", description: "Spindle on clockwise" },
  { command: "M4", description: "Spindle on counter-clockwise" },
  { command: "M5", description: "Spindle stop" },
  { command: "M6", description: "Tool change" },
  { command: "M8", description: "Coolant on" },
  { command: "M9", description: "Coolant off" },
  { command: "M30", description: "Program end and reset" }
];

// Database di parametri comuni
const GCODE_PARAMETERS = [
  { param: "X", description: "X-axis position" },
  { param: "Y", description: "Y-axis position" },
  { param: "Z", description: "Z-axis position" },
  { param: "I", description: "Arc center X offset" },
  { param: "J", description: "Arc center Y offset" },
  { param: "K", description: "Arc center Z offset" },
  { param: "F", description: "Feed rate" },
  { param: "S", description: "Spindle speed" },
  { param: "P", description: "Parameter value" },
  { param: "T", description: "Tool number" },
  { param: "R", description: "Arc radius" }
];

// Hook personalizzato per le funzionalità di autocompletamento
export function useGCodeAutoComplete(options: GCodeCompletionOptions = {}) {
  const {
    content,
    selectionRange,
    showAutoComplete,
    setShowAutoComplete,
    autoCompleteOptions,
    setAutoCompleteOptions,
    autoCompletePosition,
    setAutoCompletePosition,
    insertTextAtSelection,
    getLineAtPosition,
    editorRef
  } = useGCodeEditor();

  const [isLoading, setIsLoading] = useState(false);

  // Funzione per generare suggerimenti in base al contesto
  const generateCompletions = useCallback(
    (cursorPosition: number) => {
      if (!content || cursorPosition === undefined) return [];

      setIsLoading(true);

      try {
        // Ottieni la linea corrente
        const { lineContent, lineStart } = getLineAtPosition(cursorPosition);

        // Calcola l'indice relativo del cursore all'interno della linea
        const relativePosition = cursorPosition - lineStart;

        // Ottieni il testo prima del cursore nella linea corrente
        const textBeforeCursor = lineContent.substring(0, relativePosition);

        let results: GCodeAutocompletion[] = [];

        // Verifica se stiamo digitando un comando G o M
        if (/[GM]$/.test(textBeforeCursor)) {
          // Suggerisci tutti i comandi G o M
          const prefix = textBeforeCursor.endsWith("G") ? "G" : "M";
          results = GCODE_COMMANDS.filter(cmd => cmd.command.startsWith(prefix)).map(cmd => ({
            text: cmd.command,
            description: cmd.description,
            type: "command"
          }));
        }
        // Verifica se stiamo digitando un parametro dopo un comando G o M
        else if (/[GM]\d+\s+$/.test(textBeforeCursor) || /\s+$/.test(textBeforeCursor)) {
          // Suggerisci parametri
          results = GCODE_PARAMETERS.map(param => ({
            text: param.param,
            description: param.description,
            type: "parameter"
          }));
        }
        // Verifica se stiamo completando un valore del parametro
        else if (/[XYZIJKFSPRT]$/.test(textBeforeCursor)) {
          // Estrai il possibile parametro
          const param = textBeforeCursor.match(/([XYZIJKFSPRT])$/)?.[1];

          // Suggerimenti in base al tipo di parametro
          if (param === "F") {
            results = [
              { text: "F100", description: "Slow feed rate", type: "value" },
              { text: "F500", description: "Medium feed rate", type: "value" },
              { text: "F1000", description: "Fast feed rate", type: "value" }
            ];
          } else if (param === "S") {
            results = [
              { text: "S1000", description: "Low spindle speed", type: "value" },
              { text: "S10000", description: "High spindle speed", type: "value" }
            ];
          } else {
            // Per posizioni X, Y, Z suggerisci alcuni valori standard
            results = [
              { text: `${param}0`, description: "Zero position", type: "value" },
              { text: `${param}10`, description: "Position 10mm", type: "value" },
              { text: `${param}-10`, description: "Position -10mm", type: "value" }
            ];
          }
        }

        // Limita il numero di risultati se necessario
        if (options.maxResults && results.length > options.maxResults) {
          results = results.slice(0, options.maxResults);
        }

        // Se non ci sono suggerimenti, nasconde il popup
        if (results.length === 0) {
          setShowAutoComplete(false);
        } else {
          setAutoCompleteOptions(results);

          // Calculate exact cursor position for popup
          if (editorRef.current) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              const rect = range.getBoundingClientRect();
              const editorRect = editorRef.current.getBoundingClientRect();

              setAutoCompletePosition({
                top: rect.bottom - editorRect.top,
                left: rect.left - editorRect.left
              });
            }
          }

          setShowAutoComplete(true);
        }

        return results;
      } catch (error) {
        console.error("Error generating autocompletions:", error);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [
      content,
      getLineAtPosition,
      setShowAutoComplete,
      setAutoCompleteOptions,
      autoCompletePosition,
      setAutoCompletePosition,
      options.maxResults
    ]
  );

  // Funzione per applicare un suggerimento selezionato
  const applyCompletion = useCallback(
    (completion: GCodeAutocompletion) => {
      if (!selectionRange) return;

      // Posizione del cursore
      const cursorPosition = selectionRange.start;

      // Ottieni la linea corrente
      const { lineContent, lineStart } = getLineAtPosition(cursorPosition);

      // Calcola l'indice relativo del cursore all'interno della linea
      const relativePosition = cursorPosition - lineStart;

      // Ottieni il testo prima del cursore nella linea corrente
      const textBeforeCursor = lineContent.substring(0, relativePosition);

      let replacementText = completion.text;
      let textToReplace = "";

      // Determina cosa sostituire in base al contesto
      if (completion.type === "command") {
        // Se stiamo completando un comando, sostituisci il prefisso G o M
        const match = textBeforeCursor.match(/[GM]$/);
        if (match) {
          textToReplace = match[0];
        }
      } else if (completion.type === "parameter") {
        // Se stiamo inserendo un parametro, aggiungi uno spazio se necessario
        if (!textBeforeCursor.endsWith(" ")) {
          replacementText = " " + replacementText;
        }
      } else if (completion.type === "value") {
        // Se stiamo completando un valore, sostituisci il parametro
        const match = textBeforeCursor.match(/[XYZIJKFSPRT]$/);
        if (match) {
          textToReplace = match[0];
        }
      }

      // Calcola il nuovo testo
      const newText = textBeforeCursor.substring(0, textBeforeCursor.length - textToReplace.length) + replacementText;

      // Sostituisci il testo nella linea
      const newLineContent = newText + lineContent.substring(relativePosition);

      // Calcola la posizione finale del cursore dopo l'inserimento
      const newCursorPosition = lineStart + newText.length;

      // Aggiorna il contenuto
      const newContent =
        content.substring(0, lineStart) + newLineContent + content.substring(lineStart + lineContent.length);

      // Inserisci il testo (questo dovrebbe poi aggiornare anche il cursor range)
      insertTextAtSelection(newText);

      // Nascondi l'autocompletamento
      setShowAutoComplete(false);
    },
    [content, selectionRange, getLineAtPosition, insertTextAtSelection, setShowAutoComplete]
  );

  return {
    generateCompletions,
    applyCompletion,
    isLoading,
    showAutoComplete,
    setShowAutoComplete,
    autoCompleteOptions
  };
}

export default useGCodeAutoComplete;
