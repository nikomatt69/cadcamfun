// src/components/ai/ai-new/ContextAwareGenerationPanel.tsx
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Layers, Settings, RefreshCw, Check, X, Sliders, Info } from "react-feather";
import { contextAwareGenerationService } from "src/lib/ai/ContextAwareGenerationService";
import { useElementsStore } from "@/src/store/elementsStore";
import { Element3dPreview } from "src/components/ai/ai-new/Element3dPreview";
import { GenerationConstraints, GenerationOptions, GenerationResult } from "@/src/types/AITypes";
import { useAI } from "src/components/ai/ai-new/AIContextProvider";

interface ContextAwareGenerationPanelProps {
  onClose?: () => void;
  className?: string;
}

export const ContextAwareGenerationPanel: React.FC<ContextAwareGenerationPanelProps> = ({
  onClose,
  className = ""
}) => {
  const { state } = useAI();
  const { elements, addElements } = useElementsStore();
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [constraints, setConstraints] = useState<GenerationConstraints>({
    enforceStyleConsistency: true,
    scaleToMatch: true
  });

  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Focus description field on mount
  useEffect(() => {
    if (descriptionRef.current) {
      descriptionRef.current.focus();
    }
  }, []);

  // Generate elements based on context and description
  const handleGenerate = async () => {
    if (!description.trim()) {
      setError("Please enter a description.");
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      // Generate contextual components
      const result = await contextAwareGenerationService.generateContextualComponent(
        description,
        elements,
        constraints,
        {
          useCache: true,
          fallbackOnError: true,
          modelOverride: state.currentModel // Use selected model from AI state
        }
      );

      setGenerationResult(result);
      setShowPreview(true);
    } catch (error) {
      console.error("Generation error:", error);
      setError(error instanceof Error ? error.message : "An unknown error occurred.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Add generated elements to canvas
  const handleAddToCanvas = () => {
    if (generationResult?.generatedElements) {
      addElements(generationResult.generatedElements);
      setShowPreview(false);

      // Clear description after successful generation
      setDescription("");
      setGenerationResult(null);

      // Show success notification
      // You would implement this based on your notification system
    }
  };

  // Cancel preview
  const handleCancelPreview = () => {
    setShowPreview(false);
    setGenerationResult(null);
  };

  // Update constraints
  const handleConstraintChange = (name: keyof GenerationConstraints, value: any) => {
    setConstraints(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Toggle advanced settings
  const toggleAdvanced = () => {
    setShowAdvanced(!showAdvanced);
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden ${className}`}>
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center">
          <Cpu className="mr-2 text-blue-500" size={20} />
          <h2 className="text-lg font-semibold">Context-Aware Generation</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div className="p-4">
        <AnimatePresence mode="wait">
          {!showPreview ? (
            <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="mb-4">
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Describe what you want to generate
                </label>
                <textarea
                  ref={descriptionRef}
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="E.g., Add a gear mechanism that connects to the existing shaft"
                  rows={4}
                  disabled={isGenerating}
                ></textarea>

                {elements.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center">
                    <Info size={12} className="mr-1" />
                    Will generate content that fits with your {elements.length} existing element(s)
                  </div>
                )}
              </div>

              <div className="mb-4">
                <button
                  onClick={toggleAdvanced}
                  className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Sliders size={14} className="mr-1" />
                  {showAdvanced ? "Hide" : "Show"} advanced options
                </button>

                <AnimatePresence>
                  {showAdvanced && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md overflow-hidden"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="enforceStyleConsistency"
                            checked={constraints.enforceStyleConsistency}
                            onChange={e => handleConstraintChange("enforceStyleConsistency", e.target.checked)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label
                            htmlFor="enforceStyleConsistency"
                            className="ml-2 block text-sm text-gray-700 dark:text-gray-300"
                          >
                            Match existing style
                          </label>
                        </div>

                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="scaleToMatch"
                            checked={constraints.scaleToMatch}
                            onChange={e => handleConstraintChange("scaleToMatch", e.target.checked)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label htmlFor="scaleToMatch" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                            Match existing scale
                          </label>
                        </div>

                        <div>
                          <label htmlFor="maxElements" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                            Maximum number of elements
                          </label>
                          <input
                            type="number"
                            id="maxElements"
                            value={constraints.maxElements || ""}
                            onChange={e =>
                              handleConstraintChange(
                                "maxElements",
                                e.target.value ? parseInt(e.target.value) : undefined
                              )
                            }
                            className="w-full px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                            min={1}
                            max={50}
                            placeholder="No limit"
                          />
                        </div>

                        <div>
                          <label htmlFor="namePrefix" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                            Element name prefix
                          </label>
                          <input
                            type="text"
                            id="namePrefix"
                            value={constraints.namePrefix || ""}
                            onChange={e => handleConstraintChange("namePrefix", e.target.value || undefined)}
                            className="w-full px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                            placeholder="Generated"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {error && (
                <div className="mb-4 text-sm text-red-600 dark:text-red-400 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                  {error}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !description.trim()}
                  className={`px-4 py-2 rounded-md text-white font-medium flex items-center ${
                    isGenerating || !description.trim()
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw size={16} className="mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Cpu size={16} className="mr-2" />
                      Generate
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
                <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Generation Preview</h3>

                <div className="mb-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Based on your description:</span>
                  <p className="text-sm font-medium mt-1">&quot;{generationResult?.originalDescription}&quot;</p>
                </div>

                <div className="mb-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Generated {generationResult?.generatedElements.length} elements
                  </span>

                  {generationResult?.fallbackUsed && (
                    <div className="mt-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-1 rounded">
                      Note: Fallback generation was used due to an error with the primary method.
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
                <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Preview</h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {generationResult?.generatedElements.map((element, index) => (
                    <div key={element.id || index} className="bg-white dark:bg-gray-800 rounded-md p-2 shadow-sm">
                      <div className="text-xs">
                        <p className="font-medium truncate">{element.name || `${element.type} ${index + 1}`}</p>
                        <p className="text-gray-500 dark:text-gray-400 truncate">
                          {element.type}, {element.width || element.radius || 0}x{element.height || element.radius || 0}
                          x{element.depth || 0}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={handleCancelPreview}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 font-medium flex items-center hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <X size={16} className="mr-2" />
                  Cancel
                </button>

                <button
                  onClick={handleAddToCanvas}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white font-medium flex items-center hover:bg-blue-700"
                >
                  <Check size={16} className="mr-2" />
                  Add to Canvas
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
