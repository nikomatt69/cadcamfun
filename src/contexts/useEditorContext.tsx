"use client";
import React, { createContext, useContext, useState, ReactNode } from "react";

interface EditorContextType {
  editorContent: string;
  cursorPosition: { lineNumber: number; column: number };
  editorInstance: any;
  setEditorContent: (content: string) => void;
  setCursorPosition: (position: { lineNumber: number; column: number }) => void;
  setEditorInstance: (editor: any) => void;
  insertSuggestion: (text: string, range?: any) => void;
  replaceSuggestion: (text: string, range: any) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const EditorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [editorContent, setEditorContent] = useState<string>("");
  const [cursorPosition, setCursorPosition] = useState<{ lineNumber: number; column: number }>({
    lineNumber: 1,
    column: 1
  });
  const [editorInstance, setEditorInstance] = useState<any>(null);

  const insertSuggestion = (text: string, range?: any) => {
    if (editorInstance) {
      if (range) {
        editorInstance.executeEdits("copilot", [
          {
            range: range,
            text: text
          }
        ]);
      } else {
        const position = editorInstance.getPosition();
        editorInstance.executeEdits("copilot", [
          {
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column
            },
            text: text
          }
        ]);
      }
    }
  };

  const replaceSuggestion = (text: string, range: any) => {
    if (editorInstance) {
      editorInstance.executeEdits("copilot", [
        {
          range: range,
          text: text
        }
      ]);
    }
  };

  return (
    <EditorContext.Provider
      value={{
        editorContent,
        cursorPosition,
        editorInstance,
        setEditorContent,
        setCursorPosition,
        setEditorInstance,
        insertSuggestion,
        replaceSuggestion
      }}
    >
      {children}
    </EditorContext.Provider>
  );
};

export const useEditorContext = (): EditorContextType => {
  const context = useContext(EditorContext);
  if (context === undefined) {
    throw new Error("useEditorContext must be used within an EditorProvider");
  }
  return context;
};
