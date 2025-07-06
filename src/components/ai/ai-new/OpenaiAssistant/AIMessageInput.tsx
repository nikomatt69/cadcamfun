// src/components/ai/AIMessageInput.tsx
import { Brain, Hammer, LightbulbIcon, Ruler, Terminal, Cpu as CpuIcon } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Paperclip,
  AlertCircle,
  Box,
  List,
  Zap,
  X,
  Image as ImageIcon,
  Loader,
  Type,
  Edit3,
  Trash,
  ExternalLink,
  Plus,
  Tool,
  BookOpen,
  Search,
  Layers,
  PauseCircle,
  PlayCircle,
  File
} from "react-feather";
import toast from "react-hot-toast";
import ReferenceMenu from "./components/ReferenceMenu";
import CommandMenu from "./components/CommandMenu";
import MCPToolsStatusModal from "./MCPToolsStatusModal";
import ContextPanel from "../ContextPanel";
import { useContextStore } from "@/src/store/contextStore";

// Define and export tool types for clarity
export type ToolName =
  | "generateCADElement"
  | "chainOfThoughtAnalysis"
  | "suggestOptimizations"
  | "textToCAD"
  | "updateCADElement"
  | "removeCADElement"
  | "exportCADProjectAsZip"
  | "thinkAloudMode"
  | "autoQuoteCADElements"
  | "analyzeManufacturability"
  | "generate2DTechnicalDrawings"
  | "simulatePhysicalProperties"
  | "webSearch"
  | "codeInterpreter"
  | "autonomousTask"
  | "imageAnalysis"; // NUOVO - Analisi immagini con Vision API

// Structure to hold selected file data (text or image)
export interface SelectedFileData {
  name: string;
  type: "text" | "image";
  content: string; // Text content or Base64 data URL
  fileType: string; // Original MIME type
}

interface AIMessageInputProps {
  // Update signature to pass structured file data
  onSendMessage: (message: string, files?: SelectedFileData[], activeTool?: ToolName | null) => void;
  isProcessing: boolean;
  placeholder?: string;
  maxFiles?: number;
  maxFileSizeMB?: number;
  // Combine accepted types
  acceptedTextTypes?: string[];
  acceptedImageTypes?: string[];
  selectedElementContext?: { id: string; type: string; dimensions?: string } | null;

  // Props for Autonomous Agent integration
  isAutonomousModeAvailable?: boolean;
  isAutonomousModeEnabled?: boolean; // Reflects if the feature toggle is on
  isRunningAutonomously?: boolean;
  isLoadingAutonomously?: boolean;
  onStartAutonomousTask?: (currentInput: string) => void;
  onInterruptAutonomousTask?: () => void;
}

const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_SIZE_MB = 5; // Increased default max size for images
const DEFAULT_ACCEPTED_TEXT_TYPES = [
  ".txt",
  ".md",
  ".json",
  ".js",
  ".ts",
  "text/plain",
  "text/markdown",
  "application/json",
  "text/javascript",
  "application/typescript"
];
const DEFAULT_ACCEPTED_IMAGE_TYPES = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
];
const TYPING_TIMEOUT_MS = 1500; // 1.5 seconds delay for showing typing indicator

// Define tool descriptions
const toolDescriptions: Record<ToolName, string> = {
  textToCAD: "Force direct text-to-CAD conversion. Use for specific geometry creation from text.",
  generateCADElement: "Generate a new CAD element based on your description.",
  updateCADElement: "Modify existing CAD element(s) based on your instructions.",
  removeCADElement: "Delete specified CAD element(s) from the design.",
  chainOfThoughtAnalysis: "Show the AI step-by-step reasoning process for the query.",
  suggestOptimizations: "Get suggestions to optimize the current CAD design or workflow.",
  exportCADProjectAsZip: "Export the entire current CAD project as a ZIP file.",
  autoQuoteCADElements: "Automatically generate a price quote for designed CAD elements.",
  analyzeManufacturability: "Analyze the design for potential manufacturing issues or complexities.",
  generate2DTechnicalDrawings: "Create 2D technical drawings (e.g., blueprints) from the 3D model.",
  simulatePhysicalProperties: "Simulate physical properties (e.g., stress, heat) on the model.",
  thinkAloudMode: "Toggle AI thinking process visibility.",
  webSearch: "Search the web for CAD/CAM information, tutorials, and best practices.",
  codeInterpreter: "Execute Python code for advanced CAD analysis and visualization.",
  autonomousTask: "Start or manage an autonomous CAD task.",
  imageAnalysis: "Analyze uploaded images to extract CAD-relevant information, measurements, or design insights." // NUOVO
};

export const AIMessageInput: React.FC<AIMessageInputProps> = ({
  onSendMessage,
  isProcessing,
  placeholder = "Type a message...",
  maxFiles = DEFAULT_MAX_FILES,
  maxFileSizeMB = DEFAULT_MAX_SIZE_MB,
  acceptedTextTypes = DEFAULT_ACCEPTED_TEXT_TYPES,
  acceptedImageTypes = DEFAULT_ACCEPTED_IMAGE_TYPES,
  selectedElementContext,
  isAutonomousModeAvailable = false,
  isAutonomousModeEnabled = false,
  isRunningAutonomously = false,
  isLoadingAutonomously = false,
  onStartAutonomousTask,
  onInterruptAutonomousTask
}) => {
  const [inputMessage, setInputMessage] = useState("");
  const [selectedFilesData, setSelectedFilesData] = useState<SelectedFileData[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolName | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [showReferenceMenu, setShowReferenceMenu] = useState(false);
  const [showMCPToolsModal, setShowMCPToolsModal] = useState(false);
  const [showContextModal, setShowContextModal] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get active context count
  const { activeContextIds } = useContextStore();

  // Combine accepted types explicitly avoiding Set spread for compatibility
  const combinedTypes = acceptedTextTypes.concat(acceptedImageTypes);
  const uniqueTypes = combinedTypes.filter((value, index, self) => self.indexOf(value) === index);
  const allAcceptedTypesString = uniqueTypes.join(",");

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(event.target.value);

    // Handle auto-resize
    event.target.style.height = "auto";
    event.target.style.height = `${event.target.scrollHeight}px`;

    // Handle typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    setIsTyping(true);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, TYPING_TIMEOUT_MS);
  };

  const handleSendClick = () => {
    if (activeTool || inputMessage.trim() || selectedFilesData.length > 0) {
      onSendMessage(inputMessage.trim(), selectedFilesData, activeTool);
      setInputMessage("");
      setSelectedFilesData([]);
      setActiveTool(null);
      // Reset typing state immediately on send
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setIsTyping(false);

      const textarea = document.getElementById("ai-message-textarea");
      if (textarea) textarea.style.height = "auto";
    }
  };

  const handleToolButtonClick = (toolName: ToolName) => {
    if (toolName === "autonomousTask") {
      if (isRunningAutonomously && onInterruptAutonomousTask) {
        // Always call interrupt and show immediate feedback

        onInterruptAutonomousTask();
        toast.success("Autonomous task interrupted", { duration: 2000 });
      } else if (!isRunningAutonomously && !isLoadingAutonomously && onStartAutonomousTask && isAutonomousModeEnabled) {

        onStartAutonomousTask(inputMessage);
        // Clear input after starting autonomous task
        setInputMessage("");
      }
      return;
    }
    setActiveTool(currentTool => (currentTool === toolName ? null : toolName));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendClick();
    } else if (event.key === "/" && !showCommandMenu && inputMessage === "") {
      event.preventDefault();
      setShowCommandMenu(true);
    } else if (event.key === "@" && !showReferenceMenu) {
      event.preventDefault();
      setShowReferenceMenu(true);
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    if (!event.target.files) return;

    const newFiles = Array.from(event.target.files);
    let currentFileCount = selectedFilesData.length;
    let errors: string[] = [];
    let promises: Promise<SelectedFileData>[] = [];

    if (currentFileCount + newFiles.length > maxFiles) {
      errors.push(`Cannot select more than ${maxFiles} files.`);
    } else {
      newFiles.forEach(file => {
        const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();
        const isText = acceptedTextTypes.includes(file.type) || acceptedTextTypes.includes(fileExtension);
        const isImage = acceptedImageTypes.includes(file.type) || acceptedImageTypes.includes(fileExtension);

        if (!isText && !isImage) {
          errors.push(`File type not allowed: ${file.name}`);
          return;
        }
        if (file.size > maxFileSizeMB * 1024 * 1024) {
          errors.push(`File too large: ${file.name} (max ${maxFileSizeMB}MB)`);
          return;
        }
        if (selectedFilesData.some(existing => existing.name === file.name)) {
          // Silently ignore duplicates already selected
          return;
        }

        // Create promise to read file content
        promises.push(
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                name: file.name,
                type: isImage ? "image" : "text",
                content: reader.result as string, // Base64 for images, text for text
                fileType: file.type
              });
            };
            reader.onerror = error => reject(`Error reading ${file.name}: ${error}`);

            if (isImage) {
              reader.readAsDataURL(file); // Read image as Base64 data URL
            } else {
              reader.readAsText(file); // Read text as plain text
            }
          })
        );
      });
    }

    Promise.all(promises)
      .then(results => {
        setSelectedFilesData(prev => [...prev, ...results]);
      })
      .catch(readError => {
        errors.push(readError);
      })
      .finally(() => {
        if (errors.length > 0) {
          const errorMsg = errors.join(" ");
          setFileError(errorMsg);
          toast.error(errorMsg, { duration: 4000 });
        }
      });

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (fileName: string) => {
    setSelectedFilesData(prevData => prevData.filter(file => file.name !== fileName));
  };

  const handleCommandSelect = (command: string) => {
    setShowCommandMenu(false);
    setInputMessage(command + " ");
    textareaRef.current?.focus();
  };

  const handleReferenceSelect = (
    refType: "selectedElement" | "currentProject" | "editSelection" | "allElements" | "measurements" | "constraints"
  ) => {
    setShowReferenceMenu(false);
    setInputMessage(prev => prev + `@${refType} `);
    textareaRef.current?.focus();
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="p-3 border-t bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border-white/20 dark:border-gray-700/50 relative">
      {/* MCP Tools Modal */}
      <MCPToolsStatusModal isOpen={showMCPToolsModal} onClose={() => setShowMCPToolsModal(false)} />

      {/* Context Panel Modal */}
      {showContextModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl shadow-2xl max-w-2xl w-full max-h-[98vh] overflow-hidden border border-white/20 dark:border-gray-700/50 flex flex-col">
            <div className="p-4 border-b border-white/20 dark:border-gray-700/50 flex justify-between items-center bg-gradient-to-r from-blue-500/80 via-blue-600/80 to-indigo-700/80 text-white backdrop-blur-sm flex-shrink-0">
              <h2 className="text-lg font-semibold">Context Files</h2>
              <button
                onClick={() => setShowContextModal(false)}
                className="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-hidden min-h-[98vh] custom-scrollbar sidebar-scrollable">
              <ContextPanel
                className="border-0 shadow-none rounded-none h-full"
                isExpanded={true}
                onToggle={() => setShowContextModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      {fileError && (
        <div className="mb-2 text-xs text-red-600 flex items-center bg-red-50/70 dark:bg-red-900/20 backdrop-blur-sm border border-red-200/50 dark:border-red-700/50 rounded-lg p-2">
          <AlertCircle size={14} className="mr-1" /> {fileError}
        </div>
      )}

      {selectedFilesData.length > 0 && (
        <div className="mb-2 text-xs flex flex-wrap gap-1 bg-gray-50/70 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-lg p-2">
          <span className="font-medium self-center text-gray-700 dark:text-gray-300">Files:</span>
          {selectedFilesData.map(fileData => (
            <span
              key={fileData.name}
              title={fileData.name}
              className="inline-flex max-w-[150px] items-center bg-white/60 dark:bg-gray-700/60 backdrop-blur-sm rounded-lg px-2 py-1 border border-white/30 dark:border-gray-600/50"
            >
              {fileData.type === "image" && <ImageIcon size={12} className="mr-1 flex-shrink-0" />}
              <span className="truncate flex-shrink min-w-0">{fileData.name}</span>
              <button
                onClick={() => removeFile(fileData.name)}
                className="ml-1 text-gray-500 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 flex-shrink-0 p-0.5 rounded hover:bg-red-100/50 dark:hover:bg-red-900/20 transition-colors"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Tools Container with Glassmorphism */}
      <div className="mb-3 bg-gradient-to-r from-blue-50/80 via-indigo-50/80 to-purple-50/80 dark:from-gray-800/60 dark:via-gray-700/60 dark:to-gray-800/60 backdrop-blur-sm border border-white/30 dark:border-gray-600/50 rounded-xl p-3">
        <div className="flex space-x-1 flex-wrap gap-y-1">
          <div className="relative group">
            <button
              onClick={() => handleToolButtonClick("textToCAD")}
              disabled={isProcessing}
              className={`p-1.5 rounded-lg border transition-all duration-200 text-xs backdrop-blur-sm ${activeTool === "textToCAD"
                ? "bg-purple-500/80 border-purple-400/60 text-white shadow-lg shadow-purple-500/25"
                : "bg-white/60 border-white/40 text-gray-600 hover:bg-white/80 hover:shadow-md dark:bg-gray-700/60 dark:border-gray-600/50 dark:text-gray-300 dark:hover:bg-gray-600/70"
                }`}
            >
              <Type size={14} />
            </button>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white text-xs rounded-lg py-1 px-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 max-w-xs text-center border border-gray-700/50">
              {toolDescriptions.textToCAD}
            </span>
          </div>
          <div className="relative group">
            <button
              onClick={() => handleToolButtonClick("generateCADElement")}
              disabled={isProcessing}
              className={`p-1.5 rounded-lg border transition-all duration-200 text-xs backdrop-blur-sm ${activeTool === "generateCADElement"
                ? "bg-blue-500/80 border-blue-400/60 text-white shadow-lg shadow-blue-500/25"
                : "bg-white/60 border-white/40 text-gray-600 hover:bg-white/80 hover:shadow-md dark:bg-gray-700/60 dark:border-gray-600/50 dark:text-gray-300 dark:hover:bg-gray-600/70"
                }`}
            >
              <Plus size={14} />
            </button>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white text-xs rounded-lg py-1 px-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 max-w-xs text-center border border-gray-700/50">
              {toolDescriptions.generateCADElement}
            </span>
          </div>
          <div className="relative group">
            <button
              onClick={() => handleToolButtonClick("updateCADElement")}
              disabled={isProcessing}
              className={`p-1.5 rounded-lg border transition-all duration-200 text-xs backdrop-blur-sm ${activeTool === "updateCADElement"
                ? "bg-yellow-500/80 border-yellow-400/60 text-white shadow-lg shadow-yellow-500/25"
                : "bg-white/60 border-white/40 text-gray-600 hover:bg-white/80 hover:shadow-md dark:bg-gray-700/60 dark:border-gray-600/50 dark:text-gray-300 dark:hover:bg-gray-600/70"
                }`}
            >
              <Edit3 size={14} />
            </button>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white text-xs rounded-lg py-1 px-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 max-w-xs text-center border border-gray-700/50">
              {toolDescriptions.updateCADElement}
            </span>
          </div>
          <div className="relative group">
            <button
              onClick={() => handleToolButtonClick("removeCADElement")}
              disabled={isProcessing}
              className={`p-1.5 rounded-lg border transition-all duration-200 text-xs backdrop-blur-sm ${activeTool === "removeCADElement"
                ? "bg-red-500/80 border-red-400/60 text-white shadow-lg shadow-red-500/25"
                : "bg-white/60 border-white/40 text-gray-600 hover:bg-white/80 hover:shadow-md dark:bg-gray-700/60 dark:border-gray-600/50 dark:text-gray-300 dark:hover:bg-gray-600/70"
                }`}
            >
              <Trash size={14} />
            </button>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white text-xs rounded-lg py-1 px-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 max-w-xs text-center border border-gray-700/50">
              {toolDescriptions.removeCADElement}
            </span>
          </div>
          <div className="relative group">
            <button
              onClick={() => handleToolButtonClick("chainOfThoughtAnalysis")}
              disabled={isProcessing}
              className={`p-1.5 rounded-lg border transition-all duration-200 text-xs backdrop-blur-sm ${activeTool === "chainOfThoughtAnalysis"
                ? "bg-pink-500/80 border-pink-400/60 text-white shadow-lg shadow-pink-500/25"
                : "bg-white/60 border-white/40 text-gray-600 hover:bg-white/80 hover:shadow-md dark:bg-gray-700/60 dark:border-gray-600/50 dark:text-gray-300 dark:hover:bg-gray-600/70"
                }`}
            >
              <Brain size={14} />
            </button>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white text-xs rounded-lg py-1 px-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 max-w-xs text-center border border-gray-700/50">
              {toolDescriptions.chainOfThoughtAnalysis}
            </span>
          </div>
          <div className="relative group">
            <button
              onClick={() => handleToolButtonClick("suggestOptimizations")}
              disabled={isProcessing}
              className={`p-1.5 rounded-lg border transition-all duration-200 text-xs backdrop-blur-sm ${activeTool === "suggestOptimizations"
                ? "bg-orange-500/80 border-orange-400/60 text-white shadow-lg shadow-orange-500/25"
                : "bg-white/60 border-white/40 text-gray-600 hover:bg-white/80 hover:shadow-md dark:bg-gray-700/60 dark:border-gray-600/50 dark:text-gray-300 dark:hover:bg-gray-600/70"
                }`}
            >
              <List size={14} />
            </button>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white text-xs rounded-lg py-1 px-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 max-w-xs text-center border border-gray-700/50">
              {toolDescriptions.suggestOptimizations}
            </span>
          </div>
          <div className="relative group">
            <button
              onClick={() => handleToolButtonClick("exportCADProjectAsZip")}
              disabled={isProcessing}
              className={`p-1.5 rounded-lg border transition-all duration-200 text-xs backdrop-blur-sm ${activeTool === "exportCADProjectAsZip"
                ? "bg-fuchsia-500/80 border-fuchsia-400/60 text-white shadow-lg shadow-fuchsia-500/25"
                : "bg-white/60 border-white/40 text-gray-600 hover:bg-white/80 hover:shadow-md dark:bg-gray-700/60 dark:border-gray-600/50 dark:text-gray-300 dark:hover:bg-gray-600/70"
                }`}
            >
              <ExternalLink size={14} />
            </button>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white text-xs rounded-lg py-1 px-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 max-w-xs text-center border border-gray-700/50">
              {toolDescriptions.exportCADProjectAsZip}
            </span>
          </div>
          <div className="relative group">
            <button
              onClick={() => handleToolButtonClick("autoQuoteCADElements")}
              disabled={isProcessing}
              className={`p-1.5 rounded-lg border transition-all duration-200 text-xs backdrop-blur-sm ${activeTool === "autoQuoteCADElements"
                ? "bg-green-500/80 border-green-400/60 text-white shadow-lg shadow-green-500/25"
                : "bg-white/60 border-white/40 text-gray-600 hover:bg-white/80 hover:shadow-md dark:bg-gray-700/60 dark:border-gray-600/50 dark:text-gray-300 dark:hover:bg-gray-600/70"
                }`}
            >
              <Ruler size={14} />
            </button>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white text-xs rounded-lg py-1 px-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 max-w-xs text-center border border-gray-700/50">
              {toolDescriptions.autoQuoteCADElements}
            </span>
          </div>
          <div className="relative group">
            <button
              onClick={() => handleToolButtonClick("analyzeManufacturability")}
              disabled={isProcessing}
              className={`p-1.5 rounded-lg border transition-all duration-200 text-xs backdrop-blur-sm ${activeTool === "analyzeManufacturability"
                ? "bg-emerald-500/80 border-emerald-400/60 text-white shadow-lg shadow-emerald-500/25"
                : "bg-white/60 border-white/40 text-gray-600 hover:bg-white/80 hover:shadow-md dark:bg-gray-700/60 dark:border-gray-600/50 dark:text-gray-300 dark:hover:bg-gray-600/70"
                }`}
            >
              <Tool size={14} />
            </button>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white text-xs rounded-lg py-1 px-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 max-w-xs text-center border border-gray-700/50">
              {toolDescriptions.analyzeManufacturability}
            </span>
          </div>
          <div className="relative group">
            <button
              onClick={() => handleToolButtonClick("generate2DTechnicalDrawings")}
              disabled={isProcessing}
              className={`p-1.5 rounded-lg border transition-all duration-200 text-xs backdrop-blur-sm ${activeTool === "generate2DTechnicalDrawings"
                ? "bg-cyan-500/80 border-cyan-400/60 text-white shadow-lg shadow-cyan-500/25"
                : "bg-white/60 border-white/40 text-gray-600 hover:bg-white/80 hover:shadow-md dark:bg-gray-700/60 dark:border-gray-600/50 dark:text-gray-300 dark:hover:bg-gray-600/70"
                }`}
            >
              <BookOpen size={14} />
            </button>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white text-xs rounded-lg py-1 px-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 max-w-xs text-center border border-gray-700/50">
              {toolDescriptions.generate2DTechnicalDrawings}
            </span>
          </div>
          <div className="relative group">
            <button
              onClick={() => handleToolButtonClick("simulatePhysicalProperties")}
              disabled={isProcessing}
              className={`p-1.5 rounded-lg border transition-all duration-200 text-xs backdrop-blur-sm ${activeTool === "simulatePhysicalProperties"
                ? "bg-amber-500/80 border-amber-400/60 text-white shadow-lg shadow-amber-500/25"
                : "bg-white/60 border-white/40 text-gray-600 hover:bg-white/80 hover:shadow-md dark:bg-gray-700/60 dark:border-gray-600/50 dark:text-gray-300 dark:hover:bg-gray-600/70"
                }`}
            >
              <Hammer size={14} />
            </button>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white text-xs rounded-lg py-1 px-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 max-w-xs text-center border border-gray-700/50">
              {toolDescriptions.simulatePhysicalProperties}
            </span>
          </div>
          <div className="relative group">
            <button
              onClick={() => handleToolButtonClick("webSearch")}
              disabled={isProcessing}
              className={`p-1.5 rounded-lg border transition-all duration-200 text-xs backdrop-blur-sm ${activeTool === "webSearch"
                ? "bg-indigo-500/80 border-indigo-400/60 text-white shadow-lg shadow-indigo-500/25"
                : "bg-white/60 border-white/40 text-gray-600 hover:bg-white/80 hover:shadow-md dark:bg-gray-700/60 dark:border-gray-600/50 dark:text-gray-300 dark:hover:bg-gray-600/70"
                }`}
            >
              <Search size={14} />
            </button>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white text-xs rounded-lg py-1 px-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 max-w-xs text-center border border-gray-700/50">
              {toolDescriptions.webSearch}
            </span>
          </div>
          <div className="relative group">
            <button
              onClick={() => handleToolButtonClick("codeInterpreter")}
              disabled={isProcessing}
              className={`p-1.5 rounded-lg border transition-all duration-200 text-xs backdrop-blur-sm ${activeTool === "codeInterpreter"
                ? "bg-orange-500/80 border-orange-400/60 text-white shadow-lg shadow-orange-500/25"
                : "bg-white/60 border-white/40 text-gray-600 hover:bg-white/80 hover:shadow-md dark:bg-gray-700/60 dark:border-gray-600/50 dark:text-gray-300 dark:hover:bg-gray-600/70"
                }`}
            >
              <Terminal size={14} />
            </button>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white text-xs rounded-lg py-1 px-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 max-w-xs text-center border border-gray-700/50">
              {toolDescriptions.codeInterpreter}
            </span>
          </div>
          <div className="relative group">
            <button
              onClick={() => handleToolButtonClick("imageAnalysis")}
              disabled={isProcessing}
              className={`p-1.5 rounded-lg border transition-all duration-200 text-xs backdrop-blur-sm ${activeTool === "imageAnalysis"
                  ? "bg-teal-500/80 border-teal-400/60 text-white shadow-lg shadow-teal-500/25"
                  : "bg-white/60 border-white/40 text-gray-600 hover:bg-white/80 hover:shadow-md dark:bg-gray-700/60 dark:border-gray-600/50 dark:text-gray-300 dark:hover:bg-gray-600/70"
                }`}
            >
              <ImageIcon size={14} />
            </button>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white text-xs rounded-lg py-1 px-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 max-w-xs text-center border border-gray-700/50">
              {toolDescriptions.imageAnalysis}
            </span>
          </div>
          <div className="relative group mt-1.5">
            <button
              onClick={() => handleToolButtonClick("autonomousTask")}
              disabled={isProcessing || (isLoadingAutonomously && !isRunningAutonomously)}
              className={`p-1.5 rounded-lg border text-xs flex items-center transition-all duration-200 backdrop-blur-sm min-w-[90px] justify-center ${isRunningAutonomously
                ? "bg-red-500/80 border-red-400/60 text-white shadow-lg shadow-red-500/25 hover:bg-red-600/80"
                : isLoadingAutonomously
                  ? "bg-yellow-500/80 border-yellow-400/60 text-white shadow-lg shadow-yellow-500/25"
                  : activeTool === "autonomousTask"
                    ? "bg-teal-500/80 border-teal-400/60 text-white shadow-lg shadow-teal-500/25"
                    : "bg-white/60 border-white/40 text-gray-600 hover:bg-white/80 hover:shadow-md dark:bg-gray-700/60 dark:border-gray-600/50 dark:text-gray-300 dark:hover:bg-gray-600/70"
                }`}
            >
              {isRunningAutonomously ? (
                <>
                  <PauseCircle size={14} className="mr-1" />
                  Stop
                </>
              ) : isLoadingAutonomously ? (
                <>
                  <Loader size={14} className="mr-1 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <CpuIcon size={14} className="mr-1" />
                  Auto
                </>
              )}
            </button>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white text-xs rounded-lg py-1 px-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 max-w-xs text-center border border-gray-700/50">
              {isRunningAutonomously ? "Stop current autonomous task" : isLoadingAutonomously ? "Autonomous task is starting..." : toolDescriptions.autonomousTask}
            </span>
          </div>
        </div>
      </div>

      <div className="flex space-x-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            id="ai-message-textarea"
            value={inputMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={activeTool ? `Input for ${activeTool}...` : placeholder}
            className="w-full p-3 pr-10 bg-white/70 dark:bg-gray-700/70 backdrop-blur-xl border border-white/30 dark:border-gray-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 dark:text-white resize-none min-h-[44px] max-h-[120px] shadow-lg transition-all duration-200"
            disabled={isProcessing}
            rows={1}
          />

          {showCommandMenu && (
            <CommandMenu onSelectCommand={handleCommandSelect} onClose={() => setShowCommandMenu(false)} />
          )}

          {showReferenceMenu && (
            <ReferenceMenu
              onSelectReference={handleReferenceSelect}
              hasSelectedElement={!!selectedElementContext}
              selectedElementInfo={selectedElementContext || undefined}
              onClose={() => setShowReferenceMenu(false)}
            />
          )}
        </div>

        <div className="flex items-end space-x-2">
          <button
            onClick={() => setShowContextModal(true)}
            className={`p-2 rounded-xl bg-white/60 hover:bg-white/80 dark:bg-gray-700/60 dark:hover:bg-gray-600/70 text-gray-600 dark:text-gray-400 transition-all duration-200 backdrop-blur-sm border border-white/30 dark:border-gray-600/50 relative shadow-lg hover:shadow-xl ${isProcessing ? "opacity-50 cursor-not-allowed" : ""
              }`}
            title="Manage Context Files"
            disabled={isProcessing}
          >
            <File size={18} />
            {activeContextIds.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shadow-lg">
                {activeContextIds.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowMCPToolsModal(true)}
            className={`p-2 rounded-xl bg-white/60 hover:bg-white/80 dark:bg-gray-700/60 dark:hover:bg-gray-600/70 text-gray-600 dark:text-gray-400 transition-all duration-200 backdrop-blur-sm border border-white/30 dark:border-gray-600/50 shadow-lg hover:shadow-xl ${isProcessing ? "opacity-50 cursor-not-allowed" : ""
              }`}
            title="View Active MCP Tools"
            disabled={isProcessing}
          >
            <Layers size={18} />
          </button>
          <button
            onClick={handleAttachClick}
            className={`p-2 rounded-xl transition-all duration-200 backdrop-blur-sm border border-white/30 dark:border-gray-600/50 shadow-lg hover:shadow-xl ${isProcessing
              ? "bg-gray-300/60 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              : "bg-white/60 hover:bg-white/80 dark:bg-gray-700/60 dark:hover:bg-gray-600/70 text-gray-600 dark:text-gray-400"
              }`}
            title="Attach image"
            disabled={isProcessing}
          >
            <Paperclip size={20} />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept={allAcceptedTypesString}
            className="hidden"
            multiple
            disabled={isProcessing}
          />

          <button
            onClick={handleSendClick}
            disabled={
              isProcessing ||
              (!activeTool && !inputMessage.trim() && selectedFilesData.length === 0 && !isRunningAutonomously)
            }
            className={`p-2 rounded-xl transition-all duration-200 backdrop-blur-sm border shadow-lg hover:shadow-xl ${isProcessing ||
              (!activeTool && !inputMessage.trim() && selectedFilesData.length === 0 && !isRunningAutonomously)
              ? "bg-gray-300/60 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 cursor-not-allowed border-gray-300/50 dark:border-gray-600/50"
              : "bg-blue-500/80 hover:bg-blue-600/80 text-white border-blue-400/60 shadow-blue-500/25"
              }`}
            title="Send message"
          >
            {isProcessing ? <Loader size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </div>
      </div>

      {/* Command Bar */}
      <div className="mt-3 flex justify-between text-xs text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-800/30 backdrop-blur-sm rounded-lg p-2 border border-white/20 dark:border-gray-700/50">
        <div className="flex space-x-3">
          <span className="flex items-center">
            <kbd className="px-2 py-1 bg-white/60 dark:bg-gray-700/60 backdrop-blur-sm rounded-md border border-white/30 dark:border-gray-600/50 text-gray-700 dark:text-gray-300 font-mono text-xs">Enter</kbd>
            <span className="ml-1">send</span>
          </span>
          <span className="flex items-center">
            <kbd className="px-2 py-1 bg-white/60 dark:bg-gray-700/60 backdrop-blur-sm rounded-md border border-white/30 dark:border-gray-600/50 text-gray-700 dark:text-gray-300 font-mono text-xs">Shift+Enter</kbd>
            <span className="ml-1">new line</span>
          </span>
          <span className="flex items-center">
            <kbd className="px-2 py-1 bg-white/60 dark:bg-gray-700/60 backdrop-blur-sm rounded-md border border-white/30 dark:border-gray-600/50 text-gray-700 dark:text-gray-300 font-mono text-xs">/</kbd>
            <span className="ml-1">commands</span>
          </span>
          <span className="flex items-center">
            <kbd className="px-2 py-1 bg-white/60 dark:bg-gray-700/60 backdrop-blur-sm rounded-md border border-white/30 dark:border-gray-600/50 text-gray-700 dark:text-gray-300 font-mono text-xs">@</kbd>
            <span className="ml-1">reference</span>
          </span>
        </div>
      </div>

      {/* Status Bar */}
      <div className="mt-3 flex justify-between text-xs text-gray-500 dark:text-gray-400 border-t border-white/20 dark:border-gray-700/50 pt-2 bg-gradient-to-r from-gray-50/30 via-white/20 to-gray-50/30 dark:from-gray-800/20 dark:via-gray-700/10 dark:to-gray-800/20 backdrop-blur-sm rounded-lg px-3 py-2">
        <div>{/* Left side status */}</div>

        <div>
          {isProcessing && (
            <span className="flex items-center bg-blue-50/70 dark:bg-blue-900/30 backdrop-blur-sm rounded-full px-3 py-1 border border-blue-200/50 dark:border-blue-700/50">
              <Loader size={12} className="animate-spin mr-1" />
              Processing...
            </span>
          )}
          {isLoadingAutonomously && !isRunningAutonomously && (
            <span className="flex items-center text-yellow-600 dark:text-yellow-400 bg-yellow-50/70 dark:bg-yellow-900/30 backdrop-blur-sm rounded-full px-3 py-1 border border-yellow-200/50 dark:border-yellow-700/50">
              <Loader size={12} className="animate-spin mr-1" />
              Starting autonomous...
            </span>
          )}
          {isRunningAutonomously && (
            <span className="flex items-center text-green-600 dark:text-green-400 bg-green-50/70 dark:bg-green-900/30 backdrop-blur-sm rounded-full px-3 py-1 border border-green-200/50 dark:border-green-700/50">
              <CpuIcon size={12} className="animate-pulse mr-1" />
              Autonomous active
              <button
                onClick={() => handleToolButtonClick("autonomousTask")}
                className="ml-2 text-xs bg-red-500/80 hover:bg-red-600/80 text-white px-2 py-0.5 rounded-full transition-colors"
                title="Stop autonomous task"
              >
                Stop
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
