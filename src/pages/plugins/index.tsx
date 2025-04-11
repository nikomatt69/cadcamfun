import React, { useState, useEffect } from 'react';
import { PluginRegistryEntry } from '@/src/plugins/core/registry';
import { Loader, AlertTriangle, Trash2, ToggleLeft, ToggleRight, Upload, Info } from 'react-feather';
import InstallPluginDialog from '@/src/components/plugins/InstallPluginDialog'; // Adjust path
import Link from 'next/link';
import Layout from '@/src/components/layout/Layout';
import router from 'next/router';
import { useSession } from 'next-auth/react';

const PluginsPage = () => {
  const [plugins, setPlugins] = useState<PluginRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);
 
  const { status } = useSession();

  const fetchPlugins = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/plugins');
      if (!res.ok) {
        throw new Error(`Failed to fetch plugins: ${res.statusText}`);
      }
      const data: PluginRegistryEntry[] = await res.json();
      setPlugins(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlugins();
  }, []);

  const handleToggleEnable = async (pluginId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'disable' : 'enable';
    try {
       const res = await fetch(`/api/plugins/${pluginId}/${action}`, { method: 'POST' });
       if (!res.ok) {
           const errData = await res.json();
           throw new Error(errData.error || `Failed to ${action} plugin`);
       }
       // Refresh list after action
       fetchPlugins();
    } catch (err) {
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUninstall = async (pluginId: string) => {
     if (!confirm(`Are you sure you want to uninstall plugin "${pluginId}"?`)) return;
     try {
        const res = await fetch(`/api/plugins/${pluginId}`, { method: 'DELETE' });
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to uninstall plugin');
        }
        // Refresh list after action
        fetchPlugins();
     } catch (err) {
         alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
     }
  };
  

  return (
    <Layout>
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Installed Plugins</h1>
          <button
             onClick={() => setIsInstallDialogOpen(true)}
             className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center text-sm"
          >
            <Upload size={16} className="mr-2"/>
            Install Plugin
          </button>
        </div>

        {loading && (
          <div className="text-center py-10">
            <Loader className="animate-spin text-blue-500 mx-auto" size={32}/>
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold mr-2">Error:</strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {!loading && !error && plugins.length === 0 && (
          <div className="text-center py-10 text-gray-500 dark:text-gray-400">
            No plugins installed yet.
          </div>
        )}

        {!loading && !error && plugins.length > 0 && (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {plugins.map((plugin) => (
                <li key={plugin.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <div className="flex-1 min-w-0">
                      <Link href={`/plugins/${plugin.id}`} className="text-sm font-medium text-blue-600 dark:text-blue-400 truncate hover:underline">
                         {plugin.manifest.name || plugin.id}
                      </Link>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                       v{plugin.version} - {plugin.manifest.description || 'No description'}
                    </p>
                     <p className={`text-xs mt-1 ${plugin.enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                      {plugin.enabled ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3 ml-4">
                     <button
                        onClick={() => handleToggleEnable(plugin.id, plugin.enabled)}
                        title={plugin.enabled ? 'Disable Plugin' : 'Enable Plugin'}
                        className={`p-1 rounded-full transition-colors ${plugin.enabled ? 'text-green-500 hover:bg-green-100 dark:hover:bg-green-900/50' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                     >
                        {plugin.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                     </button>
                     <Link href={`/plugins/${plugin.id}`} title="Plugin Details" className="text-gray-400 hover:text-blue-500">
                        <Info size={18} />
                     </Link>
                     <button
                        onClick={() => handleUninstall(plugin.id)}
                        title="Uninstall Plugin"
                        className="text-gray-400 hover:text-red-500"
                     >
                        <Trash2 size={18}/>
                     </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <InstallPluginDialog
         isOpen={isInstallDialogOpen}
         onClose={() => {
             setIsInstallDialogOpen(false);
             fetchPlugins(); // Refresh list after closing dialog
         }}
      />
    </div>
    </Layout>
  );
};

export default PluginsPage; 