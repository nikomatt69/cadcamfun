import React, { useState, useEffect } from 'react';
import { useCADStore } from '@/src/store/cadStore';
import { useLayerStore } from '@/src/store/layerStore';
import { useElementsStore } from '@/src/store/elementsStore';
import axios from 'axios';

interface MachineConfig {
  id: string;
  name: string;
  config: {
    workVolume?: {
      x: number;
      y: number;
      z: number;
    };
    type: string;
    maxSpindleSpeed?: number;
    maxFeedRate?: number;
  };
}

const WorkpieceSetup: React.FC = () => {
  const { workpiece, setWorkpiece, selectedMachine, setSelectedMachine } = useCADStore();
  const { layers, updateLayer } = useLayerStore();
  const { addElement, elements, deleteElement } = useElementsStore();
  const [machineConfigs, setMachineConfigs] = useState<MachineConfig[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [workpieceId, setWorkpieceId] = useState<string | null>(null);
  
  // Stato del form per il pezzo grezzo
  const [formState, setFormState] = useState({
    width: workpiece.width,
    height: workpiece.height,
    depth: workpiece.depth,
    material: workpiece.material,
    units: workpiece.units,
    positionX: 0,
    positionY: 0,
    positionZ: 0
  });

  // Carica le configurazioni delle macchine
  useEffect(() => {
    const fetchMachineConfigs = async () => {
      try {
        setIsLoading(true);
        const response = await axios.get('/api/machine-configs');
        if (response.data && response.data.data) {
          setMachineConfigs(Array.isArray(response.data.data) ? response.data.data : []);
        } else {
          setMachineConfigs([]);
        }
      } catch (error) {
        console.error('Errore nel caricamento delle configurazioni macchina:', error);
        setMachineConfigs([]); // Set empty array on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchMachineConfigs();
  }, []);

  // Inizializza il valore selezionato se c'è una macchina già selezionata
  useEffect(() => {
    if (selectedMachine?.id) {
      setSelectedMachineId(selectedMachine.id);
    }
  }, [selectedMachine]);

  // Cerca il workpiece esistente negli elementi
  useEffect(() => {
    const existingWorkpiece = elements.find(el => el.type === 'workpiece');
    if (existingWorkpiece) {
      setWorkpieceId(existingWorkpiece.id);
      
      // Aggiorna lo stato del form con i dati del workpiece esistente
      setFormState({
        width: existingWorkpiece.width || workpiece.width,
        height: existingWorkpiece.height || workpiece.height,
        depth: existingWorkpiece.depth || workpiece.depth,
        material: existingWorkpiece.material || workpiece.material,
        units: existingWorkpiece.units || workpiece.units,
        positionX: existingWorkpiece.x || 0,
        positionY: existingWorkpiece.y || 0,
        positionZ: existingWorkpiece.z || 0
      });
    }
  }, [elements, workpiece]);

  // Gestisce il cambio della configurazione macchina
  const handleMachineChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const machineId = e.target.value;
    setSelectedMachineId(machineId);
    
    if (machineId) {
      const selectedConfig = machineConfigs.find(config => config.id === machineId);
      if (selectedConfig) {
        setSelectedMachine(selectedConfig);
        
        // Aggiorna il form se la macchina ha informazioni sul volume di lavoro
        if (selectedConfig.config?.workVolume) {
          const { x, y, z } = selectedConfig.config.workVolume;
          setFormState(prev => ({
            ...prev,
            width: x,
          
            height: y,
            depth: z,
          }));
        }
      }
    } else {
      setSelectedMachine(null);
    }
  };

  // Gestisce il cambio di qualsiasi campo del form
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({
      ...prev,
      [name]: name === 'material' || name === 'units' ? value : parseFloat(value)
    }));
  };

  // Applica le modifiche al pezzo grezzo
  const handleApplyWorkpiece = () => {
    // Aggiorna lo store CAD
    setWorkpiece({
      width: formState.width,
      height: formState.height,
      depth: formState.depth,
      material: formState.material,
      units: formState.units as 'mm' | 'inch'
    });

    // Ottieni il layer di default
    const defaultLayer = layers[0];
    
    // Se esiste già un workpiece, rimuovilo
    if (workpieceId) {
      deleteElement(workpieceId);
    }
    
    // Crea un nuovo elemento workpiece
    const newWorkpieceId = addElement({
      type: 'workpiece',
      x: formState.positionX,
      y: formState.positionY,
      z: formState.positionZ,
      width: formState.width,
      height: formState.height,
      depth: formState.depth,
      material: formState.material,
      units: formState.units,
      color: '#808080',
      wireframe: true,
      layerId: defaultLayer.id // Assicurati che sia nel layer di default
    });
    
    setWorkpieceId(newWorkpieceId);
  };

  return (
    <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg p-4 space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Configurazione Pezzo Grezzo</h3>
      
      {/* Selezione della macchina */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Configurazione Macchina
        </label>
        <select
          name="machine"
          value={selectedMachineId}
          onChange={handleMachineChange}
          className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        >
          <option value="">Seleziona una macchina</option>
          {machineConfigs.map((config) => (
            <option key={config.id} value={config.id}>
              {config.name} ({config.config.type})
            </option>
          ))}
        </select>
      </div>
      
      {/* Dimensioni del pezzo */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Larghezza
          </label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <input
              type="number"
              name="width"
              value={formState.width}
              onChange={handleInputChange}
              className="block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">{formState.units}</span>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Altezza
          </label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <input
              type="number"
              name="height"
              value={formState.height}
              onChange={handleInputChange}
              className="block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">{formState.units}</span>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Profondità
          </label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <input
              type="number"
              name="depth"
              value={formState.depth}
              onChange={handleInputChange}
              // src/components/cad/WorkpieceSetup.tsx (continuazione)
              className="block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">{formState.units}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Posizione del pezzo */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Posizione X
          </label>
          <input
            type="number"
            name="positionX"
            value={formState.positionX}
            onChange={handleInputChange}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Posizione Y
          </label>
          <input
            type="number"
            name="positionY"
            value={formState.positionY}
            onChange={handleInputChange}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Posizione Z
          </label>
          <input
            type="number"
            name="positionZ"
            value={formState.positionZ}
            onChange={handleInputChange}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
      </div>
      
      {/* Materiale e unità */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Materiale
          </label>
          <select
            name="material"
            value={formState.material}
            onChange={handleInputChange}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="aluminum">Alluminio</option>
            <option value="steel">Acciaio</option>
            <option value="wood">Legno</option>
            <option value="plastic">Plastica</option>
            <option value="brass">Ottone</option>
            <option value="titanium">Titanio</option>
            <option value="copper">Rame</option>
            <option value="composite">Composito</option>
            <option value="custom">Altro</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Unità
          </label>
          <select
            name="units"
            value={formState.units}
            onChange={handleInputChange}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="mm">Millimetri (mm)</option>
            <option value="inch">Pollici (inch)</option>
          </select>
        </div>
      </div>
      
      {/* Informazioni sulla macchina selezionata */}
      {selectedMachine && (
        <div className="bg-gray-50 p-3 rounded-md text-sm">
          <h4 className="font-medium text-gray-700 mb-1">Informazioni Macchina</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600">
            <div>Tipo: <span className="font-medium">{selectedMachine.config.type}</span></div>
            <div>Spazio di lavoro: <span className="font-medium">{selectedMachine.config.workVolume?.x}×{selectedMachine.config.workVolume?.y}×{selectedMachine.config.workVolume?.z} mm</span></div>
            {selectedMachine.config.maxSpindleSpeed && (
              <div>Vel. Mandrino: <span className="font-medium">{selectedMachine.config.maxSpindleSpeed} rpm</span></div>
            )}
            {selectedMachine.config.maxFeedRate && (
              <div>Avanzamento: <span className="font-medium">{selectedMachine.config.maxFeedRate} mm/min</span></div>
            )}
          </div>
        </div>
      )}
      
      {/* Bottoni di azione */}
      <div className="pt-3 flex justify-between">
        <button
          type="button"
          onClick={() => {
            // Resetta il form ai valori originali del workpiece
            setFormState({
              width: workpiece.width,
              height: workpiece.height,
              depth: workpiece.depth,
              material: workpiece.material,
              units: workpiece.units,
              positionX: 0,
              positionY: 0,
              positionZ: 0
            });
          }}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          Ripristina
        </button>
        <button
          type="button"
          onClick={handleApplyWorkpiece}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Applica Modifiche
        </button>
      </div>
      
      {/* Messaggio sul layer di default */}
      <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
        <p>Il pezzo grezzo verrà creato nel layer di default &quot;{layers[0]?.name}&quot; e sarà disponibile sia per il CAD che per il CAM.</p>
      </div>
    </div>
  );
};

export default WorkpieceSetup;