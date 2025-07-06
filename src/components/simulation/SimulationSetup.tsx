import React, { useState, useEffect } from "react";
import { Vector3 } from "three";
import { Material } from "../../lib/simulation/FEAEngine";
import { StressAnalysis, StressAnalysisParams } from "../../lib/simulation/StressAnalysis";
import {
  ThermalAnalysis,
  ThermalAnalysisParams,
  ThermalSource,
  ThermalBoundary
} from "../../lib/simulation/ThermalAnalysis";

type SimulationType = "stress" | "thermal" | "coupled";

interface SimulationSetupProps {
  meshId: string;
  onRunSimulation: (params: StressAnalysisParams | ThermalAnalysisParams, type: SimulationType) => void;
  onCancel: () => void;
}

const SimulationSetup: React.FC<SimulationSetupProps> = ({ meshId, onRunSimulation, onCancel }) => {
  const [simulationType, setSimulationType] = useState<SimulationType>("stress");
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);

  // Stress analysis specific states
  const [forces, setForces] = useState<
    Array<{
      id: string;
      position: Vector3;
      direction: Vector3;
      magnitude: number;
    }>
  >([]);

  const [fixedPoints, setFixedPoints] = useState<
    Array<{
      id: string;
      position: Vector3;
      fullyFixed: boolean;
    }>
  >([]);

  // Thermal analysis specific states
  const [ambientTemperature, setAmbientTemperature] = useState<number>(293.15); // 20°C in Kelvin
  const [heatSources, setHeatSources] = useState<Array<ThermalSource & { id: string }>>([]);
  const [boundaries, setBoundaries] = useState<Array<ThermalBoundary & { id: string }>>([]);
  const [steadyState, setSteadyState] = useState<boolean>(true);
  const [simulationTime, setSimulationTime] = useState<number>(10);
  const [timeSteps, setTimeSteps] = useState<number>(10);

  useEffect(() => {
    // Load materials
    const materialLibrary = StressAnalysis.getMaterialLibrary();
    setMaterials(materialLibrary);
    if (materialLibrary.length > 0) {
      setSelectedMaterial(materialLibrary[0]);
    }
  }, []);

  const handleAddForce = () => {
    setForces([
      ...forces,
      {
        id: `force-${forces.length}`,
        position: new Vector3(0, 0, 0),
        direction: new Vector3(0, -1, 0),
        magnitude: 100 // Newtons
      }
    ]);
  };

  const handleUpdateForce = (id: string, key: string, value: any) => {
    setForces(
      forces.map(force => {
        if (force.id === id) {
          if (key === "x" || key === "y" || key === "z") {
            return {
              ...force,
              position: force.position.clone().setComponent(key === "x" ? 0 : key === "y" ? 1 : 2, parseFloat(value))
            };
          } else if (key === "dx" || key === "dy" || key === "dz") {
            return {
              ...force,
              direction: force.direction
                .clone()
                .setComponent(key === "dx" ? 0 : key === "dy" ? 1 : 2, parseFloat(value))
            };
          } else {
            return { ...force, [key]: value };
          }
        }
        return force;
      })
    );
  };

  const handleRemoveForce = (id: string) => {
    setForces(forces.filter(force => force.id !== id));
  };

  const handleAddFixedPoint = () => {
    setFixedPoints([
      ...fixedPoints,
      {
        id: `fixed-${fixedPoints.length}`,
        position: new Vector3(0, 0, 0),
        fullyFixed: true
      }
    ]);
  };

  const handleUpdateFixedPoint = (id: string, key: string, value: any) => {
    setFixedPoints(
      fixedPoints.map(point => {
        if (point.id === id) {
          if (key === "x" || key === "y" || key === "z") {
            return {
              ...point,
              position: point.position.clone().setComponent(key === "x" ? 0 : key === "y" ? 1 : 2, parseFloat(value))
            };
          } else {
            return { ...point, [key]: value };
          }
        }
        return point;
      })
    );
  };

  const handleRemoveFixedPoint = (id: string) => {
    setFixedPoints(fixedPoints.filter(point => point.id !== id));
  };

  const handleAddHeatSource = () => {
    setHeatSources([
      ...heatSources,
      {
        id: `heat-${heatSources.length}`,
        position: new Vector3(0, 0, 0),
        radius: 0.1,
        temperature: 373.15 // 100°C in Kelvin
      }
    ]);
  };

  const handleUpdateHeatSource = (id: string, key: string, value: any) => {
    setHeatSources(
      heatSources.map(source => {
        if (source.id === id) {
          if (key === "x" || key === "y" || key === "z") {
            return {
              ...source,
              position: source.position.clone().setComponent(key === "x" ? 0 : key === "y" ? 1 : 2, parseFloat(value))
            };
          } else {
            return { ...source, [key]: key === "temperature" || key === "radius" ? parseFloat(value) : value };
          }
        }
        return source;
      })
    );
  };

  const handleRemoveHeatSource = (id: string) => {
    setHeatSources(heatSources.filter(source => source.id !== id));
  };

  const handleAddBoundary = () => {
    setBoundaries([
      ...boundaries,
      {
        id: `boundary-${boundaries.length}`,
        position: new Vector3(0, 0, 0),
        radius: 0.1,
        temperature: 293.15, // 20°C in Kelvin
        convectionCoefficient: 10
      }
    ]);
  };

  const handleUpdateBoundary = (id: string, key: string, value: any) => {
    setBoundaries(
      boundaries.map(boundary => {
        if (boundary.id === id) {
          if (key === "x" || key === "y" || key === "z") {
            return {
              ...boundary,
              position: boundary.position.clone().setComponent(key === "x" ? 0 : key === "y" ? 1 : 2, parseFloat(value))
            };
          } else {
            return {
              ...boundary,
              [key]:
                key === "temperature" || key === "radius" || key === "convectionCoefficient" ? parseFloat(value) : value
            };
          }
        }
        return boundary;
      })
    );
  };

  const handleRemoveBoundary = (id: string) => {
    setBoundaries(boundaries.filter(boundary => boundary.id !== id));
  };

  const handleRunSimulation = () => {
    if (!selectedMaterial) return;

    if (simulationType === "stress") {
      const stressParams: StressAnalysisParams = {
        forces: forces.map(f => ({
          position: f.position,
          direction: f.direction,
          magnitude: f.magnitude
        })),
        fixedPoints: fixedPoints.map(p => ({
          position: p.position,
          fullyFixed: p.fullyFixed
        })),
        material: selectedMaterial
      };

      onRunSimulation(stressParams, "stress");
    } else if (simulationType === "thermal" || simulationType === "coupled") {
      const thermalParams: ThermalAnalysisParams = {
        ambientTemperature,
        heatSources: heatSources.map(h => ({
          position: h.position,
          radius: h.radius,
          temperature: h.temperature
        })),
        boundaries: boundaries.map(b => ({
          position: b.position,
          radius: b.radius,
          temperature: b.temperature,
          convectionCoefficient: b.convectionCoefficient
        })),
        material: selectedMaterial,
        steadyState,
        simulationTime: steadyState ? undefined : simulationTime,
        timeSteps: steadyState ? undefined : timeSteps
      };

      onRunSimulation(thermalParams, simulationType);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg">
      <h2 className="text-xl font-semibold mb-4">Simulation Setup</h2>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Simulation Type</label>
        <div className="flex space-x-4">
          <label className="inline-flex items-center">
            <input
              type="radio"
              value="stress"
              checked={simulationType === "stress"}
              onChange={() => setSimulationType("stress")}
              className="form-radio h-4 w-4 text-blue-600"
            />
            <span className="ml-2">Stress Analysis</span>
          </label>
          <label className="inline-flex items-center">
            <input
              type="radio"
              value="thermal"
              checked={simulationType === "thermal"}
              onChange={() => setSimulationType("thermal")}
              className="form-radio h-4 w-4 text-blue-600"
            />
            <span className="ml-2">Thermal Analysis</span>
          </label>
          <label className="inline-flex items-center">
            <input
              type="radio"
              value="coupled"
              checked={simulationType === "coupled"}
              onChange={() => setSimulationType("coupled")}
              className="form-radio h-4 w-4 text-blue-600"
            />
            <span className="ml-2">Coupled Thermo-Mechanical</span>
          </label>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Material</label>
        <select
          value={selectedMaterial?.id}
          onChange={e => {
            const material = materials.find(m => m.id.toString() === e.target.value);
            if (material) setSelectedMaterial(material);
          }}
          className="form-select w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
        >
          {materials.map(material => (
            <option key={material.id} value={material.id}>
              {material.name}
            </option>
          ))}
        </select>
      </div>

      {(simulationType === "stress" || simulationType === "coupled") && (
        <>
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-md font-medium">Forces</h3>
              <button
                type="button"
                onClick={handleAddForce}
                className="px-2 py-1 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Add Force
              </button>
            </div>

            {forces.length === 0 && (
              <p className="text-sm text-gray-500 italic">No forces added. Click &quot;Add Force&quot; to add one.</p>
            )}

            {forces.map(force => (
              <div key={force.id} className="border p-3 mb-2 rounded-md">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Force</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveForce(force.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <label className="block text-xs">Position X</label>
                    <input
                      type="number"
                      value={force.position.x}
                      onChange={e => handleUpdateForce(force.id, "x", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs">Position Y</label>
                    <input
                      type="number"
                      value={force.position.y}
                      onChange={e => handleUpdateForce(force.id, "y", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs">Position Z</label>
                    <input
                      type="number"
                      value={force.position.z}
                      onChange={e => handleUpdateForce(force.id, "z", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <label className="block text-xs">Direction X</label>
                    <input
                      type="number"
                      value={force.direction.x}
                      onChange={e => handleUpdateForce(force.id, "dx", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs">Direction Y</label>
                    <input
                      type="number"
                      value={force.direction.y}
                      onChange={e => handleUpdateForce(force.id, "dy", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs">Direction Z</label>
                    <input
                      type="number"
                      value={force.direction.z}
                      onChange={e => handleUpdateForce(force.id, "dz", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs">Magnitude (N)</label>
                  <input
                    type="number"
                    value={force.magnitude}
                    onChange={e => handleUpdateForce(force.id, "magnitude", parseFloat(e.target.value))}
                    className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-md font-medium">Fixed Points</h3>
              <button
                type="button"
                onClick={handleAddFixedPoint}
                className="px-2 py-1 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Add Fixed Point
              </button>
            </div>

            {fixedPoints.length === 0 && (
              <p className="text-sm text-gray-500 italic">
                No fixed points added. Click &quot;Add Fixed Point&quot; to add one.
              </p>
            )}

            {fixedPoints.map(point => (
              <div key={point.id} className="border p-3 mb-2 rounded-md">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Fixed Point</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFixedPoint(point.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <label className="block text-xs">Position X</label>
                    <input
                      type="number"
                      value={point.position.x}
                      onChange={e => handleUpdateFixedPoint(point.id, "x", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs">Position Y</label>
                    <input
                      type="number"
                      value={point.position.y}
                      onChange={e => handleUpdateFixedPoint(point.id, "y", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs">Position Z</label>
                    <input
                      type="number"
                      value={point.position.z}
                      onChange={e => handleUpdateFixedPoint(point.id, "z", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={point.fullyFixed}
                      onChange={e => handleUpdateFixedPoint(point.id, "fullyFixed", e.target.checked)}
                      className="form-checkbox h-4 w-4 text-blue-600"
                    />
                    <span className="ml-2 text-sm">Fully Fixed (all DOF)</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {(simulationType === "thermal" || simulationType === "coupled") && (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Ambient Temperature (K)</label>
            <input
              type="number"
              value={ambientTemperature}
              onChange={e => setAmbientTemperature(parseFloat(e.target.value))}
              className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            />
            <p className="text-xs text-gray-500 mt-1">
              {ambientTemperature - 273.15}°C / {(((ambientTemperature - 273.15) * 9) / 5 + 32).toFixed(1)}°F
            </p>
          </div>

          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-md font-medium">Heat Sources</h3>
              <button
                type="button"
                onClick={handleAddHeatSource}
                className="px-2 py-1 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Add Heat Source
              </button>
            </div>

            {heatSources.length === 0 && (
              <p className="text-sm text-gray-500 italic">
                No heat sources added. Click &quot;Add Heat Source&quot; to add one.
              </p>
            )}

            {heatSources.map(source => (
              <div key={source.id} className="border p-3 mb-2 rounded-md">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Heat Source</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveHeatSource(source.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <label className="block text-xs">Position X</label>
                    <input
                      type="number"
                      value={source.position.x}
                      onChange={e => handleUpdateHeatSource(source.id, "x", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs">Position Y</label>
                    <input
                      type="number"
                      value={source.position.y}
                      onChange={e => handleUpdateHeatSource(source.id, "y", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs">Position Z</label>
                    <input
                      type="number"
                      value={source.position.z}
                      onChange={e => handleUpdateHeatSource(source.id, "z", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-xs">Radius</label>
                    <input
                      type="number"
                      value={source.radius}
                      onChange={e => handleUpdateHeatSource(source.id, "radius", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs">Temperature (K)</label>
                    <input
                      type="number"
                      value={source.temperature}
                      onChange={e => handleUpdateHeatSource(source.id, "temperature", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                    <p className="text-xs text-gray-500 mt-1">{(source.temperature - 273.15).toFixed(1)}°C</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-md font-medium">Thermal Boundaries</h3>
              <button
                type="button"
                onClick={handleAddBoundary}
                className="px-2 py-1 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Add Boundary
              </button>
            </div>

            {boundaries.length === 0 && (
              <p className="text-sm text-gray-500 italic">
                No boundaries added. Click &quot;Add Boundary&quot; to add one.
              </p>
            )}

            {boundaries.map(boundary => (
              <div key={boundary.id} className="border p-3 mb-2 rounded-md">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Thermal Boundary</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveBoundary(boundary.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <label className="block text-xs">Position X</label>
                    <input
                      type="number"
                      value={boundary.position.x}
                      onChange={e => handleUpdateBoundary(boundary.id, "x", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs">Position Y</label>
                    <input
                      type="number"
                      value={boundary.position.y}
                      onChange={e => handleUpdateBoundary(boundary.id, "y", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs">Position Z</label>
                    <input
                      type="number"
                      value={boundary.position.z}
                      onChange={e => handleUpdateBoundary(boundary.id, "z", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <label className="block text-xs">Radius</label>
                    <input
                      type="number"
                      value={boundary.radius}
                      onChange={e => handleUpdateBoundary(boundary.id, "radius", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs">Temperature (K)</label>
                    <input
                      type="number"
                      value={boundary.temperature}
                      onChange={e => handleUpdateBoundary(boundary.id, "temperature", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                    <p className="text-xs text-gray-500 mt-1">{(boundary.temperature - 273.15).toFixed(1)}°C</p>
                  </div>
                  <div>
                    <label className="block text-xs">Convection Coeff.</label>
                    <input
                      type="number"
                      value={boundary.convectionCoefficient}
                      onChange={e => handleUpdateBoundary(boundary.id, "convectionCoefficient", e.target.value)}
                      className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-4">
            <label className="inline-flex items-center mb-2">
              <input
                type="checkbox"
                checked={steadyState}
                onChange={e => setSteadyState(e.target.checked)}
                className="form-checkbox h-4 w-4 text-blue-600"
              />
              <span className="ml-2">Steady State Analysis</span>
            </label>

            {!steadyState && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs">Simulation Time (s)</label>
                  <input
                    type="number"
                    value={simulationTime}
                    onChange={e => setSimulationTime(parseFloat(e.target.value))}
                    className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs">Time Steps</label>
                  <input
                    type="number"
                    value={timeSteps}
                    onChange={e => setTimeSteps(parseInt(e.target.value, 10))}
                    className="form-input w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex justify-end space-x-2 mt-6">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleRunSimulation}
          className="px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          Run Simulation
        </button>
      </div>
    </div>
  );
};

export default SimulationSetup;
