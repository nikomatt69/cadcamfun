// src/components/plugins/PluginManagerView.tsx
import React, { useState, useEffect } from 'react';
// Rimuovi o commenta usePluginRegistry se non serve più per la lista
// import { usePluginRegistry } from '@/src/hooks/usePluginRegistry'; 
import { PluginRegistryEntry, PluginState } from '@/src/plugins/core/registry'; // Importa tipi
import { Loader, AlertCircle, Plus, Upload, RefreshCw, Search, Settings, Trash2, ToggleLeft, ToggleRight } from 'react-feather'; // Aggiunte icone
import InstallPluginDialog from './InstallPluginDialog';
import PluginSettingsDialog from './PluginSettingsDialog';
import toast from 'react-hot-toast';

const PluginManagerView: React.FC = () => {
  // Stati per UI
  const [searchTerm, setSearchTerm] = useState('');
  const [isInstallOpen, setIsInstallOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginRegistryEntry | null>(null);

  // --- INIZIO MODIFICA: Gestione stato plugin da API ---
  const [plugins, setPlugins] = useState<PluginRegistryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Funzione per recuperare i plugin dall'API
  const fetchPlugins = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/plugins'); // Chiama l'API GET
      if (!response.ok) {
         const errorData = await response.json().catch(() => ({ message: `Failed to fetch plugins: ${response.statusText}` }));
         throw new Error(errorData?.message || `Failed to fetch plugins: ${response.statusText}`);
      }
      const data: PluginRegistryEntry[] = await response.json();
      // Converte date stringa in oggetti Date se necessario (dipende da come serializza Prisma)
      const pluginsWithDates = data.map(p => ({
          ...p,
          // Assicurati che le date siano valide prima di creare new Date()
          installedAt: p.installedAt ? new Date(p.installedAt) : new Date(), 
          updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
          // Assicura che lo stato sia uno dei valori validi dell'enum
          state: Object.values(PluginState).includes(p.state) ? p.state : PluginState.INSTALLED,
      }));
      setPlugins(pluginsWithDates);
    } catch (err) {
      console.error("Error fetching plugins:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      toast.error(`Could not load plugins: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Recupera i plugin al montaggio del componente
  useEffect(() => {
    fetchPlugins();
  }, []);
  
  // Ricarica quando il dialog di installazione si chiude
  const handleInstallDialogClose = () => {
      setIsInstallOpen(false);
      fetchPlugins(); // Ricarica sempre per riflettere il nuovo plugin
  };
  // --- FINE MODIFICA ---

  // Rimuovi l'uso diretto di usePluginRegistry per la lista
  // const registry = usePluginRegistry();
  // const plugins = registry?.getAllPlugins() || []; // Vecchia logica

  const handleEnable = async (id: string) => {
    const originalPlugins = [...plugins];
    // Ottimisticamente aggiorna UI
    setPlugins(prev => prev.map(p => p.id === id ? { ...p, enabled: true, state: PluginState.ENABLED } : p));
    try {
        const response = await fetch(`/api/plugins/${id}/enable`, { method: 'PUT' });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to enable plugin' }));
            throw new Error(errorData?.message || 'Failed to enable plugin');
        }
        toast.success('Plugin enabled');
        fetchPlugins(); // Ricarica per stato definitivo
    } catch (err) {
        toast.error(`Error enabling plugin: ${err instanceof Error ? err.message : String(err)}`);
        setPlugins(originalPlugins); // Rollback UI ottimistica
    }
  };

  const handleDisable = async (id: string) => {
    const originalPlugins = [...plugins];
    // Ottimisticamente aggiorna UI
    setPlugins(prev => prev.map(p => p.id === id ? { ...p, enabled: false, state: PluginState.DISABLED } : p));
    try {
        const response = await fetch(`/api/plugins/${id}/disable`, { method: 'PUT' });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to disable plugin' }));
            throw new Error(errorData?.message || 'Failed to disable plugin');
        }
        toast.success('Plugin disabled');
        fetchPlugins(); // Ricarica per stato definitivo
    } catch (err) {
        toast.error(`Error disabling plugin: ${err instanceof Error ? err.message : String(err)}`);
        setPlugins(originalPlugins); // Rollback UI ottimistica
    }
  };

  const handleUninstall = async (id: string) => {
    // Conferma
    if (window.confirm(`Are you sure you want to uninstall plugin "${id}"? This action cannot be undone.`)) {
       const originalPlugins = [...plugins];
       // Ottimisticamente rimuovi da UI
       setPlugins(prev => prev.filter(p => p.id !== id));
       try {
           const response = await fetch(`/api/plugins/${id}`, { method: 'DELETE' });
           if (!response.ok) {
               const errorData = await response.json().catch(() => ({ message: 'Failed to uninstall plugin' }));
               throw new Error(errorData?.message || 'Failed to uninstall plugin');
           }
           toast.success('Plugin uninstalled');
           // Non serve fetchPlugins perché abbiamo già rimosso dall'UI
       } catch (err) {
           toast.error(`Error uninstalling plugin: ${err instanceof Error ? err.message : String(err)}`);
           setPlugins(originalPlugins); // Rollback UI ottimistica
       }
    }
  };
  
  const handleOpenSettings = (plugin: PluginRegistryEntry) => {
    setSelectedPlugin(plugin);
    setIsSettingsOpen(true);
  };

  // Filtra i plugin basati sulla ricerca
  const filteredPlugins = plugins.filter(plugin =>
    plugin.manifest?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plugin.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plugin.manifest?.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getPluginStateColor = (state: PluginState): string => {
     switch (state) {
        case PluginState.ENABLED: return 'text-green-500';
        case PluginState.DISABLED: return 'text-yellow-500';
        case PluginState.ERROR: return 'text-red-500';
        case PluginState.INSTALLED: return 'text-blue-500';
        default: return 'text-gray-500';
     }
  };

  return (
    <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white mb-4 sm:mb-6">Plugin Manager</h1>
      
      {/* Barra Azioni */}
      <div className="mb-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
         <div className="relative flex-grow">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
              </div>
              <input
                  type="text"
                  name="search"
                  id="search"
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md leading-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Search plugins..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
              />
         </div>
         <div className="flex items-center justify-end sm:justify-start space-x-2 flex-shrink-0">
              <button 
                onClick={fetchPlugins} 
                className="p-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading}
                title="Refresh list"
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              </button>
             <button 
                onClick={() => setIsInstallOpen(true)}
                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900 flex items-center space-x-1.5 transition-colors"
              >
                 <Upload size={16} />
                 <span>Install</span>
             </button>
          </div>
      </div>

      {/* --- INIZIO MODIFICA: Gestione stati caricamento/errore --- */}
      {isLoading ? (
        <div className="flex justify-center items-center py-10 text-gray-500 dark:text-gray-400">
          <Loader className="animate-spin mr-2" size={20} /> Loading plugins...
        </div>
      ) : error ? (
        <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded relative mb-4 flex items-start" role="alert">
           <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
          <div>
             <strong className="font-bold block">Error loading plugins:</strong>
             <span className="block sm:inline">{error}</span>
          </div>
        </div>
      ) : (
      // --- FINE MODIFICA ---

        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg">
          <ul role="list" className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredPlugins.length > 0 ? filteredPlugins.map((plugin) => (
              <li key={plugin.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group">
                 <div className="flex items-center justify-between">
                    <div className="truncate flex-1 mr-4">
                       <p className="text-sm font-medium text-blue-600 dark:text-blue-400 truncate">{plugin.manifest?.name || plugin.id}</p>
                       <p className="text-xs text-gray-500 dark:text-gray-400">{plugin.id} - v{plugin.version}</p>
                       <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{plugin.manifest?.description || 'No description'}</p>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getPluginStateColor(plugin.state)} bg-opacity-10 ${plugin.state === PluginState.ENABLED ? 'bg-green-100 dark:bg-green-900/30' : plugin.state === PluginState.DISABLED ? 'bg-yellow-100 dark:bg-yellow-900/30' : plugin.state === PluginState.ERROR ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-700/30'}`}>
                            {plugin.state}
                        </span>
                        {plugin.enabled ? (
                            <button 
                                onClick={() => handleDisable(plugin.id)} 
                                className="p-1.5 text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-300 rounded-full hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors" 
                                title="Disable Plugin"
                             >
                                <ToggleRight size={18} />
                             </button>
                         ) : (
                             <button 
                                onClick={() => handleEnable(plugin.id)} 
                                className="p-1.5 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 rounded-full hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors" 
                                title="Enable Plugin"
                             >
                                 <ToggleLeft size={18} />
                             </button>
                         )}
                         <button 
                            onClick={() => handleOpenSettings(plugin)} 
                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700/30 transition-colors" 
                            title="Plugin Settings"
                         >
                             <Settings size={16} />
                         </button>
                         <button 
                            onClick={() => handleUninstall(plugin.id)} 
                            className="p-1.5 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors" 
                            title="Uninstall Plugin"
                         >
                            <Trash2 size={16} />
                         </button>
                    </div>
                 </div>
                 {plugin.state === PluginState.ERROR && plugin.lastError && (
                     <p className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">Error: {plugin.lastError}</p>
                 )}
              </li>
            )) : (
              <li className="px-4 py-8 sm:px-6 text-center text-gray-500 dark:text-gray-400">
                No plugins found {searchTerm && 'matching your search'}.
              </li>
            )}
          </ul>
        </div>
      // --- INIZIO MODIFICA: Chiusura blocco condizionale ---
      )}
      {/* --- FINE MODIFICA --- */}

      {/* Dialogs */}
      <InstallPluginDialog 
        isOpen={isInstallOpen} 
        onClose={handleInstallDialogClose} // Usa handler modificato
      />
      
      {selectedPlugin && (
        <PluginSettingsDialog 
           isOpen={isSettingsOpen} 
           onClose={() => {
               setIsSettingsOpen(false);
               setSelectedPlugin(null);
               // Non serve fetchPlugins qui a meno che le impostazioni non cambino lo stato visualizzato
           }}
           pluginId={selectedPlugin.id}
        />
      )}
    </div>
  );
};

export default PluginManagerView;