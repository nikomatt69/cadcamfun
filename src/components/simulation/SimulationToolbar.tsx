import React, { useState } from "react";
import { useSimulation } from "../../hooks/useSimulation";

interface SimulationToolbarProps {
  className?: string;
}

const SimulationToolbar: React.FC<SimulationToolbarProps> = ({ className = "" }) => {
  const {
    isSimulationOpen,
    selectedElementsForSimulation,
    simulationMode,
    openSimulation,
    closeSimulation,
    canSimulateElement,
    getSimulatableElements
  } = useSimulation();

  const simulatableElementsCount = getSimulatableElements().length;
  const hasSelectedElements = selectedElementsForSimulation.length > 0;
  const [showGuide, setShowGuide] = useState(false);

  const handleShowGuide = () => {
    setShowGuide(true);
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {/* Main Simulation button - styled like other icons */}
      <button
        onClick={isSimulationOpen ? closeSimulation : openSimulation}
        disabled={simulatableElementsCount === 0}
        className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 z-10 disabled:opacity-50 disabled:cursor-not-allowed"
        title={
          simulatableElementsCount === 0
            ? "No simulatable elements in the project"
            : isSimulationOpen
              ? "Close FEA simulation"
              : "Open FEA simulation"
        }
      >
        <svg
          className={`w-[18px] h-[18px] ${isSimulationOpen ? 'text-blue-600' : 'text-gray-700 dark:text-gray-200'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      </button>

      {/* Quick simulation type buttons when simulation is open */}
      {isSimulationOpen && (
        <>
          {/* Stress Analysis */}
          <button
            className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 z-10"
            title="Structural analysis - Stress and deformation"
          >
            <svg className="w-[18px] h-[18px] text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </button>

          {/* Thermal Analysis */}
          <button
            className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 z-10"
            title="Thermal analysis - Temperature and heat"
          >
            <svg className="w-[18px] h-[18px] text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 1-4 4-4 1.657 0 3 .895 3 2 0 1-1 2-1 2 1 0 3 .5 3 2 0 .5-.5 1-1 1z"
              />
            </svg>
          </button>

          {/* Coupled Analysis */}
          <button
            className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 z-10"
            title="Coupled analysis - Combined stress and thermal"
          >
            <svg className="w-[18px] h-[18px] text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
        </>
      )}

      {/* Quick actions when simulation is open */}
      {isSimulationOpen && hasSelectedElements && (
        <>
          {/* Quick Analysis */}
          <button
            className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 z-10"
            title="Run quick analysis"
          >
            <svg className="w-[18px] h-[18px] text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </button>

          {/* Preview */}
          <button
            className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 z-10"
            title="Preview loads and constraints"
          >
            <svg className="w-[18px] h-[18px] text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          </button>
        </>
      )}

      {/* Help button */}
      <button
        onClick={handleShowGuide}
        className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 z-10"
        title="FEA simulation guide"
      >
        <svg className="w-[18px] h-[18px] text-gray-700 dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      {/* FEA Simulation Guide Modal */}
      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="max-w-4xl max-h-[90vh] w-full mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">FEA Simulation Guide</h2>
                <button
                  onClick={() => setShowGuide(false)}
                  className="p-1 hover:bg-white/20 rounded-full transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="space-y-6">
                {/* Getting Started */}
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                    <span className="w-6 h-6 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-sm font-bold mr-2">1</span>
                    Getting Started
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-3">
                    Follow these steps to perform a Finite Element Analysis (FEA) simulation:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-300 ml-4">
                    <li>Create or import CAD elements in your design</li>
                    <li>Click the FEA simulation button to open the simulation interface</li>
                    <li>Select elements for analysis using selection mode</li>
                    <li>Configure simulation parameters and run analysis</li>
                  </ol>
                </section>

                {/* Simulation Types */}
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                    <span className="w-6 h-6 bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center text-sm font-bold mr-2">2</span>
                    Simulation Types
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                      <div className="flex items-center mb-2">
                        <svg className="w-5 h-5 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <h4 className="font-medium text-gray-900 dark:text-white">Stress Analysis</h4>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Analyze mechanical stress, deformation, and safety factors under applied loads.
                      </p>
                    </div>
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                      <div className="flex items-center mb-2">
                        <svg className="w-5 h-5 text-orange-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 1-4 4-4 1.657 0 3 .895 3 2 0 1-1 2-1 2 1 0 3 .5 3 2 0 .5-.5 1-1 1z" />
                        </svg>
                        <h4 className="font-medium text-gray-900 dark:text-white">Thermal Analysis</h4>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Study heat transfer, temperature distribution, and thermal effects.
                      </p>
                    </div>
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                      <div className="flex items-center mb-2">
                        <svg className="w-5 h-5 text-purple-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <h4 className="font-medium text-gray-900 dark:text-white">Coupled Analysis</h4>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Combined thermo-mechanical analysis for complex interactions.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Keyboard Shortcuts */}
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                    <span className="w-6 h-6 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 rounded-full flex items-center justify-center text-sm font-bold mr-2">3</span>
                    Keyboard Shortcuts
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-300">Open/Close simulation</span>
                        <kbd className="px-2 py-1 text-xs font-mono bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded">Ctrl+Shift+S</kbd>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-300">Toggle selection mode</span>
                        <kbd className="px-2 py-1 text-xs font-mono bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded">F9</kbd>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-300">Clear selection</span>
                        <kbd className="px-2 py-1 text-xs font-mono bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded">Esc</kbd>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-300">Continue analysis</span>
                        <kbd className="px-2 py-1 text-xs font-mono bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded">F9</kbd>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Tips and Best Practices */}
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                    <span className="w-6 h-6 bg-yellow-100 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-400 rounded-full flex items-center justify-center text-sm font-bold mr-2">4</span>
                    Tips & Best Practices
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-start">
                      <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-gray-600 dark:text-gray-300">Start with simple geometries to understand the simulation workflow</p>
                    </div>
                    <div className="flex items-start">
                      <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-gray-600 dark:text-gray-300">Use appropriate mesh density - finer meshes provide more accurate results but take longer</p>
                    </div>
                    <div className="flex items-start">
                      <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-gray-600 dark:text-gray-300">Always apply proper boundary conditions (constraints) to avoid unrealistic results</p>
                    </div>
                    <div className="flex items-start">
                      <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-gray-600 dark:text-gray-300">Verify material properties match your real-world application</p>
                    </div>
                  </div>
                </section>

                {/* Current Limitations */}
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                    <span className="w-6 h-6 bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center text-sm font-bold mr-2">!</span>
                    Current Limitations
                  </h3>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                      <strong>Note:</strong> This is a demonstration version of the FEA system. The current implementation uses simplified solvers suitable for educational purposes and prototyping. For critical engineering applications, please integrate with professional FEA solvers like OpenFOAM or CalculiX.
                    </p>
                  </div>
                </section>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50 dark:bg-gray-700">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowGuide(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Got it!
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationToolbar; 