// src/components/cad/property-inputs/ColorListInput.tsx
import React, { useState } from 'react';
import { Plus, Minus, Edit2, X, Droplet } from 'react-feather';
import { motion, AnimatePresence } from 'framer-motion';

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
export const ColorListInput: React.FC<ColorListInputProps> = ({
  label,
  value = [],
  onChange,
  disabled = false
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingColors, setEditingColors] = useState<ColorValue[]>([]);
  const [currentColorIndex, setCurrentColorIndex] = useState<number | null>(null);
  const [currentHexColor, setCurrentHexColor] = useState('#000000');

  const openDialog = () => {
    setEditingColors([...value]);
    setIsDialogOpen(true);
    setCurrentHexColor('#000000');
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
    const hex = currentHexColor.replace('#', '');
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
      setCurrentHexColor('#000000');
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
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  // Quando seleziona un colore, aggiorna il colore corrente
  const selectColor = (index: number) => {
    setCurrentColorIndex(index);
    setCurrentHexColor(rgbToHex(editingColors[index]));
  };


  // Continua dalla Parte 1
  
  return (
    <div className="mb-2">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} ({value.length || 0} colori)
      </label>
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm 
                 bg-[#F8FBFF] hover:bg-gray-50 flex justify-between items-center"
      >
        <span>Modifica Colori</span>
        <Droplet size={16} />
      </button>

      {/* Dialog per la modifica della lista di colori */}
      <AnimatePresence>
        {isDialogOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={(e) => e.target === e.currentTarget && closeDialog()}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Modifica Colori</h3>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Lista colori */}
                <div className="border rounded-md p-2">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-medium">Lista Colori</h4>
                    <button 
                      type="button"
                      onClick={() => {
                        setCurrentColorIndex(null);
                        addColor();
                      }}
                      className="p-1 text-green-600 hover:bg-green-50 rounded"
                      title="Aggiungi Colore"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto">
                    {editingColors.map((color, index) => (
                      <div 
                        key={index}
                        className={`flex justify-between items-center p-2 my-1 rounded cursor-pointer ${
                          currentColorIndex === index ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => selectColor(index)}
                      >
                        <div className="flex items-center">
                          <div 
                            className="w-6 h-6 rounded-full mr-2 border border-gray-300" 
                            style={{ backgroundColor: rgbToHex(color) }} 
                          />
                          <div className="text-xs">{rgbToHex(color)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeColor(index);
                          }}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Rimuovi Colore"
                        >
                          <Minus size={14} />
                        </button>
                      </div>
                    ))}
                    
                    {editingColors.length === 0 && (
                      <div className="text-center text-gray-500 py-4">
                        Nessun colore aggiunto. Usa il selettore di colori per aggiungere colori.
                      </div>
                    )}
                  </div>
                </div>

                {/* Selettore colori */}
                <div className="border rounded-md p-2">
                  <h4 className="text-sm font-medium mb-2">Selettore Colori</h4>
                  
                  <div className="space-y-3">
                    <input
                      type="color"
                      value={currentHexColor}
                      onChange={(e) => updateCurrentColor(e.target.value)}
                      className="w-full h-10 rounded p-1"
                    />
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={currentHexColor}
                        onChange={(e) => updateCurrentColor(e.target.value)}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded-md text-sm"
                      />
                      
                      <button
                        type="button"
                        onClick={addColor}
                        className="px-2 py-1 bg-green-600 text-white rounded-md text-xs"
                      >
                        {currentColorIndex !== null ? 'Aggiorna' : 'Aggiungi'}
                      </button>
                    </div>
                    
                    {/* Colori predefiniti */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Colori predefiniti</label>
                      <div className="grid grid-cols-8 gap-1">
                        {['#FF0000', '#FF9900', '#FFCC00', '#33CC00', '#0099FF', '#6633CC', '#CC33FF', '#FF3399',
                          '#000000', '#666666', '#999999', '#CCCCCC', '#FFFFFF', '#996633', '#006633', '#003366'].map(color => (
                          <div
                            key={color}
                            className="w-6 h-6 rounded-full border border-gray-300 cursor-pointer"
                            style={{ backgroundColor: color }}
                            onClick={() => updateCurrentColor(color)}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2 mt-4">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={saveColors}
                  className="px-3 py-1.5 bg-blue-600 rounded text-sm text-white hover:bg-blue-700"
                >
                  Salva Colori
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};