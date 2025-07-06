// src/components/production-costs/OperationCostForm.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useProductionCostsStore } from "@/src/store/productionCostsStore";
import { OperationCost } from "@/src/types/costs";

// Consider moving to a shared config/utils file
const availableCurrencies = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "Dollaro USA" },
  { code: "GBP", symbol: "£", name: "Sterlina britannica" }
  // Add more as needed
];

interface OperationCostFormProps {
  costToEditId?: string | null; // ID of the operation cost to edit
  onActionDone?: (actionType?: "edit" | "add" | "delete" | "cancel", id?: string) => void; // Callback when an action is completed, optionally passing edited item's ID
}

function OperationCostForm({ costToEditId, onActionDone }: OperationCostFormProps): JSX.Element {
  const {
    addOperationCost,
    updateOperationCost,
    operationCosts, // Used for listing existing operations
    deleteOperationCost, // For deleting operations from the list
    settings,
    isLoading: isSubmittingCost
  } = useProductionCostsStore();

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [formData, setFormData] = useState<{
    name: string;
    machineHourlyRate: number;
    operatorHourlyRate: number;
    setupTime: number; // in minutes
    currencyCode: string;
  }>(() => ({
    name: "",
    machineHourlyRate: settings.defaultMachineHourlyRate || 50,
    operatorHourlyRate: settings.defaultOperatorHourlyRate || 30,
    setupTime: settings.defaultSetupTime || 30,
    currencyCode: settings.defaultCurrencyCode || "EUR"
  }));

  const resetForm = useCallback(() => {
    setFormData({
      name: "",
      machineHourlyRate: settings.defaultMachineHourlyRate || 50,
      operatorHourlyRate: settings.defaultOperatorHourlyRate || 30,
      setupTime: settings.defaultSetupTime || 30,
      currencyCode: settings.defaultCurrencyCode || "EUR"
    });
    setIsEditing(false);
    if (onActionDone) {
      onActionDone("cancel"); // Signal that the editing/adding process is done or cancelled
    }
  }, [settings, onActionDone]);

  useEffect(() => {
    if (costToEditId) {
      const costToEditDetails = operationCosts.find(cost => cost.id === costToEditId);
      if (costToEditDetails) {
        setFormData({
          name: costToEditDetails.name,
          machineHourlyRate: costToEditDetails.machineHourlyRate,
          operatorHourlyRate: costToEditDetails.operatorHourlyRate,
          setupTime: costToEditDetails.setupTime,
          currencyCode: costToEditDetails.currencyCode
        });
        setIsEditing(true);
      } else {
        // If costToEditId is provided but not found, reset to new form (or handle error)
        resetForm();
      }
    } else {
      // If no costToEditId, ensure form is in 'add new' state only if it was previously editing
      if (isEditing) {
        resetForm();
      }
      setIsEditing(false); // Ensure isEditing is false if no costToEditId
    }
  }, [costToEditId, operationCosts, resetForm, isEditing]); // Added isEditing

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const numericFields = ["machineHourlyRate", "operatorHourlyRate", "setupTime"];
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
    let actionType: "edit" | "add" | undefined;
    let actionId: string | undefined;

    if (isEditing && costToEditId) {
      success = await updateOperationCost(costToEditId, formData);
      if (success) {
        actionType = "edit";
        actionId = costToEditId;
      }
    } else {
      if (operationCosts.some(op => op.name.toLowerCase() === formData.name.toLowerCase())) {
        alert("Un costo operazione con questo nome esiste già.");
        return;
      }
      const newCostId = await addOperationCost(formData);
      success = !!newCostId;
      if (success) {
        actionType = "add";
        actionId = newCostId;
      }
    }

    if (success) {
      if (!isEditing) {
        // For a successful 'add', resetForm is called, which internally calls onActionDone('cancel')
        // So, we might signal 'add' first, then 'cancel' comes from resetForm.
        // Or, let onActionDone handle the state update and parent decides to clear 'costToEditId'.
        if (onActionDone && actionType && actionId) onActionDone(actionType, actionId);
        resetForm();
      } else if (isEditing) {
        // For a successful 'edit', signal the parent.
        // The parent can then choose to clear costToEditId, which would trigger resetForm via useEffect.
        if (onActionDone && actionType && actionId) onActionDone(actionType, actionId);
        // We don't resetForm here for edit, let parent control via costToEditId prop.
      }
    } else if (onActionDone) {
      // If not successful, still call onActionDone without type/id to signal completion of attempt.
      onActionDone();
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Sei sicuro di voler eliminare questo costo operazione?")) {
      const success = await deleteOperationCost(id);
      if (success) {
        if (onActionDone) onActionDone("delete", id);
        if (costToEditId === id) {
          // If the deleted cost was being edited, reset the form
          // resetForm(); // This is handled by onActionDone which parent uses to clear costToEditId
        }
      }
      // Toast notifications for success/failure are handled in the store
    }
  };

  // This internal function is now effectively replaced by parent setting costToEditId
  // const internalEditCost = (cost: OperationCost) => { ... };

  return (
    <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-200">
        {isEditing ? "Modify Operation Cost" : "Add New Operation Cost"}
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Operation Name
          </label>
          <input
            id="name"
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="es. CNC Milling, Initial Setup"
            required
            disabled={isEditing} // Name might be non-editable for existing operations or editable - depends on policy
          />
        </div>

        <div>
          <label
            htmlFor="machineHourlyRate"
            className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
          >
            Machine Hourly Rate
          </label>
          <div className="flex items-center">
            <input
              id="machineHourlyRate"
              type="number"
              name="machineHourlyRate"
              value={formData.machineHourlyRate}
              onChange={handleChange}
              min="0"
              step="0.01"
              className="w-full border-gray-300 rounded-l-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
            />
            <select
              name="currencyCode" // This will set currency for all rates in this form
              value={formData.currencyCode}
              onChange={handleChange}
              className="h-full border-gray-300 rounded-r-md shadow-sm p-2 border-l-0 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              {availableCurrencies.map(currency => (
                <option key={currency.code} value={currency.code}>
                  {currency.symbol}/h ({currency.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="operatorHourlyRate"
            className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
          >
            Operator Hourly Rate ({formData.currencyCode}/h)
          </label>
          <input
            id="operatorHourlyRate"
            type="number"
            name="operatorHourlyRate"
            value={formData.operatorHourlyRate}
            onChange={handleChange}
            min="0"
            step="0.01"
            className="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            required
          />
        </div>

        <div>
          <label htmlFor="setupTime" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Setup Time (minutes)
          </label>
          <input
            id="setupTime"
            type="number"
            name="setupTime"
            value={formData.setupTime}
            onChange={handleChange}
            min="0"
            step="1"
            className="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            required
          />
        </div>

        <div className="flex items-center justify-end space-x-3 pt-2">
          {(isEditing || formData.name) && (
            <button
              type="button"
              onClick={() => {
                resetForm(); // This will also call onActionDone, effectively cancelling edit
              }}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel{isEditing ? " Changes" : "/Clear"}
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmittingCost || !formData.name}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 dark:bg-indigo-700 dark:hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300"
          >
            {isSubmittingCost ? "Saving..." : isEditing ? "Save Changes" : "Add Operation"}
          </button>
        </div>
      </form>

      {/* Lista dei costi operazione esistenti */}
      {operationCosts.length > 0 && (
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-md font-semibold mb-3 text-gray-700 dark:text-gray-200">Registered Operations</h4>
          <div className="space-y-3">
            {operationCosts.map(cost => (
              <div
                key={cost.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 rounded-md shadow-sm flex justify-between items-center hover:shadow-md transition-shadow duration-150"
              >
                <div className="flex-grow">
                  <p className="font-medium text-gray-800 dark:text-gray-200">{cost.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Machine Rate: {cost.machineHourlyRate} {cost.currencyCode}/h
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Operator Rate: {cost.operatorHourlyRate} {cost.currencyCode}/h
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Setup Time: {cost.setupTime} min</p>
                </div>
                <div className="flex flex-col space-y-2 ml-2">
                  <button
                    onClick={() => onActionDone && onActionDone("edit", cost.id)} // Parent should set costToEditId
                    className="text-xs px-3 py-1 border border-blue-500 text-blue-500 rounded-md hover:bg-blue-50 transition-colors"
                  >
                    Modify
                  </button>
                  <button
                    onClick={() => handleDelete(cost.id)}
                    className="text-xs px-3 py-1 border border-red-500 text-red-500 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50"
                    disabled={isSubmittingCost}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default OperationCostForm;
