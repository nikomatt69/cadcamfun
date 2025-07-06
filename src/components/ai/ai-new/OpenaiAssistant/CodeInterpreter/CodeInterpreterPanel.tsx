import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Code, Play, Download, FileText, AlertTriangle, CheckCircle, Clock, Loader, X, Zap } from "react-feather";
import { Brain } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

import { codeInterpreterService } from "@/src/lib/ai/codeInterpreter/codeInterpreterService";
import { CodeInterpreterRequest, CodeInterpreterResponse, ContainerFile } from "@/src/types/codeInterpreterTypes";
import type { Element } from "@/src/store/elementsStore";

interface CodeInterpreterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  cadElements?: Element[];
  onResultsAvailable?: (results: CodeInterpreterResponse) => void;
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

export const CodeInterpreterPanel: React.FC<CodeInterpreterPanelProps> = ({
  isOpen,
  onClose,
  cadElements = [],
  onResultsAvailable
}) => {
  const [activeTab, setActiveTab] = useState<"code" | "templates" | "results">("code");
  const [code, setCode] = useState<string>("");
  const [results, setResults] = useState<ExecutionResult[]>([]);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Pre-defined code templates
  const codeTemplates = [
    {
      id: "cad_analysis",
      name: "CAD Elements Analysis",
      description: "Analyze CAD elements geometry and properties",
      icon: "📊",
      category: "analysis",
      code: `import json
import matplotlib.pyplot as plt
import numpy as np
from collections import Counter

# CAD Elements Analysis
elements = ${JSON.stringify(cadElements, null, 2)}

# Basic statistics
total_elements = len(elements)
element_types = Counter([el.get('type', 'unknown') for el in elements])

print(f"Total elements: {total_elements}")
print(f"Element types: {dict(element_types)}")

# Volume calculation for common shapes
def calculate_volume(element):
    el_type = element.get('type', 'unknown')
    if el_type == 'cube':
        return element.get('width', 0) * element.get('height', 0) * element.get('depth', 0)
    elif el_type == 'sphere':
        radius = element.get('radius', 0)
        return (4/3) * np.pi * radius**3
    elif el_type == 'cylinder':
        radius = element.get('radius', 0)
        height = element.get('height', 0)
        return np.pi * radius**2 * height
    return 0

total_volume = sum(calculate_volume(el) for el in elements)
print(f"Total volume: {total_volume:.2f} cubic units")

# Create visualization
if total_elements > 0:
    plt.figure(figsize=(10, 6))
    plt.pie(element_types.values(), labels=element_types.keys(), autopct='%1.1f%%')
    plt.title('CAD Elements Distribution')
    plt.savefig('cad_analysis.png', dpi=150, bbox_inches='tight')
    plt.show()
`
    },
    {
      id: "data_visualization",
      name: "Data Visualization",
      description: "Create charts and graphs from CAD data",
      icon: "📈",
      category: "visualization",
      code: `import matplotlib.pyplot as plt
import numpy as np

# Sample data from CAD elements
elements = ${JSON.stringify(cadElements, null, 2)}
positions = [(el.get('x', 0), el.get('y', 0)) for el in elements]

if positions:
    x_coords = [pos[0] for pos in positions]
    y_coords = [pos[1] for pos in positions]
    
    plt.figure(figsize=(12, 8))
    
    # Scatter plot of element positions
    plt.subplot(2, 2, 1)
    plt.scatter(x_coords, y_coords, alpha=0.7)
    plt.xlabel('X Position')
    plt.ylabel('Y Position')
    plt.title('Element Positions')
    plt.grid(True)
    
    # Histograms
    plt.subplot(2, 2, 2)
    plt.hist(x_coords, bins=20, alpha=0.7)
    plt.xlabel('X Position')
    plt.ylabel('Frequency')
    plt.title('X Position Distribution')
    
    plt.subplot(2, 2, 3)
    plt.hist(y_coords, bins=20, alpha=0.7)
    plt.xlabel('Y Position')
    plt.ylabel('Frequency')
    plt.title('Y Position Distribution')
    
    plt.tight_layout()
    plt.savefig('element_positions.png', dpi=150, bbox_inches='tight')
    plt.show()
else:
    print("No position data available for visualization")
`
    },
    {
      id: "manufacturing_cost",
      name: "Manufacturing Cost Analysis",
      description: "Calculate manufacturing costs based on CAD elements",
      icon: "💰",
      category: "computation",
      code: `import json
import matplotlib.pyplot as plt

# Manufacturing cost analysis
elements = ${JSON.stringify(cadElements, null, 2)}

# Material properties
material_density = 7.85  # Steel density g/cm³
material_cost_per_kg = 5.0  # USD per kg
machine_hourly_rate = 75.0  # USD per hour

def calculate_volume(element):
    el_type = element.get('type', 'unknown')
    if el_type == 'cube':
        return element.get('width', 0) * element.get('height', 0) * element.get('depth', 0)
    elif el_type == 'sphere':
        radius = element.get('radius', 0)
        return (4/3) * 3.14159 * radius**3
    elif el_type == 'cylinder':
        radius = element.get('radius', 0)
        height = element.get('height', 0)
        return 3.14159 * radius**2 * height
    return 0

# Calculate total volume and mass
total_volume_mm3 = sum(calculate_volume(el) for el in elements)
total_volume_cm3 = total_volume_mm3 / 1000  # Convert mm³ to cm³
total_mass_kg = total_volume_cm3 * material_density / 1000  # Convert g to kg

# Cost calculations
material_cost = total_mass_kg * material_cost_per_kg
machining_time_hours = total_volume_cm3 * 0.1  # Estimate: 0.1 hours per cm³
machining_cost = machining_time_hours * machine_hourly_rate
total_cost = material_cost + machining_cost

# Results
print(f"Total Volume (Cubic Centimeters): {total_volume_cm3:.2f} cm³")
print(f"Total Mass (Kilograms): {total_mass_kg:.3f} kg")
print(f"Estimated Material Cost: {material_cost:.2f}")
print(f"Estimated Machining Time: {machining_time_hours:.2f} hours")
print(f"Estimated Machining Cost: {machining_cost:.2f}")
print(f"Total Estimated Cost: {total_cost:.2f}")

# Cost breakdown chart
costs = [material_cost, machining_cost]
labels = ['Material', 'Machining']

plt.figure(figsize=(8, 6))
plt.pie(costs, labels=labels, autopct='%1.1f%%', startangle=90)
plt.title(f'Manufacturing Cost Breakdown\nTotal: {total_cost:.2f}')
plt.savefig('cost_analysis.png', dpi=150, bbox_inches='tight')
plt.show()
`
    }
  ];

  const executeCode = useCallback(
    async (codeToExecute: string, type: ExecutionResult["type"] = "computation") => {
      if (!codeToExecute.trim()) {
        return;
      }

      setIsExecuting(true);
      const executionId = uuidv4();

      try {
        const request: CodeInterpreterRequest = {
          prompt: "Execute the provided Python code for CAD analysis",
          code: codeToExecute,
          codeType: type === "analysis" ? "cad_processing" : type,
          model: "gpt-4.1",
          containerMode: "auto",
          executionTimeout: 300000 // 5 minutes
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
          type: type
        };

        setResults(prev => [result, ...prev]);

        if (onResultsAvailable) {
          onResultsAvailable(response);
        }

        // Switch to results tab to show the output
        setActiveTab("results");
      } catch (error) {
        const errorResult: ExecutionResult = {
          id: executionId,
          timestamp: Date.now(),
          code: codeToExecute,
          output: "",
          error: error instanceof Error ? error.message : "Unknown error occurred",
          executionTime: 0,
          generatedFiles: [],
          type: type
        };

        setResults(prev => [errorResult, ...prev]);
        setActiveTab("results");
      } finally {
        setIsExecuting(false);
      }
    },
    [onResultsAvailable]
  );

  const handleTemplateSelect = useCallback(
    (templateId: string) => {
      const template = codeTemplates.find(t => t.id === templateId);
      if (template) {
        setCode(template.code);
        setSelectedTemplate(templateId);
        setActiveTab("code");
      }
    },
    [codeTemplates]
  );

  const downloadFile = useCallback(async (file: ContainerFile) => {
    try {
      // Create a download link for the file
      const element = document.createElement("a");
      element.href = file.downloadUrl || "#";
      element.download = file.filename;
      element.click();
    } catch (error) {
      console.error("Failed to download file:", error);
    }
  }, []);

  // Handle panel visibility - MOVED AFTER HOOKS
  if (!isOpen) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={e => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <motion.div
          initial={{ scale: 0.9, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 50 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="bg-gradient-to-br from-white/95 via-gray-50/95 to-blue-50/95 dark:from-gray-800/95 dark:via-gray-900/95 dark:to-blue-900/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-7xl h-5/6 overflow-hidden border border-white/20 dark:border-gray-700/50"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative overflow-hidden bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-700 text-white p-6 border-b border-white/20">
            {/* Glassmorphism overlay */}
            <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
            
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/30 shadow-lg">
                    <Brain size={24} className="text-white" />
                  </div>
                  {/* Pulse effect */}
                  <div className="absolute inset-0 bg-white/20 rounded-xl animate-ping opacity-75"></div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white drop-shadow-sm">Code Interpreter</h2>
                  <p className="text-blue-100 mt-1">
                    Execute Python code for CAD analysis and visualization
                  </p>
                  <div className="flex items-center space-x-4 mt-2 text-sm text-blue-100">
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-sm"></div>
                      <span>Elements: {cadElements.length}</span>
                    </div>
                    {results.length > 0 && (
                      <div className="flex items-center space-x-1">
                        <CheckCircle size={14} className="text-emerald-400" />
                        <span>Results: {results.length}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <motion.button
                onClick={onClose}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-3 text-white/80 hover:text-white rounded-xl hover:bg-white/20 transition-all duration-200 backdrop-blur-sm border border-white/20"
              >
                <X size={20} />
              </motion.button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex bg-gradient-to-r from-gray-50/80 to-blue-50/80 dark:from-gray-800/80 dark:to-blue-900/80 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-700/50">
            {[
              { id: "code", label: "Code Editor", icon: Code, count: null },
              { id: "templates", label: "Templates", icon: FileText, count: codeTemplates.length },
              { id: "results", label: "Results", icon: CheckCircle, count: results.length }
            ].map(tab => (
              <motion.button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                whileHover={{ y: -1 }}
                whileTap={{ y: 0 }}
                className={`flex items-center space-x-3 px-6 py-4 border-b-3 transition-all duration-300 relative group ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-gray-800/60 shadow-sm"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-800/40"
                }`}
              >
                {/* Active indicator */}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 backdrop-blur-sm"
                  />
                )}
                
                <div className="relative z-10 flex items-center space-x-3">
                  <div className={`p-2 rounded-lg transition-all ${
                    activeTab === tab.id 
                      ? "bg-blue-500/20 text-blue-600 dark:text-blue-400" 
                      : "bg-gray-200/50 dark:bg-gray-700/50 group-hover:bg-gray-300/50 dark:group-hover:bg-gray-600/50"
                  }`}>
                    <tab.icon size={16} />
                  </div>
                  <span className="font-medium">{tab.label}</span>
                  {tab.count !== null && tab.count > 0 && (
                    <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      activeTab === tab.id
                        ? "bg-blue-500 text-white shadow-sm"
                        : "bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
                    }`}>
                      {tab.count}
                    </div>
                  )}
                </div>
              </motion.button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <AnimatePresence mode="wait">
              {activeTab === "code" && (
                <motion.div
                  key="code"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex-1 flex flex-col"
                >
                  {/* Editor Header */}
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50/80 to-blue-50/80 dark:from-gray-800/80 dark:to-blue-900/80 backdrop-blur-sm border-b border-gray-200/30 dark:border-gray-700/30">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                        <span>CAD Elements: {cadElements.length}</span>
                      </div>
                      {selectedTemplate && (
                        <div className="px-3 py-1 bg-purple-100/80 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium backdrop-blur-sm border border-purple-200/50 dark:border-purple-700/50">
                          Template: {codeTemplates.find(t => t.id === selectedTemplate)?.name}
                        </div>
                      )}
                    </div>
                    <motion.button
                      onClick={() => executeCode(code)}
                      disabled={isExecuting || !code.trim()}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg backdrop-blur-sm border border-blue-400/20 transition-all"
                    >
                      {isExecuting ? (
                        <>
                          <Loader className="animate-spin" size={18} />
                          <span>Executing...</span>
                        </>
                      ) : (
                        <>
                          <Play size={18} />
                          <span>Execute Code</span>
                        </>
                      )}
                    </motion.button>
                  </div>
                  
                  {/* Code Editor */}
                  <div className="flex-1 p-6">
                    <div className="h-full bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-inner overflow-hidden">
                      <textarea
                        value={code}
                        onChange={e => setCode(e.target.value)}
                        placeholder="Enter Python code here for CAD analysis, visualization, and computation..."
                        className="w-full h-full resize-none p-6 font-mono text-sm bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none placeholder-gray-500 dark:placeholder-gray-400 leading-relaxed"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === "templates" && (
                <motion.div
                  key="templates"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex-1 overflow-y-auto p-6"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {codeTemplates.map((template, index) => (
                      <motion.div
                        key={template.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className={`group cursor-pointer transition-all duration-300 ${
                          selectedTemplate === template.id
                            ? "transform scale-105"
                            : "hover:transform hover:scale-105"
                        }`}
                        onClick={() => handleTemplateSelect(template.id)}
                      >
                        <div className={`h-full p-6 rounded-xl backdrop-blur-xl border shadow-lg transition-all duration-300 ${
                          selectedTemplate === template.id
                            ? "border-blue-500/50 bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-900/40 dark:to-indigo-900/40 shadow-blue-500/25"
                            : "border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-br from-white/60 to-gray-50/60 dark:from-gray-800/60 dark:to-gray-900/60 hover:border-blue-400/50 hover:shadow-xl"
                        }`}>
                          <div className="flex items-start justify-between mb-4">
                            <div className="text-3xl">{template.icon}</div>
                            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                              template.category === "analysis" 
                                ? "bg-green-100/80 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                : template.category === "visualization"
                                ? "bg-purple-100/80 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                                : "bg-orange-100/80 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                            } backdrop-blur-sm`}>
                              {template.category}
                            </div>
                          </div>
                          
                          <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {template.name}
                          </h3>
                          
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
                            {template.description}
                          </p>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                              Click to load template
                            </span>
                            <div className={`p-2 rounded-lg transition-all ${
                              selectedTemplate === template.id
                                ? "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                                : "bg-gray-200/50 dark:bg-gray-700/50 text-gray-400 group-hover:bg-blue-500/20 group-hover:text-blue-600 dark:group-hover:text-blue-400"
                            }`}>
                              <Code size={16} />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeTab === "results" && (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex-1 overflow-y-auto p-6"
                >
                  {results.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center p-8 bg-gradient-to-br from-white/60 to-gray-50/60 dark:from-gray-800/60 dark:to-gray-900/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50">
                        <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                          <CheckCircle size={24} className="text-white" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No execution results yet</h3>
                        <p className="text-gray-500 dark:text-gray-400">Execute some code to see results here</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {results.map((result, index) => (
                        <motion.div
                          key={result.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className={`rounded-xl p-6 backdrop-blur-xl border shadow-lg ${
                            result.error
                              ? "border-red-300/50 bg-gradient-to-br from-red-50/80 to-red-100/80 dark:border-red-700/50 dark:from-red-900/30 dark:to-red-800/30"
                              : "border-green-300/50 bg-gradient-to-br from-green-50/80 to-emerald-50/80 dark:border-green-700/50 dark:from-green-900/30 dark:to-emerald-900/30"
                          }`}
                        >
                          {/* Result Header */}
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-3">
                              <div className={`p-2 rounded-lg ${
                                result.error
                                  ? "bg-red-500/20 text-red-600 dark:text-red-400"
                                  : "bg-green-500/20 text-green-600 dark:text-green-400"
                              }`}>
                                {result.error ? (
                                  <AlertTriangle size={18} />
                                ) : (
                                  <CheckCircle size={18} />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {new Date(result.timestamp).toLocaleTimeString()}
                                  </span>
                                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    result.type === "analysis"
                                      ? "bg-blue-100/80 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                                      : result.type === "visualization"
                                      ? "bg-purple-100/80 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                                      : "bg-orange-100/80 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                                  } backdrop-blur-sm`}>
                                    {result.type}
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  <Clock size={12} />
                                  <span>Execution time: {result.executionTime}ms</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Result Content */}
                          {result.error ? (
                            <div className="bg-red-100/60 dark:bg-red-900/40 p-4 rounded-lg border border-red-200/50 dark:border-red-700/50 backdrop-blur-sm">
                              <div className="flex items-center space-x-2 mb-2">
                                <AlertTriangle size={14} className="text-red-600 dark:text-red-400" />
                                <span className="text-sm font-medium text-red-800 dark:text-red-200">Error</span>
                              </div>
                              <div className="text-sm text-red-800 dark:text-red-200 font-mono whitespace-pre-wrap">
                                {result.error}
                              </div>
                            </div>
                          ) : (
                            <div className="bg-white/60 dark:bg-gray-800/60 p-4 rounded-lg border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-sm">
                              <div className="flex items-center space-x-2 mb-2">
                                <CheckCircle size={14} className="text-green-600 dark:text-green-400" />
                                <span className="text-sm font-medium text-gray-900 dark:text-white">Output</span>
                              </div>
                              <div className="text-sm text-gray-800 dark:text-gray-200 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar">
                                {result.output}
                              </div>
                            </div>
                          )}

                          {/* Generated Files */}
                          {result.generatedFiles.length > 0 && (
                            <div className="mt-4">
                              <div className="flex items-center space-x-2 mb-3">
                                <FileText size={16} className="text-gray-600 dark:text-gray-400" />
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                  Generated Files ({result.generatedFiles.length})
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {result.generatedFiles.map((file, fileIndex) => (
                                  <motion.div
                                    key={file.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: fileIndex * 0.05 }}
                                    className="flex items-center justify-between p-3 bg-white/60 dark:bg-gray-700/60 rounded-lg border border-gray-200/50 dark:border-gray-600/50 backdrop-blur-sm"
                                  >
                                    <div className="flex items-center space-x-3">
                                      <div className="p-2 bg-blue-500/20 rounded-lg">
                                        <FileText size={16} className="text-blue-600 dark:text-blue-400" />
                                      </div>
                                      <div>
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">
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
                                      className="flex items-center space-x-2 px-3 py-2 text-xs bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 shadow-sm transition-all"
                                    >
                                      <Download size={12} />
                                      <span>Download</span>
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
