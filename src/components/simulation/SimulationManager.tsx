import React, { useState, useRef, useCallback } from "react";
import * as THREE from "three";
import { useElementsStore } from "../../store/elementsStore";
import { useCADStore } from "../../store/cadStore";
import SimulationSetup from "./SimulationSetup";
import LoadsAndConstraints from "./LoadsAndConstraints";
import ResultsViewer from "./ResultsViewer";
import { StressAnalysis, StressAnalysisParams, StressAnalysisResults } from "../../lib/simulation/StressAnalysis";
import { ThermalAnalysis, ThermalAnalysisParams, ThermalAnalysisResults } from "../../lib/simulation/ThermalAnalysis";
import { FEAEngine, SimulationResults } from "../../lib/simulation/FEAEngine";

type SimulationType = "stress" | "thermal" | "coupled";

interface SimulationManagerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMeshIds?: string[];
}

type SimulationState = "setup" | "preview" | "running" | "results" | "error";

const SimulationManager: React.FC<SimulationManagerProps> = ({
  isOpen,
  onClose,
  selectedMeshIds = []
}) => {
  const [currentState, setCurrentState] = useState<SimulationState>("setup");
  const [simulationType, setSimulationType] = useState<SimulationType>("stress");
  const [simulationParams, setSimulationParams] = useState<StressAnalysisParams | ThermalAnalysisParams | null>(null);
  const [simulationResults, setSimulationResults] = useState<SimulationResults | StressAnalysisResults | ThermalAnalysisResults | null>(null);
  const [deformedMesh, setDeformedMesh] = useState<THREE.Mesh | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const { elements } = useElementsStore();

  // Get meshes from selected elements
  const getSelectedMeshes = useCallback(() => {
    if (selectedMeshIds.length === 0) {
      // If no specific meshes selected, get all mesh elements
      return elements.filter(element =>
        element.type === "mesh" ||
        element.type === "extrude" ||
        element.type === "revolve" ||
        element.type === "component"
      );
    }

    return elements.filter(element => selectedMeshIds.includes(element.id));
  }, [elements, selectedMeshIds]);

  // Convert CAD elements to THREE.Mesh for simulation
  const createMeshFromElement = useCallback((element: any): THREE.Mesh | null => {
    try {
      // This is a simplified conversion - in a real implementation you would
      // have proper mesh generation from CAD elements
      let geometry: THREE.BufferGeometry;

      switch (element.type) {
        case "cube":
          geometry = new THREE.BoxGeometry(
            element.width || 1,
            element.height || 1,
            element.depth || 1
          );
          break;

        case "sphere":
          geometry = new THREE.SphereGeometry(
            element.radius || 0.5,
            32,
            32
          );
          break;

        case "cylinder":
          geometry = new THREE.CylinderGeometry(
            element.radiusTop || 0.5,
            element.radiusBottom || 0.5,
            element.height || 1,
            32
          );
          break;

        case "extrude":
          // For extrusion, create a simple geometry
          // Real implementation would use the actual extrusion path
          geometry = new THREE.BoxGeometry(1, 1, element.extrudeDepth || 1);
          break;

        default:
          // Fallback to a simple box
          geometry = new THREE.BoxGeometry(1, 1, 1);
      }

      const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
      const mesh = new THREE.Mesh(geometry, material);

      // Apply element transforms
      if (element.x !== undefined) mesh.position.x = element.x;
      if (element.y !== undefined) mesh.position.y = element.y;
      if (element.z !== undefined) mesh.position.z = element.z;

      if (element.rotationX !== undefined) mesh.rotation.x = element.rotationX;
      if (element.rotationY !== undefined) mesh.rotation.y = element.rotationY;
      if (element.rotationZ !== undefined) mesh.rotation.z = element.rotationZ;

      if (element.scaleX !== undefined) mesh.scale.x = element.scaleX;
      if (element.scaleY !== undefined) mesh.scale.y = element.scaleY;
      if (element.scaleZ !== undefined) mesh.scale.z = element.scaleZ;

      return mesh;
    } catch (error) {
      console.error("Error creating mesh from element:", error);
      return null;
    }
  }, []);

  const handleSetupSimulation = useCallback((
    params: StressAnalysisParams | ThermalAnalysisParams,
    type: SimulationType
  ) => {
    setSimulationParams(params);
    setSimulationType(type);
    setCurrentState("preview");
  }, []);

  const handleRunSimulation = useCallback(async () => {
    if (!simulationParams) return;

    setCurrentState("running");
    setProgress(0);
    setError(null);

    try {
      const selectedMeshes = getSelectedMeshes();
      if (selectedMeshes.length === 0) {
        throw new Error("No elements selected for simulation");
      }

      // For this example, we'll use the first selected mesh
      const firstElement = selectedMeshes[0];
      const mesh = createMeshFromElement(firstElement);

      if (!mesh) {
        throw new Error("Unable to create mesh from selected element");
      }

      setProgress(25);

      // Run simulation based on type
      let results: SimulationResults | StressAnalysisResults | ThermalAnalysisResults;

      if (simulationType === "stress") {
        const stressAnalysis = new StressAnalysis(mesh as any);
        stressAnalysis.setupAnalysis(simulationParams as StressAnalysisParams);
        setProgress(50);
        results = stressAnalysis.runAnalysis();

        // Create deformed mesh for visualization
        const feaEngine = new FEAEngine(mesh as any);
        const deformed = feaEngine.createDeformedMesh(mesh as any, 5.0); // 5x deformation scale
        setDeformedMesh(deformed as any);

      } else if (simulationType === "thermal") {
        const thermalAnalysis = new ThermalAnalysis(mesh as any);
        thermalAnalysis.setupAnalysis(simulationParams as ThermalAnalysisParams);
        setProgress(50);
        results = thermalAnalysis.runAnalysis();

      } else { // coupled
        // Run both stress and thermal analysis
        const stressAnalysis = new StressAnalysis(mesh as any);
        stressAnalysis.setupAnalysis(simulationParams as StressAnalysisParams);
        setProgress(40);

        const thermalAnalysis = new ThermalAnalysis(mesh as any);
        thermalAnalysis.setupAnalysis(simulationParams as ThermalAnalysisParams);
        setProgress(60);

        const stressResults = stressAnalysis.runAnalysis();
        const thermalResults = thermalAnalysis.runAnalysis();

        // Combine results (simplified)
        results = {
          ...stressResults,
          ...thermalResults
        };

        const feaEngine = new FEAEngine(mesh as any);
        const deformed = feaEngine.createDeformedMesh(mesh as any, 5.0);
        setDeformedMesh(deformed as any);
      }

      setProgress(100);
      setSimulationResults(results);
      setCurrentState("results");

    } catch (error) {
      console.error("Error during simulation:", error);
      setError(error instanceof Error ? error.message : "Unknown error during simulation");
      setCurrentState("error");
    }
  }, [simulationParams, simulationType, getSelectedMeshes, createMeshFromElement]);

  const handleBackToSetup = useCallback(() => {
    setCurrentState("setup");
    setSimulationParams(null);
    setSimulationResults(null);
    setDeformedMesh(null);
    setError(null);
    setProgress(0);
  }, []);

  const renderCurrentView = () => {
    switch (currentState) {
      case "setup":
        return (
          <SimulationSetup
            meshId={selectedMeshIds[0] || "default"}
            onRunSimulation={handleSetupSimulation}
            onCancel={onClose}
          />
        );

      case "preview":
        if (!simulationParams) return null;

        const selectedMeshes = getSelectedMeshes();
        const firstElement = selectedMeshes[0];
        const previewMesh = firstElement ? createMeshFromElement(firstElement) : null;

        return (
          <div className="h-full flex flex-col">
            <div className="p-4 bg-gray-50 border-b">
              <h2 className="text-xl font-semibold mb-2">Simulation Preview</h2>
              <p className="text-gray-600">
                Verify loads and constraints before running the simulation
              </p>
            </div>

            <div className="flex-1">
              <LoadsAndConstraints
                meshes={previewMesh ? [previewMesh] : []}
                simulationType={simulationType}
                onForceAdd={() => { }}
                onConstraintAdd={() => { }}
                onHeatSourceAdd={() => { }}
                onThermalBoundaryAdd={() => { }}
              />
            </div>

            <div className="p-4 bg-gray-50 border-t flex justify-between">
              <button
                onClick={handleBackToSetup}
                className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              >
                Edit Setup
              </button>
              <button
                onClick={handleRunSimulation}
                className="px-6 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Run Simulation
              </button>
            </div>
          </div>
        );

      case "running":
        return (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Simulation in progress...</h3>
              <div className="w-64 bg-gray-200 rounded-full h-2 mx-auto">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-600 mt-2">{progress}% completed</p>
            </div>
          </div>
        );

      case "results":
        if (!simulationResults) return null;

        return (
          <ResultsViewer
            results={simulationResults as any}
            meshes={deformedMesh ? [deformedMesh] : []}
            simulationType={simulationType}
            onExport={(format) => {
              console.log(`Exporting results as ${format}`);
              // TODO: Implement export functionality
            }}
          />
        );

      case "error":
        return (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 mx-auto mb-4 text-red-500">
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Error during simulation</h3>
              <p className="text-sm text-gray-600 mb-4">{error}</p>
              <button
                onClick={handleBackToSetup}
                className="px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Back to Setup
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="absolute inset-4 bg-white rounded-lg shadow-xl flex flex-col">
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              FEA Simulation
            </h1>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation breadcrumb */}
          <div className="mt-2 flex items-center space-x-2 text-sm text-gray-500">
            <span className={currentState === "setup" ? "text-blue-600 font-medium" : ""}>
              Setup
            </span>
            <span>→</span>
            <span className={currentState === "preview" ? "text-blue-600 font-medium" : ""}>
              Preview
            </span>
            <span>→</span>
            <span className={currentState === "running" ? "text-blue-600 font-medium" : ""}>
              Execution
            </span>
            <span>→</span>
            <span className={currentState === "results" ? "text-blue-600 font-medium" : ""}>
              Results
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {renderCurrentView()}
        </div>
      </div>
    </div>
  );
};

export default SimulationManager; 