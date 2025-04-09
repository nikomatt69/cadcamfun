// src/components/plugins/PluginManagerView.tsx
import React, { useState, useEffect } from 'react';
import { usePluginRegistry } from '../../hooks/usePluginRegistry';
import { 
  Power, 
  Trash2, 
  Download, 
  Settings, 
  AlertCircle, 
  Info, 
  ExternalLink, 
  RefreshCw, 
  Loader
} from 'react-feather';
import { formatDistanceToNow } from 'date-fns';
import InstallPluginDialog from './InstallPluginDialog';
import PluginSettingsDialog from './PluginSettingsDialog';

interface PluginManagerViewProps {
  className?: string;
}

const PluginManagerView: React.FC<PluginManagerViewProps> = ({ className = '' }) => {
  const { 
    plugins, 
    loading, 
    error, 
    enablePlugin, 
    disablePlugin, 
    uninstallPlugin, 
    refreshPlugins 
  } = usePluginRegistry();
  
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);
  
  const handleTogglePlugin = async (pluginId: string, currentState: boolean) => {
    setProcessingId(pluginId);
    
    try {
      if (currentState) {
        await disablePlugin(pluginId);
      } else {
        await enablePlugin(pluginId);
      }
    } catch (error) {
      console.error(`Failed to ${currentState ? 'disable' : 'enable'} plugin:`, error);
    } finally {
      setProcessingId(null);
    }
  };
  
  const handleUninstall = async (pluginId: string) => {
    if (confirmUninstall !== pluginId) {
      setConfirmUninstall(pluginId);
      return;
    }
    
    setProcessingId(pluginId);
    setConfirmUninstall(null);
    
    try {
      await uninstallPlugin(pluginId);
    } catch (error) {
      console.error('Failed to uninstall plugin:', error);
    } finally {
      setProcessingId(null);
    }
  };
  
  const handleShowSettings = (pluginId: string) => {
    setSelectedPlugin(pluginId);
    setShowSettings(true);
  };
  
  if (loading) {
    return (
      <div className={`flex items-center justify-center h-64 ${className}`}>
        <Loader className="animate-spin text-blue-500 mr-2" />
        <span className="text-gray-600 dark:text-gray-300">Loading plugins...</span>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className={`p-4 border border-red-200 rounded-md bg-red-50 dark:bg-red-900/20 dark:border-red-800 ${className}`}>
        <div className="flex items-start">
          <AlertCircle className="text-red-500 mr-2 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-red-600 dark:text-red-400 font-medium mb-1">Error loading plugins</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">{error.message}</p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`${className}`}>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Plugins</h1>
        <div className="flex space-x-2">
          <button
            onClick={refreshPlugins}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Refresh plugins"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => setShowInstallDialog(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-md flex items-center shadow-sm transition-colors"
          >
            <Download size={18} className="mr-2" />
            Install Plugin
          </button>
        </div>
      </div>
      
      {plugins.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
          <Info size={36} className="text-gray-400 dark:text-gray-500 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">No plugins installed</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Plugins extend the functionality of your application with new features.
          </p>
          <button
            onClick={() => setShowInstallDialog(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md inline-flex items-center"
          >
            <Download size={16} className="mr-2" />
            Install your first plugin
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {plugins.map((plugin) => (
            <div 
              key={plugin.id}
              className="border-b border-gray-200 dark:border-gray-700 last:border-b-0 p-4 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center">
                  <h3 className="text-lg font-medium text-gray-800 dark:text-white mr-2">
                    {plugin.manifest.name}
                  </h3>
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    v{plugin.manifest.version}
                  </span>
                  
                  {plugin.errorCount > 0 && (
                    <span className="ml-2 text-xs px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                      {plugin.errorCount} errors
                    </span>
                  )}
                </div>
                
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-2">
                  {plugin.manifest.description}
                </p>
                
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-500 space-x-4">
                  <span>By {plugin.manifest.author}</span>
                  {plugin.manifest.repository && (
                    <a 
                      href={plugin.manifest.repository}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    >
                      Repository <ExternalLink size={12} className="ml-1" />
                    </a>
                  )}
                  <span>Updated {formatDistanceToNow(new Date(plugin.updatedAt))} ago</span>
                </div>
                
                {plugin.lastError && (
                  <div className="mt-2 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-800/30">
                    <strong>Last error:</strong> {plugin.lastError}
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-2 sm:flex-col sm:items-end sm:space-x-0 sm:space-y-2">
                <button
                  onClick={() => handleTogglePlugin(plugin.id, plugin.enabled)}
                  disabled={processingId === plugin.id}
                  className={`p-2 rounded-md ${
                    plugin.enabled 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  } transition-colors flex items-center`}
                  title={plugin.enabled ? "Disable plugin" : "Enable plugin"}
                >
                  {processingId === plugin.id ? (
                    <Loader size={16} className="animate-spin" />
                  ) : (
                    <Power size={16} />
                  )}
                  <span className="ml-1 hidden sm:inline text-xs">
                    {plugin.enabled ? "Enabled" : "Disabled"}
                  </span>
                </button>
                
                <button
                  onClick={() => handleShowSettings(plugin.id)}
                  className="p-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  title="Plugin settings"
                >
                  <Settings size={16} />
                </button>
                
                <button
                  onClick={() => handleUninstall(plugin.id)}
                  disabled={processingId === plugin.id}
                  className={`p-2 ${
                    confirmUninstall === plugin.id
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  } rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors`}
                  title={confirmUninstall === plugin.id ? "Click again to confirm" : "Uninstall plugin"}
                >
                  {processingId === plugin.id ? (
                    <Loader size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Install Plugin Dialog */}
      <InstallPluginDialog 
        isOpen={showInstallDialog} 
        onClose={() => setShowInstallDialog(false)} 
      />
      
      {/* Plugin Settings Dialog */}
      {selectedPlugin && (
        <PluginSettingsDialog 
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          pluginId={selectedPlugin}
        />
      )}
    </div>
  );
};

export default PluginManagerView;