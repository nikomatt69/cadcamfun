// src/components/plugins/PluginSettingsDialog.tsx
import React, { useState, useEffect } from 'react';
import { usePluginRegistry } from '../../hooks/usePluginRegistry';
import Dialog from '../../components/ui/Dialog';
import { Loader, AlertCircle, Save, Info } from 'react-feather';

interface PluginSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pluginId: string;
}

interface SettingValue {
  [key: string]: any;
}

const PluginSettingsDialog: React.FC<PluginSettingsDialogProps> = ({
  isOpen,
  onClose,
  pluginId,
}) => {
  const { plugins, registry } = usePluginRegistry();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingValue>({});
  const [plugin, setPlugin] = useState<any>(null);
  
  // Load plugin settings
  useEffect(() => {
    if (!isOpen || !pluginId || !registry) return;
    
    const loadSettings = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Find the plugin
        const foundPlugin = plugins.find(p => p.id === pluginId);
        
        if (!foundPlugin) {
          throw new Error(`Plugin ${pluginId} not found`);
        }
        
        setPlugin(foundPlugin);
        
        // Get storage handler
        const storage = registry.getStorage();
        
        // Load current settings
        const pluginConfig = await storage.getPluginConfig(pluginId);
        
        // Initialize with default values from manifest
        const defaultConfig: SettingValue = {};
        const configSchema = foundPlugin.manifest.configuration?.properties || {};
        
        // Apply default values
        Object.entries(configSchema).forEach(([key, schema]) => {
          defaultConfig[key] = schema.default;
        });
        
        // Merge with stored config if available
        const mergedConfig = {
          ...defaultConfig,
          ...(pluginConfig || {})
        };
        
        setSettings(mergedConfig);
      } catch (err) {
        console.error('Failed to load plugin settings:', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    
    loadSettings();
  }, [isOpen, pluginId, registry, plugins]);
  
  // Handle saving settings
  const handleSave = async () => {
    if (!registry || !pluginId) return;
    
    setSaving(true);
    setError(null);
    
    try {
      // Get storage handler
      const storage = registry.getStorage();
      
      // Save settings
      await storage.savePluginConfig(pluginId, settings);
      
      // Close the dialog
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      console.error('Failed to save plugin settings:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };
  
  // Handle changing a setting value
  const handleSettingChange = (key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };
  
  // Render a setting input based on its type
  const renderSettingInput = (key: string, schema: any) => {
    const value = settings[key];
    const { type, description } = schema;
    
    switch (type) {
      case 'string':
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleSettingChange(key, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
          />
        );
        
      case 'number':
        return (
          <input
            type="number"
            value={value || 0}
            min={schema.minimum}
            max={schema.maximum}
            onChange={(e) => handleSettingChange(key, parseFloat(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
          />
        );
        
      case 'boolean':
        return (
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => handleSettingChange(key, e.target.checked)}
              className="form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800"
            />
            <span className="ml-2 text-gray-700 dark:text-gray-300">Enabled</span>
          </label>
        );
        
      case 'array':
        // For simplicity, we'll render arrays as a textarea with JSON
        return (
          <textarea
            value={JSON.stringify(value || [], null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                handleSettingChange(key, parsed);
              } catch (err) {
                // Don't update if invalid JSON
              }
            }}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white font-mono text-sm"
          />
        );
        
      case 'object':
        // For simplicity, we'll render objects as a textarea with JSON
        return (
          <textarea
            value={JSON.stringify(value || {}, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                handleSettingChange(key, parsed);
              } catch (err) {
                // Don't update if invalid JSON
              }
            }}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white font-mono text-sm"
          />
        );
        
      default:
        return (
          <input
            type="text"
            value={String(value || '')}
            onChange={(e) => handleSettingChange(key, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
          />
        );
    }
  };
  
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={plugin ? `${plugin.manifest.name} Settings` : 'Plugin Settings'}
      size="lg"
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader className="animate-spin text-blue-500 mr-2" />
          <span className="text-gray-600 dark:text-gray-300">Loading settings...</span>
        </div>
      ) : error ? (
        <div className="p-4 border border-red-200 rounded-md bg-red-50 dark:bg-red-900/20 dark:border-red-800">
          <div className="flex items-start">
            <AlertCircle className="text-red-500 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-red-600 dark:text-red-400 font-medium mb-1">Error loading settings</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">{error}</p>
            </div>
          </div>
        </div>
      ) : plugin && Object.keys(plugin.manifest.configuration?.properties || {}).length === 0 ? (
        <div className="p-6 text-center">
          <Info size={32} className="text-gray-400 dark:text-gray-500 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
            No configurable settings
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            This plugin doesn&apos;t provide any settings that can be configured.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {plugin && plugin.manifest.configuration?.properties && (
            Object.entries(plugin.manifest.configuration.properties).map(([key, schema]: [string, any]) => (
              <div key={key} className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}
                </label>
                {renderSettingInput(key, schema)}
                {schema.description && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {schema.description}
                  </p>
                )}
              </div>
            ))
          )}
          
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              Cancel
            </button>
            
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center transition-colors"
            >
              {saving ? (
                <><Loader size={16} className="animate-spin mr-2" /> Saving...</>
              ) : (
                <><Save size={16} className="mr-2" /> Save Settings</>
              )}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
};

export default PluginSettingsDialog;