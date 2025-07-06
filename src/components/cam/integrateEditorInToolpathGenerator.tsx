// src/components/cam/integrateEditorInToolpathGenerator.tsx
import React from "react";
import ToolpathEditorIntegration from "./ToolpathEditorIntegration";

/**
 * Funzione per integrare l'editor nel componente ToolpathGenerator
 *
 * L'editor usa direttamente il G-code salvato nel camStore
 */
export const integrateEditorInToolpathGenerator = ({
  showEditor,
  setShowEditor,
  fileName
}: {
  showEditor: boolean;
  setShowEditor: (show: boolean) => void;
  fileName?: string;
}) => {
  if (!showEditor) return null;

  return (
    <div className="g-code-editor-container mt-4 w-full">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold">G-Code Editor</h3>
        <button
          onClick={() => setShowEditor(!showEditor)}
          className="px-2 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-sm"
        >
          {showEditor ? "Hide Editor" : "Show Editor"}
        </button>
      </div>
      <div className="h-[600px] w-full border border-gray-300 rounded-md overflow-hidden">
        <ToolpathEditorIntegration fileName={fileName || "toolpath.gcode"} />
      </div>
    </div>
  );
};

export default integrateEditorInToolpathGenerator;
