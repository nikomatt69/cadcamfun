import React from "react";
import { GCodeEditorProvider } from "@/src/contexts/GCodeEditorContext";
import EnhancedGCodeEditor from "@/src/components/cam/EnhancedGCodeEditor";

interface AIGCodeEditorProps {
  gcode: string;
  onUpdateGCode?: (newGCode: string) => void;
  onClose?: () => void;
  isExpanded?: boolean;
  defaultMode?: "chat" | "analyze" | "optimize" | "generate";
  fileName?: string;
  selectedCode?: string;
  onInsertSnippet?: (snippet: string) => void;
}

const AIGCodeEditor: React.FC<AIGCodeEditorProps> = ({
  gcode,
  onUpdateGCode,
  onClose,
  isExpanded = true,
  defaultMode = "chat",
  fileName = "untitled.gcode",
  selectedCode = "",
  onInsertSnippet
}) => {
  return (
    <GCodeEditorProvider initialContent={gcode}>
      <EnhancedGCodeEditor initialCode={gcode} filename={fileName} onChange={onUpdateGCode} onSave={onUpdateGCode} />
    </GCodeEditorProvider>
  );
};

export default AIGCodeEditor;
