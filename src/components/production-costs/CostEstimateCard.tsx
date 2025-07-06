// src/components/production-costs/CostEstimateCard.tsx
import React, { useState } from "react";
import { ProductionCostEstimate } from "@/src/types/costs";
import ProductionCostsAPI, {
  formatCurrency,
  formatTime,
  formatPercentage,
  formatVolume,
  formatDimension
} from "@/src/services/productionCostsService"; // Import ProductionCostsAPI and formatters
import { useLocalToolsLibraryStore } from "@/src/store/localToolsLibraryStore";
import { useLocalMaterialsLibraryStore } from "@/src/store/localMaterialsLibraryStore";

interface CostEstimateCardProps {
  estimate: ProductionCostEstimate;
  toolpathName: string;
  onDelete: (id: string) => void;
}

const CostEstimateCard: React.FC<CostEstimateCardProps> = ({ estimate, toolpathName, onDelete }) => {
  const [expanded, setExpanded] = useState(false);

  const { tools } = useLocalToolsLibraryStore();
  const { materials } = useLocalMaterialsLibraryStore();

  // Ottieni il nome dell'utensile
  const getToolName = (toolId: string | undefined) => {
    if (!toolId) return "N/A";
    const tool = tools.find(t => t.id === toolId);
    return tool ? tool.name : "Utensile sconosciuto";
  };

  // Ottieni il nome del materiale
  const getMaterialName = (materialId: string | undefined) => {
    if (!materialId) return "N/A";
    const material = materials.find(m => m.id === materialId);
    return material ? material.name : "Materiale sconosciuto";
  };

  // Formatta la data
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Copia report negli appunti
  const copyReport = () => {
    const report = ProductionCostsAPI.Utils.generateCostReport(estimate, true);
    navigator.clipboard
      .writeText(report)
      .then(() => alert("Report copiato negli appunti!"))
      .catch(() => alert("Impossibile copiare il report."));
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div
        className="bg-gray-50 dark:bg-gray-700 p-4 flex justify-between items-center cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <h3 className="font-medium">{toolpathName}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Created on {formatDate(estimate.createdAt)}</p>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-bold text-lg">{formatCurrency(estimate.totalCost, estimate.currencyCode)}</span>
          <button className="text-blue-600 text-sm">{expanded ? "Hide details" : "Show details"}</button>
        </div>
      </div>

      {expanded && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200  ">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <h4 className="font-medium mb-2">Cost Details</h4>
              <ul className="space-y-1 text-sm">
                <li className="flex justify-between">
                  <span>Material Cost:</span>
                  <span>{formatCurrency(estimate.materialCost, estimate.currencyCode)}</span>
                </li>
                <li className="flex justify-between">
                  <span>Tool Wear Cost:</span>
                  <span>{formatCurrency(estimate.toolWearCost, estimate.currencyCode)}</span>
                </li>
                <li className="flex justify-between">
                  <span>Machine Time:</span>
                  <span>{formatTime(estimate.machineTime)}</span>
                </li>
                <li className="flex justify-between">
                  <span>Machine Time Cost:</span>
                  <span>{formatCurrency(estimate.machineTimeCost, estimate.currencyCode)}</span>
                </li>
                <li className="flex justify-between">
                  <span>Operator Time Cost:</span>
                  <span>{formatCurrency(estimate.operatorTimeCost, estimate.currencyCode)}</span>
                </li>
                <li className="flex justify-between">
                  <span>Setup Cost:</span>
                  <span>{formatCurrency(estimate.setupCost, estimate.currencyCode)}</span>
                </li>
                <li className="flex justify-between font-bold border-t border-gray-200 pt-1 mt-1">
                  <span>TOTAL:</span>
                  <span>{formatCurrency(estimate.totalCost, estimate.currencyCode)}</span>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">Processing Details</h4>
              <ul className="space-y-1 text-sm">
                {estimate.details.materialId && (
                  <li className="flex justify-between">
                    <span>Material:</span>
                    <span>{getMaterialName(estimate.details.materialId)}</span>
                  </li>
                )}
                {estimate.details.toolId && (
                  <li className="flex justify-between">
                    <span>Tool:</span>
                    <span>{getToolName(estimate.details.toolId)}</span>
                  </li>
                )}
                {estimate.details.materialVolume && (
                  <li className="flex justify-between">
                    <span>Material Volume:</span>
                    <span>{formatVolume(estimate.details.materialVolume)}</span>
                  </li>
                )}
                {estimate.details.toolPathLength && (
                  <li className="flex justify-between">
                    <span>Tool Path Length:</span>
                    <span>{formatDimension(estimate.details.toolPathLength)}</span>
                  </li>
                )}
                {estimate.details.toolWearPercentage !== undefined && (
                  <li className="flex justify-between">
                    <span>Tool Wear Percentage:</span>
                    <span>{formatPercentage(estimate.details.toolWearPercentage)}</span>
                  </li>
                )}
                {estimate.details.feedRate && (
                  <li className="flex justify-between">
                    <span>Feed Rate:</span>
                    <span>{estimate.details.feedRate} mm/min</span>
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="flex justify-end space-x-2 mt-4">
            <button
              className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-600"
              onClick={e => {
                e.stopPropagation();
                if (confirm("Are you sure you want to delete this estimate?")) {
                  onDelete(estimate.id);
                }
              }}
            >
              Delete
            </button>
            <button
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-600"
              onClick={e => {
                e.stopPropagation();
                copyReport();
              }}
            >
              Copy Report
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CostEstimateCard;
