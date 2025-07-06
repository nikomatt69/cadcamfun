import React from "react";
import { InfoIcon } from "lucide-react";
import {
  extractElementDimensions,
  calculateOptimal3DPrintSettings,
  estimatePrintTime,
  estimateMaterialUsage
} from "./3DPrinterToolpathHelpers";

interface PrinterSettingsProps {
  settings: any;
  updateSettings: (key: string, value: any) => void;
  infillDensity: number;
  setInfillDensity: (value: number) => void;
  infillPattern: "grid" | "lines" | "triangles" | "honeycomb";
  setInfillPattern: (value: "grid" | "lines" | "triangles" | "honeycomb") => void;
  supportType: "none" | "minimal" | "full";
  setSupportType: (value: "none" | "minimal" | "full") => void;
  shellCount: number;
  setShellCount: (value: number) => void;
  printResolution: "standard" | "high" | "low";
  setPrintResolution: (value: "standard" | "high" | "low") => void;
  printOrientation: "original" | "auto-optimal";
  setPrintOrientation: (value: "original" | "auto-optimal") => void;
  selectedElement: any;
}

const PrinterSettings: React.FC<PrinterSettingsProps> = ({
  settings,
  updateSettings,
  infillDensity,
  setInfillDensity,
  infillPattern,
  setInfillPattern,
  supportType,
  setSupportType,
  shellCount,
  setShellCount,
  printResolution,
  setPrintResolution,
  printOrientation,
  setPrintOrientation,
  selectedElement
}) => {
  // Generate print statistics for selected element
  const getPrintStats = () => {
    if (!selectedElement) return null;

    const printEstimatedTime = estimatePrintTime(selectedElement, settings, {
      infillDensity,
      supportType,
      layerHeight: settings.layerHeight || 0.2
    });

    const materialUsage = estimateMaterialUsage(selectedElement, {
      infillDensity,
      shellCount,
      supportType,
      material: settings.material
    });

    return {
      time: printEstimatedTime, // in minutes
      material: materialUsage // in grams
    };
  };

  const printStats = selectedElement ? getPrintStats() : null;

  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 rounded-md">
        <h3 className="text-sm font-medium text-blue-700 mb-2">3D Printing Settings</h3>
        <p className="text-xs text-blue-600">
          Configure how your CAD model will be printed with these specialized 3D printing parameters.
        </p>
      </div>

      {/* Print parameters */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Layer Height (mm)</label>
          <div className="flex items-center">
            <input
              type="number"
              min="0.05"
              max="0.4"
              step="0.05"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={settings.layerHeight}
              onChange={e => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value) && value > 0) {
                  updateSettings("layerHeight", value);
                }
              }}
            />
            <div
              className="ml-2 tooltip"
              data-tip="Layer height determines the resolution of your print. Lower values produce finer details but increase print time."
            >
              <InfoIcon size={18} className="text-gray-500" />
            </div>
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-500">
            <span>Fine (0.1mm)</span>
            <span>Standard (0.2mm)</span>
            <span>Draft (0.3mm)</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nozzle Diameter (mm)</label>
          <select
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            value={settings.nozzleDiameter}
            onChange={e => updateSettings("nozzleDiameter", parseFloat(e.target.value))}
          >
            <option value="0.2">0.2mm (Ultra Fine)</option>
            <option value="0.3">0.3mm (Fine)</option>
            <option value="0.4">0.4mm (Standard)</option>
            <option value="0.6">0.6mm (Fast)</option>
            <option value="0.8">0.8mm (Draft/Rapid)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Print Resolution</label>
          <select
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            value={printResolution}
            onChange={e => setPrintResolution(e.target.value as "standard" | "high" | "low")}
          >
            <option value="high">High Quality (Slower)</option>
            <option value="standard">Standard Quality</option>
            <option value="low">Draft Quality (Faster)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Print Speed (mm/s)</label>
          <input
            type="number"
            min="20"
            max="150"
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            value={settings.printSpeed}
            onChange={e => {
              const value = parseFloat(e.target.value);
              if (!isNaN(value) && value > 0) {
                updateSettings("printSpeed", value);
              }
            }}
          />
          <div className="flex justify-between mt-1 text-xs text-gray-500">
            <span>Slow (30mm/s)</span>
            <span>Normal (60mm/s)</span>
            <span>Fast (100mm/s)</span>
          </div>
        </div>
      </div>

      {/* Infill and Shell settings */}
      <div className="pt-3 border-t border-gray-200">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Infill Density (%)</label>
            <input
              type="range"
              min="5"
              max="90"
              step="5"
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              value={infillDensity}
              onChange={e => setInfillDensity(parseInt(e.target.value))}
            />
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-500">Hollow (5%)</span>
              <span className="text-sm font-medium">{infillDensity}%</span>
              <span className="text-xs text-gray-500">Solid (90%)</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Infill Pattern</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={infillPattern}
              onChange={e => setInfillPattern(e.target.value as "grid" | "lines" | "triangles" | "honeycomb")}
            >
              <option value="grid">Grid (Standard)</option>
              <option value="lines">Lines (Fast)</option>
              <option value="triangles">Triangles (Strong)</option>
              <option value="honeycomb">Honeycomb (Optimal)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shell Count (Perimeters)</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={shellCount}
              onChange={e => setShellCount(parseInt(e.target.value))}
            >
              <option value="1">1 Shell (Fastest)</option>
              <option value="2">2 Shells (Standard)</option>
              <option value="3">3 Shells (Strong)</option>
              <option value="4">4 Shells (Extra Strong)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Support and orientation settings */}
      <div className="pt-3 border-t border-gray-200">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Support Structure</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={supportType}
              onChange={e => setSupportType(e.target.value as "none" | "minimal" | "full")}
            >
              <option value="none">None (No Overhangs)</option>
              <option value="minimal">Minimal (Less Material)</option>
              <option value="full">Full (Best Quality)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Print Orientation</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={printOrientation}
              onChange={e => setPrintOrientation(e.target.value as "original" | "auto-optimal")}
            >
              <option value="original">Original (As Designed)</option>
              <option value="auto-optimal">Auto-Optimal (Best Orientation)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Temperature settings */}
      <div className="pt-3 border-t border-gray-200">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Extruder Temperature (°C)</label>
            <input
              type="number"
              min="160"
              max="280"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={settings.printTemperature}
              onChange={e => {
                const value = parseInt(e.target.value);
                if (!isNaN(value)) {
                  updateSettings("printTemperature", value);
                }
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bed Temperature (°C)</label>
            <input
              type="number"
              min="20"
              max="120"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={settings.bedTemperature}
              onChange={e => {
                const value = parseInt(e.target.value);
                if (!isNaN(value)) {
                  updateSettings("bedTemperature", value);
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Print statistics if we have a selected element */}
      {printStats && (
        <div className="mt-3 p-3 bg-green-50 rounded-md">
          <h3 className="text-sm font-medium text-green-700 mb-2">Print Statistics</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">Print Time</span>
              <span className="text-sm font-medium text-green-600">
                {printStats.time > 60
                  ? `${Math.floor(printStats.time / 60)}h ${printStats.time % 60}m`
                  : `${printStats.time}m`}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">Material Usage</span>
              <span className="text-sm font-medium text-green-600">{printStats.material}g</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrinterSettings;
