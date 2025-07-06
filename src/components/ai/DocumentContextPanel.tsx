import React, { useState } from "react";
import { File, X, Eye, EyeOff, FileText } from "react-feather";
import DocumentAnalyzer from "./DocumentAnalyzer";
import { useContextStore } from "@/src/store/contextStore";

interface DocumentContextPanelProps {
  className?: string;
}

/**
 * A panel for displaying and analyzing context documents
 * Integrates with ML-powered document analysis
 */
export const DocumentContextPanel: React.FC<DocumentContextPanelProps> = ({ className = "" }) => {
  const { contextFiles, activeContextIds, setActiveContexts } = useContextStore();
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const [analyzedFileId, setAnalyzedFileId] = useState<string | null>(null);

  // Toggle document active state
  const toggleDocumentActive = (fileId: string) => {
    if (activeContextIds.includes(fileId)) {
      setActiveContexts(activeContextIds.filter(id => id !== fileId));
    } else {
      setActiveContexts([...activeContextIds, fileId]);
    }
  };

  // Toggle document content expansion
  const toggleExpand = (fileId: string) => {
    setExpandedFileId(expandedFileId === fileId ? null : fileId);
  };

  // Toggle document analysis
  const toggleAnalysis = (fileId: string) => {
    setAnalyzedFileId(analyzedFileId === fileId ? null : fileId);
  };

  // Handle analysis completion
  const handleAnalysisComplete = (fileId: string, result: any) => {
    console.log(`Analysis complete for file ${fileId}:`, result);
  };

  // Format file size
  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={`document-context-panel ${className}`}>
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 overflow-hidden">
        <div className="bg-gray-100 dark:bg-gray-800 p-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-medium flex items-center">
            <FileText size={16} className="mr-2 text-blue-500" />
            Document Context
          </h2>
        </div>

        {contextFiles.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            <p>No context documents added.</p>
            <p className="text-sm mt-1">Add documents to improve AI understanding of your project.</p>
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto">
            {contextFiles.map(file => (
              <div key={file.id} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                <div className="p-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center flex-1 min-w-0">
                    <File
                      size={16}
                      className={activeContextIds.includes(file.id) ? "text-blue-500" : "text-gray-400"}
                    />
                    <div className="ml-2 flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{file.name}</div>
                      <div className="text-xs text-gray-500">
                        {formatFileSize(file.size || 0)} · {new Date(file?.dateAdded || 0).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => toggleDocumentActive(file.id)}
                      className={`p-1.5 rounded-full ${
                        activeContextIds.includes(file.id)
                          ? "text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/30"
                          : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                      }`}
                      title={activeContextIds.includes(file.id) ? "Deactivate document" : "Activate document"}
                    >
                      {activeContextIds.includes(file.id) ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>

                    <button
                      onClick={() => toggleExpand(file.id)}
                      className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                      title="Toggle content"
                    >
                      {expandedFileId === file.id ? <X size={16} /> : <FileText size={16} />}
                    </button>
                  </div>
                </div>

                {expandedFileId === file.id && (
                  <div className="px-3 pb-3">
                    <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-2 max-h-[150px] overflow-y-auto">
                      <pre className="text-xs whitespace-pre-wrap text-gray-700 dark:text-gray-300">{file.content}</pre>
                    </div>

                    <div className="mt-2 flex justify-between">
                      <button
                        onClick={() => toggleAnalysis(file.id)}
                        className="px-3 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 dark:text-blue-400 rounded border border-blue-200 dark:border-blue-900/30"
                      >
                        {analyzedFileId === file.id ? "Hide Analysis" : "Analyze Document"}
                      </button>
                    </div>

                    {analyzedFileId === file.id && (
                      <div className="mt-3">
                        <DocumentAnalyzer
                          documentText={file.content || ""}
                          documentId={file.id}
                          onAnalysisComplete={result => handleAnalysisComplete(file.id, result)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentContextPanel;
