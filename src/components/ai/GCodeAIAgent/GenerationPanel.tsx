// src/components/ai/GCodeAIAgent/GenerationPanel.tsx
import React, { useState } from "react";
import { Code, Copy, Check, Cpu, List, Tool, Circle, Square, Command, FileText, Send } from "react-feather";

interface GenerationPanelProps {
  onGenerate: (prompt: string) => void;
  isGenerating: boolean;
  onApplyGenerated: (code: string) => void;
  lastGeneratedCode: string;
}

const GenerationPanel: React.FC<GenerationPanelProps> = ({
  onGenerate,
  isGenerating,
  onApplyGenerated,
  lastGeneratedCode
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [codeCopied, setCodeCopied] = useState<boolean>(false);

  // Handle copy generated code
  const handleCopyCode = () => {
    if (lastGeneratedCode) {
      navigator.clipboard.writeText(lastGeneratedCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  // Handle generate from template
  const handleGenerateFromTemplate = () => {
    if (selectedTemplate) {
      onGenerate(selectedTemplate);
    }
  };

  // Handle custom prompt submission
  const handleSubmitCustomPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (customPrompt.trim()) {
      onGenerate(customPrompt);
      setCustomPrompt("");
    }
  };

  // Templates for common G-code operations
  const templates = [
    {
      id: "circle",
      title: "Circular Pocket",
      description: "Create a circular pocket with depth control",
      icon: <Circle size={20} />,
      prompt:
        "Generate G-code for a circular pocket with a 30mm diameter, 5mm depth, using a 6mm end mill. Include safety moves and full operation from tool change to end of program."
    },
    {
      id: "square",
      title: "Square Pocket",
      description: "Create a square pocket with rounded corners",
      icon: <Square size={20} />,
      prompt:
        "Generate G-code for a 50mm x 50mm square pocket with 5mm radius corners, 8mm depth, using an 8mm end mill. Include safety moves, roughing, and finishing passes."
    },
    {
      id: "contour",
      title: "Outer Contour",
      description: "Cut an external profile around a part",
      icon: <Command size={20} />,
      prompt:
        "Generate G-code for an external contour cut of a 100mm x 75mm rectangular part with 10mm rounded corners. Use a 6mm end mill, cutting to a depth of 15mm with a 0.5mm finishing allowance."
    },
    {
      id: "drilling",
      title: "Drilling Pattern",
      description: "Create a pattern of holes in a grid",
      icon: <Tool size={20} />,
      prompt:
        "Generate G-code for drilling 5mm holes in a 4x3 grid pattern with 20mm spacing. Drill depth of 10mm, use pecking cycles for chip clearing, and include safety moves between holes."
    }
  ];

  return (
    <div className="flex-1 overflow-auto p-4">
      {/* Template Selection */}
      <div className="mb-4">
        <h3 className="text-md font-medium mb-2 text-gray-700 dark:text-gray-300">Choose a template</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {templates.map(template => (
            <button
              key={template.id}
              onClick={() => setSelectedTemplate(template.prompt)}
              className={`p-3 rounded-md text-left flex items-start space-x-3 transition-colors ${
                selectedTemplate === template.prompt
                  ? "bg-blue-100 dark:bg-blue-900 border-2 border-blue-500"
                  : "bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
              }`}
            >
              <div className="flex-shrink-0 mt-1">{template.icon}</div>
              <div>
                <div className="font-medium text-sm">{template.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{template.description}</div>
              </div>
            </button>
          ))}
        </div>

        {selectedTemplate && (
          <div className="mt-3">
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-sm border border-gray-200 dark:border-gray-600">
              {selectedTemplate}
            </div>
            <button
              onClick={handleGenerateFromTemplate}
              disabled={isGenerating}
              className={`mt-2 w-full py-2 px-3 rounded-md text-sm font-medium flex items-center justify-center ${
                isGenerating
                  ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600 text-white"
              }`}
            >
              <Cpu size={16} className="mr-2" />
              {isGenerating ? "Generating..." : "Generate from Template"}
            </button>
          </div>
        )}
      </div>

      {/* Custom Prompt */}
      <div className="mb-4">
        <h3 className="text-md font-medium mb-2 text-gray-700 dark:text-gray-300">Or describe what you need</h3>

        <form onSubmit={handleSubmitCustomPrompt}>
          <textarea
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            placeholder="Describe the G-code you want to generate..."
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md h-24 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            disabled={isGenerating}
          />

          <button
            type="submit"
            disabled={isGenerating || !customPrompt.trim()}
            className={`mt-2 w-full py-2 px-3 rounded-md text-sm font-medium flex items-center justify-center ${
              isGenerating || !customPrompt.trim()
                ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                : "bg-green-500 hover:bg-green-600 text-white"
            }`}
          >
            <Send size={16} className="mr-2" />
            {isGenerating ? "Generating..." : "Generate Custom Code"}
          </button>
        </form>
      </div>

      {/* Generated Code Display */}
      {lastGeneratedCode && (
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-medium text-gray-700 dark:text-gray-300">Generated G-Code</h3>
            <div className="flex space-x-2">
              <button
                onClick={handleCopyCode}
                className="p-2 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-600"
                title="Copy code"
              >
                {codeCopied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
              </button>
              <button
                onClick={() => onApplyGenerated(lastGeneratedCode)}
                className="p-2 rounded-md bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800"
                title="Apply code to editor"
              >
                <Code size={16} />
              </button>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md border border-gray-200 dark:border-gray-600 max-h-48 overflow-y-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              <code>{lastGeneratedCode}</code>
            </pre>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!lastGeneratedCode && !isGenerating && !selectedTemplate && !customPrompt && (
        <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
          <FileText size={32} className="mb-2" />
          <p className="text-center text-sm">Select a template or describe what G-code you want to generate</p>
        </div>
      )}
    </div>
  );
};

export default GenerationPanel;
