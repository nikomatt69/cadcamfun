import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Code, Play, Download, FileText, AlertTriangle, CheckCircle, Clock, Loader, Zap } from "react-feather";
import { Brain } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

import { codeInterpreterService } from "@/src/lib/ai/codeInterpreter/codeInterpreterService";
import { CodeInterpreterRequest, CodeInterpreterResponse, ContainerFile } from "@/src/types/codeInterpreterTypes";
import { Element } from "@/src/store/elementsStore";
import { templateManager } from "@/src/lib/ai/codeInterpreter/templates/templateManager";
import { TEMPLATE_CATEGORIES } from "@/src/lib/ai/codeInterpreter/templates/index";

interface CodeInterpreterTabProps {
  cadElements?: Element[];
  onResultsAvailable?: (results: CodeInterpreterResponse) => void;
  onExecutionStatusChange?: (isExecuting: boolean) => void;
}

interface ExecutionResult {
  id: string;
  timestamp: number;
  code: string;
  output: string;
  error?: string;
  executionTime: number;
  generatedFiles: ContainerFile[];
  type: "analysis" | "visualization" | "computation";
}

export const CodeInterpreterTab: React.FC<CodeInterpreterTabProps> = ({ cadElements = [], onResultsAvailable }) => {
  const [code, setCode] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [results, setResults] = useState<ExecutionResult[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<"editor" | "templates" | "results">("editor");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Get dynamic templates from template manager (now includes current CAD elements)
  const getAllTemplates = () => templateManager.generateTemplateForCodeTab();

  const getFilteredTemplates = () => {
    const allTemplates = getAllTemplates();
    if (selectedCategory === "all") return allTemplates;
    return allTemplates.filter(
      template =>
        template.id.includes(selectedCategory) ||
        templateManager.getTemplate(template.id)?.category === selectedCategory
    );
  };

  // Get current elements info for display
  const elementsInfo = templateManager.getCurrentElementsInfo();

  const executeCode = useCallback(
    async (codeToExecute: string) => {
      if (!codeToExecute.trim()) return;

      setIsExecuting(true);
      const executionId = uuidv4();

      try {
        const request: CodeInterpreterRequest = {
          prompt: "Execute Python code for CAD analysis",
          code: codeToExecute,
          codeType: "cad_processing",
          model: "gpt-4.1",
          containerMode: "auto",
          executionTimeout: 300000
        };

        const response = await codeInterpreterService.executeCode(request);

        const result: ExecutionResult = {
          id: executionId,
          timestamp: Date.now(),
          code: codeToExecute,
          output: response.pythonOutput || response.data?.output || "Code executed successfully",
          error: response.error,
          executionTime: response.processingTime || 0,
          generatedFiles: response.generatedFiles || [],
          type: "analysis"
        };

        setResults(prev => [result, ...prev]);

        if (onResultsAvailable) {
          onResultsAvailable(response);
        }

        setActiveSubTab("results");
      } catch (error) {
        const errorResult: ExecutionResult = {
          id: executionId,
          timestamp: Date.now(),
          code: codeToExecute,
          output: "",
          error: error instanceof Error ? error.message : "Unknown error occurred",
          executionTime: 0,
          generatedFiles: [],
          type: "analysis"
        };

        setResults(prev => [errorResult, ...prev]);
        setActiveSubTab("results");
      } finally {
        setIsExecuting(false);
      }
    },
    [onResultsAvailable]
  );

  const handleTemplateSelect = useCallback((templateId: string) => {
    const templates = getAllTemplates();
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setCode(template.code);
      setActiveSubTab("editor");
    }
  }, []);

  const downloadFile = useCallback(async (file: ContainerFile) => {
    try {
      const element = document.createElement("a");
      element.href = file.downloadUrl || "#";
      element.download = file.filename;
      element.click();
    } catch (error) {
      console.error("Failed to download file:", error);
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-white/95 via-gray-50/95 to-blue-50/95 dark:from-gray-800/95 dark:via-gray-900/95 dark:to-blue-900/95 backdrop-blur-xl rounded-lg border border-white/20 dark:border-gray-700/50">
      {/* Sub-tabs */}
      <div className="flex bg-gradient-to-r from-gray-50/80 to-blue-50/80 dark:from-gray-800/80 dark:to-blue-900/80 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-600/50 rounded-t-lg">
        {[
          { id: "editor", label: "Editor", icon: Code },
          { id: "templates", label: "Templates", icon: FileText },
          { id: "results", label: "Results", icon: CheckCircle }
        ].map(tab => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            whileHover={{ y: -1 }}
            whileTap={{ y: 0 }}
            className={`flex items-center space-x-2 px-4 py-3 text-sm border-b-2 transition-all duration-300 relative group ${activeSubTab === tab.id
              ? "border-blue-500 text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-gray-800/60 shadow-sm"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-800/40"
              } first:rounded-tl-lg`}
          >
            {/* Active indicator */}
            {activeSubTab === tab.id && (
              <motion.div
                layoutId="activeSubTab"
                className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 backdrop-blur-sm first:rounded-tl-lg"
              />
            )}

            <div className="relative z-10 flex items-center space-x-2">
              <div className={`p-1.5 rounded-lg transition-all ${activeSubTab === tab.id
                ? "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                : "bg-gray-200/50 dark:bg-gray-700/50 group-hover:bg-gray-300/50 dark:group-hover:bg-gray-600/50"
                }`}>
                <tab.icon size={14} />
              </div>
              <span className="font-medium">{tab.label}</span>
              {tab.id === "results" && results.length > 0 && (
                <div className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${activeSubTab === tab.id
                  ? "bg-blue-500 text-white"
                  : "bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
                  }`}>
                  {results.length}
                </div>
              )}
            </div>
          </motion.button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeSubTab === "editor" && (
            <motion.div
              key="editor"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col h-full"
            >
              {/* Editor Header */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50/70 to-blue-50/70 dark:from-gray-800/70 dark:to-blue-900/70 backdrop-blur-sm border-b border-gray-200/30 dark:border-gray-600/30">
                <div className="flex items-center space-x-3 text-sm">
                  <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                    <span>Canvas elements: {elementsInfo.count}</span>
                  </div>
                  {elementsInfo.types.length > 0 && (
                    <div className="px-2 py-1 bg-purple-100/70 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium backdrop-blur-sm border border-purple-200/30 dark:border-purple-700/30">
                      Types: {elementsInfo.types.join(", ")}
                    </div>
                  )}
                </div>
                <motion.button
                  onClick={() => executeCode(code)}
                  disabled={isExecuting || !code.trim()}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center space-x-2 px-4 py-2 text-sm bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md backdrop-blur-sm border border-blue-400/20 transition-all"
                >
                  {isExecuting ? (
                    <>
                      <Loader className="animate-spin" size={14} />
                      <span>Running...</span>
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      <span>Execute</span>
                    </>
                  )}
                </motion.button>
              </div>

              {/* Code Editor */}
              <div className="flex-1 p-3">
                <div className="h-full bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm rounded-lg border border-gray-200/50 dark:border-gray-600/50 shadow-inner overflow-hidden">
                  <textarea
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    placeholder="Enter Python code for CAD analysis..."
                    className="w-full h-full resize-none p-4 font-mono text-sm bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-gray-500 dark:placeholder-gray-400 leading-relaxed"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {activeSubTab === "templates" && (
            <motion.div
              key="templates"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col h-full p-3"
            >
              {/* Template Info Header */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-blue-900/40 dark:to-indigo-900/40 backdrop-blur-sm border border-blue-200/50 dark:border-blue-700/50 rounded-lg p-4 mb-4"
              >
                <div className="flex items-center space-x-2 mb-2">
                  <Brain size={16} className="text-blue-600 dark:text-blue-400" />
                  <h3 className="font-semibold text-sm text-blue-900 dark:text-blue-100">CAD Analysis Templates</h3>
                </div>
                <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                    <span>Elements in canvas: <span className="font-mono">{elementsInfo.count}</span></span>
                  </div>
                  {elementsInfo.types.length > 0 && (
                    <div className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
                      <span>Types: <span className="font-mono">{elementsInfo.types.join(", ")}</span></span>
                    </div>
                  )}
                  {elementsInfo.materials.length > 0 && (
                    <div className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 bg-orange-400 rounded-full"></div>
                      <span>Materials: <span className="font-mono">{elementsInfo.materials.join(", ")}</span></span>
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Category Filter */}
              <div className="mb-4">
                <div className="flex flex-wrap gap-2">
                  <motion.button
                    onClick={() => setSelectedCategory("all")}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`px-3 py-2 text-xs rounded-lg transition-all backdrop-blur-sm ${selectedCategory === "all"
                      ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md border border-blue-400/20"
                      : "bg-white/50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-600/70 border border-gray-200/50 dark:border-gray-600/50"
                      }`}
                  >
                    All ({getAllTemplates().length})
                  </motion.button>
                  {TEMPLATE_CATEGORIES.map(category => (
                    <motion.button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`px-3 py-2 text-xs rounded-lg transition-all backdrop-blur-sm flex items-center space-x-1 ${selectedCategory === category.id
                        ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md border border-blue-400/20"
                        : "bg-white/50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-600/70 border border-gray-200/50 dark:border-gray-600/50"
                        }`}
                    >
                      <span>{category.icon}</span>
                      <span>{category.name}</span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Templates List */}
              <div className="space-y-3 overflow-y-auto flex-1 custom-scrollbar">
                {getFilteredTemplates().map((template, index) => {
                  const templateDetails = templateManager.getTemplate(template.id);
                  return (
                    <motion.div
                      key={template.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="group cursor-pointer transition-all duration-300 hover:transform hover:scale-[1.02]"
                      onClick={() => handleTemplateSelect(template.id)}
                    >
                      <div className="bg-gradient-to-r from-white/60 to-gray-50/60 dark:from-gray-800/60 dark:to-gray-900/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-600/50 rounded-lg p-4 hover:border-blue-400/50 hover:shadow-lg transition-all duration-300">
                        <div className="flex items-start justify-between mb-3">
                          <h4 className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {template.name}
                          </h4>
                          {templateDetails && (
                            <div className="flex items-center space-x-2">
                              <div className={`px-2 py-1 text-xs rounded-full font-medium ${templateDetails.difficulty === "basic"
                                ? "bg-green-100/80 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                : templateDetails.difficulty === "intermediate"
                                  ? "bg-yellow-100/80 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
                                  : "bg-red-100/80 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                } backdrop-blur-sm`}>
                                {templateDetails.difficulty}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100/80 dark:bg-gray-800/80 px-2 py-1 rounded-full backdrop-blur-sm">
                                {templateDetails.estimatedTime}
                              </div>
                            </div>
                          )}
                        </div>

                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
                          {template.description}
                        </p>

                        {templateDetails && templateDetails.requiredPackages && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {templateDetails.requiredPackages.map((pkg, idx) => (
                              <motion.span
                                key={pkg}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.05 }}
                                className="px-2 py-1 text-xs bg-gradient-to-r from-purple-100/70 to-indigo-100/70 dark:from-purple-900/40 dark:to-indigo-900/40 text-purple-700 dark:text-purple-300 rounded-full backdrop-blur-sm border border-purple-200/30 dark:border-purple-700/30"
                              >
                                {pkg}
                              </motion.span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            Click to load template
                          </span>
                          <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-400 group-hover:bg-blue-500/30 transition-all">
                            <Code size={12} />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}

                {getFilteredTemplates().length === 0 && (
                  <div className="text-center py-8">
                    <div className="bg-gradient-to-br from-white/60 to-gray-50/60 dark:from-gray-800/60 dark:to-gray-900/60 backdrop-blur-sm rounded-lg p-6 border border-gray-200/50 dark:border-gray-700/50">
                      <FileText size={24} className="mx-auto mb-3 text-gray-400" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No templates found for this category</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeSubTab === "results" && (
            <motion.div
              key="results"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="overflow-y-auto p-3 h-full"
            >
              {results.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center p-6 bg-gradient-to-br from-white/60 to-gray-50/60 dark:from-gray-800/60 dark:to-gray-900/60 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50">
                    <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                      <CheckCircle size={16} className="text-white" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No results yet</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Execute code to see results</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {results.map((result, index) => (
                    <motion.div
                      key={result.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={`rounded-lg p-4 text-sm backdrop-blur-xl border shadow-md ${result.error
                        ? "border-red-300/50 bg-gradient-to-br from-red-50/80 to-red-100/80 dark:border-red-700/50 dark:from-red-900/30 dark:to-red-800/30"
                        : "border-green-300/50 bg-gradient-to-br from-green-50/80 to-emerald-50/80 dark:border-green-700/50 dark:from-green-900/30 dark:to-emerald-900/30"
                        }`}
                    >
                      {/* Result Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <div className={`p-1.5 rounded-lg ${result.error
                            ? "bg-red-500/20 text-red-600 dark:text-red-400"
                            : "bg-green-500/20 text-green-600 dark:text-green-400"
                            }`}>
                            {result.error ? (
                              <AlertTriangle size={12} />
                            ) : (
                              <CheckCircle size={12} />
                            )}
                          </div>
                          <span className="text-gray-600 dark:text-gray-400 text-xs">
                            {new Date(result.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                          <Clock size={10} />
                          <span>{result.executionTime}ms</span>
                        </div>
                      </div>

                      {/* Result Content */}
                      {result.error ? (
                        <div className="bg-red-100/60 dark:bg-red-900/40 p-3 rounded-lg border border-red-200/50 dark:border-red-700/50 backdrop-blur-sm">
                          <div className="flex items-center space-x-2 mb-2">
                            <AlertTriangle size={12} className="text-red-600 dark:text-red-400" />
                            <span className="text-xs font-medium text-red-800 dark:text-red-200">Error</span>
                          </div>
                          <div className="text-xs text-red-800 dark:text-red-200 font-mono whitespace-pre-wrap">
                            {result.error}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-white/60 dark:bg-gray-800/60 p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-sm">
                          <div className="flex items-center space-x-2 mb-2">
                            <CheckCircle size={12} className="text-green-600 dark:text-green-400" />
                            <span className="text-xs font-medium text-gray-900 dark:text-white">Output</span>
                          </div>
                          <div className="text-xs text-gray-800 dark:text-gray-200 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">
                            {result.output}
                          </div>
                        </div>
                      )}

                      {/* Generated Files */}
                      {result.generatedFiles.length > 0 && (
                        <div className="mt-3">
                          <div className="flex items-center space-x-2 mb-2">
                            <FileText size={12} className="text-gray-600 dark:text-gray-400" />
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                              Files ({result.generatedFiles.length})
                            </span>
                          </div>
                          <div className="space-y-2">
                            {result.generatedFiles.map((file, fileIndex) => (
                              <motion.div
                                key={file.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: fileIndex * 0.05 }}
                                className="flex items-center justify-between p-2 bg-white/60 dark:bg-gray-700/60 rounded-lg border border-gray-200/50 dark:border-gray-600/50 backdrop-blur-sm"
                              >
                                <div className="flex items-center space-x-2">
                                  <div className="p-1 bg-blue-500/20 rounded">
                                    <FileText size={10} />
                                  </div>
                                  <div>
                                    <div className="text-xs font-medium text-gray-900 dark:text-white">
                                      {file.filename}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      {(file.size / 1024).toFixed(1)} KB
                                    </div>
                                  </div>
                                </div>
                                <motion.button
                                  onClick={() => downloadFile(file)}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  className="flex items-center space-x-1 px-2 py-1 text-xs bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded hover:from-blue-600 hover:to-indigo-700 shadow-sm transition-all"
                                >
                                  <Download size={8} />
                                  <span>Get</span>
                                </motion.button>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
