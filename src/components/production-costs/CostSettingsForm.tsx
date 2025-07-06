// src/components/production-costs/CostSettingsForm.tsx
import React, { useState, useEffect } from "react";
import { useProductionCostsStore } from "@/src/store/productionCostsStore";
import { CostSettings } from "@/src/types/costs";

// Consider moving to a shared config/utils file
const availableCurrencies = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "Dollaro USA" },
  { code: "GBP", symbol: "£", name: "Sterlina britannica" }
  // Add more as needed
];

// Define a type for the form data, excluding fields not meant to be edited by the user directly
// or that are handled by the backend/store action (like id, ownerId etc.)
type CostSettingsFormData = Omit<
  CostSettings,
  "id" | "ownerId" | "organizationId" | "createdAt" | "updatedAt" | "additionalSettings"
>;

const CostSettingsForm: React.FC = () => {
  const { settings, updateSettings, isLoading: isSubmitting } = useProductionCostsStore();

  // Initialize formData using the settings from the store, or sensible defaults if settings are not yet loaded.
  const [formData, setFormData] = useState<CostSettingsFormData>(() => {
    const currentSettings = settings; // settings from store might be the initial default from store or loaded ones
    return {
      defaultCurrencyCode: currentSettings.defaultCurrencyCode || "EUR",
      defaultMachineHourlyRate: currentSettings.defaultMachineHourlyRate || 50,
      defaultOperatorHourlyRate: currentSettings.defaultOperatorHourlyRate || 30,
      defaultSetupTime: currentSettings.defaultSetupTime || 30,
      calculateAutomatically:
        currentSettings.calculateAutomatically === undefined ? true : currentSettings.calculateAutomatically
    };
  });

  // Sync form with store settings when they change (e.g., after initial load or external update)
  useEffect(() => {
    // Ensure we only update from 'settings' if it contains valid data (not the initial empty/default state of the store before loading)
    if (settings && settings.id) {
      // Check for 'id' or another significant field to confirm settings are loaded
      setFormData({
        defaultCurrencyCode: settings.defaultCurrencyCode,
        defaultMachineHourlyRate: settings.defaultMachineHourlyRate,
        defaultOperatorHourlyRate: settings.defaultOperatorHourlyRate,
        defaultSetupTime: settings.defaultSetupTime,
        calculateAutomatically: settings.calculateAutomatically
      });
    }
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (type === "number") {
      setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    // The updateSettings action in the store expects the correct partial type
    await updateSettings(formData);
    // Toast notifications are handled by the store action, remove alert
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md">
      {" "}
      {/* Increased padding */}
      <h3 className="text-lg font-semibold mb-6 text-gray-700 dark:text-gray-300">
        {" "}
        {/* Styled header */}
        Default Cost Settings
      </h3>
      <form onSubmit={handleSubmit} className="space-y-6">
        {" "}
        {/* Increased spacing */}
        <div>
          <label
            htmlFor="defaultCurrencyCode"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Default Currency
          </label>
          <select
            id="defaultCurrencyCode"
            name="defaultCurrencyCode"
            value={formData.defaultCurrencyCode}
            onChange={handleChange}
            className="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            disabled={isSubmitting}
          >
            {availableCurrencies.map(currency => (
              <option key={currency.code} value={currency.code}>
                {currency.name} ({currency.symbol})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="defaultMachineHourlyRate"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Default Machine Hourly Rate ({formData.defaultCurrencyCode}/h)
          </label>
          <input
            id="defaultMachineHourlyRate"
            type="number"
            name="defaultMachineHourlyRate"
            value={formData.defaultMachineHourlyRate}
            onChange={handleChange}
            min="0"
            step="0.01"
            className="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            required
            disabled={isSubmitting}
          />
        </div>
        <div>
          <label
            htmlFor="defaultOperatorHourlyRate"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Default Operator Hourly Rate ({formData.defaultCurrencyCode}/h)
          </label>
          <input
            id="defaultOperatorHourlyRate"
            type="number"
            name="defaultOperatorHourlyRate"
            value={formData.defaultOperatorHourlyRate}
            onChange={handleChange}
            min="0"
            step="0.01"
            className="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            required
            disabled={isSubmitting}
          />
        </div>
        <div>
          <label htmlFor="defaultSetupTime" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default Setup Time (minutes)
          </label>
          <input
            id="defaultSetupTime"
            type="number"
            name="defaultSetupTime"
            value={formData.defaultSetupTime}
            onChange={handleChange}
            min="0"
            step="1"
            className="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            required
            disabled={isSubmitting}
          />
        </div>
        <div className="flex items-center pt-2">
          {" "}
          {/* Added padding top */}
          <input
            id="calculateAutomatically"
            type="checkbox"
            name="calculateAutomatically"
            checked={formData.calculateAutomatically}
            onChange={handleChange}
            className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            disabled={isSubmitting}
          />
          <label htmlFor="calculateAutomatically" className="ml-2 block text-sm text-gray-900">
            Calculate automatically the cost estimates
          </label>
        </div>
        <div className="pt-2">
          {" "}
          {/* Added padding top */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium dark:text-gray-300 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
          >
            {isSubmitting ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CostSettingsForm;
