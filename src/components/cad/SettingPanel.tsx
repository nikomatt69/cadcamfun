// src/components/cad/SettingsPanel.tsx

import React, { useState } from 'react';
import { Settings, Grid, Compass, Eye, Info } from 'react-feather';
import { useCADStore } from 'src/store/cadStore';

const SettingsPanel: React.FC = () => {
  const { 
    viewMode, 
    setViewMode, 
    gridVisible, 
    toggleGrid, 
    axisVisible, 
    toggleAxis,

  } = useCADStore();

  const [units, setUnits] = useState<'mm' | 'inch'>('mm');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [snapToObjects, setSnapToObjects] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [autoSaveInterval, setAutoSaveInterval] = useState(5); // minuti

  const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setUnits(e.target.value as 'mm' | 'inch');
  };

  

  const handleToggleSnapToGrid = () => {
    setSnapToGrid(!snapToGrid);
  };

  const handleToggleSnapToObjects = () => {
    setSnapToObjects(!snapToObjects);
  };

  const handleToggleAutoSave = () => {
    setAutoSave(!autoSave);
  };

  const handleAutoSaveIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      setAutoSaveInterval(value);
    }
  };


  

  return (
    <div className="space-y-4">
      <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-sm rounded-md overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 flex items-center">
          <Settings size={18} className="text-blue-600 mr-2" />
          <span className="font-medium text-gray-700">General Settings</span>
        </div>
        
        <div className="p-4 space-y-4">
          {/* Modalità di visualizzazione */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">View Mode</label>
            <div className="flex space-x-2">
              <button
                onClick={() => setViewMode('2d')}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-md ${
                  viewMode === '2d'
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                }`}
              >
                2D
              </button>
              <button
                onClick={() => setViewMode('3d')}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-md ${
                  viewMode === '3d'
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                }`}
              >
                3D
              </button>
            </div>
          </div>
          
          {/* Unità di misura */}
          <div>
            <label htmlFor="units" className="block text-sm font-medium text-gray-700 mb-1">Units</label>
            <select
              id="units"
              value={units}
              onChange={handleUnitChange}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value="mm">Millimeters (mm)</option>
              <option value="inch">Inches (inch)</option>
            </select>
          </div>
          
          {/* Colore di sfondo */}
        </div>
      </div>
      
      {/* Impostazioni della griglia */}
      <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-sm rounded-md overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 flex items-center">
          <Grid size={18} className="text-blue-600 mr-2" />
          <span className="font-medium text-gray-700">Grid Settings</span>
        </div>
        
        <div className="p-4 space-y-4">
          {/* Visibilità griglia */}
          <div className="flex items-center justify-between">
            <label htmlFor="gridVisible" className="text-sm font-medium text-gray-700">Show Grid</label>
            <div className="relative inline-block w-10 mr-2 align-middle select-none">
              <input
                type="checkbox"
                id="gridVisible"
                checked={gridVisible}
                onChange={toggleGrid}
                className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white border-4 appearance-none cursor-pointer"
              />
              <label
                htmlFor="gridVisible"
                className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                  gridVisible ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              ></label>
            </div>
          </div>
          
          {/* Dimensione griglia */}
          
          
          {/* Snap to grid */}
          <div className="flex items-center justify-between">
            <label htmlFor="snapToGrid" className="text-sm font-medium text-gray-700">Snap to Grid</label>
            <div className="relative inline-block w-10 mr-2 align-middle select-none">
              <input
                type="checkbox"
                id="snapToGrid"
                checked={snapToGrid}
                onChange={handleToggleSnapToGrid}
                className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white border-4 appearance-none cursor-pointer"
              />
              <label
                htmlFor="snapToGrid"
                className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                  snapToGrid ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              ></label>
            </div>
          </div>
          
          {/* Snap to objects */}
          <div className="flex items-center justify-between">
            <label htmlFor="snapToObjects" className="text-sm font-medium text-gray-700">Snap to Objects</label>
            <div className="relative inline-block w-10 mr-2 align-middle select-none">
              <input
                type="checkbox"
                id="snapToObjects"
                checked={snapToObjects}
                onChange={handleToggleSnapToObjects}
                className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white border-4 appearance-none cursor-pointer"
              />
              <label
                htmlFor="snapToObjects"
                className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                  snapToObjects ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              ></label>
            </div>
          </div>
        </div>
      </div>
      
      {/* Impostazioni assi */}
      <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-sm rounded-md overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 flex items-center">
          <Compass size={18} className="text-blue-600 mr-2" />
          <span className="font-medium text-gray-700">Axis Settings</span>
        </div>
        
        <div className="p-4 space-y-4">
          {/* Visibilità assi */}
          <div className="flex items-center justify-between">
            <label htmlFor="axisVisible" className="text-sm font-medium text-gray-700">Show Axes</label>
            <div className="relative inline-block w-10 mr-2 align-middle select-none">
              <input
                type="checkbox"
                id="axisVisible"
                checked={axisVisible}
                onChange={toggleAxis}
                className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white border-4 appearance-none cursor-pointer"
              />
              <label
                htmlFor="axisVisible"
                className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                  axisVisible ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              ></label>
            </div>
          </div>
        </div>
      </div>
      
      {/* Impostazioni autosalvataggio */}
      <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-sm rounded-md overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 flex items-center">
          <Info size={18} className="text-blue-600 mr-2" />
          <span className="font-medium text-gray-700">Other Settings</span>
        </div>
        
        <div className="p-4 space-y-4">
          {/* Autosalvataggio */}
          <div className="flex items-center justify-between">
            <label htmlFor="autoSave" className="text-sm font-medium text-gray-700">Auto Save</label>
            <div className="relative inline-block w-10 mr-2 align-middle select-none">
              <input
                type="checkbox"
                id="autoSave"
                checked={autoSave}
                onChange={handleToggleAutoSave}
                className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white border-4 appearance-none cursor-pointer"
              />
              <label
                htmlFor="autoSave"
                className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                  autoSave ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              ></label>
            </div>
          </div>
          
          {/* Intervallo autosalvataggio */}
          {autoSave && (
            <div>
              <label htmlFor="autoSaveInterval" className="block text-sm font-medium text-gray-700 mb-1">
                Auto Save Interval (minutes)
              </label>
              <input
                type="number"
                id="autoSaveInterval"
                min="1"
                step="1"
                value={autoSaveInterval}
                onChange={handleAutoSaveIntervalChange}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;