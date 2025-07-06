import React, { useState, useEffect, useRef, useMemo } from "react";
import { Element, useElementsStore } from "@/src/store/elementsStore";
import { useAI } from "./ai-new/AIContextProvider";
import { UnifiedAIAgent } from "./UnifiedAIAgent";
import { ChevronLeft, ChevronRight, Cpu } from "react-feather";
import { CADAssistantBridge } from "./ai-new/OpenaiAssistant/CADAssistantBridge";
import { useSelectionStore } from "@/src/store/selectorStore";
import { useLayerStore } from "@/src/store/layerStore";
import { CADAssistantOpenai } from "./ai-new/OpenaiAssistant/CADAssistantOpenai";

interface CADAssistantToolbarProps {
  onElementsGenerated?: (elements: Element[]) => void;
  availableElements?: Element[];
  className?: string;
}

export const CADAssistantToolbar: React.FC<CADAssistantToolbarProps> = ({
  onElementsGenerated,
  availableElements = [],
  className = ""
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showCADAssistant, setShowCADAssistant] = useState(true);
  const { selectedElementIds } = useSelectionStore();
  const { elements } = useElementsStore();
  const { layers } = useLayerStore();
  const { activeLayer } = useLayerStore();
  const cadContextData = useMemo(() => {
    const selectedElementsDetails = selectedElementIds
      .map(id => elements.find(el => el.id === id))
      .filter(el => el !== undefined)
      .map(el => ({
        // Passa solo info essenziali per ridurre i token
        id: el!.id,
        type: el!.type,
        name: el!.name || "Unnamed",

        x: el!.x,
        y: el!.y,
        z: el!.z,
        rotation: el!.rotation || { x: 0, y: 0, z: 0 },
        scale: el!.scale || { x: 1, y: 1, z: 1 },
        color: el!.color || "#000000",
        linewidth: el!.linewidth || 1,
        description: el!.description || "",
        material: el!.material || "default",
        additionalProps: el!.additionalProps || {},
        operands: el!.operands || [],
        wireframe: el!.wireframe || false

        // Potresti aggiungere altre proprietà rilevanti qui se necessario
      }));

    const activeLayerDetails = layers.find(l => l.id === activeLayer);

    return {
      totalElementCount: elements.length,
      selectedElementCount: selectedElementIds.length,
      selectedElements: selectedElementsDetails, // Array con dettagli elementi selezionati
      activeLayer: activeLayerDetails ? { id: activeLayerDetails.id, name: activeLayerDetails.name } : null // Dettagli layer attivo
    };
  }, [elements, selectedElementIds, layers, activeLayer]);

  const handleClose = () => {
    setIsAnimating(true);
    setIsExpanded(false);
    setTimeout(() => setIsAnimating(false), 300);
  };

  return (
    <div
      className={`fixed right-0 top-1/2 transform -translate-y-1/2 z-50 flex flex-col h-[1000px] bg-gray-100 dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden transition-all duration-300 ease-in-out ${
        isExpanded ? "w-96" : "w-12 rounded-lg rounded-l-3xl"
      } ${className}`}
    >
      {isExpanded ? (
        <>
          {/* Header */}

          <div className=" flex h-full flex-col relative">
            <CADAssistantBridge
              isVisible={showCADAssistant}
              onClose={() => setShowCADAssistant(false)}
              initialContextData={cadContextData}
            />
          </div>

          {/* Status Indicator at bottom */}
        </>
      ) : (
        // Collapsed view
        <div className="h-full flex flex-col items-center py-4 space-y-4">
          <button
            onClick={() => setIsExpanded(true)}
            className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800"
            title="Expand AI Assistant"
          >
            <ChevronLeft size={16} className="text-blue-600 dark:text-blue-300" />
          </button>
          <Cpu size={16} className="text-gray-500 dark:text-gray-400" />

          {/* Status Indicator */}
        </div>
      )}
    </div>
  );
};
