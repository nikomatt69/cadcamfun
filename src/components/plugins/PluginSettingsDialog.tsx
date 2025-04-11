// src/components/plugins/PluginSettingsDialog.tsx
import React, { useState, useEffect } from 'react';
// import { usePluginRegistry } from '../../hooks/usePluginRegistry'; // Remove hook
import Dialog from '../../components/ui/Dialog';
import { Loader, AlertCircle, Save, Info } from 'react-feather';

// --- New/Modified Types ---
interface ConfigSchemaProperty {
  type: string;
  default?: any;
  description?: string;
  minimum?: number;
  maximum?: number;
  // Add other schema properties if needed (e.g., enum)
}

interface ConfigSchema {
  properties?: { [key: string]: ConfigSchemaProperty };
  // Potentially other top-level schema keys like 'type', 'required'
}

interface SettingValue {
  [key: string]: any;
}

// --- Updated Props ---
interface PluginSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pluginId: string;
  pluginName?: string; // Optional: For dialog title
  initialSettings?: SettingValue | null; // Current settings passed from parent
  configSchema?: ConfigSchema | null;    // Schema passed from parent
}

const PluginSettingsDialog: React.FC<PluginSettingsDialogProps> = ({
  isOpen,
  onClose,
  pluginId,
  pluginName,
  initialSettings,
  configSchema,
}) => {
  // Remove registry hook
  // const { plugins, registry } = usePluginRegistry();

  // State for the settings form
  const [settings, setSettings] = useState<SettingValue>({});
  // State for API interactions
  const [isLoading, setIsLoading] = useState(true); // Initial loading state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Initialize settings state when dialog opens or props change
  useEffect(() => {
    if (!isOpen) {
        setIsLoading(true); // Reset loading state when closed
        setSaveSuccess(false);
        setError(null);
        return;
    }

    setIsLoading(true);
    setError(null);
    setSaveSuccess(false);

    try {
        // Use schema and initial settings passed via props
        const schemaProperties = configSchema?.properties || {};
        const currentConfig = initialSettings || {};

        // Initialize with default values from schema
        const defaultSettings: SettingValue = {};
        Object.entries(schemaProperties).forEach(([key, schema]) => {
          if (schema.default !== undefined) {
            defaultSettings[key] = schema.default;
          }
        });

        // Merge defaults with current config
        const mergedSettings = {
          ...defaultSettings,
          ...currentConfig,
        };

        setSettings(mergedSettings);
        setIsLoading(false);

    } catch (err) {
        console.error('Error initializing settings state:', err);
        setError('Failed to prepare settings form.');
        setIsLoading(false);
    }

  }, [isOpen, pluginId, initialSettings, configSchema]);

  // Handle saving settings via API
  const handleSave = async () => {
    if (!pluginId) return;

    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const response = await fetch(`/api/plugins/${pluginId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { message: `Failed to save: ${response.statusText}` };
        }
        throw new Error(errorData?.message || 'Failed to save settings');
      }

      setSaveSuccess(true);
      // Close the dialog after a short delay
      setTimeout(() => {
        onClose();
      }, 1000);

    } catch (err) {
      console.error('Failed to save plugin settings:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  // Handle changing a setting value (no change needed here)
  const handleSettingChange = (key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setSaveSuccess(false); // Reset success state on change
    setError(null); // Clear previous save errors on change
  };

  // Render a setting input based on its type (schema type adjusted)
  const renderSettingInput = (key: string, schema: ConfigSchemaProperty) => {
    const value = settings[key];
    const { type, description, minimum, maximum } = schema;

    switch (type) {
      case 'string':
        return (
          <input
            type="text"
            id={`setting-${key}`}
            value={value ?? ''} // Use nullish coalescing
            onChange={(e) => handleSettingChange(key, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
          />
        );

      case 'number':
        return (
          <input
            type="number"
            id={`setting-${key}`}
            value={value ?? ''} // Allow empty input, handle parseFloat on change
            min={minimum}
            max={maximum}
            onChange={(e) => {
                 const num = e.target.value === '' ? undefined : parseFloat(e.target.value);
                 handleSettingChange(key, num);
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
          />
        );

      case 'boolean':
        return (
          <div className="flex items-center">
            <input
              type="checkbox"
              id={`setting-${key}`}
              checked={!!value}
              onChange={(e) => handleSettingChange(key, e.target.checked)}
              className="form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800"
            />
             {/* Optional: Add a label if needed */}
             {/* <label htmlFor={`setting-${key}`} className="ml-2 text-gray-700 dark:text-gray-300">Enabled</label> */}
          </div>
        );

      case 'array':
        // For simplicity, render arrays as a textarea with JSON
        return (
          <textarea
            id={`setting-${key}`}
            value={value !== undefined ? JSON.stringify(value, null, 2) : ''}
            onChange={(e) => {
              try {
                const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : undefined;
                 if (parsed === undefined || Array.isArray(parsed)) {
                     handleSettingChange(key, parsed);
                 }
              } catch (err) {
                // Maybe indicate JSON error visually?
              }
            }}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white font-mono text-sm"
          />
        );

      case 'object':
        // For simplicity, render objects as a textarea with JSON
        return (
          <textarea
            id={`setting-${key}`}
            value={value !== undefined ? JSON.stringify(value, null, 2) : ''}
            onChange={(e) => {
              try {
                 const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : undefined;
                  if (parsed === undefined || (typeof parsed === 'object' && !Array.isArray(parsed))) {
                     handleSettingChange(key, parsed);
                 }
              } catch (err) {
                 // Maybe indicate JSON error visually?
              }
            }}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white font-mono text-sm"
          />
        );

      default:
        // Fallback for unknown types
        return (
          <input
            type="text"
            id={`setting-${key}`}
            value={value !== undefined ? String(value) : ''}
            onChange={(e) => handleSettingChange(key, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
          />
        );
    }
  };

  const schemaProperties = configSchema?.properties || {};
  const hasSettings = Object.keys(schemaProperties).length > 0;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`${pluginName || pluginId} Settings`}
      size="lg"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader className="animate-spin text-blue-500 mr-2" />
          <span className="text-gray-600 dark:text-gray-300">Loading settings...</span>
        </div>
      ) : error && !isSaving ? ( // Show initial load/prep error if not currently saving
        <div className="p-4 border border-red-200 rounded-md bg-red-50 dark:bg-red-900/20 dark:border-red-800">
          <div className="flex items-start">
            <AlertCircle className="text-red-500 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-red-600 dark:text-red-400 font-medium mb-1">Error Preparing Settings</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">{error}</p>
            </div>
          </div>
        </div>
      ) : !hasSettings ? (
        <div className="p-6 text-center">
          <Info size={32} className="text-gray-400 dark:text-gray-500 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
            No Configurable Settings
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            This plugin doesn&apos;t provide any settings that can be configured.
          </p>
        </div>
      ) : (
        // Form Content
        <div className="space-y-6">
          {Object.entries(schemaProperties).map(([key, schema]) => (
            <div key={key} className="mb-4">
              <label htmlFor={`setting-${key}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {/* Improve label generation if needed */}
                {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}
              </label>
              {renderSettingInput(key, schema)}
              {schema.description && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {schema.description}
                </p>
              )}
            </div>
          ))}

          {/* Save Error Display */}
          {error && isSaving && (
             <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 flex items-start">
                <AlertCircle className="text-red-500 mr-2 flex-shrink-0 mt-0.5" size={16} />
                <span className="text-sm text-red-600 dark:text-red-400">Save failed: {error}</span>
             </div>
          )}
           {/* Save Success Display */}
           {saveSuccess && (
             <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 flex items-start">
                <Save size={16} className="text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-green-600 dark:text-green-400">Settings saved successfully!</span>
             </div>
           )}
        </div>
      )}

      {/* Footer with buttons */}
      {!isLoading && hasSettings && (
          <div className="mt-8 pt-5 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
              <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50"
              >
                  Cancel
              </button>
              <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || saveSuccess}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center transition-colors min-w-[90px] justify-center"
              >
                  {isSaving ? (
                      <><Loader size={16} className="animate-spin mr-2" /> Saving...</>
                  ) : saveSuccess ? (
                      <><Save size={16} className="mr-2" /> Saved</>
                  ) : (
                      'Save Settings'
                  )}
              </button>
          </div>
      )}
    </Dialog>
  );
};

export default PluginSettingsDialog;