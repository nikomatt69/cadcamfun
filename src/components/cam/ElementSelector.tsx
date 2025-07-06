import React, { useState, useMemo } from "react";
import { useElementsStore } from "../../store/elementsStore";
import { useMultiToolpathStore } from "../../store/multiToolpathStore";
import { ToolpathSettings } from "./ToolpathGenerator";
import {
  Eye,
  EyeOff,
  Settings,
  Trash2,
  Copy,
  Layers,
  ChevronUp,
  ChevronDown,
  CheckSquare,
  Square,
  Circle,
  Box,
  Triangle,
  Hexagon
} from "react-feather";

interface ElementSelectorProps {
  globalSettings: ToolpathSettings;
  onGenerateToolpath: (elementId: string, settings: ToolpathSettings) => void;
  onSelectElement: (elementId: string) => void;
}

const ElementSelector: React.FC<ElementSelectorProps> = ({ globalSettings, onGenerateToolpath, onSelectElement }) => {
  const { elements } = useElementsStore();
  const {
    toolpaths,
    addToolpath,
    removeToolpath,
    toggleToolpathVisibility,
    selectToolpath,
    deselectToolpath,
    moveToolpathUp,
    moveToolpathDown,
    getToolpathByElementId,
    updateToolpath
  } = useMultiToolpathStore();

  const [expandedElements, setExpandedElements] = useState<Set<string>>(new Set());
  const [selectedForGeneration, setSelectedForGeneration] = useState<Set<string>>(new Set());

  // Filtra elementi validi per toolpath
  const validElements = useMemo(() => {
    return elements.filter(el => el.type && !["grid", "axis", "light"].includes(el.type) && el.visible !== false);
  }, [elements]);

  // Ottieni icona per tipo di elemento
  const getElementIcon = (type: string) => {
    switch (type) {
      case "circle":
        return <Circle size={16} />;
      case "rectangle":
      case "box":
      case "cube":
        return <Box size={16} />;
      case "triangle":
        return <Triangle size={16} />;
      case "polygon":
        return <Hexagon size={16} />;
      default:
        return <Layers size={16} />;
    }
  };

  // Toggle selezione elemento per generazione
  const toggleElementSelection = (elementId: string) => {
    const newSelection = new Set(selectedForGeneration);
    if (newSelection.has(elementId)) {
      newSelection.delete(elementId);
    } else {
      newSelection.add(elementId);
    }
    setSelectedForGeneration(newSelection);
  };

  // Genera toolpath per elementi selezionati
  const generateToolpathsForSelected = () => {
    selectedForGeneration.forEach(elementId => {
      const element = elements.find(el => el.id === elementId);
      if (element && !getToolpathByElementId(elementId)) {
        const toolpathId = addToolpath(
          elementId,
          element.type,
          element.name || `${element.type}-${elementId.slice(0, 8)}`,
          globalSettings
        );

        // Genera il toolpath
        onGenerateToolpath(elementId, globalSettings);
      }
    });
    setSelectedForGeneration(new Set());
  };

  // Rimuovi tutti i toolpath selezionati
  const removeSelectedToolpaths = () => {
    toolpaths
      .filter(tp => tp.selected)
      .forEach(tp => {
        removeToolpath(tp.id);
      });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <Layers size={20} />
        Gestione Multi-Toolpath
      </h3>

      {/* Sezione Elementi CAD */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-300 mb-2">Elementi CAD Disponibili ({validElements.length})</h4>

        <div className="max-h-60 overflow-y-auto border border-gray-700 rounded-lg p-2">
          {validElements.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">Nessun elemento CAD disponibile</p>
          ) : (
            <div className="space-y-1">
              {validElements.map(element => {
                const hasToolpath = !!getToolpathByElementId(element.id);
                const isSelected = selectedForGeneration.has(element.id);

                return (
                  <div
                    key={element.id}
                    className={`
                      flex items-center justify-between p-2 rounded
                      ${hasToolpath ? "bg-green-900/30" : "bg-gray-700/50"}
                      ${isSelected ? "ring-2 ring-blue-500" : ""}
                      hover:bg-gray-700 transition-colors cursor-pointer
                    `}
                    onClick={() => !hasToolpath && toggleElementSelection(element.id)}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          !hasToolpath && toggleElementSelection(element.id);
                        }}
                        className="text-gray-400 hover:text-white"
                        disabled={hasToolpath}
                      >
                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>

                      {getElementIcon(element.type)}

                      <span className="text-sm text-white">
                        {element.name || `${element.type}-${element.id.slice(0, 8)}`}
                      </span>

                      {hasToolpath && <span className="text-xs text-green-400 ml-2">(Toolpath generato)</span>}
                    </div>

                    <div className="flex items-center gap-1">
                      {element.width && element.height && (
                        <span className="text-xs text-gray-400">
                          {element.width.toFixed(1)}x{element.height.toFixed(1)}
                        </span>
                      )}
                      {element.radius && <span className="text-xs text-gray-400">R{element.radius.toFixed(1)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedForGeneration.size > 0 && (
          <button
            onClick={generateToolpathsForSelected}
            className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg
                     transition-colors flex items-center justify-center gap-2"
          >
            <Layers size={16} />
            Genera Toolpath per {selectedForGeneration.size} elementi
          </button>
        )}
      </div>

      {/* Sezione Toolpath Generati */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-300">Toolpath Generati ({toolpaths.length})</h4>

          {toolpaths.some(tp => tp.selected) && (
            <button
              onClick={removeSelectedToolpaths}
              className="text-red-400 hover:text-red-300 transition-colors"
              title="Rimuovi toolpath selezionati"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {toolpaths.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">Nessun toolpath generato</p>
          ) : (
            toolpaths.map((toolpath, index) => (
              <div
                key={toolpath.id}
                className={`
                  border rounded-lg p-3 transition-colors
                  ${toolpath.selected ? "border-blue-500 bg-blue-900/20" : "border-gray-700 bg-gray-800/50"}
                `}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => (toolpath.selected ? deselectToolpath(toolpath.id) : selectToolpath(toolpath.id))}
                      className="text-gray-400 hover:text-white"
                    >
                      {toolpath.selected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>

                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: toolpath.color }}
                      title="Colore visualizzazione"
                    />

                    {getElementIcon(toolpath.elementType)}

                    <span className="text-sm text-white font-medium">{toolpath.elementName}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleToolpathVisibility(toolpath.id)}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                      title={toolpath.visible ? "Nascondi" : "Mostra"}
                    >
                      {toolpath.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>

                    <button
                      onClick={() => onSelectElement(toolpath.elementId)}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                      title="Modifica impostazioni"
                    >
                      <Settings size={16} />
                    </button>

                    <button
                      onClick={() => moveToolpathUp(toolpath.id)}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                      disabled={index === 0}
                      title="Sposta su"
                    >
                      <ChevronUp size={16} />
                    </button>

                    <button
                      onClick={() => moveToolpathDown(toolpath.id)}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                      disabled={index === toolpaths.length - 1}
                      title="Sposta giù"
                    >
                      <ChevronDown size={16} />
                    </button>

                    <button
                      onClick={() => removeToolpath(toolpath.id)}
                      className="p-1 text-red-400 hover:text-red-300 transition-colors"
                      title="Rimuovi"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Info toolpath */}
                <div className="text-xs text-gray-400 flex items-center gap-4">
                  <span>Ø{toolpath.toolpathSettings.toolDiameter}mm</span>
                  <span>{toolpath.toolpathSettings.operationType}</span>
                  {toolpath.distance > 0 && <span>Dist: {(toolpath.distance / 1000).toFixed(2)}m</span>}
                  {toolpath.estimatedTime > 0 && (
                    <span>
                      Tempo: {Math.floor(toolpath.estimatedTime / 60)}:
                      {(toolpath.estimatedTime % 60).toFixed(0).padStart(2, "0")}
                    </span>
                  )}
                </div>

                {/* Barra progresso se G-code generato */}
                {toolpath.gcode && (
                  <div className="mt-2 bg-gray-700 rounded-full h-1 overflow-hidden">
                    <div className="h-full bg-green-500 transition-all duration-500" style={{ width: "100%" }} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ElementSelector;
