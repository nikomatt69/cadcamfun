// src/components/production-costs/MaterialCostForm.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useProductionCostsStore } from "@/src/store/productionCostsStore";
import { MaterialCost } from "@/src/types/costs";
import { Material } from "@/src/types/mainTypes";
import { fetchMaterials } from "@/src/lib/api/materials";

const availableCurrencies = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "Dollaro USA" },
  { code: "GBP", symbol: "£", name: "Sterlina britannica" }
];

interface MaterialCostFormProps {
  costToEditId?: string | null;
  onSubmissionDone?: () => void;
}

function MaterialCostForm({ costToEditId, onSubmissionDone }: MaterialCostFormProps): JSX.Element {
  const {
    addMaterialCost,
    updateMaterialCost,
    materialCosts,
    settings,
    isLoading: isSubmittingCost
  } = useProductionCostsStore();

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [formData, setFormData] = useState<{
    materialId: string;
    costPerUnit: number;
    wasteFactor: number;
    minimumCharge: number;
    currencyCode: string;
  }>(() => ({
    materialId: "",
    costPerUnit: 0,
    wasteFactor: 10,
    minimumCharge: 0,
    currencyCode: settings.defaultCurrencyCode || "EUR"
  }));

  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [availableMaterialsForNewCost, setAvailableMaterialsForNewCost] = useState<Material[]>([]);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState<boolean>(false);
  const [materialError, setMaterialError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setFormData({
      materialId: "",
      costPerUnit: 0,
      wasteFactor: 10,
      minimumCharge: 0,
      currencyCode: settings.defaultCurrencyCode || "EUR"
    });
    setIsEditing(false);
    if (onSubmissionDone) {
      onSubmissionDone();
    }
  }, [settings.defaultCurrencyCode, onSubmissionDone]);

  useEffect(() => {
    const loadMaterialsAndFilter = async () => {
      setIsLoadingMaterials(true);
      setMaterialError(null);
      try {
        const fetchedMaterials = await fetchMaterials();
        setAllMaterials(fetchedMaterials);

        const materialsWithoutCosts = fetchedMaterials.filter(
          material => !materialCosts.some(cost => cost.materialId === material.id)
        );
        setAvailableMaterialsForNewCost(materialsWithoutCosts);
      } catch (error) {
        console.error("Failed to fetch materials:", error);
        if (error instanceof Error) {
          setMaterialError(`Errore caricamento materiali: ${error.message}`);
        } else {
          setMaterialError("Errore sconosciuto caricamento materiali.");
        }
      } finally {
        setIsLoadingMaterials(false);
      }
    };
    loadMaterialsAndFilter();
  }, [materialCosts]);

  useEffect(() => {
    if (costToEditId) {
      const costToEdit = materialCosts.find(cost => cost.id === costToEditId);
      if (costToEdit) {
        setFormData({
          materialId: costToEdit.materialId,
          costPerUnit: costToEdit.costPerUnit,
          wasteFactor: costToEdit.wasteFactor,
          minimumCharge: costToEdit.minimumCharge,
          currencyCode: costToEdit.currencyCode
        });
        setIsEditing(true);
      } else {
        resetForm();
      }
    } else {
      if (isEditing) {
        resetForm();
      }
      setIsEditing(false);
    }
  }, [costToEditId, materialCosts, resetForm, isEditing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const numericFields = ["costPerUnit", "wasteFactor", "minimumCharge"];
    if (numericFields.includes(name)) {
      setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingCost) return;

    let success = false;
    if (isEditing && costToEditId) {
      success = await updateMaterialCost(costToEditId, formData);
    } else {
      const newCostId = await addMaterialCost(formData);
      success = !!newCostId;
    }

    if (success) {
      resetForm();
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-200">
        {isEditing ? "Modify Material Cost" : "Add New Material Cost"}
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="materialId" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Material
          </label>
          <select
            id="materialId"
            name="materialId"
            value={formData.materialId}
            onChange={handleChange}
            className="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            required
            disabled={isEditing || isLoadingMaterials || !!materialError}
          >
            {isLoadingMaterials ? (
              <option value="">Loading materials...</option>
            ) : materialError ? (
              <option value="">{materialError}</option>
            ) : (
              <>
                <option value="">Select a material</option>
                {isEditing && formData.materialId
                  ? allMaterials
                      .filter(material => material.id === formData.materialId)
                      .map(material => (
                        <option key={material.id} value={material.id}>
                          {material.name}
                        </option>
                      ))
                  : availableMaterialsForNewCost.map(material => (
                      <option key={material.id} value={material.id}>
                        {material.name}
                      </option>
                    ))}
                {isEditing &&
                  formData.materialId &&
                  !allMaterials.find(material => material.id === formData.materialId) && (
                    <option
                      value={formData.materialId}
                      disabled
                    >{`Material (ID: ${formData.materialId}) - Loaded`}</option>
                  )}
              </>
            )}
          </select>
        </div>

        <div>
          <label htmlFor="costPerUnit" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Cost per Unit ({formData.currencyCode} / unit)
          </label>
          <div className="flex items-center">
            <input
              id="costPerUnit"
              type="number"
              name="costPerUnit"
              value={formData.costPerUnit}
              onChange={handleChange}
              min="0"
              step="0.01"
              className="w-full border-gray-300 rounded-l-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
            />
            <select
              name="currencyCode"
              value={formData.currencyCode}
              onChange={handleChange}
              className="h-full border-gray-300 rounded-r-md shadow-sm p-2 border-l-0 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              {availableCurrencies.map(currency => (
                <option key={currency.code} value={currency.code}>
                  {currency.symbol} ({currency.code})
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Es. costo per cm³ o per kg. Ensure the unit is consistent. (e.g. cost per cm³ or per kg)
          </p>
        </div>

        <div>
          <label htmlFor="wasteFactor" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Waste Factor (%)
          </label>
          <input
            id="wasteFactor"
            type="number"
            name="wasteFactor"
            value={formData.wasteFactor}
            onChange={handleChange}
            min="0"
            max="100"
            step="1"
            className="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Percentage of extra material to consider for waste and scrap (e.g. 10 for 10%).
          </p>
        </div>

        <div>
          <label htmlFor="minimumCharge" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Minimum Charge ({formData.currencyCode})
          </label>
          <input
            id="minimumCharge"
            type="number"
            name="minimumCharge"
            value={formData.minimumCharge}
            onChange={handleChange}
            min="0"
            step="0.01"
            className="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">Optional minimum charge for this material.</p>
        </div>

        <div className="flex items-center justify-end space-x-3 pt-2">
          {(isEditing || formData.materialId) && (
            <button
              type="button"
              onClick={() => {
                resetForm();
                if (onSubmissionDone && isEditing) {
                  onSubmissionDone();
                }
              }}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel{isEditing ? "" : "/Clear"}
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmittingCost || isLoadingMaterials || !formData.materialId}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 dark:bg-indigo-700 dark:hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300"
          >
            {isSubmittingCost ? "Saving..." : isEditing ? "Save Changes" : "Add Cost"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default MaterialCostForm;
