import React, { useState, useEffect } from 'react';
import { useCADStore } from '@/src/store/cadStore';
import axios from 'axios';
import { Layers, Circle } from 'react-feather';

// Define the CAMStore interface and create a stub implementation
interface CAMStoreState {
  setWorkpieceParameters?: (params: { stockAllowance: number, isLathe?: boolean, diameter?: number }) => void;
}

// Create a simple hook for the CAM store
const useCAMStore = (): CAMStoreState => {
  return {
    setWorkpieceParameters: (params: { stockAllowance: number, isLathe?: boolean, diameter?: number }) => {
      console.log('CAM workpiece parameters updated:', params);
    }
  };
};

interface MachineConfig {
  id: string;
  name: string;
  config: {
    workVolume?: {
      x: number;
      z: number;
      y: number;
    };
    type: string;
    maxSpindleSpeed?: number;
    maxFeedRate?: number;
  };
}

type WorkpieceType = 'rectangular' | 'cylindrical';

const CAMWorkpieceSetup: React.FC = () => {
  const { workpiece, setWorkpiece, selectedMachine, setSelectedMachine } = useCADStore();
  const camStore = useCAMStore();

  const [machineConfigs, setMachineConfigs] = useState<MachineConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [workpieceType, setWorkpieceType] = useState<WorkpieceType>('rectangular');
  
  // Form state for the raw piece
  const [formState, setFormState] = useState({
    width: workpiece.width,
    height: workpiece.height,
    depth: workpiece.depth,
    diameter: 50, // Default diameter for cylindrical workpiece
    length: 100, // Default length for cylindrical workpiece
    material: workpiece.material,
    units: workpiece.units,
    stockAllowance: 1.0 // Stock allowance for CAM
  });
  
  const workpieceExists = workpiece !== undefined;
  
  // Load machine configurations
  useEffect(() => {
    const fetchMachineConfigs = async () => {
      try {
        setIsLoading(true);
        const response = await axios.get('/api/machine-configs');
        if (response.data) {
          setMachineConfigs(response.data);
        }
      } catch (error) {
        console.error('Error loading machine configurations:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMachineConfigs();
  }, []);
  
  // Update workpiece type when machine type changes
  useEffect(() => {
    if (selectedMachine?.config?.type?.toLowerCase().includes('lathe') || 
        selectedMachine?.config?.type?.toLowerCase().includes('tornio')) {
      setWorkpieceType('cylindrical');
    }
  }, [selectedMachine]);
  
  // Handle machine selection change
  const handleMachineChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const machineId = e.target.value;
    
    if (machineId) {
      const selectedConfig = machineConfigs.find(config => config.id === machineId);
      if (selectedConfig) {
        setSelectedMachine(selectedConfig);
        
        // Check if it's a lathe machine
        const isLathe = selectedConfig.config.type.toLowerCase().includes('lathe') || 
                        selectedConfig.config.type.toLowerCase().includes('tornio');
        
        // Update the workpiece type based on the machine type
        setWorkpieceType(isLathe ? 'cylindrical' : 'rectangular');
        
        // Update the form if the machine has work volume information
        if (selectedConfig.config?.workVolume) {
          const { x, y, z } = selectedConfig.config.workVolume;
          if (isLathe) {
            // For lathe, use x as diameter and z as length
            setFormState(prev => ({
              ...prev,
              diameter: x,
              length: z
            }));
          } else {
            setFormState(prev => ({
              ...prev,
              width: x,
              height: y,
              depth: z
            }));
          }
        }
      }
    } else {
      setSelectedMachine(null);
    }
  };

  // Handle workpiece type change
  const handleWorkpieceTypeChange = (type: WorkpieceType) => {
    setWorkpieceType(type);
  };

  // Handle any form field change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({
      ...prev,
      [name]: name === 'material' || name === 'units' ? value : parseFloat(value)
    }));
  };

  // Apply changes to the workpiece
  const handleApplyWorkpiece = () => {
    if (workpieceType === 'rectangular') {
      // Update CAD store for rectangular workpiece
      setWorkpiece({
        width: formState.width,
        height: formState.height,
        depth: formState.depth,
        material: formState.material,
        units: formState.units as 'mm' | 'inch'
      });

      // Update any CAM specific parameters
      if (camStore.setWorkpieceParameters) {
        camStore.setWorkpieceParameters({
          stockAllowance: formState.stockAllowance,
          isLathe: false
        });
      }
    } else {
      // For cylindrical workpiece, convert to equivalent rectangular for CAD store
      // but keep the lathe parameters for CAM
      setWorkpiece({
        width: formState.diameter,
        height: formState.diameter,
        depth: formState.length,
        material: formState.material,
        units: formState.units as 'mm' | 'inch'
      });

      // Update CAM specific parameters
      if (camStore.setWorkpieceParameters) {
        camStore.setWorkpieceParameters({
          stockAllowance: formState.stockAllowance,
          isLathe: true,
          diameter: formState.diameter
        });
      }
    }
  };

  return (
    <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg p-4 space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Workpiece Configuration for CAM</h3>
      
      {/* Machine selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Machine Configuration
        </label>
        <select
          name="machine"
          value={selectedMachine?.id || ''}
          onChange={handleMachineChange}
          className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        >
          <option value="">Select a machine</option>
          {machineConfigs.map((config) => (
            <option key={config.id} value={config.id}>
              {config.name} ({config.config.type})
            </option>
          ))}
        </select>
      </div>
      
      {/* Workpiece type selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Workpiece Type
        </label>
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={() => handleWorkpieceTypeChange('rectangular')}
            className={`flex-1 flex items-center justify-center px-4 py-2 border ${
              workpieceType === 'rectangular' 
                ? 'border-blue-500 bg-blue-50 text-blue-700' 
                : 'border-gray-300 bg-white text-gray-700'
            } rounded-md shadow-sm text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
          >
            <Layers size={16} className="mr-2" />
            Rectangular
          </button>
          <button
            type="button"
            onClick={() => handleWorkpieceTypeChange('cylindrical')}
            className={`flex-1 flex items-center justify-center px-4 py-2 border ${
              workpieceType === 'cylindrical' 
                ? 'border-blue-500 bg-blue-50 text-blue-700' 
                : 'border-gray-300 bg-white text-gray-700'
            } rounded-md shadow-sm text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
          >
            <Circle size={16} className="mr-2" />
            Cylindrical
          </button>
        </div>
      </div>
      
      {/* Piece dimensions - conditional rendering based on workpiece type */}
      {workpieceType === 'rectangular' ? (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Width
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
              Height
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
              Depth
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <input
                type="number"
                name="depth"
                value={formState.depth}
                onChange={handleInputChange}
                className="block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">{formState.units}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Diameter
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <input
                type="number"
                name="diameter"
                value={formState.diameter}
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
              Length
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <input
                type="number"
                name="length"
                value={formState.length}
                onChange={handleInputChange}
                className="block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">{formState.units}</span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Material and units */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Material
          </label>
          <select
            name="material"
            value={formState.material}
            onChange={handleInputChange}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="aluminum">Aluminum</option>
            <option value="steel">Steel</option>
            <option value="wood">Wood</option>
            <option value="plastic">Plastic</option>
            <option value="brass">Brass</option>
            <option value="titanium">Titanium</option>
            <option value="copper">Copper</option>
            <option value="composite">Composite</option>
            <option value="custom">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Units
          </label>
          <select
            name="units"
            value={formState.units}
            onChange={handleInputChange}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="mm">Millimeters (mm)</option>
            <option value="inch">Inches (inch)</option>
          </select>
        </div>
      </div>
      
      {/* CAM specific parameters */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Stock Allowance
        </label>
        <div className="mt-1 relative rounded-md shadow-sm">
          <input
            type="number"
            name="stockAllowance"
            value={formState.stockAllowance}
            onChange={handleInputChange}
            step="0.1"
            min="0"
            className="block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-gray-500 sm:text-sm">{formState.units}</span>
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Additional material to leave for finishing or subsequent operations
        </p>
      </div>
      
      {/* Workpiece Preview - Simple visual representation */}
      <div className="p-4 border border-gray-200 rounded-md">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Workpiece Preview</h4>
        <div className="flex justify-center">
          {workpieceType === 'rectangular' ? (
            <div 
              className="bg-blue-100 border-2 border-blue-400 rounded"
              style={{
                width: `${Math.min(200, formState.width / 2)}px`,
                height: `${Math.min(120, formState.height / 2)}px`,
              }}
            >
              <div className="h-full w-full flex items-center justify-center text-xs text-blue-700">
                {formState.width} x {formState.height} x {formState.depth} {formState.units}
              </div>
            </div>
          ) : (
            <div className="relative">
              <div 
                className="bg-blue-100 border-2 border-blue-400 rounded-full"
                style={{
                  width: `${Math.min(150, formState.diameter)}px`,
                  height: `${Math.min(150, formState.diameter)}px`,
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center text-xs text-blue-700">
                  Ø {formState.diameter} {formState.units}
                </div>
              </div>
              <div className="mt-2 text-center text-xs text-blue-700">
                Length: {formState.length} {formState.units}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Selected machine info */}
      {selectedMachine && (
        <div className="bg-gray-50 p-3 rounded-md">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Machine Information</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>Type: <span className="font-medium">{selectedMachine.config.type}</span></div>
            {selectedMachine.config.maxSpindleSpeed && (
              <div>Max spindle speed: <span className="font-medium">{selectedMachine.config.maxSpindleSpeed} rpm</span></div>
            )}
            {selectedMachine.config.maxFeedRate && (
              <div>Max feed rate: <span className="font-medium">{selectedMachine.config.maxFeedRate} mm/min</span></div>
            )}
          </div>
        </div>
      )}
      
      {workpieceExists && (
        <div className="bg-blue-50 p-3 rounded-md text-sm text-blue-700 mb-4">
          <p>È stato rilevato un pezzo grezzo creato nel CAD. Le dimensioni sono state importate automaticamente.</p>
        </div>
      )}
      
      {/* Action buttons */}
      <div className="flex justify-end space-x-3 pt-3">
        <button
          type="button"
          onClick={() => {
            if (workpieceType === 'rectangular') {
              setFormState({
                ...formState,
                width: workpiece.width,
                height: workpiece.depth,
                depth: workpiece.height,
                material: workpiece.material,
                units: workpiece.units,
                stockAllowance: 1.0
              });
            } else {
              setFormState({
                ...formState,
                diameter: 50,
                length: 100,
                material: workpiece.material,
                units: workpiece.units,
                stockAllowance: 1.0
              });
            }
          }}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={handleApplyWorkpiece}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Apply
        </button>
      </div>
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white bg-opacity-75">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      )}
    </div>
  );
};

export default CAMWorkpieceSetup;