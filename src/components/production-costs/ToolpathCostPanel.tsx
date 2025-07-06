// src/components/production-costs/ToolpathCostPanel.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useProductionCostsStore } from "@/src/store/productionCostsStore";
import { formatCurrency, formatTime, formatPercentage } from "@/src/services/productionCostsService";
import { ProductionCostEstimate } from "@/src/types/costs";

interface ToolpathCostPanelProps {
  toolpathId: string;
}

const ToolpathCostPanel: React.FC<ToolpathCostPanelProps> = ({ toolpathId }) => {
  const { getEstimateByToolpathId, estimateToolpathCost, saveEstimate, settings } = useProductionCostsStore();

  const [estimate, setEstimate] = useState<ProductionCostEstimate | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const generateNewEstimate = useCallback(async () => {
    if (!toolpathId) return;
    setLoading(true);
    try {
      const newEstimateResult = await estimateToolpathCost(toolpathId);
      if (newEstimateResult) {
        await saveEstimate(newEstimateResult);
        setEstimate(newEstimateResult);
      }
    } catch (error) {
      console.error("Errore nella generazione della stima dei costi:", error);
      setEstimate(null);
    } finally {
      setLoading(false);
    }
  }, [toolpathId, estimateToolpathCost, saveEstimate]);

  useEffect(() => {
    const fetchOrGenerateEstimate = async () => {
      if (!toolpathId) {
        setEstimate(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const existingEstimate = await getEstimateByToolpathId(toolpathId);
        if (existingEstimate) {
          setEstimate(existingEstimate);
          setLoading(false);
        } else if (settings.calculateAutomatically) {
          // generateNewEstimate will handle its own setLoading(true/false) and setEstimate
          await generateNewEstimate();
        } else {
          setEstimate(null);
          setLoading(false);
        }
      } catch (error) {
        console.error("Errore nel recupero o generazione della stima:", error);
        setEstimate(null);
        setLoading(false);
      }
    };

    fetchOrGenerateEstimate();
  }, [toolpathId, getEstimateByToolpathId, settings.calculateAutomatically, generateNewEstimate]);

  // Se non ci sono dati da mostrare e non sta caricando (dopo il fetch iniziale)
  if (!loading && !estimate && toolpathId) {
    // ensure toolpathId is present to show generate button
    return (
      <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow">
        <h3 className="text-lg font-medium mb-3">Production Cost</h3>
        <p className="text-gray-500">No production cost estimate available for this toolpath.</p>
        <button
          onClick={generateNewEstimate}
          className="mt-3 bg-blue-500 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-600"
        >
          Generate Estimate
        </button>
      </div>
    );
  }

  // Mostra il caricamento
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow">
        <h3 className="text-lg font-medium mb-3">Production Cost</h3>
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mr-2"></div>
          <span>Calculation in progress...</span>
        </div>
      </div>
    );
  }

  // Mostra i dettagli della stima
  return (
    <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow">
      <h3 className="text-lg font-medium mb-3">Production Cost</h3>

      {estimate && (
        <div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-gray-50 dark:bg-gray-800     p-2 rounded">
              <span className="text-sm text-gray-600">Material:</span>
              <p className="font-medium">{formatCurrency(estimate.materialCost, estimate.currencyCode)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
              <span className="text-sm text-gray-600">Tool:</span>
              <p className="font-medium">{formatCurrency(estimate.toolWearCost, estimate.currencyCode)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
              <span className="text-sm text-gray-600">Machine Time:</span>
              <p className="font-medium">{formatTime(estimate.machineTime)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
              <span className="text-sm text-gray-600">Operator Time:</span>
              <p className="font-medium">{formatCurrency(estimate.operatorTimeCost, estimate.currencyCode)}</p>
            </div>
          </div>

          {/* Costo totale */}
          <div className="bg-blue-50 dark:bg-blue-900 p-3 rounded-md flex justify-between items-center">
            <span className="font-medium text-blue-800 dark:text-blue-200">TOTAL COST:</span>
            <span className="text-lg font-bold">{formatCurrency(estimate.totalCost, estimate.currencyCode)}</span>
          </div>

          {/* Data calcolo */}
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-right">
            Last update: {new Date(estimate.updatedAt).toLocaleString("en-US")}
          </div>

          {/* Pulsante per rigenerare la stima */}
          <button onClick={generateNewEstimate} className="mt-2 text-blue-600 text-sm hover:text-blue-800">
            Update Estimate
          </button>
        </div>
      )}
    </div>
  );
};

export default ToolpathCostPanel;
