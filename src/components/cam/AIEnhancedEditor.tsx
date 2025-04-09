// src/components/cam/AIEnhancedEditor.tsx
import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Cloud, Check, X, Cpu } from 'react-feather';
import axios from 'axios';

// Importazione dinamica di MonacoEditor per Next.js
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
});

interface AIEnhancedEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
}

interface SuggestionState {
  text: string;
  range: any;
  isVisible: boolean;
}

const AIEnhancedEditor: React.FC<AIEnhancedEditorProps> = ({
  value,
  onChange,
  language = 'plaintext'
}) => {
  // Riferimenti
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const lastRequestTime = useRef<number>(Date.now());
  const suggestionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Stati
  const [aiSuggestion, setAiSuggestion] = useState<SuggestionState | null>(null);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [lastCursorPosition, setLastCursorPosition] = useState<{lineNumber: number, column: number} | null>(null);
  const [aiContext, setAiContext] = useState<string>('');
  
  // Model configuration
  const CLAUDE_MODEL = 'claude-3-5-sonnet-20240229';
  const TEMPERATURE = 0.3; // Lower for more precise code suggestions
  
  // Aggancia l'editor quando viene montato
  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // Aggiungi evento per rilevare modifiche
    editor.onDidChangeModelContent(() => {
      onChange(editor.getValue());
      
      // Cancel any pending suggestion
      if (suggestionTimeoutRef.current) {
        clearTimeout(suggestionTimeoutRef.current);
      }
      
      // Add delay before triggering AI to avoid constant API calls while typing
      suggestionTimeoutRef.current = setTimeout(() => {
        triggerAiCompletion();
      }, 1000);
    });
    
    // Add cursor position change event
    editor.onDidChangeCursorPosition((e: any) => {
      setLastCursorPosition(e.position);
      
      // Cancel suggestion if visible and cursor moves away from suggestion area
      if (aiSuggestion?.isVisible) {
        setAiSuggestion(prev => prev ? {...prev, isVisible: false} : null);
      }
    });
    
    // Aggiungi comando per accettare i suggerimenti
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      acceptSuggestion();
    });
    
    // Add Tab key handler for accepting suggestions
    editor.addCommand(monaco.KeyCode.Tab, () => {
      if (aiSuggestion?.isVisible) {
        acceptSuggestion();
        return null; // Cancel default tab behavior
      }
      return undefined; // Continue with default tab behavior
    });
  };
  
  // Funzione che utilizza Claude per generare completamenti in tempo reale
  const triggerAiCompletion = async () => {
    if (!editorRef.current || !monacoRef.current) return;
    
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    
    // Ottieni la posizione del cursore
    const position = editor.getPosition();
    if (!position) return;
    
    // Ottieni il testo attuale
    const currentText = editor.getValue();
    
    // Non generare suggerimenti se il testo è troppo corto
    if (currentText.length < 10) {
      setAiSuggestion(null);
      return;
    }
    
    // Evita troppe chiamate API
    const now = Date.now();
    if (now - lastRequestTime.current < 2000) {  // Limita a una richiesta ogni 2 secondi
      return;
    }
    lastRequestTime.current = now;
    
    setIsAIThinking(true);
    
    try {
      // Extract context around the cursor position
      const model = editor.getModel();
      const lineCount = model.getLineCount();
      
      // Get 10 lines before and 5 lines after the cursor for context
      const startLine = Math.max(1, position.lineNumber - 10);
      const endLine = Math.min(lineCount, position.lineNumber + 5);
      
      // Extract the context
      let contextLines = [];
      for (let i = startLine; i <= endLine; i++) {
        const line = model.getLineContent(i);
        contextLines.push(line);
        
        // Mark current line with >>> <
        if (i === position.lineNumber) {
          // Find cursor position in this line
          const cursorIdx = position.column - 1;
          const markedLine = line.substring(0, cursorIdx) + '|' + line.substring(cursorIdx);
          contextLines[contextLines.length - 1] = markedLine;
        }
      }
      
      const context = contextLines.join('\n');
      setAiContext(context);
      
      // Prepare the prompt for Claude
      const prompt = buildGcodeCompletionPrompt(context, language);
      
      // Call Claude API (either directly or through a proxy)
      const response = await callClaudeAPI(prompt);
      
      // Process the response
      if (response && response.trim()) {
        // Get the first line of the response as the suggestion
        const suggestion = response.trim();
        
        // Create a range for the suggestion
        const range = new monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column + suggestion.length
        );
        
        setAiSuggestion({ 
          text: suggestion, 
          range, 
          isVisible: true 
        });
      } else {
        setAiSuggestion(null);
      }
    } catch (error) {
      console.error('Error getting AI completion:', error);
      setAiSuggestion(null);
    } finally {
      setIsAIThinking(false);
    }
  };
  
  // Function to build a prompt for G-code completion
  const buildGcodeCompletionPrompt = (context: string, language: string) => {
    if (language === 'gcode') {
      return `You are an expert CNC programmer assistant helping with G-code. 
      I'll show you the G-code I'm currently editing, with a '|' symbol indicating my cursor position.
      Please provide a short, specific completion or suggestion for what I might want to add at the cursor.
      Only provide the exact text I should insert - no explanations, comments, or markdown.
      
      Current G-code context (| marks cursor position):
      
      ${context}
      
      Your suggestion (code only):`;
    } else {
      return `You are an expert programming assistant. I'm currently editing code and need a suggestion.
      I'll show you the code with a '|' symbol indicating my cursor position.
      Please provide a short, specific completion for what I might want to add at the cursor.
      Only provide the exact text I should insert - no explanations, comments, or markdown.
      
      Current code context (| marks cursor position):
      
      ${context}
      
      Your suggestion (code only):`;
    }
  };
  
  // Function to call Claude API
  const callClaudeAPI = async (prompt: string) => {
    try {
      // You would need an API endpoint that calls Claude
      // This can be a Next.js API route or a direct call to Claude API
      
      // Example using a Next.js API route
      const response = await axios.post('/api/ai/completion', {
        prompt,
        model: CLAUDE_MODEL,
        temperature: TEMPERATURE,
        max_tokens: 100
      });
      
      return response.data.completion;
      
      // If API isn't yet set up, use this mockup for demonstration
      /*
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Mock responses based on G-code context
      if (prompt.includes('G0') || prompt.includes('G00')) {
        return 'Z5 ; Safe rapid position';
      } else if (prompt.includes('G1') || prompt.includes('G01')) {
        return 'F150 ; Feed rate';
      } else if (prompt.includes('M3') || prompt.includes('M03')) {
        return 'S1000 ; Spindle speed';
      } else if (prompt.includes('(') || prompt.includes(';')) {
        return ' Operation description';
      } else {
        return 'G0 Z5 ; Safe position';
      }
      */
    } catch (error) {
      console.error('Error calling Claude API:', error);
      return '';
    }
  };
  
  // Accept the current suggestion
  const acceptSuggestion = () => {
    if (!aiSuggestion?.isVisible || !editorRef.current) return;
    
    const editor = editorRef.current;
    const text = aiSuggestion.text;
    const position = editor.getPosition();
    
    // Insert the suggestion text at the current position
    editor.executeEdits('ai-suggestion', [{
      range: {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      },
      text: text,
      forceMoveMarkers: true
    }]);
    
    // Clear the suggestion
    setAiSuggestion(null);
    
    // Move cursor to end of inserted text
    editor.setPosition({
      lineNumber: position.lineNumber,
      column: position.column + text.length
    });
    
    // Focus back to editor
    editor.focus();
  };
  
  // Decline the current suggestion
  const declineSuggestion = () => {
    setAiSuggestion(null);
  };
  
  // Render suggestion tooltip if available
  const renderSuggestion = () => {
    if (!aiSuggestion?.isVisible || !editorRef.current) return null;
    
    return (
      <div className="absolute z-10 bg-white border border-gray-300 rounded shadow-lg p-2 text-sm flex items-center">
        <span className="text-gray-600 mr-2 font-mono">{aiSuggestion.text}</span>
        <div className="flex space-x-1">
          <button 
            onClick={acceptSuggestion}
            className="p-1 rounded bg-green-100 text-green-700 hover:bg-green-200"
            title="Accept suggestion (Tab)"
          >
            <Check size={14} />
          </button>
          <button 
            onClick={declineSuggestion}
            className="p-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
            title="Decline suggestion (Esc)"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  };
  
  return (
    <div className="relative h-full rounded-xl t-3 flex flex-col">
      <MonacoEditor
        height="100%"
        language={language}
        value={value}
        theme="vs-light"
        className='rounded-xl'
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          lineNumbers: 'on',
          fontSize: 14,
          fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
          automaticLayout: true,
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
          acceptSuggestionOnEnter: 'on',
        }}
        onMount={handleEditorDidMount}
      />
      
      {isAIThinking && (
        <div className="absolute bottom-4 right-4 flex items-center bg-blue-50 px-3 py-1.5 rounded-md border border-blue-200">
          <div className="animate-pulse h-2 w-2 mr-2 rounded-full bg-blue-500"></div>
          <span className="text-xs text-blue-700">AI is analyzing...</span>
        </div>
      )}
      
      {aiSuggestion?.isVisible && renderSuggestion()}
      
      <div className="mt-2 px-3 py-1.5 bg-gray-50 rounded border border-gray-200 text-xs text-gray-500 flex justify-between">
        <span>
          <kbd className="px-1 py-0.5 bg-white border border-gray-300 rounded text-xs font-mono">Tab</kbd> to indent or accept suggestions, 
          <kbd className="px-1 py-0.5 bg-white border border-gray-300 rounded text-xs font-mono ml-1">Ctrl+Enter</kbd> to accept suggestions
        </span>
        <span className="flex items-center">
          <Cpu size={10} className="mr-1 text-blue-500" />
          AI assisted powered by Claude
        </span>
      </div>
    </div>
  );
};

export default AIEnhancedEditor;