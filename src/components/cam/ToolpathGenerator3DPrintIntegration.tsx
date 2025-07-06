import React from "react";
import {
  generate3DPrinterFromElement,
  extractElementDimensions,
  estimatePrintTime,
  estimateMaterialUsage
} from "./3DPrinterToolpathHelpers";
import PrinterSettings from "./3DPrinterSettings";
import PrinterPreview from "./3DPrinterPreview";

// Interface for props
interface ToolpathGenerator3DPrintIntegrationProps {
  settings: any;
  updateSettings: (key: string, value: any) => void;
  selectedElement: any;
  onGCodeGenerated: (gcode: string) => void;

  // 3D Print specific state props
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
}

const ToolpathGenerator3DPrintIntegration: React.FC<ToolpathGenerator3DPrintIntegrationProps> = ({
  settings,
  updateSettings,
  selectedElement,
  onGCodeGenerated,
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
  setPrintOrientation
}) => {
  // Function to generate G-code for 3D printing the selected element
  const generateGCodeFor3DPrinting = () => {
    if (!selectedElement) {
      return "; No element selected for 3D printing\n";
    }

    // Generate G-code using our helper function
    const gcode = generate3DPrinterFromElement(selectedElement, settings, {
      infillDensity,
      infillPattern,
      supportType,
      shellCount,
      printResolution,
      printOrientation
    });

    // Return the generated G-code
    return gcode;
  };

  // Generate print statistics for the selected element
  const getPrintStatistics = () => {
    if (!selectedElement) return null;

    // Get dimensions
    const { width, height, depth, volume } = extractElementDimensions(selectedElement);

    // Calculate time estimate
    const estimatedTime = estimatePrintTime(selectedElement, settings, {
      infillDensity,
      supportType,
      layerHeight: settings.layerHeight || 0.2
    });

    // Calculate material usage
    const materialUsage = estimateMaterialUsage(selectedElement, {
      infillDensity,
      shellCount,
      supportType,
      material: settings.material
    });

    return {
      dimensions: { width, height, depth },
      volume: volume.toFixed(2),
      time: estimatedTime > 60 ? `${Math.floor(estimatedTime / 60)}h ${estimatedTime % 60}m` : `${estimatedTime}m`,
      material: `${materialUsage}g`,
      layerCount: Math.ceil(height / (settings.layerHeight || 0.2))
    };
  };

  const printStats = getPrintStatistics();

  return (
    <div className="flex flex-col space-y-4">
      {/* Info panel for 3D printing */}
      <div className="bg-white p-4 rounded-md border border-gray-200">
        <h3 className="text-base font-medium text-blue-600 mb-2">3D Printing from CAD Element</h3>

        {selectedElement ? (
          <div className="text-sm text-gray-600">
            <p>Ready to 3D print the selected {selectedElement.type} element.</p>
            <p className="mt-1">Adjust settings below to customize your print.</p>
          </div>
        ) : (
          <div className="bg-yellow-50 p-3 rounded-md text-sm text-yellow-700">
            <p>Please select an element from the CAD editor to generate a 3D print.</p>
            <p className="mt-1">
              You can select any 3D object (cube, sphere, cylinder, etc.) or 2D shape (which will be extruded).
            </p>
          </div>
        )}
      </div>

      {/* Flex container for settings and preview */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Settings panel */}
        <div className="flex-1 bg-white p-4 rounded-md border border-gray-200">
          <PrinterSettings
            settings={settings}
            updateSettings={updateSettings}
            infillDensity={infillDensity}
            setInfillDensity={setInfillDensity}
            infillPattern={infillPattern}
            setInfillPattern={setInfillPattern}
            supportType={supportType}
            setSupportType={setSupportType}
            shellCount={shellCount}
            setShellCount={setShellCount}
            printResolution={printResolution}
            setPrintResolution={setPrintResolution}
            printOrientation={printOrientation}
            setPrintOrientation={setPrintOrientation}
            selectedElement={selectedElement}
          />
        </div>

        {/* Preview panel */}
        <div className="flex-1 bg-white p-4 rounded-md border border-gray-200">
          {selectedElement ? (
            <PrinterPreview
              element={selectedElement}
              settings={settings}
              infillDensity={infillDensity}
              shellCount={shellCount}
              supportType={supportType}
              infillPattern={infillPattern}
            />
          ) : (
            <div className="flex items-center justify-center h-64 bg-gray-100 rounded-md">
              <p className="text-gray-500">Select an element to preview</p>
            </div>
          )}

          {/* Print statistics */}
          {printStats && (
            <div className="mt-4 p-3 bg-blue-50 rounded-md">
              <h4 className="text-sm font-medium text-blue-700 mb-2">Print Statistics</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500">Dimensions</span>
                  <span className="font-medium text-blue-600">
                    {printStats.dimensions.width.toFixed(1)} × {printStats.dimensions.depth.toFixed(1)} ×{" "}
                    {printStats.dimensions.height.toFixed(1)} mm
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500">Volume</span>
                  <span className="font-medium text-blue-600">{printStats.volume} cm³</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500">Print Time</span>
                  <span className="font-medium text-blue-600">{printStats.time}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500">Material</span>
                  <span className="font-medium text-blue-600">{printStats.material}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500">Layer Count</span>
                  <span className="font-medium text-blue-600">{printStats.layerCount} layers</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500">Layer Height</span>
                  <span className="font-medium text-blue-600">{settings.layerHeight || 0.2} mm</span>
                </div>
              </div>
            </div>
          )}

          {/* Generate button */}
          <div className="mt-4">
            <button
              onClick={() => {
                const gcode = generateGCodeFor3DPrinting();
                onGCodeGenerated(gcode);
              }}
              disabled={!selectedElement}
              className={`w-full py-2 px-4 rounded-md flex items-center justify-center ${
                selectedElement
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"
                ></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              Generate 3D Print G-code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolpathGenerator3DPrintIntegration;
