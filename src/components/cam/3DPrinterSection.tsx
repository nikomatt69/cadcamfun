// 3D Printer Section component for the ToolpathGenerator
import React from "react";
import { ChevronDown, ChevronUp } from "react-feather";
import PrinterSettings from "./3DPrinterSettings";
import PrinterPreview from "./3DPrinterPreview";

interface PrinterSectionProps {
  expanded: boolean;
  toggleSection: (section: string) => void;
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

const PrinterSection: React.FC<PrinterSectionProps> = ({
  expanded,
  toggleSection,
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
  if (settings.machineType !== "3dprinter") return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection("printer")}>
        <h3 className="text-lg font-medium text-gray-900">3D Printer Settings</h3>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </div>

      {expanded && (
        <div className="mt-3 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left column: Settings */}
            <div>
              <PrinterSettings
                settings={settings}
                updateSettings={(key, value) => updateSettings(key, value)}
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

            {/* Right column: Visualization */}
            <div>
              <PrinterPreview
                element={selectedElement}
                settings={settings}
                infillDensity={infillDensity}
                shellCount={shellCount}
                supportType={supportType}
                infillPattern={infillPattern}
              />

              {/* Element selection guidance */}
              {!selectedElement && (
                <div className="mt-3 p-3 bg-yellow-50 rounded-md">
                  <p className="text-sm text-yellow-700">
                    Select an element in the CAD view to see a 3D printing preview and generate specific G-code for it.
                  </p>
                </div>
              )}

              {selectedElement && (
                <div className="mt-3 p-3 bg-green-50 rounded-md">
                  <p className="text-sm text-green-700">
                    <strong>{selectedElement.type}</strong> element selected. Generate G-code to create 3D print
                    instructions for this element.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Operation type selection */}
          <div className="pt-4 border-t border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Operation Type</label>
              <select
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.operationType}
                onChange={e => updateSettings("operationType", e.target.value)}
              >
                <option value="standard">Standard Print</option>
                <option value="vase">Vase Mode (Spiral)</option>
                <option value="support">Support Structures</option>
                <option value="infill">Custom Infill Pattern</option>
                <option value="raft">Raft Base Layer</option>
                <option value="brim">Brim Adhesion</option>
              </select>
            </div>

            {/* Operation description */}
            <div className="mt-3 p-3 bg-blue-50 rounded-md">
              <h4 className="text-sm font-medium text-blue-700 mb-1">
                {settings.operationType === "standard" && "Standard 3D Print"}
                {settings.operationType === "vase" && "Vase Mode (Spiral Printing)"}
                {settings.operationType === "support" && "Support Structure Generation"}
                {settings.operationType === "infill" && "Custom Infill Pattern"}
                {settings.operationType === "raft" && "Raft Base Layer"}
                {settings.operationType === "brim" && "Brim Adhesion"}
              </h4>
              <p className="text-xs text-blue-600">
                {settings.operationType === "standard" &&
                  "Creates a standard 3D print with perimeters, infill, and top/bottom solid layers."}
                {settings.operationType === "vase" &&
                  "Prints continuously in a spiral pattern with no retractions, ideal for simple vase-like objects."}
                {settings.operationType === "support" &&
                  "Generates support structures for overhanging geometry, which can be removed after printing."}
                {settings.operationType === "infill" &&
                  "Focuses on creating custom infill patterns within the object for specific strength or weight requirements."}
                {settings.operationType === "raft" &&
                  "Creates a thick base layer beneath the print to improve bed adhesion for complex or warping-prone parts."}
                {settings.operationType === "brim" &&
                  "Adds a single-layer flat area around the base of the model to increase bed adhesion without full raft thickness."}
              </p>
            </div>
          </div>

          {/* Material-specific recommendations */}
          {settings.material && (
            <div className="pt-3 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Material Recommendations</h4>
              <div className="p-3 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-700">
                  {settings.material === "plastic" && (
                    <>
                      <strong>PLA/PETG</strong>: Recommended temperature {settings.printTemperature}°C, Bed temperature{" "}
                      {settings.bedTemperature}°C. Layer adhesion is good with selected
                      {settings.layerHeight}mm layer height.
                    </>
                  )}
                  {settings.material === "aluminum" && (
                    <>
                      <strong>Metal printing</strong>: This simulation represents metal 3D printing. Actual metal
                      printing requires specialized equipment and different parameters.
                    </>
                  )}
                  {settings.material === "wood" && (
                    <>
                      <strong>Wood filament</strong>: Wood-filled PLA prints best at 190-220°C with a larger nozzle
                      (≥0.5mm) to prevent clogging from wood particles.
                    </>
                  )}
                  {settings.material !== "plastic" &&
                    settings.material !== "aluminum" &&
                    settings.material !== "wood" && (
                      <>
                        <strong>{settings.material}</strong>: Custom material settings applied. Verify temperatures and
                        speeds before printing.
                      </>
                    )}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PrinterSection;
