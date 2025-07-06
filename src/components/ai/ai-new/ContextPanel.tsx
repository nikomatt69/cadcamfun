// src/components/ai/ContextPanel.tsx
import React, { useState, useRef } from "react";
import { File, Trash2, Check, Upload, Info, X, BarChart } from "react-feather";
import { useContextStore, ContextFile } from "@/src/store/contextStore";

interface ContextPanelProps {
  className?: string;
  onToggle?: () => void;
  isExpanded: boolean;
}

const ContextPanel: React.FC<ContextPanelProps> = ({ className = "", onToggle, isExpanded }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { 
    contextFiles, 
    activeContextIds, 
    currentSession,
    limits,
    addContextFile, 
    removeContextFile, 
    toggleContextActive, 
    clearAllContexts,
    setSessionTitle,
    setSessionDescription,
    getTotalCharacters,
    getRemainingFiles,
    getRemainingCharacters,
    getUsagePercentage,
    validateContextForModel
  } = useContextStore();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        await addContextFile(files[i]);
      }
      // Reset the input value to allow uploading the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error adding context file:", error);
      setUploadError(error instanceof Error ? error.message : "An error occurred while uploading the file.");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setUploadError(null);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    try {
      for (let i = 0; i < files.length; i++) {
        await addContextFile(files[i]);
      }
    } catch (error) {
      console.error("Error adding context file:", error);
      setUploadError(error instanceof Error ? error.message : "An error occurred while uploading the file.");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    else return (bytes / 1048576).toFixed(1) + " MB";
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  const usagePercentage = getUsagePercentage();
  const totalChars = getTotalCharacters();
  const remainingFiles = getRemainingFiles();
  const remainingChars = getRemainingCharacters();
  const contextValidation = validateContextForModel();

  if (!isExpanded) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center justify-center p-2 bg-blue-100 hover:bg-blue-200 dark:bg-blue-800/30 dark:hover:bg-blue-800/50 text-blue-700 dark:text-blue-300 rounded-md transition-colors"
      >
        <File size={16} className="mr-2" />
        <span className="text-sm font-medium">Show Context</span>
        {activeContextIds.length > 0 && (
          <span className="ml-1 bg-blue-600 text-white dark:bg-blue-500 text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {activeContextIds.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow flex flex-col h-full ${className}`}>
      <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
          <File className="mr-2" size={20} />
          AI Context
        </h2>
        <button
          onClick={onToggle}
          className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          aria-label="Close context panel"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {/* Session Title */}
        <div>
          <label htmlFor="session-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Context Title
          </label>
          <input
            id="session-title"
            type="text"
            value={currentSession.title}
            onChange={(e) => setSessionTitle(e.target.value)}
            placeholder="Enter a title for this context session..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
          />
        </div>

        {/* Session Description */}
        <div>
          <label htmlFor="session-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            id="session-description"
            value={currentSession.description}
            onChange={(e) => setSessionDescription(e.target.value)}
            placeholder="Describe the context or purpose of these files..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm resize-none"
          />
        </div>

        {/* Usage Statistics */}
        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
          <div className="flex items-center mb-2">
            <BarChart size={16} className="text-gray-600 dark:text-gray-400 mr-2" />
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Usage Statistics</h3>
          </div>
          
          {/* Files Usage */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
              <span>Files: {contextFiles.length} / {limits.maxFiles}</span>
              <span>{remainingFiles} remaining</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  usagePercentage.files > 90 ? 'bg-red-500' : 
                  usagePercentage.files > 70 ? 'bg-yellow-500' : 'bg-blue-500'
                }`}
                style={{ width: `${usagePercentage.files}%` }}
              />
            </div>
          </div>

          {/* Characters Usage */}
          <div>
            <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
              <span>Characters: {formatNumber(totalChars)} / {formatNumber(limits.maxTotalCharacters)}</span>
              <span>{formatNumber(remainingChars)} remaining</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  usagePercentage.characters > 90 ? 'bg-red-500' : 
                  usagePercentage.characters > 70 ? 'bg-yellow-500' : 'bg-blue-500'
                }`}
                style={{ width: `${usagePercentage.characters}%` }}
              />
            </div>
          </div>
        </div>

        {/* Context Validation Warning */}
        {!contextValidation.isValid && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md border border-yellow-200 dark:border-yellow-800">
            <div className="flex">
              <Info size={18} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5 mr-2" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Performance Warning</p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  {contextValidation.warning}
                </p>
                {contextValidation.recommendation && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                    💡 {contextValidation.recommendation}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Performance Indicator */}
        {usagePercentage.characters > 70 && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
            <div className="flex">
              <Info size={18} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5 mr-2" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Performance Notice</p>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Large contexts may result in slower AI response times (8-15 seconds). 
                  {usagePercentage.characters > 85 && " Consider removing some files for better performance."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Context information */}
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
          <div className="flex">
            <Info size={18} className="text-blue-500 flex-shrink-0 mt-0.5 mr-2" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Add documents or text files to provide additional context to the AI for improved CAD model generation.
            </p>
          </div>
        </div>

        {/* Upload area */}
        <div
          className={`border-2 border-dashed rounded-md p-4 text-center transition-colors ${
            dragActive
              ? "border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20"
              : "border-gray-300 dark:border-gray-600"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload size={24} className="mx-auto text-gray-400 dark:text-gray-500 mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Drag files here or</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
            id="context-file-input"
            accept=".txt,.pdf,.doc,.docx,.md,.json"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={remainingFiles <= 0}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              remainingFiles <= 0 
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {remainingFiles <= 0 ? 'File limit reached' : 'Select Files'}
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Supported formats: TXT, PDF, DOC, DOCX, MD, JSON (Max: {(limits.maxFileSize / (1024 * 1024)).toFixed(1)}MB per file)
          </p>
        </div>

        {uploadError && (
          <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm rounded-md">
            {uploadError}
          </div>
        )}

        {/* File list */}
        {contextFiles.length > 0 ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Context files ({contextFiles.length})
              </h3>
              <button
                onClick={clearAllContexts}
                className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
              >
                Remove all
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
              {contextFiles.map(file => (
                <div
                  key={file.id}
                  className="flex justify-between items-center p-2 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => toggleContextActive(file.id)}
                      className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                        activeContextIds.includes(file.id) ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-700"
                      }`}
                      aria-label={activeContextIds.includes(file.id) ? "Deactivate file" : "Activate file"}
                    >
                      {activeContextIds.includes(file.id) && <Check size={14} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{file.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFileSize(file.size)} • {formatNumber(file.content.length)} chars • {new Date(file.dateAdded).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeContextFile(file.id)}
                    className="p-1 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                    aria-label="Remove file"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ContextPanel;
