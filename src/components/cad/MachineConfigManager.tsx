// src/components/settings/MachineConfigManager.tsx
import React, { useState, useEffect } from 'react';
import { useCADStore } from '@/src/store/cadStore';
import { Plus, Edit, Trash2 } from 'react-feather';
import { 
  getMachineConfigs, 
  createMachineConfig, 
  updateMachineConfig, 
  deleteMachineConfig,
  MachineConfig,
  UpdateMachineConfigDto,
  CreateMachineConfigDto
} from 'src/lib/api/machineConfigApi';

const MachineConfigManager: React.FC = () => {
  const { selectedMachine, setSelectedMachine } = useCADStore();
  const [machineConfigs, setMachineConfigs] = useState<MachineConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingConfig, setEditingConfig] = useState<MachineConfig | null>(null);
  
  // Form state
  const [formState, setFormState] = useState({
    name: '',
    type: 'mill',
    volumeX: 200,
    volumeY: 200,
    volumeZ: 100,
    maxSpindleSpeed: 10000,
    maxFeedRate: 5000
  });

  // Fetch machine configurations
  useEffect(() => {
    const fetchMachineConfigs = async () => {
      try {
        setIsLoading(true);
        const response = await getMachineConfigs();
        if (response && response.data) {
          setMachineConfigs(Array.isArray(response.data) ? response.data : []);
        } else {
          setMachineConfigs([]);
        }
      } catch (error) {
        console.error('Errore nel caricamento delle configurazioni macchina:', error);
        setMachineConfigs([]); // Set empty array on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchMachineConfigs();
  }, []);

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({
      ...prev,
      [name]: name === 'type' ? value : parseFloat(value)
    }));
  };

  // Start editing a machine config
  const handleEditConfig = (config: MachineConfig) => {
    setIsEditing(true);
    setEditingConfig(config);
    setFormState({
      name: config.name,
      type: config.type || 'mill',
      volumeX: config.config?.workVolume?.x || 200,
      volumeY: config.config?.workVolume?.y || 200,
      volumeZ: config.config?.workVolume?.z || 100,
      maxSpindleSpeed: config.config?.maxSpindleSpeed || 10000,
      maxFeedRate: config.config?.maxFeedRate || 5000
    });
  };

  // Create or update a machine config
  const handleAddConfig = async () => {
    try {
      setIsLoading(true);
      
      const configData = {
        name: formState.name,
        type: formState.type as 'mill' | 'lathe' | 'printer' | 'laser',
        config: {
          type: formState.type,
          workVolume: {
            x: formState.volumeX,
            y: formState.volumeY,
            z: formState.volumeZ
          },
          maxSpindleSpeed: formState.maxSpindleSpeed,
          maxFeedRate: formState.maxFeedRate
        }
      };
      
      if (isEditing && editingConfig) {
        // Update existing config
        const updatedConfig = await updateMachineConfig(editingConfig.id, configData as UpdateMachineConfigDto);
        
        setMachineConfigs(prev => prev.map(config => 
          config.id === editingConfig.id ? updatedConfig : config
        ));

        // Update selected machine if it was the one being edited
        if (selectedMachine?.id === editingConfig.id) {
          setSelectedMachine(updatedConfig);
        }
      } else {
        // Create new config
        const newConfig = await createMachineConfig(configData as CreateMachineConfigDto);
        const response = await getMachineConfigs();
        if (response && response.data) {
          setMachineConfigs(Array.isArray(response.data) ? response.data : []);
        }
      }
      
      // Reset form
      resetForm();
    } catch (error) {
      console.error('Errore nel salvare la configurazione:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Delete a machine config
  const handleDeleteConfig = async (id: string) => {
    if (!confirm('Sei sicuro di voler eliminare questa configurazione?')) return;
    
    try {
      setIsLoading(true);
      await deleteMachineConfig(id);
      setMachineConfigs(prev => prev.filter(config => config.id !== id));
      
      // If the selected machine was deleted, clear the selection
      if (selectedMachine?.id === id) {
        setSelectedMachine(null);
      }
    } catch (error) {
      console.error('Errore nell\'eliminare la configurazione:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset form to default values
  const resetForm = () => {
    setFormState({
      name: '',
      type: 'mill',
      volumeX: 200,
      volumeY: 200,
      volumeZ: 100,
      maxSpindleSpeed: 10000,
      maxFeedRate: 5000
    });
    setIsEditing(false);
    setEditingConfig(null);
  };

  return (
    <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg p-4 space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Configurazioni Macchina</h3>
      
      {/* Form per aggiungere/modificare configurazioni */}
      <div className="border-b border-gray-200 pb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          {isEditing ? 'Modifica Configurazione' : 'Nuova Configurazione'}
        </h4>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Nome</label>
            <input
              type="text"
              name="name"
              value={formState.name}
              onChange={handleInputChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Tipo</label>
            <select
              name="type"
              value={formState.type}
              onChange={handleInputChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="mill">Fresatrice</option>
              <option value="lathe">Tornio</option>
              <option value="laser">Taglio Laser</option>
              <option value="printer">Stampante 3D</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Velocità Max Mandrino (RPM)</label>
            <input
              type="number"
              name="maxSpindleSpeed"
              value={formState.maxSpindleSpeed}
              onChange={handleInputChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Avanzamento Max (mm/min)</label>
            <input
              type="number"
              name="maxFeedRate"
              value={formState.maxFeedRate}
              onChange={handleInputChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div className="col-span-2">
            <h5 className="text-sm font-medium text-gray-700">Volume di Lavoro</h5>
            <div className="grid grid-cols-3 gap-4 mt-2">
              <div>
                <label className="block text-xs text-gray-500">Larghezza (X)</label>
                <input
                  type="number"
                  name="volumeX"
                  value={formState.volumeX}
                  onChange={handleInputChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Profondità (Y)</label>
                <input
                  type="number"
                  name="volumeY"
                  value={formState.volumeY}
                  onChange={handleInputChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Altezza (Z)</label>
                <input
                  type="number"
                  name="volumeZ"
                  value={formState.volumeZ}
                  onChange={handleInputChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end space-x-2">
          {isEditing && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Annulla
            </button>
          )}
          <button
            type="button"
            onClick={handleAddConfig}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            disabled={!formState.name}
          >
            {isEditing ? 'Aggiorna' : 'Aggiungi'} Configurazione
          </button>
        </div>
      </div>
      
      {/* Lista delle configurazioni */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Configurazioni Salvate</h4>
        
        {isLoading ? (
          <div className="text-center p-4">
            <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500">Caricamento...</p>
          </div>
        ) : machineConfigs.length === 0 ? (
          <p className="text-sm text-gray-500 p-4 text-center">Nessuna configurazione salvata</p>
        ) : (
          <ul className="space-y-2">
            {machineConfigs.map(config => (
              <li 
                key={config.id} 
                className={`p-3 border rounded-md ${selectedMachine?.id === config.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h5 className="font-medium">{config.name}</h5>
                    <p className="text-xs text-gray-500">
                      {config.type.charAt(0).toUpperCase() + config.type.slice(1)} • 
                      Volume: {config.config.workVolume?.x}×{config.config.workVolume?.y}×{config.config.workVolume?.z} mm
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setSelectedMachine({ ...config, config: { ...config.config, type: config.type || '' } })}
                      className={`px-2 py-1 text-xs rounded ${selectedMachine?.id === config.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      {selectedMachine?.id === config.id ? 'Selezionata' : 'Seleziona'}
                    </button>
                    <button
                      onClick={() => handleEditConfig(config)}
                      className="p-1 text-gray-500 hover:text-blue-500"
                      title="Modifica"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteConfig(config.id)}
                      className="p-1 text-gray-500 hover:text-red-500"
                      title="Elimina"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MachineConfigManager;