import React from "react";
import { InfoIcon } from "lucide-react";
import PrinterSettings from "./3DPrinterSettings";
import PrinterPreview from "./3DPrinterPreview";

interface PrinterOperationsProps {
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
  geometryType: string;
  setGeometryType: (type: any) => void;
  elements: any[];
}

const PrinterOperations: React.FC<PrinterOperationsProps> = ({
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
  selectedElement,
  geometryType,
  setGeometryType,
  elements
}) => {
  // Update settings helper function
  const handleUpdateSettings = (key: string, value: any) => {
    updateSettings(key, value);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-4">
        {/* Element Selection Section */}
        <div className="p-4 bg-white rounded-md shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Element Selection</h3>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Geometry Source</label>
              <select
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={geometryType}
                onChange={e => setGeometryType(e.target.value)}
              >
                <option value="selected">From Selected Element</option>
                <option value="rectangle">Rectangle</option>
                <option value="circle">Circle</option>
                <option value="polygon">Polygon</option>
                <option value="cube">Cube</option>
                <option value="sphere">Sphere</option>
                <option value="cylinder">Cylinder</option>
                <option value="cone">Cone</option>
              </select>
            </div>

            {/* Show selected element info if "selected" is chosen */}
            {geometryType === "selected" && (
              <div className={`p-3 ${selectedElement ? "bg-green-50" : "bg-yellow-50"} rounded-md`}>
                {selectedElement ? (
                  <div>
                    <p className="text-sm text-green-700 font-medium mb-1">
                      Selected Element: {selectedElement.type} (ID: {selectedElement.id.substring(0, 6)}...)
                    </p>

                    <div className="mt-2 text-xs text-green-600">
                      {selectedElement.type === "cube" && (
                        <span>
                          Cube: {selectedElement.width}mm × {selectedElement.height}mm × {selectedElement.depth}mm
                        </span>
                      )}
                      {selectedElement.type === "sphere" && (
                        <span>Sphere: {selectedElement.radius * 2}mm diameter</span>
                      )}
                      {selectedElement.type === "cylinder" && (
                        <span>
                          Cylinder: {selectedElement.radius * 2}mm diameter × {selectedElement.height}mm height
                        </span>
                      )}
                      {selectedElement.type === "cone" && (
                        <span>
                          Cone: {selectedElement.radius * 2}mm base diameter × {selectedElement.height}mm height
                        </span>
                      )}
                      {selectedElement.type === "rectangle" && (
                        <span>
                          Rectangle: {selectedElement.width}mm × {selectedElement.height}mm
                        </span>
                      )}
                      {selectedElement.type === "circle" && (
                        <span>Circle: {selectedElement.radius * 2}mm diameter</span>
                      )}
                      {selectedElement.type === "polygon" && (
                        <span>
                          Polygon: {selectedElement.sides} sides, {selectedElement.radius * 2}mm diameter
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-yellow-700">No element selected. Select an element in the CAD Editor.</p>
                )}
              </div>
            )}

            {/* List available elements to select */}
            {geometryType === "selected" && elements.length > 0 && (
              <div className="mt-2">
                <h4 className="text-xs font-medium text-gray-600 mb-1">Available Elements:</h4>
                <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md">
                  <ul className="divide-y divide-gray-200">
                    {elements.map(element => (
                      <li
                        key={element.id}
                        className={`px-2 py-1 text-xs hover:bg-blue-50 cursor-pointer ${
                          selectedElement?.id === element.id ? "bg-blue-100" : ""
                        }`}
                        onClick={() => {
                          // This assumes that the component has access to a function to select elements
                          // In a real application, you would need to implement this selection logic
                          // or call the appropriate function from the CAD store
                          console.log("Selected element:", element.id);
                          // This would typically be done via a store action
                        }}
                      >
                        {element.type}: {element.name || element.id.substring(0, 8)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3D Printer Preview */}
        <div className="bg-white rounded-md shadow-sm border border-gray-200">
          <PrinterPreview
            element={selectedElement}
            settings={settings}
            infillDensity={infillDensity}
            shellCount={shellCount}
            supportType={supportType}
            infillPattern={infillPattern}
          />
        </div>
      </div>

      {/* 3D Printer Settings */}
      <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200">
        <PrinterSettings
          settings={settings}
          updateSettings={handleUpdateSettings}
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
    </div>
  );
};

export default PrinterOperations;
