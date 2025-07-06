// src/components/cam/ToolpathEditorIntegration.tsx
import React from "react";
import AIGCodeEditor from "@/src/components/ai/GCodeAIAgent";
import { GCodeEditorProvider } from "@/src/contexts/GCodeEditorContext";
import { useCAMStore } from "@/src/store/camStore";

interface ToolpathEditorIntegrationProps {
  fileName?: string;
}

/**
 * Componente di integrazione tra il ToolpathGenerator e l'editor GCode AI
 * Legge e scrive direttamente nel camStore
 */
const ToolpathEditorIntegration: React.FC<ToolpathEditorIntegrationProps> = ({ fileName = "toolpath.gcode" }) => {
  // Accesso diretto allo store CAM
  const gcode = useCAMStore(state => state.gcode);
  const setGcode = useCAMStore(state => state.setGcode);

  return (
    <GCodeEditorProvider initialContent={gcode}>
      <div className="toolpath-editor-container">
        <AIGCodeEditor
          gcode={gcode}
          onUpdateGCode={setGcode}
          fileName={fileName}
          isExpanded={true}
          defaultMode="chat"
        />
      </div>
    </GCodeEditorProvider>
  );
};

export default ToolpathEditorIntegration;
