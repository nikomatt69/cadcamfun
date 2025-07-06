// src/components/ai/AIArtifactRenderer.tsx
import React, { useState } from "react";
import { AIArtifact, AIAction } from "../../../../types/AITypes";
import { CADElementPreview } from "./CADElementPreview";
import { Download, File, Image, Code, FileText, Archive } from "react-feather";

// Interface for file data from code interpreter
interface CodeInterpreterFile {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  downloadUrl: string;
}

interface AIArtifactRendererProps {
  artifact: AIArtifact;
  onAddToCanvas?: (cadData: any) => void;
}

export const AIArtifactRenderer: React.FC<AIArtifactRendererProps> = ({ artifact, onAddToCanvas }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Helper function to format file sizes
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Helper function to get file icon based on content type
  const getFileIcon = (contentType: string, filename: string) => {
    if (contentType.startsWith('image/')) return <Image size={16} />;
    if (contentType.startsWith('text/') || filename.endsWith('.txt') || filename.endsWith('.md')) return <FileText size={16} />;
    if (contentType.includes('javascript') || contentType.includes('python') || filename.endsWith('.py') || filename.endsWith('.js') || filename.endsWith('.ts')) return <Code size={16} />;
    if (contentType.includes('zip') || contentType.includes('archive')) return <Archive size={16} />;
    return <File size={16} />;
  };

  // Handle copying artifact content
  const handleCopy = () => {
    let contentToCopy = artifact.content;

    // For JSON artifacts, format the content nicely
    if (artifact.type === "json") {
      try {
        if (typeof artifact.content === "string") {
          contentToCopy = JSON.stringify(JSON.parse(artifact.content), null, 2);
        } else if (typeof artifact.content === "object" && artifact.content !== null) {
          contentToCopy = JSON.stringify(artifact.content, null, 2);
        } else {
          contentToCopy = String(artifact.content);
        }
      } catch (e) {
        contentToCopy =
          typeof artifact.content === "string" ? artifact.content : JSON.stringify(artifact.content, null, 2);
      }
    }

    navigator.clipboard.writeText(contentToCopy);
  };

  // Handle adding to canvas
  const handleAddToCanvas = () => {
    if (artifact.type === "cad" && onAddToCanvas) {
      try {
        const cadData = JSON.parse(artifact.content);
        onAddToCanvas(cadData);
      } catch (error) {
        console.error("Failed to parse CAD artifact content:", error);
        // Optionally, provide user feedback about the error
      }
    }
  };

  const renderArtifactContent = () => {
    if (!isExpanded) return null;

    switch (artifact.type) {
      case "code":
        return (
          <div className="max-h-96 overflow-y-auto p-3">
            <pre className="p-4 bg-gray-900/90 dark:bg-gray-950/90 text-gray-100 dark:text-gray-100 rounded-xl overflow-x-auto whitespace-pre-wrap break-words backdrop-blur-sm border border-gray-700/50 shadow-inner">
              <code className="break-words text-sm leading-relaxed">{artifact.content}</code>
            </pre>
          </div>
        );

      case "json":
        try {
          let contentToDisplay = artifact.content;
          if (typeof artifact.content === "string") {
            // If it's a string, try to parse and re-stringify for formatting
            contentToDisplay = JSON.stringify(JSON.parse(artifact.content), null, 2);
          } else if (typeof artifact.content === "object" && artifact.content !== null) {
            // If it's already an object, stringify it directly
            contentToDisplay = JSON.stringify(artifact.content, null, 2);
          } else {
            // Fallback for other types (or null) - convert to string
            contentToDisplay = String(artifact.content);
          }
          return (
            <div className="max-h-96 overflow-y-auto p-3">
              <pre className="p-4 bg-gray-900/90 dark:bg-gray-950/90 text-gray-100 dark:text-gray-100 rounded-xl overflow-x-auto whitespace-pre-wrap break-words backdrop-blur-sm border border-gray-700/50 shadow-inner">
                <code className="break-words text-sm leading-relaxed">{contentToDisplay}</code>
              </pre>
            </div>
          );
        } catch (e) {
          // This catch block would now primarily catch errors from JSON.parse if content was a malformed JSON string
          // or if String(artifact.content) somehow fails, which is unlikely for typical inputs.
          return (
            <div className="max-h-96 overflow-y-auto">
              <pre className="p-3 bg-gray-800 dark:bg-gray-900 text-gray-200 dark:text-gray-200 rounded overflow-x-auto text-xs whitespace-pre-wrap break-words">
                <code className="break-words">
                  {typeof artifact.content === "string" ? artifact.content : JSON.stringify(artifact.content, null, 2)}
                </code>
              </pre>
            </div>
          );
        }

      case "cad":
        // For CAD components, render using CADElementPreview
        try {
          const cadAction = JSON.parse(artifact.content) as AIAction;
          if (cadAction.type === "generateCADElement" && cadAction.payload?.elements) {
            return (
              <div className="p-3">
                <div className="mb-2 text-sm font-medium text-gray-700">{artifact.title || "CAD Preview"}</div>
                <CADElementPreview action={cadAction} />
              </div>
            );
          } else {
            return (
              <div className="max-h-96 overflow-y-auto">
                <pre className="p-3 bg-gray-800 dark:bg-gray-900 text-gray-200 dark:text-gray-200 rounded overflow-x-auto text-xs whitespace-pre-wrap break-words">
                  <code className="break-words">{JSON.stringify(cadAction, null, 2)}</code>
                </pre>
              </div>
            );
          }
        } catch (e) {
          console.error("Failed to parse or render CAD artifact:", e);
          return (
            <div className="max-h-96 overflow-y-auto">
              <pre className="p-3 bg-gray-800 dark:bg-gray-900 text-red-400 dark:text-red-400 rounded overflow-x-auto whitespace-pre-wrap break-words">
                <code className="break-words">Error rendering CAD preview. Raw content: {artifact.content}</code>
              </pre>
            </div>
          );
        }

      case "markdown":
        // Here you could add a markdown renderer
        return (
          <div className="p-4 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl m-3 shadow-md">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {artifact.content}
            </div>
          </div>
        );

      case "files":
        // Handle code interpreter files
        try {
          let files: CodeInterpreterFile[] = [];

          // Handle both single file and array of files
          if (Array.isArray(artifact.content)) {
            files = artifact.content;
          } else if (artifact.content && typeof artifact.content === 'object') {
            files = [artifact.content];
          }

          return (
            <div className="p-3">
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div
                    key={file.id || index}
                    className="p-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-lg hover:bg-white/80 dark:hover:bg-gray-700/60 transition-colors"
                  >
                    <div className="flex items-start space-x-3">
                      <div className="text-blue-500 dark:text-blue-400 flex-shrink-0 pt-1">
                        {getFileIcon(file.contentType, file.filename)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={file.filename}>
                          {file.filename}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(file.size)} • {file.contentType}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">
                          Created: {new Date(file.createdAt).toLocaleString('en-US')}
                        </div>
                      </div>
                    </div>

                    {(file.contentType.startsWith("image/") || file.filename.toLowerCase().endsWith('.png') || file.filename.toLowerCase().endsWith('.jpg') || file.filename.toLowerCase().endsWith('.jpeg') || file.filename.toLowerCase().endsWith('.gif') || file.filename.toLowerCase().endsWith('.webp')) && file.downloadUrl && (
                      <details className="mt-3 group" open>
                        <summary className="cursor-pointer text-xs list-none">
                          <span className="font-medium text-blue-600 dark:text-blue-400 group-hover:underline">🖼️ Image Preview</span>
                        </summary>
                        <div className="mt-2 border-t border-gray-200/50 dark:border-gray-700/50 pt-3">
                          <div className="flex justify-center mb-3">
                            <img
                              src={file.downloadUrl}
                              alt={`Preview of ${file.filename}`}
                              className="max-w-full h-auto rounded-md border border-gray-300/50 dark:border-gray-600/50 shadow-sm bg-white"
                              style={{ maxHeight: "200px" }}
                              loading="lazy"
                              onError={(e) => {
                                console.error('Failed to load image:', file.filename, file.downloadUrl);
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          </div>
                          <div className="flex justify-center">
                            <a
                              href={file.downloadUrl}
                              download={file.filename}
                              className="flex items-center space-x-1 px-4 py-2 text-sm bg-blue-500/80 hover:bg-blue-600/80 text-white rounded-lg transition-colors shadow-md"
                            >
                              <Download size={14} />
                              <span>Download</span>
                            </a>
                          </div>
                        </div>
                      </details>
                    )}

                    {/* Download button for non-image files */}
                    {!(file.contentType.startsWith("image/") || file.filename.toLowerCase().endsWith('.png') || file.filename.toLowerCase().endsWith('.jpg') || file.filename.toLowerCase().endsWith('.jpeg') || file.filename.toLowerCase().endsWith('.gif') || file.filename.toLowerCase().endsWith('.webp')) && (
                      <div className="mt-3 flex justify-end">
                    <a
                      href={file.downloadUrl}
                      download={file.filename}
                      className="flex items-center space-x-1 px-3 py-1.5 text-xs bg-blue-500/80 hover:bg-blue-600/80 text-white rounded-lg transition-colors"
                    >
                      <Download size={12} />
                      <span>Download</span>
                    </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {files.length === 0 && (
                <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                  No files available
                </div>
              )}
            </div>
          );
        } catch (error) {
          console.error("Failed to render files artifact:", error);
          return (
            <div className="p-3 text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-900/30 rounded-lg">
              Error rendering files: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          );
        }

      case "autonomous_report":
        // Handle autonomous task progress reports
        try {
          const report = artifact.content;
          return (
            <div className="p-3">
              <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-gray-800/60 dark:to-gray-700/60 backdrop-blur-sm border border-blue-200/50 dark:border-gray-600/50 rounded-xl p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {report.totalIterations || 0}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Iterations</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {report.finalQualityScore || 0}%
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Quality Score</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {report.elementsGenerated || 0}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Elements</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {report.duration ? Math.round(report.duration / 1000) : 0}s
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Duration</div>
                  </div>
                </div>

                {report.summary && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Summary</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{report.summary}</p>
                  </div>
                )}

                {report.achievements && report.achievements.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Achievements</h4>
                    <div className="space-y-1">
                      {report.achievements.map((achievement: string, index: number) => (
                        <div key={index} className="text-sm text-green-600 dark:text-green-400">
                          • {achievement}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {report.recommendations && report.recommendations.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Recommendations</h4>
                    <div className="space-y-1">
                      {report.recommendations.map((rec: string, index: number) => (
                        <div key={index} className="text-sm text-blue-600 dark:text-blue-400">
                          • {rec}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        } catch (error) {
          console.error("Failed to render autonomous report:", error);
          return (
            <div className="p-3 text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-900/30 rounded-lg">
              Error rendering autonomous report: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          );
        }

      case "tool_calls":
        // Handle AI tool calls
        try {
          let toolCalls = [];
          if (Array.isArray(artifact.content)) {
            toolCalls = artifact.content;
          } else if (artifact.content && typeof artifact.content === 'object') {
            toolCalls = [artifact.content];
          }

          return (
            <div className="p-3">
              <div className="space-y-3">
                {toolCalls.map((toolCall: any, index: number) => (
                  <div
                    key={toolCall.id || index}
                    className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Code size={16} className="text-blue-500 dark:text-blue-400" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          {toolCall.function?.name || toolCall.name || 'Tool Call'}
                        </span>
                      </div>
                      <span className="text-xs px-2 py-1 bg-blue-100/70 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                        {toolCall.type || 'function'}
                      </span>
                    </div>

                    {toolCall.function?.arguments && (
                      <div className="mt-2">
                        <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Arguments:</div>
                        <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                          <code>{JSON.stringify(JSON.parse(toolCall.function.arguments), null, 2)}</code>
                        </pre>
                      </div>
                    )}

                    {toolCall.result && (
                      <div className="mt-2">
                        <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Result:</div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 bg-green-50/70 dark:bg-green-900/20 p-2 rounded">
                          {typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {toolCalls.length === 0 && (
                <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                  No tool calls available
                </div>
              )}
            </div>
          );
        } catch (error) {
          console.error("Failed to render tool calls:", error);
          return (
            <div className="p-3 text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-900/30 rounded-lg">
              Error rendering tool calls: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          );
        }

      case "cad_elements":
        // Handle CAD elements arrays
        try {
          let elements = [];
          if (Array.isArray(artifact.content)) {
            elements = artifact.content;
          } else if (artifact.content && typeof artifact.content === 'object') {
            elements = [artifact.content];
          }

          return (
            <div className="p-3">
              <div className="bg-gradient-to-r from-green-50/80 to-emerald-50/80 dark:from-gray-800/60 dark:to-gray-700/60 backdrop-blur-sm border border-green-200/50 dark:border-gray-600/50 rounded-xl p-4">
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    CAD Elements ({elements.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {elements.map((element: any, index: number) => (
                      <div
                        key={element.id || index}
                        className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-lg p-3"
                      >
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                          {element.name || element.type || `Element ${index + 1}`}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Type: {element.type || 'Unknown'}
                        </div>
                        {element.color && (
                          <div className="flex items-center space-x-2 mt-2">
                            <div
                              className="w-3 h-3 rounded-full border border-gray-300"
                              style={{ backgroundColor: element.color }}
                            />
                            <span className="text-xs text-gray-500 dark:text-gray-400">{element.color}</span>
                          </div>
                        )}
                        {element.dimensions && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Dimensions: {JSON.stringify(element.dimensions)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {elements.length === 0 && (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                    No CAD elements available
                  </div>
                )}
              </div>
            </div>
          );
        } catch (error) {
          console.error("Failed to render CAD elements:", error);
          return (
            <div className="p-3 text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-900/30 rounded-lg">
              Error rendering CAD elements: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          );
        }

      default:
        return (
          <div className="max-h-96 overflow-y-auto">
            <pre className="p-3 bg-gray-100 dark:bg-gray-900 rounded overflow-x-auto whitespace-pre-wrap break-words">
              <span className="break-words">
                {typeof artifact.content === 'string'
                  ? artifact.content
                  : typeof artifact.content === 'object' && artifact.content !== null
                    ? JSON.stringify(artifact.content, null, 2)
                    : String(artifact.content)
                }
              </span>
            </pre>
          </div>
        );
    }
  };

  return (
    <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 rounded-2xl overflow-hidden shadow-lg">
      <div className="flex justify-between items-center px-4 py-3 bg-gradient-to-r from-gray-50/80 to-gray-100/80 dark:from-gray-700/80 dark:to-gray-800/80 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-600/50 sticky top-0 z-10">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"></div>
          <div className="font-semibold text-sm text-gray-700 dark:text-gray-200">{artifact.title || "Artifact"}</div>
        </div>
        <div className="flex space-x-2">
          {artifact.type === "cad" && onAddToCanvas && (
            <button
              onClick={handleAddToCanvas}
              className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 transition-all duration-300 font-medium shadow-md hover:shadow-lg"
            >
              Add to Canvas
            </button>
          )}
          <button
            onClick={handleCopy}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-200/70 dark:bg-gray-700/70 hover:bg-gray-300/70 dark:hover:bg-gray-600/70 transition-all duration-300 font-medium backdrop-blur-sm"
          >
            Copy
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-200/70 dark:bg-gray-700/70 hover:bg-gray-300/70 dark:hover:bg-gray-600/70 transition-all duration-300 font-medium backdrop-blur-sm"
          >
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      {renderArtifactContent()}
    </div>
  );
};
