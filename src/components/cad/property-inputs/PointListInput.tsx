// src/components/cad/property-inputs/PointListInput.tsx
import React, { useState } from 'react';
import { Plus, Minus, Edit2, X, Move } from 'react-feather';
import { motion, AnimatePresence } from 'framer-motion';

interface Point3d {
  x: number;
  y: number;
  z: number;
}

interface PointListInputProps {
  label: string;
  value: Point3d[];
  onChange: (points: Point3d[]) => void;
  disabled?: boolean;
  minPoints?: number;
  maxPoints?: number;
  exactPoints?: number;
}

/**
 * Componente per modificare liste di punti 3D con un editor visuale
 * Supporta aggiunta, rimozione e modifica di punti con validazione
 * 
 * @example
 * <PointListInput
 *   label="Control Points"
 *   value={[{x: 0, y: 0, z: 0}, {x: 10, y: 10, z: 0}]}
 *   onChange={(points) => handlePointsChange(points)}
 *   minPoints={2}
 *   maxPoints={10}
 * />
 */
export const PointListInput: React.FC<PointListInputProps> = ({
  label,
  value = [],
  onChange,
  disabled = false,
  minPoints = 0,
  maxPoints,
  exactPoints
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPoints, setEditingPoints] = useState<Point3d[]>([]);
  const [currentPointIndex, setCurrentPointIndex] = useState<number | null>(null);

  const openDialog = () => {
    setEditingPoints([...value]);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setCurrentPointIndex(null);
  };

  const savePoints = () => {
    // Validazione del numero minimo di punti
    if (minPoints > 0 && editingPoints.length < minPoints) {
      alert(`Sono richiesti almeno ${minPoints} punti`);
      return;
    }

    // Validazione del numero esatto di punti
    if (exactPoints && editingPoints.length !== exactPoints) {
      alert(`Sono richiesti esattamente ${exactPoints} punti`);
      return;
    }

    onChange(editingPoints);
    closeDialog();
  };

  const addPoint = () => {
    // Verifica limite massimo di punti
    if (maxPoints && editingPoints.length >= maxPoints) {
      alert(`Numero massimo di punti consentito: ${maxPoints}`);
      return;
    }

    // Aggiunge un nuovo punto (0,0,0) o vicino all'ultimo punto se disponibile
    const lastPoint = editingPoints.length > 0 ? editingPoints[editingPoints.length - 1] : null;
    const newPoint = lastPoint 
      ? { x: lastPoint.x + 10, y: lastPoint.y, z: lastPoint.z }
      : { x: 0, y: 0, z: 0 };
      
    setEditingPoints([...editingPoints, newPoint]);
    setCurrentPointIndex(editingPoints.length);
  };

  const removePoint = (index: number) => {
    // Verifica limite minimo di punti
    if (minPoints > 0 && editingPoints.length <= minPoints) {
      alert(`Sono richiesti almeno ${minPoints} punti`);
      return;
    }

    const updatedPoints = [...editingPoints];
    updatedPoints.splice(index, 1);
    setEditingPoints(updatedPoints);
    
    // Aggiorna l'indice del punto corrente se necessario
    if (currentPointIndex === index) {
      setCurrentPointIndex(null);
    } else if (currentPointIndex !== null && currentPointIndex > index) {
      setCurrentPointIndex(currentPointIndex - 1);
    }
  };

  const updatePoint = (index: number, coord: 'x' | 'y' | 'z', value: string) => {
    const numValue = value === '' ? 0 : parseFloat(value);
    const updatedPoints = [...editingPoints];
    updatedPoints[index] = { ...updatedPoints[index], [coord]: numValue };
    setEditingPoints(updatedPoints);
  };

  // Continua dalla Parte 1
  
  return (
    <div className="mb-2">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} ({value.length || 0} punti)
        {minPoints > 0 && ` (Min: ${minPoints})`}
        {maxPoints && ` (Max: ${maxPoints})`}
        {exactPoints && ` (Richiesti: ${exactPoints})`}
      </label>
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm 
                 bg-[#F8FBFF] hover:bg-gray-50 flex justify-between items-center"
      >
        <span>Modifica Punti</span>
        <Edit2 size={16} />
      </button>

      {/* Dialog per la modifica della lista di punti */}
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
                <h3 className="text-lg font-medium text-gray-900">Modifica Punti</h3>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Lista dei punti */}
                <div className="border rounded-md p-2">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-medium">Lista Punti</h4>
                    <button 
                      type="button"
                      onClick={addPoint}
                      className="p-1 text-green-600 hover:bg-green-50 rounded"
                      title="Aggiungi Punto"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto">
                    {editingPoints.map((point, index) => (
                      <div 
                        key={index}
                        className={`flex justify-between items-center p-2 my-1 rounded cursor-pointer ${
                          currentPointIndex === index ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setCurrentPointIndex(index)}
                      >
                        <div className="flex items-center">
                          <Move size={14} className="text-gray-400 mr-2" />
                          <div className="text-xs">
                            Punto {index + 1}: ({point?.x?.toFixed(1) || 0}, {point?.y?.toFixed(1) || 0}, {point?.z?.toFixed(1) || 0})
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removePoint(index);
                          }}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Rimuovi Punto"
                        >
                          <Minus size={14} />
                        </button>
                      </div>
                    ))}
                    
                    {editingPoints.length === 0 && (
                      <div className="text-center text-gray-500 py-4">
                        Nessun punto aggiunto. Fare clic sul pulsante + per aggiungere un punto.
                      </div>
                    )}
                  </div>
                </div>

                {/* Editor punto */}
                <div className="border rounded-md p-2">
                  <h4 className="text-sm font-medium mb-2">Editor Punto</h4>
                  
                  {currentPointIndex !== null ? (
                    <div className="space-y-3">
                      <div className="text-xs text-gray-500 mb-2">
                        Modifica le coordinate per il punto {currentPointIndex + 1}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">X</label>
                          <input
                            type="number"
                            value={editingPoints[currentPointIndex]?.x ?? 0}
                            onChange={(e) => updatePoint(currentPointIndex, 'x', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded-md shadow-sm text-xs"
                            step={0.1}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Y</label>
                          <input
                            type="number"
                            value={editingPoints[currentPointIndex]?.y ?? 0}
                            onChange={(e) => updatePoint(currentPointIndex, 'y', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded-md shadow-sm text-xs"
                            step={0.1}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Z</label>
                          <input
                            type="number"
                            value={editingPoints[currentPointIndex]?.z ?? 0}
                            onChange={(e) => updatePoint(currentPointIndex, 'z', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded-md shadow-sm text-xs"
                            step={0.1}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-4">
                      Seleziona un punto dalla lista per modificare le sue coordinate.
                    </div>
                  )}
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
                  onClick={savePoints}
                  className="px-3 py-1.5 bg-blue-600 rounded text-sm text-white hover:bg-blue-700"
                >
                  Salva Punti
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};