import React, { useState, useEffect } from "react";
import { useCADStore } from "@/src/store/cadStore";
import { useLayerStore } from "@/src/store/layerStore";
import { useElementsStore } from "@/src/store/elementsStore";
import axios from "axios";

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
  const [selectedMachineId, setSelectedMachineId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [workpieceId, setWorkpieceId] = useState<string | null>(null);

  // Form state for the workpiece
  const [formState, setFormState] = useState({
    width: useCADStore?.getState()?.workpiece?.width || workpiece.width,
    height: useCADStore?.getState()?.workpiece?.height || workpiece.height,
    depth: useCADStore?.getState()?.workpiece?.depth || workpiece.depth,
    radius: useCADStore?.getState()?.workpiece?.radius || workpiece.radius,
    material: useCADStore?.getState()?.workpiece?.material || workpiece.material,
    positionX: 0,
    positionY: 0,
    positionZ: 0
  });

  // Load machine configurations
  useEffect(() => {
    const fetchMachineConfigs = async () => {
      try {
        setIsLoading(true);
        // Specify expected type in Axios response
        const response = await axios.get<{ data: MachineConfig[] }>("/api/machine-configs");

        // More robust check: verify that 'data' exists and is an array
        if (response.data && Array.isArray(response.data.data)) {
          setMachineConfigs(response.data.data);
        } else {
          console.warn("API /api/machine-configs did not return an array in response.data.data");
          setMachineConfigs([]); // Set empty array if data is not in expected format
        }
      } catch (error) {
        console.error("Error loading machine configurations:", error);
        setMachineConfigs([]); // Set empty array in case of error
      } finally {
        setIsLoading(false);
      }
    };

    fetchMachineConfigs();
  }, []);

  // Initialize selected value if there's already a selected machine
  useEffect(() => {
    if (selectedMachine?.id) {
      setSelectedMachineId(selectedMachine.id);
    }
  }, [selectedMachine]);

  // Find existing workpiece in elements
  useEffect(() => {
    const existingWorkpiece = elements.find(el => el.type === "workpiece");
    if (existingWorkpiece) {
      setWorkpieceId(existingWorkpiece.id);

      // Update form state with existing workpiece data
      setFormState({
        width: existingWorkpiece.width || workpiece?.width || 0,
        height: existingWorkpiece.height || workpiece?.height || 0,
        depth: existingWorkpiece.depth || workpiece?.depth || 0,
        radius: existingWorkpiece.radius || workpiece?.radius || 0,
        material: existingWorkpiece.material || workpiece?.material || "",
        positionX: existingWorkpiece.x || 0,
        positionY: existingWorkpiece.y || 0,
        positionZ: existingWorkpiece.z || 0
      });
    }
  }, [elements, workpiece]);

  // Handle machine configuration change
  const handleMachineChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const machineId = e.target.value;
    setSelectedMachineId(machineId);

    if (machineId) {
      const selectedConfig = machineConfigs.find(config => config.id === machineId);
      if (selectedConfig) {
        setSelectedMachine(selectedConfig);

        // Update form if machine has work volume information
        if (selectedConfig.config?.workVolume) {
          const { x, y, z } = selectedConfig.config.workVolume;
          setFormState(prev => ({
            ...prev,
            width: x,
            height: y,
            depth: z
          }));
        }
      }
    } else {
      setSelectedMachine(null);
    }
  };

  // Handle any form field change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({
      ...prev,
      [name]: name === "material" || name === "units" ? value : parseFloat(value)
    }));
  };

  // Apply workpiece changes
  const handleApplyWorkpiece = () => {
    // Update CAD store
    setWorkpiece({
      width: useCADStore?.getState()?.workpiece?.width || formState.width,
      height: useCADStore?.getState()?.workpiece?.height || formState.height,
      depth: useCADStore?.getState()?.workpiece?.depth || formState.depth,
      radius: useCADStore?.getState()?.workpiece?.radius || formState.radius,
      material: useCADStore?.getState()?.workpiece?.material || formState.material
    });

    // Get default layer
    const defaultLayer = layers[0];

    // If workpiece already exists, remove it
    if (workpieceId) {
      deleteElement(workpieceId);
    }

    // Create new workpiece element
    const newWorkpieceId = addElement({
      type: "workpiece",
      x: formState.positionX,
      y: formState.positionY,
      z: formState.positionZ,
      width: formState.width,
      height: formState.height,
      depth: formState.depth,
      material: formState.material,
      color: "#808080",
      wireframe: true,
      layerId: defaultLayer.id // Make sure it's in the default layer
    });

    setWorkpieceId(newWorkpieceId);
  };

  return (
    <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-md rounded-lg p-4 space-y-4">
      <h3 className="text-lg font-medium text-gray-900 dark:text-white">Workpiece Setup</h3>

      {/* Machine selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Machine Configuration</label>
        <select
          name="machine"
          value={selectedMachineId}
          onChange={handleMachineChange}
          className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF] dark:bg-gray-800 dark:text-white dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        >
          <option value="">Select a machine</option>
          {machineConfigs.map(config => (
            <option key={config.id} value={config.id}>
              {config.name} ({config.config.type})
            </option>
          ))}
        </select>
      </div>

      {/* Workpiece dimensions */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Width</label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <input
              type="number"
              name="width"
              value={formState.width}
              onChange={handleInputChange}
              className="block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF] dark:bg-gray-800 dark:text-white dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none"></div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Height</label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <input
              type="number"
              name="height"
              value={formState.height}
              onChange={handleInputChange}
              className="block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF] dark:bg-gray-800 dark:text-white dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none"></div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Depth</label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <input
              type="number"
              name="depth"
              value={formState.depth}
              onChange={handleInputChange}
              className="block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF] dark:bg-gray-800 dark:text-white dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none"></div>
          </div>
        </div>
      </div>

      {/* Workpiece position */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Position X</label>
          <input
            type="number"
            name="positionX"
            value={formState.positionX}
            onChange={handleInputChange}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF] dark:bg-gray-800 dark:text-white dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Position Y</label>
          <input
            type="number"
            name="positionY"
            value={formState.positionY}
            onChange={handleInputChange}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF] dark:bg-gray-800 dark:text-white dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Position Z</label>
          <input
            type="number"
            name="positionZ"
            value={formState.positionZ}
            onChange={handleInputChange}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF] dark:bg-gray-800 dark:text-white dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
      </div>

      {/* Material and units */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Material</label>
          <select
            name="material"
            value={formState.material}
            onChange={handleInputChange}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-[#F8FBFF] dark:bg-gray-800 dark:text-white dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
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
      </div>

      {/* Selected machine information */}
      {selectedMachine && (
        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md text-sm">
          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-1">Machine Information</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600 dark:text-gray-400">
            <div>
              Type: <span className="font-medium">{selectedMachine.config.type}</span>
            </div>
            <div>
              Work Volume:{" "}
              <span className="font-medium">
                {selectedMachine.config.workVolume?.x}×{selectedMachine.config.workVolume?.y}×
                {selectedMachine.config.workVolume?.z} mm
              </span>
            </div>
            {selectedMachine.config.maxSpindleSpeed && (
              <div>
                Spindle Speed: <span className="font-medium">{selectedMachine.config.maxSpindleSpeed} rpm</span>
              </div>
            )}
            {selectedMachine.config.maxFeedRate && (
              <div>
                Feed Rate: <span className="font-medium">{selectedMachine.config.maxFeedRate} mm/min</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="pt-3 flex justify-between">
        <button
          type="button"
          onClick={() => {
            // Reset form to original workpiece values
            setFormState({
              width: workpiece.width,
              height: workpiece.height,
              depth: workpiece.depth,
              radius: workpiece.radius,
              material: workpiece.material,
              positionX: 0,
              positionY: 0,
              positionZ: 0
            });
          }}
          className="px-4 py-2 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={handleApplyWorkpiece}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Apply Changes
        </button>
      </div>

      {/* Default layer message */}
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
        <p>
          The workpiece will be created in the default layer &quot;{layers[0]?.name}&quot; and will be available for both CAD and CAM.
        </p>
      </div>
    </div>
  );
};

export default WorkpieceSetup;
