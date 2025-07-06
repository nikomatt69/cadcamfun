import React, { useState, useEffect, useMemo } from "react";
import { useElementsStore } from "@/src/store/elementsStore";
import { CADAssistantOpenai } from "./CADAssistantOpenai";
import { createCadActionHandler } from "@/src/lib/ai/cadActionHandler";
import { useCADAssistant, UseCADAssistantProps } from "@/src/hooks/useCADAssistant";
import { AIMessage } from "@/src/types/AITypes";

interface CADAssistantBridgeProps {
  isVisible: boolean;
  onClose: () => void;
  initialContextData?: any;
}

export const CADAssistantBridge: React.FC<CADAssistantBridgeProps> = ({
  isVisible,
  onClose,
  initialContextData = {}
}) => {
  // Get access to the elements store
  const { elements, addElements, updateElement, deleteElement } = useElementsStore();

  // Create CAD context state
  const [cadContext, setCadContext] = useState<any>(initialContextData);

  // Update CAD context when elements change
  useEffect(() => {
    const cadContextData = {
      elementCount: elements.length,
      elementTypes: Array.from(new Set(elements.map(el => el.type))),
      elementSummary: elements.map(el => ({
        id: el.id,
        type: el.type,
        position: { x: el.x, y: el.y, z: el.z || 0, x2: el.x2 || 0, y2: el.y2 || 0, z2: el.z2 || 0 },
        dimensions: {
          width: el.width,
          height: el.height,
          depth: el.depth,
          radius: el.radius
        },
        color: el.color || "#000000",
        rotation: {
          x: el.rotationX,
          y: el.rotationY,
          z: el.rotationZ
        },
        scale: el.scale
      }))
    };
    setCadContext(cadContextData);
  }, [elements]);

  // --- Create the action handler INSTANCE first ---
  // Use useMemo to prevent recreating the handler on every render unless dependencies change
  const actualActionHandler = useMemo(
    () =>
      createCadActionHandler({
        addElementsToCanvas: addElements,
        updateElementInCanvas: updateElement,
        removeElementFromCanvas: deleteElement,
        getCanvasElements: () => elements
      }),
    [elements, addElements, updateElement, deleteElement]
  ); // Dependencies ensure handler has fresh functions
  // --- End handler creation ---

  // --- Hook Call: Remove messages AND sendMessage from destructuring ---
  const { isProcessing, pendingActions, clearMessages, executePendingAction } = useCADAssistant({
    contextData: cadContext,
    actionHandler: actualActionHandler // Pass the actual instance
  });
  // --- End Hook Call ---

  if (!isVisible) return null;

  return (
    <div className="cad-assistant-container rounded-3xl">
      {/* Pass props from the hook to the UI component */}
      <CADAssistantOpenai
        isProcessing={isProcessing}
        pendingActions={pendingActions}
        clearMessages={clearMessages}
        executePendingAction={executePendingAction}
        contextData={cadContext}
        actionHandler={actualActionHandler}
        onClose={onClose}
      />
    </div>
  );
};
