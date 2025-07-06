import React, { useState, useEffect, useCallback } from "react";
import { useMultiToolpathStore } from "../../store/multiToolpathStore";
import { useElementsStore } from "../../store/elementsStore";
import ToolpathGenerator, { ToolpathSettings } from "./ToolpathGenerator";
import ElementSelector from "./ElementSelector";
import { Layers, Download, Eye, EyeOff, Play, Save, Settings, RefreshCw, Zap, Box } from "react-feather";
import toast from "react-hot-toast";

interface MultiToolpathGeneratorProps {
  onGCodeGenerated: (gcode: string) => void;
  onToolSelected?: (tool: any) => void;
  isSimulating?: boolean;
}

// Parse G-code to extract toolpath points
const parseGCodeToPoints = (gcode: string): any[] => {
  const points: any[] = [];
  const lines = gcode.split("\n");

  let currentX = 0;
  let currentY = 0;
  let currentZ = 0;
  let currentF = 0;

  lines.forEach(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith(";")) return;

    const isG0 = trimmedLine.includes("G0");
    const isG1 = trimmedLine.includes("G1");

    if (isG0 || isG1) {
      const xMatch = trimmedLine.match(/X([+-]?\d*\.?\d+)/);
      const yMatch = trimmedLine.match(/Y([+-]?\d*\.?\d+)/);
      const zMatch = trimmedLine.match(/Z([+-]?\d*\.?\d+)/);
      const fMatch = trimmedLine.match(/F([+-]?\d*\.?\d+)/);

      if (xMatch) currentX = parseFloat(xMatch[1]);
      if (yMatch) currentY = parseFloat(yMatch[1]);
      if (zMatch) currentZ = parseFloat(zMatch[1]);
      if (fMatch) currentF = parseFloat(fMatch[1]);

      points.push({
        x: currentX,
        y: currentY,
        z: currentZ,
        feedrate: currentF,
        type: isG0 ? "G0" : "G1",
        isRapid: isG0
      });
    }
  });

  return points;
};

const MultiToolpathGenerator: React.FC<MultiToolpathGeneratorProps> = ({
  onGCodeGenerated,
  onToolSelected,
  isSimulating = false
}) => {
  const { elements, selectedElement, selectElement } = useElementsStore();
  const {
    toolpaths,
    updateToolpathGCode,
    generateCombinedGCode,
    getToolpathByElementId,
    activeToolpathId,
    updateGlobalSettings,
    globalSettings
  } = useMultiToolpathStore();

  // State for managing which element is currently being configured
  const [configuringElementId, setConfiguringElementId] = useState<string | null>(null);
  const [showElementSelector, setShowElementSelector] = useState(true);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [defaultSettings, setDefaultSettings] = useState<ToolpathSettings>({
    machineType: "mill",
    operationType: "contour",
    material: "aluminum",
    toolType: "endmill",
    toolDiameter: 6,
    flutes: 2,
    depth: 5,
    stepdown: 1,
    stepover: 40,
    feedrate: 800,
    plungerate: 300,
    rpm: 10000,
    tolerance: 0.01,
    offset: "outside",
    direction: "climb",
    coolant: true,
    finishingPass: false,
    finishingAllowance: 0.2,
    finishingStrategy: "contour",
    useAI: false,
    aiDifficulty: "moderate",
    aiOptimize: "balance",
    optimizePath: false,
    useArcFitting: false,
    useHighSpeedMode: false,
    useExactStop: false,
    useToolCompensation: false,
    useAdaptiveFeeds: false,
    useRestMachining: false,
    toolNumber: 1,
    originType: "workpiece-center",
    originX: 0,
    originY: 0,
    originZ: 0
  });

  // Initialize global settings
  useEffect(() => {
    updateGlobalSettings(defaultSettings);
  }, []);

  // Handle G-code generation for a specific element
  const handleGCodeGenerated = useCallback(
    (elementId: string, gcode: string) => {
      // Parse the G-code to extract points
      const points = parseGCodeToPoints(gcode);

      // Update the toolpath in the store
      updateToolpathGCode(elementId, gcode, points);

      toast.success(`Toolpath generato per elemento ${elementId}`);
    },
    [updateToolpathGCode]
  );

  // Handle element selection for configuration
  const handleSelectElementForConfig = useCallback(
    (elementId: string) => {
      setConfiguringElementId(elementId);
      selectElement(elementId);

      // Find the toolpath for this element
      const toolpath = getToolpathByElementId(elementId);
      if (toolpath) {
        // Load the toolpath settings into the default settings
        setDefaultSettings(toolpath.toolpathSettings);
      }
    },
    [selectElement, getToolpathByElementId]
  );

  // Generate toolpath for a specific element
  const generateToolpathForElement = useCallback(
    (elementId: string, settings: ToolpathSettings) => {
      const element = elements.find(el => el.id === elementId);
      if (!element) {
        toast.error("Elemento non trovato");
        return;
      }

      // Select the element in the store
      selectElement(elementId);

      // The ToolpathGenerator will handle the actual G-code generation
      // We'll capture it through the onGCodeGenerated callback
      setConfiguringElementId(elementId);
    },
    [elements, selectElement]
  );

  // Generate all toolpaths
  const generateAllToolpaths = useCallback(async () => {
    setIsGeneratingAll(true);

    try {
      for (const toolpath of toolpaths) {
        if (!toolpath.gcode) {
          // Generate toolpath for this element
          await generateToolpathForElement(toolpath.elementId, toolpath.toolpathSettings);

          // Small delay to prevent overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      toast.success("Tutti i toolpath sono stati generati");
    } catch (error) {
      toast.error("Errore nella generazione dei toolpath");
      console.error(error);
    } finally {
      setIsGeneratingAll(false);
    }
  }, [toolpaths, generateToolpathForElement]);

  // Download combined G-code
  const downloadCombinedGCode = useCallback(() => {
    const combinedGCode = generateCombinedGCode();

    const blob = new Blob([combinedGCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `multi-toolpath-${new Date().toISOString().slice(0, 10)}.nc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("G-code combinato scaricato");
  }, [generateCombinedGCode]);

  // Send combined G-code to visualizer
  const sendToVisualizer = useCallback(() => {
    const combinedGCode = generateCombinedGCode();
    onGCodeGenerated(combinedGCode);
    toast.success("G-code inviato al visualizzatore");
  }, [generateCombinedGCode, onGCodeGenerated]);

  // Calculate statistics
  const statistics = {
    totalToolpaths: toolpaths.length,
    generatedToolpaths: toolpaths.filter(tp => tp.gcode).length,
    totalDistance: toolpaths.reduce((sum, tp) => sum + tp.distance, 0),
    totalTime: toolpaths.reduce((sum, tp) => sum + tp.estimatedTime, 0)
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers size={24} />
            Multi-Toolpath Generator
          </h2>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowElementSelector(!showElementSelector)}
              className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-white transition-colors"
              title="Toggle selezione elementi"
            >
              {showElementSelector ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>

            <button
              onClick={generateAllToolpaths}
              disabled={isGeneratingAll || statistics.totalToolpaths === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600
                       text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Zap size={16} />
              Genera Tutti
            </button>

            <button
              onClick={sendToVisualizer}
              disabled={statistics.generatedToolpaths === 0}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600
                       text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Play size={16} />
              Visualizza
            </button>

            <button
              onClick={downloadCombinedGCode}
              disabled={statistics.generatedToolpaths === 0}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600
                       text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Download size={16} />
              Scarica G-Code
            </button>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-gray-400">Toolpath Totali</div>
            <div className="text-2xl font-bold text-white">{statistics.totalToolpaths}</div>
          </div>

          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-gray-400">Generati</div>
            <div className="text-2xl font-bold text-green-400">{statistics.generatedToolpaths}</div>
          </div>

          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-gray-400">Distanza Totale</div>
            <div className="text-2xl font-bold text-blue-400">{(statistics.totalDistance / 1000).toFixed(2)}m</div>
          </div>

          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-gray-400">Tempo Stimato</div>
            <div className="text-2xl font-bold text-yellow-400">
              {Math.floor(statistics.totalTime / 60)}:{(statistics.totalTime % 60).toFixed(0).padStart(2, "0")}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Element Selector Panel */}
        {showElementSelector && (
          <div className="w-96 bg-gray-800 border-r border-gray-700 overflow-y-auto">
            <ElementSelector
              globalSettings={defaultSettings}
              onGenerateToolpath={generateToolpathForElement}
              onSelectElement={handleSelectElementForConfig}
            />
          </div>
        )}

        {/* Toolpath Generator Panel */}
        <div className="flex-1 overflow-y-auto">
          {configuringElementId ? (
            <div className="p-4">
              <div className="mb-4 bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Box size={20} className="text-blue-400" />
                  <span className="text-white">Configurazione toolpath per: {configuringElementId}</span>
                </div>

                <button
                  onClick={() => setConfiguringElementId(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <ToolpathGenerator
                onGCodeGenerated={gcode => {
                  if (configuringElementId) {
                    handleGCodeGenerated(configuringElementId, gcode);
                  }
                }}
                onToolSelected={onToolSelected}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Layers size={64} className="text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">Seleziona un elemento per configurare il toolpath</p>
                <p className="text-gray-500 text-sm mt-2">Usa il pannello laterale per selezionare gli elementi CAD</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MultiToolpathGenerator;
