import React, { useState } from 'react';
import { ControllerType } from '@/src/lib/cncControllers';

interface GCodeSettingsProps {
  onSettingsChange: (settings: GCodeSettings) => void;
  initialSettings?: Partial<GCodeSettings>;
}

export interface GCodeSettings {
  controller: ControllerType;
  programName: string;
  toolNumber: number;
  spindleSpeed: number;
  feedrate: number;
  plungerate: number;
  safeHeight: number;
  useMetricUnits: boolean;
  useAbsoluteCoordinates: boolean;
  optimizeRapidMoves: boolean;
  includeComments: boolean;
  coolantOn: boolean;
  useHighPrecision: boolean;
  useRadiusCompensation: boolean;
  radiusCompensationValue: number;
}

const defaultSettings: GCodeSettings = {
  controller: 'fanuc',
  programName: 'CAD_CAM',
  toolNumber: 1,
  spindleSpeed: 12000,
  feedrate: 800,
  plungerate: 300,
  safeHeight: 30,
  useMetricUnits: true,
  useAbsoluteCoordinates: true,
  optimizeRapidMoves: true,
  includeComments: true,
  coolantOn: true,
  useHighPrecision: false,
  useRadiusCompensation: false,
  radiusCompensationValue: 0
};

const GCodeSettings: React.FC<GCodeSettingsProps> = ({ onSettingsChange, initialSettings = {} }) => {
  // Merge default settings with initial settings
  const [settings, setSettings] = useState<GCodeSettings>({
    ...defaultSettings,
    ...initialSettings
  });

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    // Convert values based on input type
    let parsedValue: string | number | boolean = value;
    
    if (type === 'number') {
      parsedValue = parseFloat(value);
    } else if (type === 'checkbox') {
      parsedValue = (e.target as HTMLInputElement).checked;
    }
    
    // Update settings
    const newSettings = {
      ...settings,
      [name]: parsedValue
    };
    
    setSettings(newSettings);
    onSettingsChange(newSettings);
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <h2 className="text-xl font-bold mb-4">G-code Settings</h2> 
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Controller selection */}
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Controller CNC</label>
          <select 
            name="controller"
            value={settings.controller}
            onChange={handleInputChange}
            className="w-full p-2 border rounded"
          >
            <option value="fanuc">Fanuc</option>
            <option value="heidenhain">Heidenhain</option>
            <option value="generic">Generico</option>
          </select>
        </div>
        
        {/* Program name */}
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Program Name</label>
          <input
            type="text"
            name="programName"
            value={settings.programName}
            onChange={handleInputChange}
            className="w-full p-2 border rounded"
          />
        </div>
        
        {/* Tool number */}
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Tool Number</label>
          <input
            type="number"
            name="toolNumber"
            value={settings.toolNumber}
            onChange={handleInputChange}
            min="1"
            max="99"
            className="w-full p-2 border rounded"
          />
        </div>
        
        {/* Spindle speed */}
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Spindle Speed (RPM)</label>
          <input
            type="number"
            name="spindleSpeed"
            value={settings.spindleSpeed}
            onChange={handleInputChange}
            min="1000"
            max="24000"
            step="1000"
            className="w-full p-2 border rounded"
          />
        </div>
        
        {/* Feedrate */}
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Feedrate (mm/min)</label>
          <input
            type="number"
            name="feedrate"
            value={settings.feedrate}
            onChange={handleInputChange}
            min="10"
            max="5000"
            step="10"
            className="w-full p-2 border rounded"
          />
        </div>
        
        {/* Plunge rate */}
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Plunge Rate (mm/min)</label>
          <input
            type="number"
            name="plungerate"
            value={settings.plungerate}
            onChange={handleInputChange}
            min="10"
            max="1000"
            step="10"
            className="w-full p-2 border rounded"
          />
        </div>
        
        {/* Safe height */}
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Safe Height (mm)</label>
          <input
            type="number"
            name="safeHeight"
            value={settings.safeHeight}
            onChange={handleInputChange}
            min="5"
            max="100"
            step="5"
            className="w-full p-2 border rounded"
          />
        </div>

        {settings.controller === 'heidenhain' && (
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">High Precision Tolerance (mm)</label>
            <input
              type="number"
              name="radiusCompensationValue"
              value={settings.radiusCompensationValue}
              onChange={handleInputChange}
              min="0.001"
              max="0.1"
              step="0.001"
              disabled={!settings.useHighPrecision}
              className="w-full p-2 border rounded"
            />
          </div>
        )}
      </div>
      
      <hr className="my-4" />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Checkboxes for various options */}
        <div className="mb-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              name="useMetricUnits"
              checked={settings.useMetricUnits}
              onChange={handleInputChange}
              className="h-4 w-4"
            />
            <span>Metric Units (mm)</span>
          </label>
        </div>
        
        <div className="mb-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              name="useAbsoluteCoordinates"
              checked={settings.useAbsoluteCoordinates}
              onChange={handleInputChange}
              className="h-4 w-4"
            />
            <span>Absolute Coordinates</span>
          </label>
        </div>
        
        <div className="mb-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              name="optimizeRapidMoves"
              checked={settings.optimizeRapidMoves}
              onChange={handleInputChange}
              className="h-4 w-4"
            />
            <span>Optimize Rapid Moves</span>
          </label>
        </div>
        
        <div className="mb-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              name="includeComments"
              checked={settings.includeComments}
              onChange={handleInputChange}
              className="h-4 w-4"
            />
            <span>Include Comments</span>
          </label>
        </div>
        
        <div className="mb-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              name="coolantOn"
              checked={settings.coolantOn}
              onChange={handleInputChange}
              className="h-4 w-4"
            />
            <span>Enable Coolant</span>
          </label>
        </div>
        
        {settings.controller === 'heidenhain' && (
          <div className="mb-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                name="useHighPrecision"
                checked={settings.useHighPrecision}
                onChange={handleInputChange}
                className="h-4 w-4"
              />
              <span>Use High Precision</span>
            </label>
          </div>
        )}
        
        <div className="mb-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              name="useRadiusCompensation"
              checked={settings.useRadiusCompensation}
              onChange={handleInputChange}
              className="h-4 w-4"
            />
            <span>Tool Radius Compensation</span>
          </label>
        </div>
      </div>
      
      {/* Controller-specific notes */}
      <div className="mt-4 p-3 bg-blue-50 rounded text-sm">
        {settings.controller === 'fanuc' && (
          <p>Fanuc Format: The G-code will be generated in Fanuc standard format with G0, G1, G2/G3 commands and standard M commands.</p>
        )}
        
        {settings.controller === 'heidenhain' && (
          <p>Heidenhain Format: The G-code will be adapted to the Heidenhain syntax, with specific cycles and formats for this controller.</p>
        )}
        
        {settings.controller === 'generic' && (
          <p>Generic Format: The G-code will be generated in standard RS-274D (G-code) format, compatible with most CNC controllers.</p>
        )}
      </div>
    </div>
  );
};

export default GCodeSettings; 