/**
 * AdvancedPostProcessorPanel.tsx
 * Advanced panel for G-code post-processing
 * Supports Fanuc and Heidenhain controllers with numerous optimization options
 */

import React, { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  Info,
  Cpu,
  Check,
  X,
  AlertTriangle,
  Download,
  Settings,
  Sliders,
  Loader,
  Save,
  Eye
} from "react-feather";
import {
  ControllerType,
  OptimizationOptions,
  OptimizationResult,
  AdvancedPostProcessor
} from "src/lib/advanced-post-processor";

interface AdvancedPostProcessorPanelProps {
  initialGcode: string;
  controllerType: ControllerType;
  onProcessedGcode: (gcode: string, stats?: any) => void;
}

const AdvancedPostProcessorPanel: React.FC<AdvancedPostProcessorPanelProps> = ({
  initialGcode,
  controllerType,
  onProcessedGcode
}) => {
  // G-code state and results
  const [inputGcode, setInputGcode] = useState(initialGcode);
  const [outputGcode, setOutputGcode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [selectedController, setSelectedController] = useState<ControllerType>(controllerType);

  // Options state
  const [options, setOptions] = useState<OptimizationOptions>({
    removeRedundantMoves: true,
    removeRedundantCodes: true,
    optimizeRapidMoves: true,
    optimizeToolpaths: true,
    optimizeFeedrates: true,
    useHighSpeedMode: false,
    useLookAhead: true,
    useTCPMode: false,
    useArcOptimization: true,
    consolidateGCodes: true,
    removeEmptyLines: true,
    removeComments: false,
    minimizeAxisMovement: true,
    safetyChecks: true,

    controllerSpecific: {
      fanuc: {
        useDecimalFormat: true,
        useModalGCodes: true,
        useAI: false,
        useNanoSmoothing: false,
        useCornerRounding: false,
        useHighPrecisionMode: false,
        useCompactGCode: true
      },
      heidenhain: {
        useConversationalFormat: true,
        useFunctionBlocks: true,
        useCycleDefine: true,
        useParameterProgramming: false,
        useTCP: false,
        useRadiusCompensation3D: false,
        useSmartTurning: true
      }
    }
  });

  // Open panels management
  const [expanded, setExpanded] = useState({
    generalOptions: true,
    controllerOptions: true,
    results: true,
    preview: false
  });

  // Initialization and update
  useEffect(() => {
    if (initialGcode !== inputGcode) {
      setInputGcode(initialGcode);
      setOutputGcode("");
      setResult(null);
    }
  }, [initialGcode]);

  useEffect(() => {
    setSelectedController(controllerType);
  }, [controllerType]);

  // Toggle panels
  const toggleSection = (section: keyof typeof expanded) => {
    setExpanded(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Update options
  const updateOption = <K extends keyof OptimizationOptions>(key: K, value: OptimizationOptions[K]) => {
    setOptions(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Update controller-specific options
  const updateControllerOption = <
    C extends keyof OptimizationOptions["controllerSpecific"],
    K extends keyof NonNullable<OptimizationOptions["controllerSpecific"][C]>
  >(
    controller: C,
    key: K,
    value: any
  ) => {
    setOptions(prev => ({
      ...prev,
      controllerSpecific: {
        ...prev.controllerSpecific,
        [controller]: {
          ...prev.controllerSpecific[controller],
          [key]: value
        }
      }
    }));
  };

  // Process G-code
  const processGcode = async () => {
    if (!inputGcode) return;

    setIsProcessing(true);
    setResult(null);

    try {
      // Create the post-processor
      const postProcessor = new AdvancedPostProcessor(selectedController, options);

      // Process the code
      const result = await postProcessor.processGCode(inputGcode);

      // Update state
      setOutputGcode(result.code);
      setResult(result);

      // Send the result to the parent component
      onProcessedGcode(result.code, result.stats);
    } catch (error) {
      console.error("Error during post-processing:", error);
      // Show error
    } finally {
      setIsProcessing(false);
      // Open the results panel
      setExpanded(prev => ({
        ...prev,
        results: true
      }));
    }
  };

  // Save G-code
  const saveGcode = () => {
    if (!outputGcode) return;

    const blob = new Blob([outputGcode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    // Filename with date and controller type
    const date = new Date().toISOString().slice(0, 10);
    const extension = selectedController === "heidenhain" ? ".h" : ".nc";
    a.download = `optimized_${selectedController}_${date}${extension}`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Apply optimization preset
  const applyOptimizationPreset = (preset: "basic" | "speed" | "quality" | "advanced") => {
    switch (preset) {
      case "basic":
        setOptions({
          ...options,
          removeRedundantMoves: true,
          removeRedundantCodes: true,
          optimizeRapidMoves: true,
          optimizeToolpaths: false,
          optimizeFeedrates: true,
          useHighSpeedMode: false,
          useLookAhead: false,
          useTCPMode: false,
          useArcOptimization: true,
          consolidateGCodes: true,
          removeEmptyLines: true,
          removeComments: false,
          minimizeAxisMovement: false,
          safetyChecks: true,
          controllerSpecific: {
            ...options.controllerSpecific,
            fanuc: {
              ...options.controllerSpecific.fanuc,
              useDecimalFormat: true,
              useModalGCodes: true,
              useAI: false,
              useNanoSmoothing: false,
              useCornerRounding: false,
              useHighPrecisionMode: false,
              useCompactGCode: true
            },
            heidenhain: {
              ...options.controllerSpecific.heidenhain,
              useConversationalFormat: true,
              useFunctionBlocks: false,
              useCycleDefine: true,
              useParameterProgramming: false,
              useTCP: false,
              useRadiusCompensation3D: false,
              useSmartTurning: false
            }
          }
        });
        break;
      case "speed":
        setOptions({
          ...options,
          removeRedundantMoves: true,
          removeRedundantCodes: true,
          optimizeRapidMoves: true,
          optimizeToolpaths: true,
          optimizeFeedrates: true,
          useHighSpeedMode: true,
          useLookAhead: true,
          useTCPMode: false,
          useArcOptimization: true,
          consolidateGCodes: true,
          removeEmptyLines: true,
          removeComments: true,
          minimizeAxisMovement: true,
          safetyChecks: true,
          controllerSpecific: {
            ...options.controllerSpecific,
            fanuc: {
              ...options.controllerSpecific.fanuc,
              useDecimalFormat: true,
              useModalGCodes: true,
              useAI: true,
              useNanoSmoothing: true,
              useCornerRounding: true,
              useHighPrecisionMode: false,
              useCompactGCode: true
            },
            heidenhain: {
              ...options.controllerSpecific.heidenhain,
              useConversationalFormat: true,
              useFunctionBlocks: true,
              useCycleDefine: true,
              useParameterProgramming: false,
              useTCP: true,
              useRadiusCompensation3D: false,
              useSmartTurning: true
            }
          }
        });
        break;
      case "quality":
        setOptions({
          ...options,
          removeRedundantMoves: true,
          removeRedundantCodes: true,
          optimizeRapidMoves: true,
          optimizeToolpaths: true,
          optimizeFeedrates: true,
          useHighSpeedMode: false,
          useLookAhead: true,
          useTCPMode: true,
          useArcOptimization: true,
          consolidateGCodes: true,
          removeEmptyLines: true,
          removeComments: false,
          minimizeAxisMovement: false,
          safetyChecks: true,
          controllerSpecific: {
            ...options.controllerSpecific,
            fanuc: {
              ...options.controllerSpecific.fanuc,
              useDecimalFormat: true,
              useModalGCodes: true,
              useAI: false,
              useNanoSmoothing: false,
              useCornerRounding: false,
              useHighPrecisionMode: true,
              useCompactGCode: false
            },
            heidenhain: {
              ...options.controllerSpecific.heidenhain,
              useConversationalFormat: true,
              useFunctionBlocks: true,
              useCycleDefine: true,
              useParameterProgramming: true,
              useTCP: true,
              useRadiusCompensation3D: true,
              useSmartTurning: true
            }
          }
        });
        break;
      case "advanced":
        setOptions({
          ...options,
          removeRedundantMoves: true,
          removeRedundantCodes: true,
          optimizeRapidMoves: true,
          optimizeToolpaths: true,
          optimizeFeedrates: true,
          useHighSpeedMode: true,
          useLookAhead: true,
          useTCPMode: true,
          useArcOptimization: true,
          consolidateGCodes: true,
          removeEmptyLines: true,
          removeComments: false,
          minimizeAxisMovement: true,
          safetyChecks: true,
          controllerSpecific: {
            ...options.controllerSpecific,
            fanuc: {
              ...options.controllerSpecific.fanuc,
              useDecimalFormat: true,
              useModalGCodes: true,
              useAI: true,
              useNanoSmoothing: true,
              useCornerRounding: true,
              useHighPrecisionMode: true,
              useCompactGCode: true
            },
            heidenhain: {
              ...options.controllerSpecific.heidenhain,
              useConversationalFormat: true,
              useFunctionBlocks: true,
              useCycleDefine: true,
              useParameterProgramming: true,
              useTCP: true,
              useRadiusCompensation3D: true,
              useSmartTurning: true
            }
          }
        });
        break;
    }
  };

  // Get controller-specific optimizations description
  const getControllerSpecificDescription = (): string => {
    switch (selectedController) {
      case "fanuc":
        return "Specific optimizations for Fanuc controllers include support for High-Speed modes, AICC (AI Contour Control), Nano Smoothing, and corner rounding for smoother paths.";
      case "heidenhain":
        return "Specific optimizations for Heidenhain controllers include conversational format, function blocks, advanced cycles, parameter programming, and TCPM support.";
      case "siemens":
        return "Specific optimizations for Siemens/Sinumerik controllers include code compaction, look-ahead optimization, and support for advanced cycles.";
      case "haas":
        return "Specific optimizations for Haas controllers include support for Haas-specific macros and cycles.";
      case "mazak":
        return "Specific optimizations for Mazak controllers include SMOOTH mode and support for advanced cycles.";
      case "okuma":
        return "Specific optimizations for Okuma controllers include OSP syntax and advanced cycles.";
      default:
        return "Generic optimizations compatible with most CNC controllers.";
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold text-gray-800 flex items-center mb-2">
          <Cpu size={20} className="mr-2 text-blue-600" />
          Advanced Post-Processor
        </h2>

        <p className="text-sm text-gray-600 mb-4">
          Optimize and convert G-code for {selectedController.charAt(0).toUpperCase() + selectedController.slice(1)}{" "}
          controllers. Configure options to adapt the code to your CNC specifications.
        </p>

        {/* Controller selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Controller Type</label>
          <div className="flex space-x-2">
            <select
              className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={selectedController}
              onChange={e => setSelectedController(e.target.value as ControllerType)}
            >
              <option value="fanuc">Fanuc</option>
              <option value="heidenhain">Heidenhain</option>
              <option value="siemens">Siemens</option>
              <option value="haas">Haas</option>
              <option value="mazak">Mazak</option>
              <option value="okuma">Okuma</option>
              <option value="generic">Generic</option>
            </select>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center"
              onClick={processGcode}
              disabled={isProcessing || !inputGcode}
            >
              {isProcessing ? (
                <Loader size={18} className="mr-2 animate-spin" />
              ) : (
                <Settings size={18} className="mr-2" />
              )}
              {isProcessing ? "Processing..." : "Process G-code"}
            </button>
          </div>
        </div>

        {/* Preset buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-sm font-medium text-gray-700 self-center mr-2">Presets:</span>
          <button
            type="button"
            className="px-3 py-1 bg-gray-100 text-gray-800 text-sm rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400"
            onClick={() => applyOptimizationPreset("basic")}
          >
            Basic
          </button>
          <button
            type="button"
            className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
            onClick={() => applyOptimizationPreset("speed")}
          >
            Speed
          </button>
          <button
            type="button"
            className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-400"
            onClick={() => applyOptimizationPreset("quality")}
          >
            Quality
          </button>
          <button
            type="button"
            className="px-3 py-1 bg-purple-100 text-purple-800 text-sm rounded hover:bg-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
            onClick={() => applyOptimizationPreset("advanced")}
          >
            Advanced
          </button>
        </div>

        {/* Controller specific info */}
        <div className="p-3 bg-blue-50 rounded-md mb-4 text-sm text-blue-800">
          <div className="flex items-start">
            <Info size={16} className="mt-0.5 mr-2 flex-shrink-0 text-blue-600" />
            <p>{getControllerSpecificDescription()}</p>
          </div>
        </div>
      </div>

      {/* General options */}
      <div className="border-b">
        <div
          className="flex items-center justify-between p-4 cursor-pointer"
          onClick={() => toggleSection("generalOptions")}
        >
          <h3 className="text-lg font-medium text-gray-800 flex items-center">
            <Sliders size={18} className="mr-2 text-blue-600" />
            General Options
          </h3>
          {expanded.generalOptions ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>

        {expanded.generalOptions && (
          <div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Path Optimization</h4>

              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="removeRedundantMoves"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.removeRedundantMoves}
                    onChange={e => updateOption("removeRedundantMoves", e.target.checked)}
                  />
                  <label htmlFor="removeRedundantMoves" className="ml-2 block text-sm text-gray-700">
                    Remove redundant moves
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="optimizeRapidMoves"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.optimizeRapidMoves}
                    onChange={e => updateOption("optimizeRapidMoves", e.target.checked)}
                  />
                  <label htmlFor="optimizeRapidMoves" className="ml-2 block text-sm text-gray-700">
                    Optimize rapid moves
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="optimizeToolpaths"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.optimizeToolpaths}
                    onChange={e => updateOption("optimizeToolpaths", e.target.checked)}
                  />
                  <label htmlFor="optimizeToolpaths" className="ml-2 block text-sm text-gray-700">
                    Optimize toolpaths
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="minimizeAxisMovement"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.minimizeAxisMovement}
                    onChange={e => updateOption("minimizeAxisMovement", e.target.checked)}
                  />
                  <label htmlFor="minimizeAxisMovement" className="ml-2 block text-sm text-gray-700">
                    Minimize axis movement
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="useArcOptimization"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.useArcOptimization}
                    onChange={e => updateOption("useArcOptimization", e.target.checked)}
                  />
                  <label htmlFor="useArcOptimization" className="ml-2 block text-sm text-gray-700">
                    Optimize arcs and circles
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-700 mb-2">Code Optimization</h4>

              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="removeRedundantCodes"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.removeRedundantCodes}
                    onChange={e => updateOption("removeRedundantCodes", e.target.checked)}
                  />
                  <label htmlFor="removeRedundantCodes" className="ml-2 block text-sm text-gray-700">
                    Remove redundant codes
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="optimizeFeedrates"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.optimizeFeedrates}
                    onChange={e => updateOption("optimizeFeedrates", e.target.checked)}
                  />
                  <label htmlFor="optimizeFeedrates" className="ml-2 block text-sm text-gray-700">
                    Optimize feed rates
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="consolidateGCodes"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.consolidateGCodes}
                    onChange={e => updateOption("consolidateGCodes", e.target.checked)}
                  />
                  <label htmlFor="consolidateGCodes" className="ml-2 block text-sm text-gray-700">
                    Consolidate modal G-codes
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="removeEmptyLines"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.removeEmptyLines}
                    onChange={e => updateOption("removeEmptyLines", e.target.checked)}
                  />
                  <label htmlFor="removeEmptyLines" className="ml-2 block text-sm text-gray-700">
                    Remove excess empty lines
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="removeComments"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.removeComments}
                    onChange={e => updateOption("removeComments", e.target.checked)}
                  />
                  <label htmlFor="removeComments" className="ml-2 block text-sm text-gray-700">
                    Remove comments
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-700 mb-2">Advanced Features</h4>

              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="useHighSpeedMode"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.useHighSpeedMode}
                    onChange={e => updateOption("useHighSpeedMode", e.target.checked)}
                  />
                  <label htmlFor="useHighSpeedMode" className="ml-2 block text-sm text-gray-700">
                    Enable high-speed mode
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="useLookAhead"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.useLookAhead}
                    onChange={e => updateOption("useLookAhead", e.target.checked)}
                  />
                  <label htmlFor="useLookAhead" className="ml-2 block text-sm text-gray-700">
                    Enable look-ahead
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="useTCPMode"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.useTCPMode}
                    onChange={e => updateOption("useTCPMode", e.target.checked)}
                  />
                  <label htmlFor="useTCPMode" className="ml-2 block text-sm text-gray-700">
                    Enable TCP/TCPM (5-axis)
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="safetyChecks"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.safetyChecks}
                    onChange={e => updateOption("safetyChecks", e.target.checked)}
                  />
                  <label htmlFor="safetyChecks" className="ml-2 block text-sm text-gray-700">
                    Perform safety checks
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controller Specific Options */}
      <div className="border-b">
        <div
          className="flex items-center justify-between p-4 cursor-pointer"
          onClick={() => toggleSection("controllerOptions")}
        >
          <h3 className="text-lg font-medium text-gray-800 flex items-center">
            <Settings size={18} className="mr-2 text-blue-600" />
            {selectedController.charAt(0).toUpperCase() + selectedController.slice(1)} Specific Options
          </h3>
          {expanded.controllerOptions ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>

        {expanded.controllerOptions && (
          <div className="p-4 pt-0">
            {/* Fanuc Specific Options */}
            {selectedController === "fanuc" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Format Optimization</h4>

                  <div className="space-y-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="fanucUseDecimalFormat"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.fanuc?.useDecimalFormat}
                        onChange={e => updateControllerOption("fanuc", "useDecimalFormat", e.target.checked)}
                      />
                      <label htmlFor="fanucUseDecimalFormat" className="ml-2 block text-sm text-gray-700">
                        Use decimal format
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="fanucUseModalGCodes"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.fanuc?.useModalGCodes}
                        onChange={e => updateControllerOption("fanuc", "useModalGCodes", e.target.checked)}
                      />
                      <label htmlFor="fanucUseModalGCodes" className="ml-2 block text-sm text-gray-700">
                        Use modal G-codes
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="fanucUseCompactGCode"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.fanuc?.useCompactGCode}
                        onChange={e => updateControllerOption("fanuc", "useCompactGCode", e.target.checked)}
                      />
                      <label htmlFor="fanucUseCompactGCode" className="ml-2 block text-sm text-gray-700">
                        Generate compact G-code
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Advanced Features</h4>

                  <div className="space-y-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="fanucUseAI"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.fanuc?.useAI}
                        onChange={e => updateControllerOption("fanuc", "useAI", e.target.checked)}
                      />
                      <label htmlFor="fanucUseAI" className="ml-2 block text-sm text-gray-700">
                        Enable AI Contour Control
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="fanucUseNanoSmoothing"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.fanuc?.useNanoSmoothing}
                        onChange={e => updateControllerOption("fanuc", "useNanoSmoothing", e.target.checked)}
                      />
                      <label htmlFor="fanucUseNanoSmoothing" className="ml-2 block text-sm text-gray-700">
                        Enable Nano Smoothing
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="fanucUseCornerRounding"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.fanuc?.useCornerRounding}
                        onChange={e => updateControllerOption("fanuc", "useCornerRounding", e.target.checked)}
                      />
                      <label htmlFor="fanucUseCornerRounding" className="ml-2 block text-sm text-gray-700">
                        Enable corner rounding
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="fanucUseHighPrecisionMode"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.fanuc?.useHighPrecisionMode}
                        onChange={e => updateControllerOption("fanuc", "useHighPrecisionMode", e.target.checked)}
                      />
                      <label htmlFor="fanucUseHighPrecisionMode" className="ml-2 block text-sm text-gray-700">
                        Enable high-precision mode
                      </label>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="p-3 bg-yellow-50 rounded-md mt-2">
                    <div className="flex items-start">
                      <Info size={16} className="mt-0.5 mr-2 flex-shrink-0 text-yellow-600" />
                      <p className="text-sm text-yellow-800">
                        Advanced Fanuc options like AI Contour Control and Nano Smoothing require the CNC controller to
                        support these features. Verify that your controller supports these functions before using them.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Heidenhain Specific Options */}
            {selectedController === "heidenhain" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Program Format</h4>

                  <div className="space-y-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="heidenhainUseConversationalFormat"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.heidenhain?.useConversationalFormat}
                        onChange={e =>
                          updateControllerOption("heidenhain", "useConversationalFormat", e.target.checked)
                        }
                      />
                      <label htmlFor="heidenhainUseConversationalFormat" className="ml-2 block text-sm text-gray-700">
                        Use conversational format
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="heidenhainUseFunctionBlocks"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.heidenhain?.useFunctionBlocks}
                        onChange={e => updateControllerOption("heidenhain", "useFunctionBlocks", e.target.checked)}
                      />
                      <label htmlFor="heidenhainUseFunctionBlocks" className="ml-2 block text-sm text-gray-700">
                        Use function blocks (LBL)
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="heidenhainUseCycleDefine"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.heidenhain?.useCycleDefine}
                        onChange={e => updateControllerOption("heidenhain", "useCycleDefine", e.target.checked)}
                      />
                      <label htmlFor="heidenhainUseCycleDefine" className="ml-2 block text-sm text-gray-700">
                        Use defined cycles (CYCL DEF)
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="heidenhainUseParameterProgramming"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.heidenhain?.useParameterProgramming}
                        onChange={e =>
                          updateControllerOption("heidenhain", "useParameterProgramming", e.target.checked)
                        }
                      />
                      <label htmlFor="heidenhainUseParameterProgramming" className="ml-2 block text-sm text-gray-700">
                        Use parametric programming
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Advanced Features</h4>

                  <div className="space-y-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="heidenhainUseTCP"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.heidenhain?.useTCP}
                        onChange={e => updateControllerOption("heidenhain", "useTCP", e.target.checked)}
                      />
                      <label htmlFor="heidenhainUseTCP" className="ml-2 block text-sm text-gray-700">
                        Enable TCPM (5-axis)
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="heidenhainUseRadiusCompensation3D"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.heidenhain?.useRadiusCompensation3D}
                        onChange={e =>
                          updateControllerOption("heidenhain", "useRadiusCompensation3D", e.target.checked)
                        }
                      />
                      <label htmlFor="heidenhainUseRadiusCompensation3D" className="ml-2 block text-sm text-gray-700">
                        3D radius compensation
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="heidenhainUseSmartTurning"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.heidenhain?.useSmartTurning}
                        onChange={e => updateControllerOption("heidenhain", "useSmartTurning", e.target.checked)}
                      />
                      <label htmlFor="heidenhainUseSmartTurning" className="ml-2 block text-sm text-gray-700">
                        Enable Smart Turning
                      </label>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="p-3 bg-yellow-50 rounded-md mt-2">
                    <div className="flex items-start">
                      <Info size={16} className="mt-0.5 mr-2 flex-shrink-0 text-yellow-600" />
                      <p className="text-sm text-yellow-800">
                        Converting standard G-code to Heidenhain conversational format may require additional manual
                        adjustments for complex operations. Always verify the result before using it on the machine.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Other controllers */}
            {["siemens", "haas", "mazak", "okuma", "generic"].includes(selectedController) && (
              <div className="p-3 bg-blue-50 rounded-md">
                <div className="flex items-start">
                  <Info size={16} className="mt-0.5 mr-2 flex-shrink-0 text-blue-600" />
                  <p className="text-sm text-blue-800">
                    Optimizations for the {selectedController.charAt(0).toUpperCase() + selectedController.slice(1)}{" "}
                    controller use the general optimization options configured in the previous section. Extended options
                    are available only for Fanuc and Heidenhain controllers.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="border-b">
          <div
            className="flex items-center justify-between p-4 cursor-pointer"
            onClick={() => toggleSection("results")}
          >
            <h3 className="text-lg font-medium text-gray-800 flex items-center">
              <Check size={18} className="mr-2 text-green-600" />
              Optimization Results
            </h3>
            {expanded.results ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>

          {expanded.results && (
            <div className="p-4 pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Statistics</h4>

                  <div className="bg-gray-50 p-3 rounded-md">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Original lines:</span>
                        <span className="font-medium">{result.stats.originalLines}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Optimized lines:</span>
                        <span className="font-medium">{result.stats.optimizedLines}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Reduction:</span>
                        <span className="font-medium">{result.stats.reductionPercent.toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Estimated time:</span>
                        <span className="font-medium">-{result.stats.estimatedTimeReduction.toFixed(2)} min</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Safety Checks</h4>

                  {result.validation.isValid ? (
                    <div className="bg-green-50 p-3 rounded-md flex items-start">
                      <Check size={16} className="mt-0.5 mr-2 flex-shrink-0 text-green-600" />
                      <p className="text-sm text-green-800">The optimized G-code passed all safety checks.</p>
                    </div>
                  ) : (
                    <div className="bg-red-50 p-3 rounded-md flex items-start">
                      <AlertTriangle size={16} className="mt-0.5 mr-2 flex-shrink-0 text-red-600" />
                      <div>
                        <p className="text-sm font-medium text-red-800 mb-1">Warning: Issues detected in the G-code</p>
                        <ul className="text-sm text-red-800 list-disc list-inside">
                          {result.validation.errors.map((error, index) => (
                            <li key={`error-${index}`}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {result.validation.warnings.length > 0 && (
                    <div className="bg-yellow-50 p-3 rounded-md flex items-start mt-2">
                      <AlertTriangle size={16} className="mt-0.5 mr-2 flex-shrink-0 text-yellow-600" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800 mb-1">Warnings:</p>
                        <ul className="text-sm text-yellow-800 list-disc list-inside">
                          {result.validation.warnings.map((warning, index) => (
                            <li key={`warning-${index}`}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <h4 className="font-medium text-gray-700 mb-2">Applied Optimizations</h4>

                <div className="bg-blue-50 p-3 rounded-md">
                  <ul className="text-sm text-blue-800 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {result.improvements.map((improvement, index) => (
                      <li key={`improvement-${index}`} className="flex items-start">
                        <Check size={14} className="mt-0.5 mr-2 flex-shrink-0 text-blue-600" />
                        <span>{improvement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  className="flex items-center px-4 py-2 text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={() => toggleSection("preview")}
                >
                  <Eye size={16} className="mr-2" />
                  {expanded.preview ? "Hide Preview" : "Show Preview"}
                </button>

                <button
                  type="button"
                  className="flex items-center px-4 py-2 text-green-700 bg-green-100 rounded-md hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500"
                  onClick={saveGcode}
                >
                  <Save size={16} className="mr-2" />
                  Save G-code
                </button>

                <button
                  type="button"
                  className="flex items-center px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={processGcode}
                >
                  <Settings size={16} className="mr-2" />
                  Reprocess
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* G-code Preview */}
      {result && expanded.preview && (
        <div className="p-4">
          <h3 className="text-lg font-medium text-gray-800 mb-2">Optimized G-code Preview</h3>

          <div className="bg-gray-100 p-3 rounded-md overflow-auto max-h-96">
            <pre className="text-sm font-mono whitespace-pre-wrap">{outputGcode}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedPostProcessorPanel;
