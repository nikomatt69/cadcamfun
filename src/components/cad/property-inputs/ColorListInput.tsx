// src/components/cad/property-inputs/ColorListInput.tsx
import React, { useState } from "react";
import { Plus, Minus, Edit2, X, Droplet } from "react-feather";
import { motion, AnimatePresence } from "framer-motion";

interface ColorValue {
  r: number;
  g: number;
  b: number;
}

interface ColorListInputProps {
  label: string;
  value: ColorValue[];
  onChange: (colors: ColorValue[]) => void;
  disabled?: boolean;
}

/**
 * Componente per gestire liste di colori con editor visuale
 * Supporta aggiunta, rimozione e modifica di colori con anteprima
 *
 * @example
 * <ColorListInput
 *   label="Point Colors"
 *   value={[{r: 1, g: 0, b: 0}, {r: 0, g: 1, b: 0}]}
 *   onChange={(colors) => handleColorsChange(colors)}
 * />
 */
export const ColorListInput: React.FC<ColorListInputProps> = ({ label, value = [], onChange, disabled = false }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingColors, setEditingColors] = useState<ColorValue[]>([]);
  const [currentColorIndex, setCurrentColorIndex] = useState<number | null>(null);
  const [currentHexColor, setCurrentHexColor] = useState("#000000");

  const openDialog = () => {
    setEditingColors([...value]);
    setIsDialogOpen(true);
    setCurrentHexColor("#000000");
    setCurrentColorIndex(null);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setCurrentColorIndex(null);
  };

  const saveColors = () => {
    onChange(editingColors);
    closeDialog();
  };

  const addColor = () => {
    // Converte hex in rgb normalizzato (0-1)
    const hex = currentHexColor.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    if (currentColorIndex !== null) {
      // Aggiorna il colore esistente
      const updatedColors = [...editingColors];
      updatedColors[currentColorIndex] = { r, g, b };
      setEditingColors(updatedColors);
    } else {
      // Aggiunge un nuovo colore
      setEditingColors([...editingColors, { r, g, b }]);
    }
  };

  const removeColor = (index: number) => {
    const updatedColors = [...editingColors];
    updatedColors.splice(index, 1);
    setEditingColors(updatedColors);

    if (currentColorIndex === index) {
      setCurrentColorIndex(null);
      setCurrentHexColor("#000000");
    } else if (currentColorIndex !== null && currentColorIndex > index) {
      setCurrentColorIndex(currentColorIndex - 1);
    }
  };

  const updateCurrentColor = (hex: string) => {
    setCurrentHexColor(hex);
  };

  // Converte RGB normalizzato (0-1) in stringa hex
  const rgbToHex = (color: ColorValue) => {
    // Converte RGB normalizzato (0-1) in range 0-255
    const r = Math.floor(color.r * 255);
    const g = Math.floor(color.g * 255);
    const b = Math.floor(color.b * 255);

    // Converte in hex
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  };

  // Quando seleziona un colore, aggiorna il colore corrente
  const selectColor = (index: number) => {
    setCurrentColorIndex(index);
    setCurrentHexColor(rgbToHex(editingColors[index]));
  };

  // Continua dalla Parte 1

  return (
    <div className="mb-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-blue-400 mb-1">
        {label} ({value.length || 0} colors)
      </label>
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm 
                 bg-[#F8FBFF] dark:bg-gray-700 dark:hover:bg-gray-600 hover:bg-gray-50 flex justify-between items-center
                 text-gray-700 dark:text-blue-400"
      >
        <span>Edit Colors</span>
        <Droplet size={16} />
      </button>

      {/* Dialog for editing the color list */}
      <AnimatePresence>
        {isDialogOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={e => e.target === e.currentTarget && closeDialog()}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-blue-400">Edit Colors</h3>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Color List */}
                <div className="border dark:border-gray-600 rounded-md p-2">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-medium dark:text-blue-400">Color List</h4>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentColorIndex(null);
                        setCurrentHexColor("#000000"); // Reset hex color for adding new
                      }}
                      className="p-1 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/50 rounded"
                      title="Add Color"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    {editingColors.map((color, index) => (
                      <div
                        key={index}
                        className={`flex justify-between items-center p-2 my-1 rounded cursor-pointer ${
                          currentColorIndex === index
                            ? "bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700"
                            : "hover:bg-gray-50 dark:hover:bg-blue-900/30"
                        }`}
                        onClick={() => selectColor(index)}
                      >
                        <div className="flex items-center">
                          <div
                            className="w-6 h-6 rounded-full mr-2 border border-gray-300 dark:border-gray-600"
                            style={{ backgroundColor: rgbToHex(color) }}
                          />
                          <div className="text-xs dark:text-blue-400">{rgbToHex(color)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            removeColor(index);
                          }}
                          className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/50 rounded"
                          title="Remove Color"
                        >
                          <Minus size={14} />
                        </button>
                      </div>
                    ))}

                    {editingColors.length === 0 && (
                      <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                        No colors added. Use the color picker to add colors.
                      </div>
                    )}
                  </div>
                </div>

                {/* Color Picker */}
                <div className="border dark:border-gray-600 rounded-md p-2">
                  <h4 className="text-sm font-medium mb-2 dark:text-blue-400">Color Picker</h4>

                  <div className="space-y-3">
                    <input
                      type="color"
                      value={currentHexColor}
                      onChange={e => updateCurrentColor(e.target.value)}
                      className="w-full h-10 rounded p-1 border dark:border-gray-600 cursor-pointer"
                    />

                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={currentHexColor}
                        onChange={e => updateCurrentColor(e.target.value)}
                        className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-blue-400"
                      />

                      <button
                        type="button"
                        onClick={addColor}
                        className="px-2 py-1 bg-green-600 dark:bg-green-700 dark:hover:bg-green-600 text-white rounded-md text-xs hover:bg-green-700"
                      >
                        {currentColorIndex !== null ? "Update" : "Add"}
                      </button>
                    </div>

                    {/* Preset Colors */}
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-blue-400 mb-1">Preset Colors</label>
                      <div className="grid grid-cols-8 gap-1">
                        {[
                          "#FF0000",
                          "#FF9900",
                          "#FFCC00",
                          "#33CC00",
                          "#0099FF",
                          "#6633CC",
                          "#CC33FF",
                          "#FF3399",
                          "#000000",
                          "#666666",
                          "#999999",
                          "#CCCCCC",
                          "#FFFFFF",
                          "#996633",
                          "#006633",
                          "#003366"
                        ].map(color => (
                          <div
                            key={color}
                            className="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600 cursor-pointer hover:scale-110 transition-transform"
                            style={{ backgroundColor: color }}
                            onClick={() => updateCurrentColor(color)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal actions */}
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveColors}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Save Colors
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
