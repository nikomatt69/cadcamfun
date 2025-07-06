import React from "react";
import CADCanvas from "./CADCanvas";
import SimulationManager from "../simulation/SimulationManager";
import SimulationToolbar from "../simulation/SimulationToolbar";
import SimulationInteractionLayer from "../simulation/SimulationInteractionLayer";
import { useSimulation, useSimulationEffects } from "../../hooks/useSimulation";

interface CADCanvasWithSimulationProps {
  width?: string | number;
  height?: string | number;
  previewComponent?: string | null;
  onComponentPlaced?: (component: string, position: { x: number; y: number; z: number }) => void;
  allowDragDrop?: boolean;
  onElementsChange?: (elements: any[]) => void;
}

const CADCanvasWithSimulation: React.FC<CADCanvasWithSimulationProps> = (props) => {
  const simulation = useSimulation();
  const simulationEffects = useSimulationEffects();

  return (
    <div className="relative w-full h-full">
      {/* Main CAD Canvas */}
      <CADCanvas {...props} />

      {/* Simulation overlay */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {/* Simulation Toolbar - only if there are simulatable elements */}
        {simulation.getSimulatableElements().length > 0 && (
          <div className="absolute top-4 right-4 pointer-events-auto">
            <SimulationToolbar />
          </div>
        )}

        {/* Simulation status indicators when active */}
        {simulation.isSimulationOpen && simulation.simulationMode === "selecting" && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto">
            <div className="bg-blue-100 border border-blue-300 rounded-lg p-4 shadow-lg">
              <div className="flex items-center space-x-2 text-blue-800">
                <svg className="w-5 h-5 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">Select elements for simulation</span>
              </div>
              <p className="text-sm text-blue-600 mt-1">
                Click on CAD elements you want to simulate
              </p>
            </div>
          </div>
        )}

        {/* Indicators for elements selected for simulation */}
        {simulation.selectedElementsForSimulation.length > 0 && (
          <div className="absolute bottom-4 left-4 pointer-events-auto">
            <div className="bg-green-100 border border-green-300 rounded-lg p-3 shadow-lg">
              <div className="flex items-center space-x-2 text-green-800">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium">
                  {simulation.selectedElementsForSimulation.length} element(s) selected
                </span>
              </div>
              <div className="flex space-x-2 mt-2">
                <button
                  onClick={simulation.toggleSimulationMode}
                  className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                >
                  {simulation.simulationMode === "selecting" ? "Configure" : "Reselect"}
                </button>
                <button
                  onClick={simulation.clearSimulationSelection}
                  className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Simulation interaction layer */}
      <SimulationInteractionLayer />

      {/* Simulation modal */}
      <SimulationManager
        isOpen={simulation.isSimulationOpen}
        onClose={simulation.closeSimulation}
        selectedMeshIds={simulation.selectedElementsForSimulation}
      />

      {/* Simulation visual effects overlaid on canvas */}
      {simulation.simulationResults && (
        <div className="absolute inset-0 pointer-events-none z-5">
          {/* Here you can add overlays for simulation results */}
          <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg">
            <h4 className="font-semibold text-sm mb-2">Simulation Results</h4>
            <div className="text-xs space-y-1">
              <div>Max Stress: <span className="font-mono">{(simulation.simulationResults as any)?.maxStress?.toFixed(2) || 'N/A'} MPa</span></div>
              <div>Max Displacement: <span className="font-mono">{(simulation.simulationResults as any)?.maxDisplacement?.toFixed(2) || 'N/A'} mm</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CADCanvasWithSimulation; 