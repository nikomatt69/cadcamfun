// src/components/production-costs/ProductionCostsManager.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useProductionCostsStore } from "@/src/store/productionCostsStore";
import { useCAMStore } from "@/src/store/camStore";
import ProductionCostsAPI, {
  formatCurrency,
  formatPercentage,
  formatTime,
  formatVolume,
  formatDimension
} from "@/src/services/productionCostsService";

import ToolWearCostForm from "./ToolWearCostForm";
import MaterialCostForm from "./MaterialCostForm";
import OperationCostForm from "./OperationCostForm";
import CostEstimateCard from "./CostEstimateCard";
import CostSettingsForm from "./CostSettingsForm";

// Import API functions and types
import { fetchTools } from "@/src/lib/api/tools";
import { fetchMaterials } from "@/src/lib/api/materials";
import { fetchToolpaths } from "@/src/lib/api/toolpaths";
import { Tool, Material } from "@/src/types/mainTypes";
import { ToolpathData } from "@/src/lib/api/toolpaths";

// Icon components (simple placeholders)
const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828zM5 12V7.172l7.586-7.586a2 2 0 012.828 0L17 3.172l-7.586 7.586L5 12z" />
    <path d="M15 5l-1.586-1.586L7.414 8H5v2.414L12.586 17 14 15.586 15 5z" fillRule="evenodd" clipRule="evenodd" />
    <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
  </svg>
);
const DeleteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
      clipRule="evenodd"
    />
  </svg>
);

interface Tab {
  id: string;
  label: string;
}

const tabs: Tab[] = [
  { id: "overview", label: "Panoramica" },
  { id: "tool-wear", label: "Costi Utensili" },
  { id: "materials", label: "Costi Materiali" },
  { id: "operations", label: "Costi Operazioni" },
  { id: "estimates", label: "Stime Costi" },
  { id: "settings", label: "Impostazioni" }
];

const CURRENT_TOOLPATH_ID = "current";

const ProductionCostsManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [selectedToolpathId, setSelectedToolpathId] = useState<string | null>(null);
  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(null);

  const [editingToolWearCostId, setEditingToolWearCostId] = useState<string | null>(null);
  const [editingMaterialCostId, setEditingMaterialCostId] = useState<string | null>(null);
  const [editingOperationCostId, setEditingOperationCostId] = useState<string | null>(null);

  // Local state for tools and materials fetched from API
  const [apiTools, setApiTools] = useState<Tool[]>([]);
  const [apiMaterials, setApiMaterials] = useState<Material[]>([]);
  const [savedToolpaths, setSavedToolpaths] = useState<ToolpathData[]>([]);
  const [isFetchingLibraries, setIsFetchingLibraries] = useState<boolean>(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [isFetchingToolpaths, setIsFetchingToolpaths] = useState<boolean>(false);
  const [toolpathsError, setToolpathsError] = useState<string | null>(null);

  const {
    toolWearCosts,
    deleteToolWearCost, // add/update handled by forms
    materialCosts,
    deleteMaterialCost, // add/update handled by forms
    operationCosts, // add/update/delete handled by OperationCostForm
    costEstimates,
    estimateToolpathCost,
    saveEstimate,
    deleteEstimate,
    // settings, // settings are used by CostSettingsForm directly
    isLoading: isStoreLoading, // Renamed to avoid conflict with local loading
    error: storeError, // Renamed
    loadData
  } = useProductionCostsStore();

  const { toolpaths: currentToolpaths } = useCAMStore();

  useEffect(() => {
    loadData(); // Load cost data (wear, material, operation, estimates, settings)

    const fetchLibraries = async () => {
      setIsFetchingLibraries(true);
      setLibraryError(null);
      try {
        const [fetchedTools, fetchedMaterials] = await Promise.all([fetchTools(), fetchMaterials()]);
        setApiTools(fetchedTools);
        setApiMaterials(fetchedMaterials);
      } catch (err) {
        console.error("Error fetching tool/material libraries:", err);
        setLibraryError("Impossibile caricare le librerie di utensili/materiali.");
      } finally {
        setIsFetchingLibraries(false);
      }
    };
    fetchLibraries();

    const fetchSavedToolpaths = async () => {
      setIsFetchingToolpaths(true);
      setToolpathsError(null);
      try {
        const toolpathsData = await fetchToolpaths();
        setSavedToolpaths(toolpathsData);
      } catch (err) {
        console.error("Error fetching saved toolpaths:", err);
        setToolpathsError("Impossibile caricare i toolpath salvati.");
      } finally {
        setIsFetchingToolpaths(false);
      }
    };
    fetchSavedToolpaths();
  }, [loadData]);

  const handleToolpathSelect = (toolpathId: string) => {
    setSelectedToolpathId(toolpathId);
    // Only look for existing estimates for saved toolpaths, not the current one
    if (toolpathId !== CURRENT_TOOLPATH_ID) {
      const existingEstimate = costEstimates.find(est => est.toolpathId === toolpathId);
      setSelectedEstimateId(existingEstimate ? existingEstimate.id : null);
    } else {
      setSelectedEstimateId(null);
    }
  };

  const generateEstimateAndUpdateState = async () => {
    if (!selectedToolpathId) return;

    let toolpathToUse = selectedToolpathId;

    // If current toolpath is selected, we need the actual toolpath
    if (selectedToolpathId === CURRENT_TOOLPATH_ID) {
      if (currentToolpaths.length === 0) {
        alert("Nessun toolpath corrente disponibile.");
        return;
      }

      // Use the last one in the current session as it's likely the most recent
      const lastCurrentToolpath = currentToolpaths[currentToolpaths.length - 1];

      // TODO: Here you'd need to save the current toolpath to get an ID
      // For now, we'll just use the current ID if a stored version exists
      // This is where you might add logic to save the current toolpath to the database

      toolpathToUse = lastCurrentToolpath.id;
    }

    const estimateResult = await estimateToolpathCost(toolpathToUse);
    if (estimateResult) {
      await saveEstimate(estimateResult); // This should update costEstimates in the store
      // Find the newly saved estimate to get its ID, assuming saveEstimate adds it to the store
      // This might require saveEstimate to return the full estimate object with ID
      const saved = costEstimates.find(e => e.toolpathId === toolpathToUse && e.totalCost === estimateResult.totalCost); // Heuristic
      setSelectedEstimateId(saved ? saved.id : estimateResult.id || null);
    }
  };

  const getToolName = useCallback(
    (toolId: string) => {
      const tool = apiTools.find(t => t.id === toolId);
      return tool ? `${tool.name} (${tool.diameter}mm ${tool.type})` : "Utensile sconosciuto";
    },
    [apiTools]
  );

  const getMaterialName = useCallback(
    (materialId: string) => {
      const material = apiMaterials.find(m => m.id === materialId);
      return material ? material.name : "Materiale sconosciuto";
    },
    [apiMaterials]
  );

  const getCurrentToolpath = () => {
    if (currentToolpaths.length === 0) return null;
    return currentToolpaths[currentToolpaths.length - 1]; // Get the last one which is usually the most recent
  };

  const selectedToolpath =
    selectedToolpathId === CURRENT_TOOLPATH_ID
      ? getCurrentToolpath()
      : savedToolpaths.find(tp => tp.id === selectedToolpathId) ||
        currentToolpaths.find(tp => tp.id === selectedToolpathId);

  const selectedEstimate = costEstimates.find(est => est.id === selectedEstimateId);
  const hasEstimateForSelectedToolpath =
    selectedToolpathId &&
    selectedToolpathId !== CURRENT_TOOLPATH_ID &&
    costEstimates.some(est => est.toolpathId === selectedToolpathId);

  const handleToolWearFormAction = useCallback(() => {
    setEditingToolWearCostId(null);
  }, []);

  const handleMaterialFormAction = useCallback(() => {
    setEditingMaterialCostId(null);
  }, []);

  const handleOperationFormAction = useCallback((actionType?: string, id?: string) => {
    if (actionType === "edit" && id) {
      setEditingOperationCostId(id);
    } else {
      setEditingOperationCostId(null);
    }
  }, []);

  // Overall loading state: store is loading its data OR libraries are fetching
  const isLoading = isStoreLoading || isFetchingLibraries || isFetchingToolpaths;
  // Combined error state
  const error = storeError || libraryError || toolpathsError;

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div>
            <h2 className="text-xl font-semibold dark:text-gray-300 mb-4">Cost Overview</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 dark:bg-gray-600 p-4 rounded-lg">
                <h3 className="font-medium text-blue-800">Tools with Costs</h3>
                <p className="text-2xl font-bold">{toolWearCosts.length}</p>
              </div>
              <div className="bg-green-50 dark:bg-gray-600 p-4 rounded-lg">
                <h3 className="font-medium text-green-800">Materials with Costs</h3>
                <p className="text-2xl font-bold">{materialCosts.length}</p>
              </div>
              <div className="bg-purple-50 dark:bg-gray-600 p-4 rounded-lg">
                <h3 className="font-medium text-purple-800">Operations</h3>
                <p className="text-2xl font-bold">{operationCosts.length}</p>
              </div>
              <div className="bg-amber-50 p-4 dark:bg-gray-600 rounded-lg">
                <h3 className="font-medium text-amber-800">Generated Estimates</h3>
                <p className="text-2xl font-bold">{costEstimates.length}</p>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">Select Toolpath for Cost Estimation</h3>
              <div className="flex flex-col space-y-2">
                <select
                  className="border border-gray-300 rounded-md p-2"
                  value={selectedToolpathId || ""}
                  onChange={e => handleToolpathSelect(e.target.value)}
                >
                  <option value="">Select a toolpath</option>

                  {/* Current toolpath option */}
                  {currentToolpaths.length > 0 && (
                    <option value={CURRENT_TOOLPATH_ID} className="font-semibold">
                      [Current Toolpath] {getCurrentToolpath()?.name || "No name"}
                    </option>
                  )}

                  {/* Add option group for saved toolpaths if there are any */}
                  {savedToolpaths.length > 0 && (
                    <optgroup label="Saved Toolpaths">
                      {savedToolpaths.map(tp => (
                        <option key={tp.id} value={tp.id}>
                          {tp.name}
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {/* Show current session toolpaths if different from the current one */}
                  {currentToolpaths.length > 1 && (
                    <optgroup label="Current Session Toolpaths">
                      {currentToolpaths.slice(0, -1).map(tp => (
                        <option key={tp.id} value={tp.id}>
                          {tp.name || `Toolpath #${tp.id.substring(0, 6)}`}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                <button
                  className="bg-blue-500 dark:bg-gray-600 text-white px-4 py-2 rounded-md disabled:bg-gray-300"
                  disabled={!selectedToolpathId}
                  onClick={generateEstimateAndUpdateState}
                >
                  {isLoading && selectedToolpathId
                    ? "Generazione/Aggiornamento Stima..."
                    : selectedToolpathId === CURRENT_TOOLPATH_ID
                      ? "Genera Stima dal Toolpath Corrente"
                      : hasEstimateForSelectedToolpath
                        ? "Aggiorna Stima Esistente"
                        : "Genera Nuova Stima Costi"}
                </button>
              </div>
            </div>

            {selectedEstimate && (
              <div className="border border-gray-200 dark:text-gray-300 rounded-lg p-4 mb-6">
                <h3 className="text-lg font-semibold mb-2">
                  Cost Estimation for {selectedToolpath?.name || "Selected Toolpath"}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <div className="bg-gray-50 p-3 rounded-md">
                    <span className="text-gray-600">Material Cost:</span>
                    <p className="text-lg font-bold">
                      {formatCurrency(selectedEstimate.materialCost, selectedEstimate.currencyCode)}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-md">
                    <span className="text-gray-600">Tool Wear Cost:</span>
                    <p className="text-lg font-bold">
                      {formatCurrency(selectedEstimate.toolWearCost, selectedEstimate.currencyCode)}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-md">
                    <span className="text-gray-600">Machine Time:</span>
                    <p className="text-lg font-bold">{formatTime(selectedEstimate.machineTime)}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-md">
                    <span className="text-gray-600">Machine Time Cost:</span>
                    <p className="text-lg font-bold">
                      {formatCurrency(selectedEstimate.machineTimeCost, selectedEstimate.currencyCode)}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-md">
                    <span className="text-gray-600">Operator Cost:</span>
                    <p className="text-lg font-bold">
                      {formatCurrency(selectedEstimate.operatorTimeCost, selectedEstimate.currencyCode)}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-md">
                    <span className="text-gray-600">Setup Cost:</span>
                    <p className="text-lg font-bold">
                      {formatCurrency(selectedEstimate.setupCost, selectedEstimate.currencyCode)}
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-md">
                  <span className="text-blue-800">TOTAL COST:</span>
                  <p className="text-2xl font-bold">
                    {formatCurrency(selectedEstimate.totalCost, selectedEstimate.currencyCode)}
                  </p>
                </div>

                {selectedEstimate.details && (
                  <div className="mt-4 border-t border-gray-200 pt-4">
                    <h4 className="font-medium mb-2">Details</h4>
                    <ul className="text-sm text-gray-600">
                      {selectedEstimate.details.materialId && (
                        <li>Material: {getMaterialName(selectedEstimate.details.materialId)}</li>
                      )}
                      {selectedEstimate.details.toolId && <li>Tool: {getToolName(selectedEstimate.details.toolId)}</li>}
                      {selectedEstimate.details.materialVolume && (
                        <li>Material Volume: {formatVolume(selectedEstimate.details.materialVolume)}</li>
                      )}
                      {selectedEstimate.details.toolPathLength && (
                        <li>Toolpath Length: {formatDimension(selectedEstimate.details.toolPathLength)}</li>
                      )}
                      {selectedEstimate.details.toolWearPercentage && (
                        <li>Tool Wear: {formatPercentage(selectedEstimate.details.toolWearPercentage)}</li>
                      )}
                      {selectedEstimate.details.feedRate && (
                        <li>Feed Rate: {selectedEstimate.details.feedRate} mm/min</li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    className="text-red-600 hover:text-red-800 mr-2"
                    onClick={async () => {
                      if (selectedEstimateId) {
                        try {
                          if (window.confirm("Are you sure you want to delete this estimate?")) {
                            const success = await deleteEstimate(selectedEstimateId);
                            if (success) {
                              setSelectedEstimateId(null);
                            }
                          }
                        } catch (err) {
                          console.error("Error handling delete in overview tab:", err);
                          // You could add a toast notification here if not already handled in the store
                        }
                      }
                    }}
                  >
                    Delete
                  </button>
                  <button
                    className="text-blue-600 hover:text-blue-800"
                    onClick={() => {
                      if (selectedEstimate) {
                        const report = ProductionCostsAPI.Utils.generateCostReport(selectedEstimate, true);
                        navigator.clipboard
                          .writeText(report)
                          .then(() => alert("Report copied to clipboard!"))
                          .catch(() => alert("Unable to copy report."));
                      }
                    }}
                  >
                    Copy Report
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      case "tool-wear":
        return (
          <div>
            <h2 className="text-xl dark:text-gray-300 font-semibold mb-4">Tool Wear Costs Management</h2>
            <ToolWearCostForm
              key={editingToolWearCostId || "new"}
              costToEditId={editingToolWearCostId}
              onSubmissionDone={handleToolWearFormAction}
            />
            <div className="mt-8 pt-6 border-t">
              <h3 className="text-lg font-semibold mb-3">Registered Tool Wear Costs</h3>
              {isFetchingLibraries && <p>Loading tool names...</p>}
              {libraryError && <p className="text-red-500">{libraryError}</p>}
              {toolWearCosts.length === 0 && !isFetchingLibraries && (
                <p className="text-gray-500">No tool wear cost configured.</p>
              )}
              <div className="space-y-3">
                {toolWearCosts.map(cost => (
                  <div
                    key={cost.id}
                    className="bg-white p-3 rounded-md shadow-sm border flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium">{getToolName(cost.toolId)}</p>
                      <p className="text-sm text-gray-600">
                        Wear Rate: {cost.wearRatePerMeter}% per meter, Replacement Cost:{" "}
                        {formatCurrency(cost.replacementCost, cost.currencyCode)} @ {cost.replacementThreshold}%
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setEditingToolWearCostId(cost.id)}
                        className="p-1 text-blue-600 hover:text-blue-800"
                      >
                        <EditIcon />
                      </button>
                      <button
                        onClick={async () => {
                          if (window.confirm("Are you sure you want to delete this cost?")) {
                            await deleteToolWearCost(cost.id);
                            if (editingToolWearCostId === cost.id) setEditingToolWearCostId(null);
                          }
                        }}
                        className="p-1 text-red-600 hover:text-red-800"
                        disabled={isStoreLoading} // Use isStoreLoading for disabling actions during store operations
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case "materials":
        return (
          <div>
            <h2 className="text-xl font-semibold dark:text-gray-300 mb-4">Materials Costs Management</h2>
            <MaterialCostForm
              key={editingMaterialCostId || "new"}
              costToEditId={editingMaterialCostId}
              onSubmissionDone={handleMaterialFormAction}
            />
            <div className="mt-8 pt-6 border-t">
              <h3 className="text-lg font-semibold mb-3">Registered Materials Costs</h3>
              {isFetchingLibraries && <p>Loading material names...</p>}
              {libraryError && <p className="text-red-500">{libraryError}</p>}
              {materialCosts.length === 0 && !isFetchingLibraries && (
                <p className="text-gray-500">No material cost configured.</p>
              )}
              <div className="space-y-3">
                {materialCosts.map(cost => (
                  <div
                    key={cost.id}
                    className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium">{getMaterialName(cost.materialId)}</p>
                      <p className="text-sm text-gray-600">
                        Cost per Unit: {formatCurrency(cost.costPerUnit, cost.currencyCode)}, Waste Factor:{" "}
                        {cost.wasteFactor}%, Min: {formatCurrency(cost.minimumCharge, cost.currencyCode)}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setEditingMaterialCostId(cost.id)}
                        className="p-1 text-blue-600 hover:text-blue-800"
                      >
                        <EditIcon />
                      </button>
                      <button
                        onClick={async () => {
                          if (window.confirm("Are you sure you want to delete this cost?")) {
                            await deleteMaterialCost(cost.id);
                            if (editingMaterialCostId === cost.id) setEditingMaterialCostId(null);
                          }
                        }}
                        className="p-1 text-red-600 hover:text-red-800"
                        disabled={isStoreLoading} // Use isStoreLoading
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case "operations":
        return (
          <div>
            <h2 className="text-xl d font-semibold mb-4">Operations Costs Management</h2>
            <OperationCostForm
              key={editingOperationCostId || "new"} // Re-render form when targeted operation changes or goes to null (new)
              costToEditId={editingOperationCostId}
              onActionDone={handleOperationFormAction}
            />
          </div>
        );
      case "estimates":
        return (
          <div>
            <h2 className="text-xl font-semibold mb-4">All Cost Estimates</h2>
            {costEstimates.length === 0 && <p className="text-gray-500">No cost estimate generated.</p>}
            <div className="space-y-4">
              {costEstimates.map(estimate => {
                const linkedToolpath =
                  savedToolpaths.find(tp => tp.id === estimate.toolpathId) ||
                  currentToolpaths.find(tp => tp.id === estimate.toolpathId);
                return (
                  <CostEstimateCard
                    key={estimate.id}
                    estimate={estimate}
                    toolpathName={linkedToolpath?.name || "Toolpath Sconosciuta"}
                    onDelete={async id => {
                      try {
                        if (window.confirm("Are you sure you want to delete this estimate?")) {
                          // Set local loading state if needed
                          const success = await deleteEstimate(id);
                          if (success && selectedEstimateId === id) {
                            setSelectedEstimateId(null);
                          }
                        }
                      } catch (err) {
                        console.error("Error handling delete in estimates tab:", err);
                        // You could add a toast notification here if not already handled in the store
                      }
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      case "settings":
        return (
          <div>
            <h2 className="text-xl font-semibold mb-4">Cost Settings</h2>
            <CostSettingsForm />
          </div>
        );
      default:
        return <div>Select a tab</div>;
    }
  };

  return (
    <div className="p-6 bg-gray-100 dark:bg-gray-700 min-h-screen">
      {" "}
      {/* Main container styling */}
      <div className="max-w-6xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6">
        <h1 className="text-3xl dark:text-blue-400 font-bold mb-8 text-gray-800">Production Costs Management</h1>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6">
          <ul className="flex flex-wrap -mb-px text-sm font-medium text-center text-gray-500">
            {tabs.map(tab => (
              <li key={tab.id} className="mr-2">
                <button
                  onClick={() => {
                    setActiveTab(tab.id);
                    // Reset editing states when changing tabs
                    setEditingToolWearCostId(null);
                    setEditingMaterialCostId(null);
                    setEditingOperationCostId(null);
                    setSelectedToolpathId(null); // Also reset overview-specific selections
                    setSelectedEstimateId(null);
                  }}
                  className={`inline-flex items-center justify-center p-3 border-b-2 rounded-t-lg group 
                    ${
                      activeTab === tab.id
                        ? "text-indigo-600 border-indigo-600 active"
                        : "border-transparent hover:text-gray-600 hover:border-gray-300"
                    }`}
                >
                  {/* Placeholder for icons if added later */}
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Error Display */}
        {error && (
          <div
            className="bg-red-100 border-l-4 border-red-500 text-red-700 px-4 py-3 mb-4 rounded relative shadow"
            role="alert"
          >
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {/* Global Loading State for initial data load - more specific loading handled by forms/buttons */}
        {isLoading && !toolWearCosts.length && !materialCosts.length && !operationCosts.length && (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            <span className="ml-4 text-gray-600 text-lg">Loading initial data...</span>
          </div>
        )}

        {/* Tab Content Area */}
        <div className="py-4">{renderTabContent()}</div>
      </div>
    </div>
  );
};

export default ProductionCostsManager;
