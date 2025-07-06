import React from "react";
import { motion } from "framer-motion";
import { AIAction } from "@/src/types/AITypes";
import { Element3dPreview } from "./Element3dPreview";

interface ComponentPreviewSectionProps {
  action: AIAction;
}

export const ComponentPreviewSection: React.FC<ComponentPreviewSectionProps> = ({ action }) => {
  // Solo per azioni di generazione di elementi CAD
  if (action.type !== "generateCADElement" || !action.payload?.elements) {
    return null;
  }

  const elements = action.payload.elements;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="mt-3 border border-gray-200 dark:border-gray-700 rounded-md p-3 bg-blue-50 dark:bg-blue-900/20"
    >
      <h4 className="text-sm font-medium text-blue-700  dark:text-blue-300 mb-2">
        Anteprima componenti ({elements.length})
      </h4>

      <div className="grid grid-cols-2 gap-3">
        {elements.map((element: any, index: number) => (
          <div key={index} className="bg-white dark:bg-gray-800 rounded-md p-2 shadow-sm">
            <div className="h-24 mb-2 bg-gray-50 dark:bg-gray-700 rounded flex items-center justify-center">
              <Element3dPreview element={element} />
            </div>
            <div className="text-xs">
              <p className="font-medium">{element.name || `${element.type} ${index + 1}`}</p>
              <p className="text-gray-500  dark:text-gray-400 truncate">
                {element.type}, {element.width || element.radius || 0}x{element.height || element.radius || 0}x
                {element.depth || 0}
              </p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
