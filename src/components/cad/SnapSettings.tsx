// src/components/cad/SnapSettings.tsx
import React from 'react';

import { useSnap } from '@/src/hooks/useSnap';
import { SnapType } from '@/src/lib/enanchedSnapService';


const SnapSettings: React.FC = () => {
  const { snapSettings, updateSnapSettings, toggleSnapType } = useSnap();

  return (
    <div className="bg-white rounded-md shadow-sm p-4">
      <h3 className="text-sm font-medium mb-2">Snap Settings</h3>
      
      <div className="mb-3">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={snapSettings.enabled}
            onChange={() => updateSnapSettings({ enabled: !snapSettings.enabled })}
            className="mr-2 h-4 w-4 rounded text-blue-600"
          />
          <span className="text-sm">Enable Snapping</span>
        </label>
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(snapSettings.types).map(([type, enabled]) => (
          <label key={type} className="flex items-center">
            <input
              type="checkbox"
              checked={enabled}
              onChange={() => toggleSnapType(type as SnapType)}
              disabled={!snapSettings.enabled}
              className="mr-2 h-4 w-4 rounded text-blue-600"
            />
            <span className="text-xs">{type}</span>
          </label>
        ))}
      </div>
      
      <div className="mt-3">
        <label className="block text-xs mb-1">Grid Size</label>
        <input
          type="range"
          min="1"
          max="50"
          value={snapSettings.gridSize}
          onChange={(e) => updateSnapSettings({ gridSize: Number(e.target.value) })}
          disabled={!snapSettings.enabled}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>1</span>
          <span>{snapSettings.gridSize}</span>
          <span>50</span>
        </div>
      </div>
      
      <div className="mt-3">
        <label className="block text-xs mb-1">Snap Tolerance</label>
        <input
          type="range"
          min="1"
          max="20"
          value={snapSettings.tolerance}
          onChange={(e) => updateSnapSettings({ tolerance: Number(e.target.value) })}
          disabled={!snapSettings.enabled}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>1px</span>
          <span>{snapSettings.tolerance}px</span>
          <span>20px</span>
        </div>
      </div>
    </div>
  );
};

export default SnapSettings;