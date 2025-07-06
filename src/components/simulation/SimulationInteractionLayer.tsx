import React, { useEffect, useCallback } from "react";
import { useSimulation } from "../../hooks/useSimulation";
import { useElementsStore } from "../../store/elementsStore";

interface SimulationInteractionLayerProps {
  className?: string;
}

const SimulationInteractionLayer: React.FC<SimulationInteractionLayerProps> = ({
  className = ""
}) => {
  const simulation = useSimulation();
  const { selectedElement, selectElement } = useElementsStore();

  // Handle automatic element selection when simulation is in selecting mode
  useEffect(() => {
    if (simulation.simulationMode === "selecting" && selectedElement) {
      if (simulation.canSimulateElement(selectedElement.id)) {
        simulation.addElementToSimulation(selectedElement.id);
      }
    }
  }, [selectedElement, simulation.simulationMode, simulation]);

  // Handle keyboard shortcuts for simulation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + Shift + S - Open simulation
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'S') {
        event.preventDefault();
        if (!simulation.isSimulationOpen) {
          simulation.openSimulation();
        } else {
          simulation.closeSimulation();
        }
      }

      // F9 - Toggle simulation selection mode
      if (event.key === 'F9') {
        event.preventDefault();
        if (simulation.isSimulationOpen) {
          simulation.toggleSimulationMode();
        }
      }

      // Escape - Close simulation or clear selection
      if (event.key === 'Escape' && simulation.isSimulationOpen) {
        if (simulation.simulationMode === "selecting") {
          simulation.clearSimulationSelection();
        } else {
          simulation.closeSimulation();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [simulation]);

  // Create visual indicators for simulatable elements
  const renderSimulatableIndicators = useCallback(() => {
    if (!simulation.isSimulationOpen || simulation.simulationMode !== "selecting") {
      return null;
    }

    const simulatableElements = simulation.getSimulatableElements();

    return (
      <div className="absolute inset-0 pointer-events-none">
        {simulatableElements.map(elementId => {
          const isSelected = simulation.selectedElementsForSimulation.includes(elementId);

          return (
            <div
              key={elementId}
              className={`
                absolute border-2 rounded-md transition-all duration-200
                ${isSelected
                  ? "border-green-400 bg-green-100/20"
                  : "border-blue-400 bg-blue-100/10 hover:bg-blue-100/20"
                }
              `}
              style={{
                // Here you should calculate the element position in the canvas
                // For now using placeholder positions
                top: "20%",
                left: "20%",
                width: "100px",
                height: "100px"
              }}
            >
              {isSelected && (
                <div className="absolute -top-6 left-0 bg-green-600 text-white px-2 py-1 rounded text-xs">
                  Selected
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }, [simulation]);

  if (!simulation.isSimulationOpen) {
    return null;
  }

  return (
    <div className={`absolute inset-0 z-20 ${className}`}>
      {/* Selection overlay */}
      {simulation.simulationMode === "selecting" && (
        <div className="absolute inset-0 bg-blue-500/10 backdrop-blur-sm">
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
            <div className="bg-white border border-blue-300 rounded-lg p-4 shadow-lg max-w-md">
              <div className="flex items-center space-x-2 text-blue-800 mb-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-semibold">Simulation Selection Mode</span>
              </div>

              <p className="text-sm text-gray-600 mb-3">
                Select the elements you want to include in the FEA simulation.
              </p>

              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-medium text-green-600">
                    {simulation.selectedElementsForSimulation.length}
                  </span>
                  <span className="text-gray-500"> / </span>
                  <span className="text-gray-600">
                    {simulation.getSimulatableElements().length} elements
                  </span>
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={simulation.clearSimulationSelection}
                    className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    Clear
                  </button>
                  <button
                    onClick={simulation.toggleSimulationMode}
                    disabled={simulation.selectedElementsForSimulation.length === 0}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Selection instructions */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
            <div className="bg-black/80 text-white px-4 py-2 rounded-lg text-sm">
              <div className="flex items-center space-x-4">
                <span>💡 Click on elements to select them</span>
                <span>⌨️ F9: Continue</span>
                <span>⌨️ Esc: Clear selection</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Visual indicators for simulatable elements */}
      {renderSimulatableIndicators()}

      {/* Simulation statistics */}
      {simulation.selectedElementsForSimulation.length > 0 && (
        <div className="absolute top-4 right-4 bg-white border border-gray-300 rounded-lg p-3 shadow-lg">
          <h4 className="font-semibold text-gray-800 mb-2">Selected Elements</h4>
          <div className="space-y-1">
            {simulation.selectedElementsForSimulation.map((elementId, index) => (
              <div key={elementId} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  Element {index + 1}
                </span>
                <button
                  onClick={() => simulation.removeElementFromSimulation(elementId)}
                  className="text-red-500 hover:text-red-700 text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-2 border-t border-gray-200">
            <div className="text-xs text-gray-500">
              Mode: <span className="font-medium capitalize">{simulation.simulationMode}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationInteractionLayer; 