// src/lib/toolpath/3dprinterToolpaths.ts

/**
 * Integration Guide:
 *
 * 1. Import necessary functions from this file into `src/components/cam/ToolpathGenerator.tsx`.
 *    Example: import { generate3DPrinterGCodeForElement, generateCompositeElement3D } from 'src/lib/toolpath/3dprinterToolpaths';
 *
 * 2. In `ToolpathGenerator.tsx`, locate the `generateGCode` function.
 *
 * 3. Modify the `case '3dprinter':` block within the `switch (settings.machineType)` statement.
 *
 * 4. Inside the `case '3dprinter':` block, add logic to check the `selectedElement.type`.
 *
 * 5. Call the appropriate function from this file based on the element type.
 *    - For simple elements (cube, sphere, etc.), call `generate3DPrinterGCodeForElement(selectedElement, printerSettings)`.
 *    - For composite elements, call `generateCompositeElement3D(selectedElement, printerSettings)`.
 *
 * 6. Pass the necessary 3D printer settings (layer height, infill, temperature, etc.) to these functions.
 *    You might need to gather these settings from the `use3DPrinterSettings` hook and potentially the main `settings` state in `ToolpathGenerator.tsx` and pass them as a single object (e.g., `printerSettings`).
 *
 * Example modification in `ToolpathGenerator.tsx's `generateGCode` function:
 *
 * case '3dprinter':
 *   if (selectedElement) {
 *     const printerSettings = { // Gather all necessary 3D print settings here
 *       ...settings, // Include relevant general settings like material?
 *       layerHeight: settings.layerHeight, // Example: might be directly in settings
 *       printSpeed: settings.printSpeed, // Example
 *       printTemperature: settings.printTemperature, // Example
 *       bedTemperature: settings.bedTemperature, // Example
 *       extrusionWidth: settings.extrusionWidth, // Example
 *       filamentDiameter: settings.filamentDiameter, // Example
 *       infillDensity, // From use3DPrinterSettings hook
 *       infillPattern, // From use3DPrinterSettings hook
 *       supportType,   // From use3DPrinterSettings hook
 *       shellCount,    // From use3DPrinterSettings hook
 *       // ... add other relevant 3D printing settings
 *     };
 *
 *     if (selectedElement.type === 'composite' || selectedElement.type === 'component' || selectedElement.type === 'group') {
 *        gcode = generateCompositeElement3D(selectedElement, printerSettings);
 *     } else {
 *        gcode = generate3DPrinterGCodeForElement(selectedElement, printerSettings);
 *     }
 *   } else {
 *     toast.error('Please select a CAD element for 3D printing.');
 *     gcode = '; Error: No element selected for 3D printing\n';
 *     setIsGenerating(false);
 *     return; // Exit early
 *   }
 *   break;
 *
 */

// Placeholder Types (Refine based on actual settings structure)
type PrinterSettings = {
  layerHeight: number;
  printSpeed: number;
  travelSpeed?: number;
  printTemperature: number;
  bedTemperature: number;
  extrusionWidth: number;
  filamentDiameter: number;
  retractionDistance?: number;
  retractionSpeed?: number;
  infillDensity: number; // Percentage 0-100
  infillPattern: string; // 'lines', 'grid', 'honeycomb', etc.
  shellCount: number; // Number of outer walls
  supportType: string; // 'none', 'touching_buildplate', 'everywhere'
  supportOverhangAngle?: number;
  supportDensity?: number; // Percentage
  raftLayers?: number;
  brimWidth?: number;
  // Potentially add material type if it affects temps/speeds
  material?: string;
  // Add other relevant settings from ToolpathGenerator's settings state if needed
  nozzleDiameter?: number;
  // ... any other settings from ToolpathSettings or use3DPrinterSettings
};

type Point3D = { x: number; y: number; z: number };

// Add geometry types
type Point2D = { x: number; y: number };
type Polygon = Point2D[]; // Represents the 2D cross-section
type SliceGeometry = Polygon[]; // Represents the 2D cross-section
type SliceResult = { gcode: string; nextE: number; geometry: SliceGeometry };

// --- Helper Functions ---

/**
 * Generates initial G-code commands for starting a 3D print.
 */
function generatePrintStartGCode(settings: PrinterSettings): string {
  let gcode = "";
  gcode += "; Print Start G-code\n";
  gcode += "M82 ; Set extruder to absolute mode\n";
  gcode += "G21 ; Set units to millimeters\n";
  gcode += "G90 ; Use absolute coordinates\n";
  gcode += `M104 S${settings.printTemperature} ; Set extruder temperature (no wait)\n`;
  gcode += `M140 S${settings.bedTemperature} ; Set bed temperature (no wait)\n`;
  gcode += "G28 ; Home all axes\n";
  gcode += `M109 S${settings.printTemperature} ; Wait for extruder temperature\n`;
  gcode += `M190 S${settings.bedTemperature} ; Wait for bed temperature\n`;
  gcode += "G1 Z5 F5000 ; Move Z up\n";
  gcode += "G1 X0 Y0 Z0.2 F3000 ; Move to prime position\n"; // Adjust prime position if needed
  gcode += "G92 E0 ; Reset extruder position\n";
  gcode += "G1 E5 F1800 ; Prime the extruder\n"; // Adjust priming amount/speed
  gcode += "G92 E0 ; Reset extruder position again\n";
  gcode += "G1 Z0.3 F3000 ; Lift slightly before starting print\n"; // Adjust Z height
  gcode += "\n";
  return gcode;
}

/**
 * Generates final G-code commands for ending a 3D print.
 */
function generatePrintEndGCode(settings: PrinterSettings, lastZ: number): string {
  let gcode = "\n";
  gcode += "; Print End G-code\n";
  gcode += `G1 E-${settings.retractionDistance || 2} F${(settings.retractionSpeed || 60) * 60} ; Retract filament\n`; // Retraction speed often in mm/min
  gcode += "G91 ; Relative positioning\n";
  gcode += `G1 Z5 F3000 ; Move Z up relative\n`; // Lift nozzle
  gcode += "G90 ; Absolute positioning\n";
  gcode += `G1 X0 Y${200} F3000 ; Present print (move Y forward)\n`; // Adjust Y position based on printer size
  gcode += "M104 S0 ; Turn off extruder temperature\n";
  gcode += "M140 S0 ; Turn off bed temperature\n";
  gcode += "M84 ; Disable motors\n";
  return gcode;
}

/**
 * Calculates the amount of filament to extrude for a given line length.
 */
function calculateExtrusion(
  length: number,
  layerHeight: number,
  extrusionWidth: number,
  filamentDiameter: number
): number {
  if (length <= 0 || layerHeight <= 0 || extrusionWidth <= 0 || filamentDiameter <= 0) {
    return 0;
  }
  const filamentArea = Math.PI * Math.pow(filamentDiameter / 2, 2);
  const extrusionArea = extrusionWidth * layerHeight;
  const volumePerMm = extrusionArea; // mm^3 per mm of linear movement
  const extrusionPerMm = volumePerMm / filamentArea; // mm of filament per mm of linear movement
  return extrusionPerMm * length;
}

/**
 * Moves the extruder to a specific point, potentially extruding filament.
 */
function moveTo(
  point: Point3D,
  speed: number,
  currentE: number,
  extrusionAmount: number
): { gcode: string; nextE: number } {
  const nextE = currentE + extrusionAmount;
  const speedMmMin = speed * 60; // Convert mm/s to mm/min for G-code F parameter
  let gcode = `G1 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} Z${point.z.toFixed(3)}`;
  if (extrusionAmount > 0) {
    gcode += ` E${nextE.toFixed(5)}`;
  }
  gcode += ` F${speedMmMin}\n`;
  return { gcode, nextE };
}

/**
 * Generates G-code for printing a polygon outline for a single layer.
 */
function generatePolygonLayer(
  points: Point3D[], // Assumes points are ordered and include Z for the layer
  settings: PrinterSettings,
  currentE: number
): { gcode: string; nextE: number } {
  if (points.length < 2) return { gcode: "", nextE: currentE };

  let gcode = "";
  let nextE = currentE;
  const travelSpeed = settings.travelSpeed || 150; // mm/s

  // Move to the start of the polygon without extruding
  const moveResult = moveTo(points[0], travelSpeed, nextE, 0);
  gcode += moveResult.gcode;
  // nextE = moveResult.nextE; // E doesn't change on travel

  // Extrude along the polygon segments
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const segmentLength = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    const extrusion = calculateExtrusion(
      segmentLength,
      settings.layerHeight,
      settings.extrusionWidth,
      settings.filamentDiameter
    );
    const segmentMove = moveTo(p2, settings.printSpeed, nextE, extrusion);
    gcode += segmentMove.gcode;
    nextE = segmentMove.nextE;
  }

  return { gcode, nextE };
}

// --- Element Specific Generators ---

/**
 * Generates 3D printer G-code for a Cube element.
 */
function generateCube3D(element: any, settings: PrinterSettings): string {
  let gcode = `; 3D Print Cube: center (${element.x}, ${element.y}, ${element.z}), size ${element.width}x${element.depth}x${element.height}\n`;
  let currentE = 0; // Track extruded filament length

  const { width, depth: elementDepth, height } = element; // Use element's dimensions
  const layers = Math.ceil(height / settings.layerHeight);
  const halfWidth = width / 2;
  const halfDepth = elementDepth / 2;
  const startZ = element.z - height / 2; // Bottom of the cube

  for (let layer = 0; layer < layers; layer++) {
    const currentLayerZ = startZ + (layer + 1) * settings.layerHeight;
    gcode += `\n; Layer ${layer + 1} / ${layers} at Z=${currentLayerZ.toFixed(3)}\n`;

    // Define corners for this layer
    const corners: Point3D[] = [
      { x: element.x - halfWidth, y: element.y - halfDepth, z: currentLayerZ },
      { x: element.x + halfWidth, y: element.y - halfDepth, z: currentLayerZ },
      { x: element.x + halfWidth, y: element.y + halfDepth, z: currentLayerZ },
      { x: element.x - halfWidth, y: element.y + halfDepth, z: currentLayerZ },
      { x: element.x - halfWidth, y: element.y - halfDepth, z: currentLayerZ } // Close loop
    ];

    // Generate perimeters (shells)
    for (let shell = 0; shell < settings.shellCount; shell++) {
      // Simple offset - more robust offsetting needed for complex shapes/infill
      const offset = shell * settings.extrusionWidth;
      const shellCorners: Point3D[] = [
        { x: element.x - halfWidth + offset, y: element.y - halfDepth + offset, z: currentLayerZ },
        { x: element.x + halfWidth - offset, y: element.y - halfDepth + offset, z: currentLayerZ },
        { x: element.x + halfWidth - offset, y: element.y + halfDepth - offset, z: currentLayerZ },
        { x: element.x - halfWidth + offset, y: element.y + halfDepth - offset, z: currentLayerZ },
        { x: element.x - halfWidth + offset, y: element.y - halfDepth + offset, z: currentLayerZ } // Close loop
      ];

      // Prevent negative dimensions
      if (width - 2 * offset <= 0 || elementDepth - 2 * offset <= 0) break;

      const layerResult = generatePolygonLayer(shellCorners, settings, currentE);
      gcode += layerResult.gcode;
      currentE = layerResult.nextE;
    }

    // TODO: Add Infill generation here based on settings.infillDensity and settings.infillPattern
    // Example: generateInfillForLayer(bounds, settings, currentE);
    gcode += `; TODO: Add infill for layer ${layer + 1}\n`;

    // TODO: Add Support generation check here if needed
    // Example: if (needsSupport(layer, element, settings)) { gcode += generateSupportForLayer(...) }
    gcode += `; TODO: Check and add support for layer ${layer + 1}\n`;
  }

  return gcode;
}

/**
 * Generates 3D printer G-code for a Cylinder element.
 */
function generateCylinder3D(element: any, settings: PrinterSettings): string {
  let gcode = `; 3D Print Cylinder: center (${element.x}, ${element.y}, ${element.z}), radius ${element.radius}, height ${element.height}\n`;
  let currentE = 0;

  const { radius, height } = element;
  const layers = Math.ceil(height / settings.layerHeight);
  const startZ = element.z - height / 2; // Bottom of the cylinder
  const segments = 36; // Number of segments to approximate circle

  for (let layer = 0; layer < layers; layer++) {
    const currentLayerZ = startZ + (layer + 1) * settings.layerHeight;
    gcode += `\n; Layer ${layer + 1} / ${layers} at Z=${currentLayerZ.toFixed(3)}\n`;

    // Generate perimeters (shells)
    for (let shell = 0; shell < settings.shellCount; shell++) {
      const shellRadius = radius - shell * settings.extrusionWidth;
      if (shellRadius <= 0) break; // Stop if radius becomes too small

      const points: Point3D[] = [];
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        points.push({
          x: element.x + shellRadius * Math.cos(angle),
          y: element.y + shellRadius * Math.sin(angle),
          z: currentLayerZ
        });
      }
      const layerResult = generatePolygonLayer(points, settings, currentE);
      gcode += layerResult.gcode;
      currentE = layerResult.nextE;
    }

    // TODO: Add Infill generation here (e.g., concentric circles or lines)
    gcode += `; TODO: Add infill for layer ${layer + 1}\n`;

    // TODO: Add Support generation check here if needed
    gcode += `; TODO: Check and add support for layer ${layer + 1}\n`;
  }

  return gcode;
}

/**
 * Generates 3D printer G-code for a Sphere element.
 */
function generateSphere3D(element: any, settings: PrinterSettings): string {
  let gcode = `; 3D Print Sphere: center (${element.x}, ${element.y}, ${element.z}), radius ${element.radius}\n`;
  let currentE = 0;

  const { radius } = element;
  const height = radius * 2;
  const layers = Math.ceil(height / settings.layerHeight);
  const startZ = element.z - radius; // Bottom of the sphere
  const segments = 36; // Number of segments to approximate circle

  for (let layer = 0; layer < layers; layer++) {
    const currentLayerZ = startZ + (layer + 1) * settings.layerHeight;

    // Calculate radius of the sphere slice at this Z height
    const distFromCenter = Math.abs(currentLayerZ - element.z);
    if (distFromCenter > radius) continue; // Skip layers outside the sphere

    const sliceRadius = Math.sqrt(Math.pow(radius, 2) - Math.pow(distFromCenter, 2));
    if (sliceRadius <= 0) continue;

    gcode += `\n; Layer ${layer + 1} / ${layers} at Z=${currentLayerZ.toFixed(3)}, Slice Radius: ${sliceRadius.toFixed(3)}\n`;

    // Generate perimeters (shells)
    for (let shell = 0; shell < settings.shellCount; shell++) {
      const shellRadius = sliceRadius - shell * settings.extrusionWidth;
      if (shellRadius <= 0) break; // Stop if radius becomes too small

      const points: Point3D[] = [];
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        points.push({
          x: element.x + shellRadius * Math.cos(angle),
          y: element.y + shellRadius * Math.sin(angle),
          z: currentLayerZ
        });
      }
      const layerResult = generatePolygonLayer(points, settings, currentE);
      gcode += layerResult.gcode;
      currentE = layerResult.nextE;
    }

    // TODO: Add Infill generation here
    gcode += `; TODO: Add infill for layer ${layer + 1}\n`;

    // TODO: Add Support generation check here (especially for the lower half)
    gcode += `; TODO: Check and add support for layer ${layer + 1}\n`;
  }

  return gcode;
}

// --- Add generators for other shapes (Cone, Torus, Extrude, Text, Polygon, etc.) here ---
// --- adapting the logic from the milling functions and sphere/cylinder examples ---

function generateCone3D(element: any, settings: PrinterSettings): string {
  let gcode = `; 3D Print Cone: base center (${element.x}, ${element.y}, ${element.z}), base radius ${element.radius}, height ${element.height}\n`;
  let currentE = 0;

  const { radius, height } = element;
  const layers = Math.ceil(height / settings.layerHeight);
  const startZ = element.z - height / 2; // Bottom of the cone (base)
  const segments = 36;

  for (let layer = 0; layer < layers; layer++) {
    const currentLayerZ = startZ + (layer + 1) * settings.layerHeight;
    const progress = (currentLayerZ - startZ) / height; // 0 at base, 1 at tip
    const sliceRadius = radius * (1 - progress); // Radius decreases towards the tip

    if (sliceRadius <= 0) continue; // Stop when radius is zero or less

    gcode += `\n; Layer ${layer + 1} / ${layers} at Z=${currentLayerZ.toFixed(3)}, Slice Radius: ${sliceRadius.toFixed(3)}\n`;

    for (let shell = 0; shell < settings.shellCount; shell++) {
      const shellRadius = sliceRadius - shell * settings.extrusionWidth;
      if (shellRadius <= 0) break;

      const points: Point3D[] = [];
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        points.push({
          x: element.x + shellRadius * Math.cos(angle),
          y: element.y + shellRadius * Math.sin(angle),
          z: currentLayerZ
        });
      }
      const layerResult = generatePolygonLayer(points, settings, currentE);
      gcode += layerResult.gcode;
      currentE = layerResult.nextE;
    }
    gcode += `; TODO: Add infill for layer ${layer + 1}\n`;
    gcode += `; TODO: Check and add support for layer ${layer + 1}\n`;
  }
  return gcode;
}

function generateTorus3D(element: any, settings: PrinterSettings): string {
  let gcode = `; 3D Print Torus: center (${element.x}, ${element.y}, ${element.z}), major radius ${element.radius}, minor radius ${element.tubeRadius}\n`;
  let currentE = 0;

  const majorRadius = element.radius || 30;
  const minorRadius = element.tubeRadius || 10;
  const height = minorRadius * 2;
  const layers = Math.ceil(height / settings.layerHeight);
  const startZ = element.z - minorRadius; // Bottom of the torus
  const segments = 48; // Higher segments for smoother torus

  for (let layer = 0; layer < layers; layer++) {
    const currentLayerZ = startZ + (layer + 1) * settings.layerHeight;
    const distFromCenterPlane = Math.abs(currentLayerZ - element.z);

    if (distFromCenterPlane > minorRadius) continue; // Skip layers outside the torus

    // Calculate inner and outer radius of the torus slice at this Z
    const minorSliceRadius = Math.sqrt(Math.pow(minorRadius, 2) - Math.pow(distFromCenterPlane, 2));
    const outerSliceRadius = majorRadius + minorSliceRadius;
    const innerSliceRadius = majorRadius - minorSliceRadius;

    if (outerSliceRadius <= 0 || innerSliceRadius < 0 || innerSliceRadius >= outerSliceRadius) continue;

    gcode += `\n; Layer ${layer + 1} / ${layers} at Z=${currentLayerZ.toFixed(3)}, Outer R: ${outerSliceRadius.toFixed(3)}, Inner R: ${innerSliceRadius.toFixed(3)}\n`;

    // Generate perimeters (shells) - working outwards from inner radius and inwards from outer radius
    for (let shell = 0; shell < settings.shellCount; shell++) {
      // Outer shell
      const outerShellRadius = outerSliceRadius - shell * settings.extrusionWidth;
      if (outerShellRadius <= innerSliceRadius + (settings.shellCount - 1 - shell) * settings.extrusionWidth) break; // Prevent outer shell crossing inner shell

      const outerPoints: Point3D[] = [];
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        outerPoints.push({
          x: element.x + outerShellRadius * Math.cos(angle),
          y: element.y + outerShellRadius * Math.sin(angle),
          z: currentLayerZ
        });
      }
      const outerResult = generatePolygonLayer(outerPoints, settings, currentE);
      gcode += outerResult.gcode;
      currentE = outerResult.nextE;

      // Inner shell (if inner radius > 0 and space allows)
      const innerShellRadius = innerSliceRadius + shell * settings.extrusionWidth;
      if (innerShellRadius > 0 && innerShellRadius < outerShellRadius - settings.extrusionWidth) {
        const innerPoints: Point3D[] = [];
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * 2 * Math.PI; // Print inner CCW maybe? Check orientation.
          innerPoints.push({
            x: element.x + innerShellRadius * Math.cos(angle),
            y: element.y + innerShellRadius * Math.sin(angle),
            z: currentLayerZ
          });
        }
        // Consider reversing inner points for correct extrusion direction? Test needed.
        const innerResult = generatePolygonLayer(innerPoints.reverse(), settings, currentE); // Try reversing
        gcode += innerResult.gcode;
        currentE = innerResult.nextE;
      }
    }
    gcode += `; TODO: Add torus infill (ring shape) for layer ${layer + 1}\n`;
    gcode += `; TODO: Check and add support for layer ${layer + 1}\n`;
  }
  return gcode;
}

// Placeholder for Text - Very Complex
function generateText3D(element: any, settings: PrinterSettings): string {
  let gcode = `; 3D Print Text: "${element.text}" at (${element.x}, ${element.y}, ${element.z})\n`;
  gcode += `; ERROR: Direct 3D printing of text elements is not supported.\n`;
  gcode += `; Please convert text to outlines/paths first (e.g., using an SVG export/import).\n`;
  // Optionally, print a bounding box as a placeholder
  const height = element.size || 10;
  const width = (element.text?.length || 5) * height * 0.6; // Rough guess
  const depth = element.depth || settings.layerHeight * 5; // Default depth
  const cubeElement = { ...element, type: "cube", width, depth: width, height: depth }; // Create a placeholder cube
  gcode += generateCube3D(cubeElement, settings);
  return gcode;
}

// --- Slicing Helper Functions (Internal) ---

/**
 * Generates G-code for a single slice (layer) of a Cube element.
 */
function generateCubeSlice(
  element: any,
  settings: PrinterSettings,
  currentLayerZ: number,
  currentE: number
): SliceResult {
  const { width, depth: elementDepth, height, x, y, z } = element;
  const halfWidth = width / 2;
  const halfDepth = elementDepth / 2;
  const startZ = z - height / 2;
  let sliceGCode = "";
  let nextE = currentE;
  let sliceGeometry: SliceGeometry = [];

  // Check if this layer intersects the cube's height
  if (currentLayerZ > startZ && currentLayerZ <= startZ + height) {
    // Define corners for the outer perimeter for geometry output
    const outerCorners: Polygon = [
      { x: x - halfWidth, y: y - halfDepth },
      { x: x + halfWidth, y: y - halfDepth },
      { x: x + halfWidth, y: y + halfDepth },
      { x: x - halfWidth, y: y + halfDepth }
      // { x: x - halfWidth, y: y - halfDepth }, // Polygon definition usually doesn't repeat start point
    ];
    sliceGeometry.push(outerCorners);

    // Generate perimeters (shells) for this slice
    for (let shell = 0; shell < settings.shellCount; shell++) {
      const offset = shell * settings.extrusionWidth;
      const shellCorners: Point3D[] = [
        { x: x - halfWidth + offset, y: y - halfDepth + offset, z: currentLayerZ },
        { x: x + halfWidth - offset, y: y - halfDepth + offset, z: currentLayerZ },
        { x: x + halfWidth - offset, y: y + halfDepth - offset, z: currentLayerZ },
        { x: x - halfWidth + offset, y: y + halfDepth - offset, z: currentLayerZ },
        { x: x - halfWidth + offset, y: y - halfDepth + offset, z: currentLayerZ } // Close loop
      ];
      if (width - 2 * offset <= 0 || elementDepth - 2 * offset <= 0) break;

      const layerResult = generatePolygonLayer(shellCorners, settings, nextE);
      sliceGCode += layerResult.gcode;
      nextE = layerResult.nextE;
    }

    // --- Basic Rectilinear Infill ---
    const infillDensity = Math.max(0.1, Math.min(100, settings.infillDensity)); // Clamp density 0.1-100%
    if (infillDensity > 0 && settings.infillPattern === "lines") {
      // Only implement 'lines' for now
      const innerShellOffset = settings.shellCount * settings.extrusionWidth;
      const infillWidth = width - 2 * innerShellOffset;
      const infillDepth = elementDepth - 2 * innerShellOffset;

      if (infillWidth > settings.extrusionWidth && infillDepth > settings.extrusionWidth) {
        // Check if infill area is large enough
        sliceGCode += `\\n; Infill for layer at Z=${currentLayerZ.toFixed(3)}\\n`;
        const lineSpacing = settings.extrusionWidth / (infillDensity / 100);
        const startX = x - halfWidth + innerShellOffset;
        const endX = x + halfWidth - innerShellOffset;
        let currentY = y - halfDepth + innerShellOffset;
        const endY = y + halfDepth - innerShellOffset;
        let direction = 1; // 1 for startX to endX, -1 for endX to startX

        while (currentY <= endY) {
          const p1: Point3D = { x: direction === 1 ? startX : endX, y: currentY, z: currentLayerZ };
          const p2: Point3D = { x: direction === 1 ? endX : startX, y: currentY, z: currentLayerZ };

          // Travel move to the start of the infill line (optional, might connect directly)
          // const travelToInfill = moveTo(p1, settings.travelSpeed || 150, nextE, 0);
          // sliceGCode += travelToInfill.gcode;

          // Extrude along the infill line
          const segmentLength = Math.abs(p2.x - p1.x);
          const extrusion = calculateExtrusion(
            segmentLength,
            settings.layerHeight,
            settings.extrusionWidth,
            settings.filamentDiameter
          );
          // Use printSpeed for infill lines
          const infillMove = moveTo(p2, settings.printSpeed, nextE, extrusion);
          sliceGCode += infillMove.gcode;
          nextE = infillMove.nextE;

          // Move to the next line Y position
          currentY += lineSpacing;
          direction *= -1; // Reverse direction for next line
        }
      }
    } else if (infillDensity > 0) {
      sliceGCode += `; WARNING: Infill pattern '${settings.infillPattern}' not implemented. Skipping infill.\\n`;
    }
    // --- End Infill ---
  }

  return { gcode: sliceGCode, nextE, geometry: sliceGeometry };
}

/**
 * Generates G-code for a single slice (layer) of a Line element.
 * Simple implementation: Extrudes along the line path at the current Z.
 */
function generateLineSlice(
  element: any,
  settings: PrinterSettings,
  currentLayerZ: number,
  currentE: number
): SliceResult {
  let sliceGCode = "";
  let nextE = currentE;
  const travelSpeed = settings.travelSpeed || 150;
  let sliceGeometry: SliceGeometry = [];

  // Assuming line element has start and end points or pathData
  // For simplicity, let's assume start/end: element.x1, element.y1, element.x2, element.y2
  // A proper implementation would handle pathData (arrays of points)

  // Define start and end points at the current layer Z
  const p1: Point3D = { x: element.x1 ?? element.x, y: element.y1 ?? element.y, z: currentLayerZ };
  const p2: Point3D = {
    x: element.x2 ?? element.x + (element.length || 10),
    y: element.y2 ?? element.y,
    z: currentLayerZ
  }; // Guess end if not provided

  // Represent line as a degenerate polygon (or just a line segment type if preferred)
  // For SliceGeometry expecting Polygons, we might skip lines or represent as thin rectangles?
  // Let's skip adding lines to sliceGeometry for now, as they don't define an area well.
  // sliceGeometry.push([{x: p1.x, y: p1.y}, {x: p2.x, y: p2.y}]); // If SliceGeometry allowed line segments

  // Need to check if the line itself has a Z component or if it exists at this layer
  // Assuming for now it's a 2D line projected onto the current layer Z.

  // Move to the start
  const travelMove = moveTo(p1, travelSpeed, nextE, 0);
  sliceGCode += travelMove.gcode;

  // Extrude to the end
  const segmentLength = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  const extrusion = calculateExtrusion(
    segmentLength,
    settings.layerHeight,
    settings.extrusionWidth,
    settings.filamentDiameter
  );
  const extrudeMove = moveTo(p2, settings.printSpeed, nextE, extrusion);
  sliceGCode += extrudeMove.gcode;
  nextE = extrudeMove.nextE;

  return { gcode: sliceGCode, nextE, geometry: sliceGeometry }; // No geometry added for lines currently
}

// --- Add Slice Generators for other shapes (Cylinder, Sphere, Cone, Torus etc.) here ---
// Example for Cylinder:
function generateCylinderSlice(
  element: any,
  settings: PrinterSettings,
  currentLayerZ: number,
  currentE: number
): SliceResult {
  const { radius, height, x, y, z } = element;
  const startZ = z - height / 2;
  let sliceGCode = "";
  let nextE = currentE;
  const segments = 36;
  let sliceGeometry: SliceGeometry = [];

  if (currentLayerZ > startZ && currentLayerZ <= startZ + height) {
    // Generate outer perimeter points for geometry
    const outerPoints: Polygon = [];
    for (let i = 0; i < segments; i++) {
      // No need to repeat start point for polygon def
      const angle = (i / segments) * 2 * Math.PI;
      outerPoints.push({
        x: x + radius * Math.cos(angle),
        y: y + radius * Math.sin(angle)
      });
    }
    sliceGeometry.push(outerPoints);

    for (let shell = 0; shell < settings.shellCount; shell++) {
      const shellRadius = radius - shell * settings.extrusionWidth;
      if (shellRadius <= 0) break;

      const points: Point3D[] = [];
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        points.push({
          x: x + shellRadius * Math.cos(angle),
          y: y + shellRadius * Math.sin(angle),
          z: currentLayerZ
        });
      }
      const layerResult = generatePolygonLayer(points, settings, nextE);
      sliceGCode += layerResult.gcode;
      nextE = layerResult.nextE;
    }
    // TODO: Implement infill generation (e.g., concentric circles or lines) for this slice
    // --- Basic Rectilinear Infill ---
    const infillDensity = Math.max(0.1, Math.min(100, settings.infillDensity));
    if (infillDensity > 0 && settings.infillPattern === "lines") {
      const innerShellRadius = radius - settings.shellCount * settings.extrusionWidth;
      if (innerShellRadius > settings.extrusionWidth / 2) {
        sliceGCode += `\n; Infill for Cylinder layer at Z=${currentLayerZ.toFixed(3)}\n`;
        const lineSpacing = settings.extrusionWidth / (infillDensity / 100);
        const startY = y - innerShellRadius;
        const endY = y + innerShellRadius;
        let currentInfillY = startY;
        let direction = 1;

        while (currentInfillY <= endY) {
          const dy = currentInfillY - y;
          const dx = Math.sqrt(Math.max(0, innerShellRadius * innerShellRadius - dy * dy));
          const startX = x - dx;
          const endX = x + dx;

          if (endX > startX) {
            const p1: Point3D = { x: direction === 1 ? startX : endX, y: currentInfillY, z: currentLayerZ };
            const p2: Point3D = { x: direction === 1 ? endX : startX, y: currentInfillY, z: currentLayerZ };
            const segmentLength = Math.abs(p2.x - p1.x);
            if (segmentLength > 1e-3) {
              const extrusion = calculateExtrusion(
                segmentLength,
                settings.layerHeight,
                settings.extrusionWidth,
                settings.filamentDiameter
              );
              const infillMove = moveTo(p2, settings.printSpeed, nextE, extrusion);
              sliceGCode += infillMove.gcode;
              nextE = infillMove.nextE;
            }
          }
          currentInfillY += lineSpacing;
          direction *= -1;
        }
      }
    } else if (infillDensity > 0) {
      sliceGCode += `; WARNING: Infill pattern '${settings.infillPattern}' not implemented for Cylinder. Skipping infill.\n`;
    }
    // --- End Infill ---
  }
  return { gcode: sliceGCode, nextE, geometry: sliceGeometry };
}

function generateSphereSlice(
  element: any,
  settings: PrinterSettings,
  currentLayerZ: number,
  currentE: number
): SliceResult {
  const { radius, x, y, z } = element;
  const startZ = z - radius;
  let sliceGCode = "";
  let nextE = currentE;
  const segments = 36;
  let sliceGeometry: SliceGeometry = [];

  const distFromCenter = Math.abs(currentLayerZ - z);
  if (distFromCenter <= radius) {
    // Check if layer intersects sphere
    const sliceRadius = Math.sqrt(Math.pow(radius, 2) - Math.pow(distFromCenter, 2));
    if (sliceRadius > 0) {
      // Generate outer perimeter points for geometry
      const outerPoints: Polygon = [];
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        outerPoints.push({
          x: x + sliceRadius * Math.cos(angle),
          y: y + sliceRadius * Math.sin(angle)
        });
      }
      sliceGeometry.push(outerPoints);

      for (let shell = 0; shell < settings.shellCount; shell++) {
        const shellRadius = sliceRadius - shell * settings.extrusionWidth;
        if (shellRadius <= 0) break;

        const points: Point3D[] = [];
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * 2 * Math.PI;
          points.push({
            x: x + shellRadius * Math.cos(angle),
            y: y + shellRadius * Math.sin(angle),
            z: currentLayerZ
          });
        }
        const layerResult = generatePolygonLayer(points, settings, nextE);
        sliceGCode += layerResult.gcode;
        nextE = layerResult.nextE;
      }
      // TODO: Implement infill generation for this slice
      // TODO: Implement support check for this slice (needed below center)
      // --- Basic Rectilinear Infill ---
      const infillDensity = Math.max(0.1, Math.min(100, settings.infillDensity));
      if (infillDensity > 0 && settings.infillPattern === "lines") {
        const innerShellRadius = sliceRadius - settings.shellCount * settings.extrusionWidth;
        if (innerShellRadius > settings.extrusionWidth / 2) {
          sliceGCode += `\n; Infill for Sphere layer at Z=${currentLayerZ.toFixed(3)}\n`;
          const lineSpacing = settings.extrusionWidth / (infillDensity / 100);
          const startY = y - innerShellRadius;
          const endY = y + innerShellRadius;
          let currentInfillY = startY;
          let direction = 1;

          while (currentInfillY <= endY) {
            const dy = currentInfillY - y;
            const dx = Math.sqrt(Math.max(0, innerShellRadius * innerShellRadius - dy * dy));
            const startX = x - dx;
            const endX = x + dx;

            if (endX > startX) {
              const p1: Point3D = { x: direction === 1 ? startX : endX, y: currentInfillY, z: currentLayerZ };
              const p2: Point3D = { x: direction === 1 ? endX : startX, y: currentInfillY, z: currentLayerZ };
              const segmentLength = Math.abs(p2.x - p1.x);
              if (segmentLength > 1e-3) {
                const extrusion = calculateExtrusion(
                  segmentLength,
                  settings.layerHeight,
                  settings.extrusionWidth,
                  settings.filamentDiameter
                );
                const infillMove = moveTo(p2, settings.printSpeed, nextE, extrusion);
                sliceGCode += infillMove.gcode;
                nextE = infillMove.nextE;
              }
            }
            currentInfillY += lineSpacing;
            direction *= -1;
          }
        }
      } else if (infillDensity > 0) {
        sliceGCode += `; WARNING: Infill pattern '${settings.infillPattern}' not implemented for Sphere. Skipping infill.\n`;
      }
      // --- End Infill ---
    }
  }
  return { gcode: sliceGCode, nextE, geometry: sliceGeometry };
}

function generateConeSlice(
  element: any,
  settings: PrinterSettings,
  currentLayerZ: number,
  currentE: number
): SliceResult {
  const { radius, height, x, y, z } = element;
  const startZ = z - height / 2; // Base of the cone
  let sliceGCode = "";
  let nextE = currentE;
  const segments = 36;
  let sliceGeometry: SliceGeometry = [];

  if (currentLayerZ > startZ && currentLayerZ <= startZ + height) {
    const progress = (currentLayerZ - startZ) / height; // 0 at base, 1 at tip
    const sliceRadius = radius * (1 - progress); // Radius decreases towards the tip

    if (sliceRadius > settings.extrusionWidth / 2) {
      // Only print if slice is thick enough
      // Generate outer perimeter points for geometry
      const outerPoints: Polygon = [];
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        outerPoints.push({
          x: x + sliceRadius * Math.cos(angle),
          y: y + sliceRadius * Math.sin(angle)
        });
      }
      sliceGeometry.push(outerPoints);

      // Generate perimeters (shells)
      for (let shell = 0; shell < settings.shellCount; shell++) {
        const shellRadius = sliceRadius - shell * settings.extrusionWidth;
        if (shellRadius <= 0) break;

        const points: Point3D[] = [];
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * 2 * Math.PI;
          points.push({
            x: x + shellRadius * Math.cos(angle),
            y: y + shellRadius * Math.sin(angle),
            z: currentLayerZ
          });
        }
        const layerResult = generatePolygonLayer(points, settings, nextE);
        sliceGCode += layerResult.gcode;
        nextE = layerResult.nextE;
      }

      // Basic Rectilinear Infill (Circular Bounds)
      const infillDensity = Math.max(0.1, Math.min(100, settings.infillDensity));
      if (infillDensity > 0 && settings.infillPattern === "lines") {
        const innerShellRadius = sliceRadius - settings.shellCount * settings.extrusionWidth;
        if (innerShellRadius > settings.extrusionWidth / 2) {
          sliceGCode += `\n; Infill for Cone layer at Z=${currentLayerZ.toFixed(3)}\n`;
          const lineSpacing = settings.extrusionWidth / (infillDensity / 100);
          const startY = y - innerShellRadius;
          const endY = y + innerShellRadius;
          let currentInfillY = startY;
          let direction = 1;

          while (currentInfillY <= endY) {
            // Calculate intersection points of the horizontal line Y=currentInfillY with the inner circle
            const dy = currentInfillY - y;
            const dx = Math.sqrt(Math.max(0, innerShellRadius * innerShellRadius - dy * dy));
            const startX = x - dx;
            const endX = x + dx;

            if (endX > startX) {
              // Check if line intersects the circle
              const p1: Point3D = { x: direction === 1 ? startX : endX, y: currentInfillY, z: currentLayerZ };
              const p2: Point3D = { x: direction === 1 ? endX : startX, y: currentInfillY, z: currentLayerZ };

              const segmentLength = Math.abs(p2.x - p1.x);
              if (segmentLength > 1e-3) {
                // Avoid zero-length extrusion
                const extrusion = calculateExtrusion(
                  segmentLength,
                  settings.layerHeight,
                  settings.extrusionWidth,
                  settings.filamentDiameter
                );
                const infillMove = moveTo(p2, settings.printSpeed, nextE, extrusion);
                sliceGCode += infillMove.gcode;
                nextE = infillMove.nextE;
              }
            }
            currentInfillY += lineSpacing;
            direction *= -1;
          }
        }
      } else if (infillDensity > 0) {
        sliceGCode += `; WARNING: Infill pattern '${settings.infillPattern}' not implemented for Cone. Skipping infill.\n`;
      }
    }
  }
  return { gcode: sliceGCode, nextE, geometry: sliceGeometry };
}

function generateTorusSlice(
  element: any,
  settings: PrinterSettings,
  currentLayerZ: number,
  currentE: number
): SliceResult {
  const { radius: majorRadius, tubeRadius: minorRadius, x, y, z } = element;
  const startZ = z - minorRadius;
  let sliceGCode = "";
  let nextE = currentE;
  const segments = 48;
  let sliceGeometry: SliceGeometry = [];

  const distFromCenterPlane = Math.abs(currentLayerZ - z);
  if (distFromCenterPlane <= minorRadius) {
    // Check if layer intersects torus tube
    const minorSliceRadius = Math.sqrt(
      Math.max(0, minorRadius * minorRadius - distFromCenterPlane * distFromCenterPlane)
    );
    const outerSliceRadius = majorRadius + minorSliceRadius;
    const innerSliceRadius = majorRadius - minorSliceRadius;

    if (outerSliceRadius > innerSliceRadius && innerSliceRadius >= 0) {
      // Generate outer perimeter for geometry
      const outerBoundaryPoints: Polygon = [];
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        outerBoundaryPoints.push({
          x: x + outerSliceRadius * Math.cos(angle),
          y: y + outerSliceRadius * Math.sin(angle)
        });
      }
      sliceGeometry.push(outerBoundaryPoints);

      // Generate inner perimeter for geometry (defines the hole)
      if (innerSliceRadius > 0) {
        const innerBoundaryPoints: Polygon = [];
        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * 2 * Math.PI;
          innerBoundaryPoints.push({
            x: x + innerSliceRadius * Math.cos(angle),
            y: y + innerSliceRadius * Math.sin(angle)
          });
        }
        // Inner boundaries often need opposite winding order for polygon libraries
        sliceGeometry.push(innerBoundaryPoints.reverse());
      }

      // Generate perimeters (shells) - working outwards from inner radius and inwards from outer radius
      for (let shell = 0; shell < settings.shellCount; shell++) {
        // Outer shell
        const outerShellRadius = outerSliceRadius - shell * settings.extrusionWidth;
        if (outerShellRadius <= innerSliceRadius + (settings.shellCount - 1 - shell) * settings.extrusionWidth) break;

        const outerPoints: Point3D[] = [];
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * 2 * Math.PI;
          outerPoints.push({
            x: x + outerShellRadius * Math.cos(angle),
            y: y + outerShellRadius * Math.sin(angle),
            z: currentLayerZ
          });
        }
        const outerResult = generatePolygonLayer(outerPoints, settings, nextE);
        sliceGCode += outerResult.gcode;
        nextE = outerResult.nextE;

        // Inner shell
        const innerShellRadius = innerSliceRadius + shell * settings.extrusionWidth;
        if (innerShellRadius > 0 && innerShellRadius < outerShellRadius - settings.extrusionWidth) {
          const innerPoints: Point3D[] = [];
          for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * 2 * Math.PI;
            innerPoints.push({
              x: x + innerShellRadius * Math.cos(angle),
              y: y + innerShellRadius * Math.sin(angle),
              z: currentLayerZ
            });
          }
          // Reverse inner loop points for correct extrusion direction (assuming outer is CCW)
          const innerResult = generatePolygonLayer(innerPoints.reverse(), settings, nextE);
          sliceGCode += innerResult.gcode;
          nextE = innerResult.nextE;
        }
      }

      // TODO: Implement infill for the torus ring shape (more complex than simple rect/circle)
      // sliceGCode += `; TODO: Implement Torus slice infill logic for Z=${currentLayerZ.toFixed(3)}\n`;
      // --- Basic Rectilinear Infill (Simplified - Fills Bounding Box of Outer Ring) ---
      const infillDensity = Math.max(0.1, Math.min(100, settings.infillDensity));
      if (infillDensity > 0 && settings.infillPattern === "lines") {
        // Use the outer radius of the *innermost* shell as the bound for infill
        // (or could use the outer radius of the outermost shell and fill the hole)
        // Let's use the outermost radius for simplicity, acknowledging it fills the hole.
        const infillBoundsRadius = outerSliceRadius - settings.shellCount * settings.extrusionWidth; // Approx inner radius of solid part

        if (infillBoundsRadius > innerSliceRadius + settings.extrusionWidth / 2) {
          // Check if there is space to infill between shells
          sliceGCode += `\n; Infill for Torus layer at Z=${currentLayerZ.toFixed(3)} (Simplified BBox Infill)\n`;
          const lineSpacing = settings.extrusionWidth / (infillDensity / 100);
          // Infill across the bounding box defined by the outer radius of the ring
          const startY = y - outerSliceRadius;
          const endY = y + outerSliceRadius;
          let currentInfillY = startY;
          let direction = 1;

          while (currentInfillY <= endY) {
            // Calculate intersection points with the OUTER boundary
            const dy_outer = currentInfillY - y;
            const dx_outer = Math.sqrt(Math.max(0, outerSliceRadius * outerSliceRadius - dy_outer * dy_outer));
            const startX_outer = x - dx_outer;
            const endX_outer = x + dx_outer;

            // Calculate intersection points with the INNER boundary
            let startX_inner = startX_outer,
              endX_inner = endX_outer;
            if (innerSliceRadius > 0) {
              const dy_inner = currentInfillY - y;
              if (Math.abs(dy_inner) < innerSliceRadius) {
                // Check if line crosses the inner hole
                const dx_inner = Math.sqrt(Math.max(0, innerSliceRadius * innerSliceRadius - dy_inner * dy_inner));
                startX_inner = x - dx_inner;
                endX_inner = x + dx_inner;
              }
            }

            // Generate infill segments between inner and outer boundaries
            const segmentsToFill: { start: number; end: number }[] = [];
            if (endX_outer > startX_outer) {
              // Does it intersect the outer circle?
              if (innerSliceRadius <= 0 || Math.abs(currentInfillY - y) >= innerSliceRadius) {
                // No hole intersection or line is outside hole vertically
                segmentsToFill.push({ start: startX_outer, end: endX_outer });
              } else {
                // Line crosses the hole, create two segments
                if (startX_outer < startX_inner) segmentsToFill.push({ start: startX_outer, end: startX_inner });
                if (endX_inner < endX_outer) segmentsToFill.push({ start: endX_inner, end: endX_outer });
              }
            }

            for (const segment of segmentsToFill) {
              const p1: Point3D = {
                x: direction === 1 ? segment.start : segment.end,
                y: currentInfillY,
                z: currentLayerZ
              };
              const p2: Point3D = {
                x: direction === 1 ? segment.end : segment.start,
                y: currentInfillY,
                z: currentLayerZ
              };
              const segmentLength = Math.abs(p2.x - p1.x);

              if (segmentLength > 1e-3) {
                const extrusion = calculateExtrusion(
                  segmentLength,
                  settings.layerHeight,
                  settings.extrusionWidth,
                  settings.filamentDiameter
                );
                const infillMove = moveTo(p2, settings.printSpeed, nextE, extrusion);
                sliceGCode += infillMove.gcode;
                nextE = infillMove.nextE;
              }
            }

            currentInfillY += lineSpacing;
            direction *= -1;
          }
        }
      } else if (infillDensity > 0) {
        sliceGCode += `; WARNING: Infill pattern '${settings.infillPattern}' not implemented for Torus. Skipping infill.\n`;
      }
      // --- End Infill ---
    }
  }
  return { gcode: sliceGCode, nextE, geometry: sliceGeometry };
}

// Placeholder for Ellipsoid slicing
function generateEllipsoidSlice(
  element: any,
  settings: PrinterSettings,
  currentLayerZ: number,
  currentE: number
): SliceResult {
  const { x, y, z, radiusX, radiusY, radiusZ } = element;
  let sliceGCode = "";
  let nextE = currentE;
  const segments = 36; // Adjust for desired smoothness
  let sliceGeometry: SliceGeometry = [];

  const dz = currentLayerZ - z;
  // Check if the layer intersects the ellipsoid
  if (Math.abs(dz) <= radiusZ) {
    const verticalScaleFactor = Math.sqrt(Math.max(0, 1 - (dz * dz) / (radiusZ * radiusZ)));
    const sliceRadiusX = radiusX * verticalScaleFactor;
    const sliceRadiusY = radiusY * verticalScaleFactor;

    if (sliceRadiusX > settings.extrusionWidth / 2 && sliceRadiusY > settings.extrusionWidth / 2) {
      // Only print if slice is thick enough
      sliceGCode += `\n; Ellipsoid Slice at Z=${currentLayerZ.toFixed(3)} RX=${sliceRadiusX.toFixed(3)} RY=${sliceRadiusY.toFixed(3)}\n`;
      // Generate perimeters (shells)
      for (let shell = 0; shell < settings.shellCount; shell++) {
        // Approximate shell offset by scaling radii (not geometrically perfect)
        const offsetX = shell * settings.extrusionWidth * (sliceRadiusX / Math.max(sliceRadiusX, sliceRadiusY)); // Scale offset based on aspect ratio
        const offsetY = shell * settings.extrusionWidth * (sliceRadiusY / Math.max(sliceRadiusX, sliceRadiusY));
        const shellRadiusX = sliceRadiusX - offsetX;
        const shellRadiusY = sliceRadiusY - offsetY;

        if (shellRadiusX <= 0 || shellRadiusY <= 0) break;

        const points: Point3D[] = [];
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * 2 * Math.PI;
          points.push({
            x: x + shellRadiusX * Math.cos(angle),
            y: y + shellRadiusY * Math.sin(angle),
            z: currentLayerZ
          });
        }
        const layerResult = generatePolygonLayer(points, settings, nextE);
        sliceGCode += layerResult.gcode;
        nextE = layerResult.nextE;
      }

      // Basic Rectilinear Infill (Elliptical Bounds)
      const infillDensity = Math.max(0.1, Math.min(100, settings.infillDensity));
      if (infillDensity > 0 && settings.infillPattern === "lines") {
        const innerShellOffsetX =
          settings.shellCount * settings.extrusionWidth * (sliceRadiusX / Math.max(sliceRadiusX, sliceRadiusY));
        const innerShellOffsetY =
          settings.shellCount * settings.extrusionWidth * (sliceRadiusY / Math.max(sliceRadiusX, sliceRadiusY));
        const innerRadiusX = sliceRadiusX - innerShellOffsetX;
        const innerRadiusY = sliceRadiusY - innerShellOffsetY;

        if (innerRadiusX > settings.extrusionWidth / 2 && innerRadiusY > settings.extrusionWidth / 2) {
          sliceGCode += `\n; Infill for Ellipsoid layer at Z=${currentLayerZ.toFixed(3)}\n`;
          const lineSpacing = settings.extrusionWidth / (infillDensity / 100);
          const startY = y - innerRadiusY;
          const endY = y + innerRadiusY;
          let currentInfillY = startY;
          let direction = 1;

          while (currentInfillY <= endY) {
            // Calculate intersection points of the horizontal line Y=currentInfillY with the inner ellipse
            const term = 1 - ((currentInfillY - y) * (currentInfillY - y)) / (innerRadiusY * innerRadiusY);
            const dx = innerRadiusX * Math.sqrt(Math.max(0, term));
            const startX = x - dx;
            const endX = x + dx;

            if (endX > startX) {
              // Check if line intersects the ellipse
              const p1: Point3D = { x: direction === 1 ? startX : endX, y: currentInfillY, z: currentLayerZ };
              const p2: Point3D = { x: direction === 1 ? endX : startX, y: currentInfillY, z: currentLayerZ };
              const segmentLength = Math.abs(p2.x - p1.x);

              if (segmentLength > 1e-3) {
                const extrusion = calculateExtrusion(
                  segmentLength,
                  settings.layerHeight,
                  settings.extrusionWidth,
                  settings.filamentDiameter
                );
                const infillMove = moveTo(p2, settings.printSpeed, nextE, extrusion);
                sliceGCode += infillMove.gcode;
                nextE = infillMove.nextE;
              }
            }
            currentInfillY += lineSpacing;
            direction *= -1;
          }
        }
      } else if (infillDensity > 0) {
        sliceGCode += `; WARNING: Infill pattern '${settings.infillPattern}' not implemented for Ellipsoid. Skipping infill.\n`;
      }
    }
  }
  return { gcode: sliceGCode, nextE, geometry: sliceGeometry };
}

// --- Bounding Box Helper ---

function getElementBounds(element: any): { minZ: number; maxZ: number } | null {
  if (!element) return null;

  let minZ = Infinity,
    maxZ = -Infinity;

  const updateBounds = (elMinZ: number, elMaxZ: number) => {
    minZ = Math.min(minZ, elMinZ);
    maxZ = Math.max(maxZ, elMaxZ);
  };

  switch (element.type) {
    case "cube":
    case "cylinder":
    case "cone":
      if (element.z != null && element.height != null) {
        updateBounds(element.z - element.height / 2, element.z + element.height / 2);
      } else return null;
      break;
    case "sphere":
      if (element.z != null && element.radius != null) {
        updateBounds(element.z - element.radius, element.z + element.radius);
      } else return null;
      break;
    case "torus":
      if (element.z != null && element.tubeRadius != null) {
        updateBounds(element.z - element.tubeRadius, element.z + element.tubeRadius);
      } else return null;
      break;
    case "ellipsoid":
      if (element.z != null && element.radiusZ != null) {
        updateBounds(element.z - element.radiusZ, element.z + element.radiusZ);
      } else return null;
      break;
    case "line":
      // Lines are tricky, depend on how Z is defined (start/end Z or just thickness)
      // Assuming for now they exist primarily at their element.z +/- strokeWidth/2 ?
      // Or maybe they define z1, z2?
      // Simplification: use element.z only for now.
      if (element.z != null) {
        updateBounds(element.z - (element.strokeWidth || 0.2) / 2, element.z + (element.strokeWidth || 0.2) / 2); // Approximate bounds for line thickness
      }
      // A more robust implementation would check element.z1, element.z2 if they exist.
      break;
    case "text":
    case "text3d":
      // Similar to line, Z bounds are complex. Using element.z and depth/size.
      if (element.z != null) {
        const height = element.depth || element.size || 1; // Estimate height
        updateBounds(element.z - height / 2, element.z + height / 2);
      } else return null;
      break;
    // Add cases for other primitive types if they exist (e.g., Pyramid, Prism)

    case "composite":
    case "component":
    case "group":
      if (element.elements && Array.isArray(element.elements)) {
        let hasSubBounds = false;
        for (const subElement of element.elements) {
          const subBounds = getElementBounds(subElement);
          if (subBounds) {
            updateBounds(subBounds.minZ, subBounds.maxZ);
            hasSubBounds = true;
          }
        }
        if (!hasSubBounds) return null; // No valid sub-elements with bounds
      } else {
        // Composite has no elements, return null or default bounds?
        return null; // Let's return null if empty
      }
      break;
    default:
      // Unknown type, cannot determine bounds
      console.warn(`Cannot get bounds for unknown element type: ${element.type}`);
      return null;
  }

  // If bounds were never updated (e.g., empty composite), return null
  if (minZ === Infinity || maxZ === -Infinity) {
    return null;
  }

  return { minZ, maxZ };
}

// --- Layer Feature Generation Functions ---

function generatePerimetersForGeometry(
  geometry: SliceGeometry,
  layerZ: number, // Pass layer Z explicitly
  settings: PrinterSettings,
  currentE: number
): { gcode: string; nextE: number } {
  let perimeterGCode = "";
  let nextE = currentE;

  if (!geometry || geometry.length === 0) return { gcode: "", nextE: nextE }; // Fix return

  perimeterGCode += `; Layer Perimeters at Z=${layerZ.toFixed(3)}\n`;

  for (const polygon of geometry) {
    if (polygon.length >= 3) {
      // Need at least 3 points for a polygon
      // Generate shells from outside in
      for (let shell = 0; shell < settings.shellCount; shell++) {
        const offsetDistance = shell * settings.extrusionWidth;
        // Basic polygon offsetting (approximate vertex normal offset)
        // A robust library (clipper) is highly recommended for complex polygons
        const shellPolygon = offsetPolygonSimple(polygon, -offsetDistance); // Offset inwards

        if (shellPolygon && shellPolygon.length >= 3) {
          const shellPoints3D = shellPolygon.map(p => ({ ...p, z: layerZ }));
          // Close the loop for G-code generation
          shellPoints3D.push({ ...shellPoints3D[0] });

          const shellResult = generatePolygonLayer(shellPoints3D, settings, nextE);
          perimeterGCode += shellResult.gcode;
          nextE = shellResult.nextE;
        } else {
          perimeterGCode += `; Skipping shell ${shell + 1} due to offset failure or polygon too small.\n`;
          break; // Stop if offset fails
        }
      }
    }
  }

  return { gcode: perimeterGCode, nextE };
}

function generateInfillForLayer(
  geometry: SliceGeometry, // Use geometry representing INNERMOST shells ideally
  layerZ: number,
  settings: PrinterSettings,
  currentE: number
): { gcode: string; nextE: number } {
  let infillGCode = "";
  let nextE = currentE;

  if (!geometry || geometry.length === 0 || settings.infillDensity <= 0) return { gcode: "", nextE: nextE }; // Fix return

  infillGCode += `; Layer Infill at Z=${layerZ.toFixed(3)} (Pattern: ${settings.infillPattern})\n`;

  if (settings.infillPattern === "lines") {
    // TODO: Implement rectilinear infill across potentially multiple disjoint polygons.
    // Requires calculating bounding box of all geometry, then clipping infill lines against each polygon.
    // Iterate through each polygon representing an infill area
    for (const polygon of geometry) {
      if (!polygon || polygon.length < 3) continue;

      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      polygon.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });

      if (minX !== Infinity) {
        const infillDensity = Math.max(0.1, Math.min(100, settings.infillDensity));
        const lineSpacing = settings.extrusionWidth / (infillDensity / 100);
        let currentY = minY;
        let direction = 1;
        // Use the passed layerZ parameter

        while (currentY <= maxY) {
          // Simplified: Use bounding box for now. TODO: Clip line segment against polygon.
          const startX = minX;
          const endX = maxX;
          const p1: Point3D = { x: direction === 1 ? startX : endX, y: currentY, z: layerZ };
          const p2: Point3D = { x: direction === 1 ? endX : startX, y: currentY, z: layerZ };
          const segmentLength = Math.abs(p2.x - p1.x);
          if (segmentLength > 1e-3) {
            const extrusion = calculateExtrusion(
              segmentLength,
              settings.layerHeight,
              settings.extrusionWidth,
              settings.filamentDiameter
            );
            const infillMove = moveTo(p2, settings.printSpeed, nextE, extrusion);
            infillGCode += infillMove.gcode;
            nextE = infillMove.nextE;
          }
          currentY += lineSpacing;
          direction *= -1;
        }
      }
    }
    // infillGCode += `; TODO: Implement proper multi-polygon infill clipping\n`; // Keep commented
  } else {
    infillGCode += `; WARNING: Infill pattern '${settings.infillPattern}' not fully implemented for layer-wide infill.\n`;
  }

  return { gcode: infillGCode, nextE };
}

function generateSupportForLayer(
  currentLayerGeometry: SliceGeometry,
  previousLayerGeometry: SliceGeometry | null,
  layerZ: number,
  settings: PrinterSettings,
  currentE: number
): { gcode: string; nextE: number } {
  let supportGCode = "";
  let nextE = currentE;

  if (!previousLayerGeometry || settings.supportType === "none") {
    return { gcode: "", nextE }; // No support needed on first layer or if disabled
  }

  supportGCode += `; Layer Support (Type: ${settings.supportType})\n`;

  // --- Overhang Detection (Placeholder) ---
  // TODO: Implement actual geometric difference/offsetting to find areas
  // where currentLayerGeometry overhangs previousLayerGeometry significantly.
  const supportAreas: SliceGeometry = []; // Placeholder
  if (currentLayerGeometry.length > 0 && previousLayerGeometry.length === 0) {
    // Very basic: If previous layer was empty and current is not, support everything?
    // This is too naive, needs proper geometric check.
    // supportAreas.push(...currentLayerGeometry);
    supportGCode += `; TODO: Implement overhang detection logic\n`;
  }
  // --- End Overhang Detection ---

  // --- Support Generation (Placeholder) ---
  if (supportAreas.length > 0) {
    supportGCode += `; TODO: Generate support structures within detected areas\n`;
    // Example: Iterate through supportAreas polygons
    // Generate sparse grid or lines according to supportDensity
    // Manage 'supportType' (touching_buildplate vs everywhere)
  }
  // --- End Support Generation ---

  return { gcode: supportGCode, nextE };
}

// --- Composite Element Handling (Refactored for Slicing) ---

/**
 * Generates 3D printer G-code for a composite element by slicing its sub-elements layer by layer.
 */
export function generateCompositeElement3D(element: any, settings: PrinterSettings): string {
  let compositeGCode = `; Start Composite Element: ${element.id || "composite"}\n`;
  let finalGCode = "";
  let lastZ = 0;
  let currentE = 0; // Track E across the entire print

  finalGCode += generatePrintStartGCode(settings);

  // --- Determine overall bounds and layers needed ---
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;
  const bounds = getElementBounds(element); // Assuming getElementBounds is updated/exists to return X/Y too

  if (!bounds /* || bounds.minX === undefined etc. */) {
    // Add checks if getElementBounds provides X/Y
    console.error("Could not determine accurate bounds for the composite element.");
    // Attempt rough estimate based on root element properties
    const rootRadius = element.radius || element.width || element.height || 100; // Very rough guess
    minX = (element.x || 0) - rootRadius;
    maxX = (element.x || 0) + rootRadius;
    minY = (element.y || 0) - rootRadius;
    maxY = (element.y || 0) + rootRadius;
    minZ = (element.z || 0) - rootRadius;
    maxZ = (element.z || 0) + rootRadius;
    console.warn("Using estimated bounds based on root element only.");
    if (minZ === Infinity) {
      // Still couldn't get any bounds
      finalGCode += "; ERROR: Cannot determine composite bounds for slicing grid.\n";
      return finalGCode;
    }
  } else {
    minZ = bounds.minZ;
    maxZ = bounds.maxZ;
    minX = "minX" in bounds && typeof bounds.minX === "number" ? bounds.minX : element.x - 50;
    maxX = "maxX" in bounds && typeof bounds.maxX === "number" ? bounds.maxX : element.x + 50;
    minY = "minY" in bounds && typeof bounds.minY === "number" ? bounds.minY : element.y - 50;
    maxY = "maxY" in bounds && typeof bounds.maxY === "number" ? bounds.maxY : element.y + 50;
    if (minX === Infinity) {
      console.warn(
        "Using estimated X/Y bounds for rasterization grid. Implement accurate XY bounds in getElementBounds."
      );
    }
  }
  const totalHeight = maxZ - minZ;
  const layers = Math.max(1, Math.ceil(totalHeight / settings.layerHeight)); // Ensure at least one layer
  compositeGCode += `; Estimated Layers: ${layers} (MinZ: ${minZ.toFixed(3)}, MaxZ: ${maxZ.toFixed(3)}) X: ${minX.toFixed(3)}..${maxX.toFixed(3)} Y: ${minY.toFixed(3)}..${maxY.toFixed(3)}\n`;
  // --- End Bounds Calculation ---

  // --- Grid Setup for Support Detection ---
  const gridResolution = 1.0; // Grid cell size in mm
  // Add padding to grid size
  const gridMinX = minX - gridResolution * 2;
  const gridMinY = minY - gridResolution * 2;
  const gridMaxX = maxX + gridResolution * 2;
  const gridMaxY = maxY + gridResolution * 2;
  const gridWidth = Math.max(1, Math.ceil((gridMaxX - gridMinX) / gridResolution));
  const gridHeight = Math.max(1, Math.ceil((gridMaxY - gridMinY) / gridResolution));

  // --- End Grid Setup ---

  let previousLayerGeometry: SliceGeometry | null = null; // Store geometry from n-1

  // --- Layer Loop ---
  for (let layer = 0; layer < layers; layer++) {
    const currentLayerZ = minZ + (layer + 1) * settings.layerHeight;
    let layerGCode = `\n; --- COMPOSITE LAYER ${layer + 1} / ${layers} at Z=${currentLayerZ.toFixed(3)} --- \n`;
    lastZ = Math.max(lastZ, currentLayerZ);
    let layerE = currentE; // Use E from previous layer

    // 1. Get all primitive 2D geometries for this layer
    const currentLayerGeometry = getPrimitivesAtLayer(element, currentLayerZ, settings);

    // 2. Generate Perimeters for the collected geometry
    // TODO: Pass layerZ explicitly to generatePerimetersForGeometry
    const perimeterResult = generatePerimetersForGeometry(currentLayerGeometry, currentLayerZ, settings, layerE);
    layerGCode += perimeterResult.gcode;
    layerE = perimeterResult.nextE;

    // 3. Generate Infill based on the collected geometry (needs inner boundaries)
    // TODO: Calculate inner shell polygons from currentLayerGeometry based on shellCount
    let innerShellGeometry: SliceGeometry = [];
    if (settings.shellCount > 0 && settings.infillDensity > 0) {
      const offsetDistance = settings.shellCount * settings.extrusionWidth;
      for (const polygon of currentLayerGeometry) {
        // Calculate inner boundary for infill
        const innerPolygon = offsetPolygonSimple(polygon, -offsetDistance);
        if (innerPolygon && innerPolygon.length >= 3) {
          innerShellGeometry.push(innerPolygon);
        }
      }
    } else if (settings.infillDensity > 0) {
      // No shells, use outer geometry for infill bounds
      innerShellGeometry = currentLayerGeometry;
    }

    const infillResult = generateInfillForLayer(innerShellGeometry, currentLayerZ, settings, layerE);
    layerGCode += infillResult.gcode;
    layerE = infillResult.nextE;

    // 4. Generate Support based on comparison with previous layer
    // TODO: Pass layerZ explicitly to generateSupportForLayer
    const supportResult = generateSupportForLayer(
      currentLayerGeometry,
      previousLayerGeometry,
      currentLayerZ,
      settings,
      layerE
    );
    layerGCode += supportResult.gcode;
    layerE = supportResult.nextE;

    compositeGCode += layerGCode;
    currentE = layerE; // Update the main E value for the next layer
    previousLayerGeometry = currentLayerGeometry; // Store for next iteration
  }
  // --- End Layer Loop ---

  finalGCode += compositeGCode; // Append the generated layers
  finalGCode += generatePrintEndGCode(settings, lastZ);
  finalGCode += `; End Composite Element: ${element.id || "composite"}\n`;

  return finalGCode;
}

/**
 * Main function to generate G-code for a selected element.
 * Calls the appropriate generator based on the element type.
 */
export function generate3DPrinterGCodeForElement(element: any, settings: PrinterSettings): string {
  let elementGCode = "";
  let lastZ = 0; // Track the highest Z point reached

  // Determine element height for end G-code Z positioning
  lastZ = element.z + (element.height || element.radius || 10) / 2; // Approximate max Z

  switch (element.type) {
    case "cube":
      elementGCode = generateCube3D(element, settings);
      lastZ = element.z + element.height / 2;
      break;
    case "cylinder":
      elementGCode = generateCylinder3D(element, settings);
      lastZ = element.z + element.height / 2;
      break;
    case "sphere":
      elementGCode = generateSphere3D(element, settings);
      lastZ = element.z + element.radius;
      break;
    case "cone":
      elementGCode = generateCone3D(element, settings);
      lastZ = element.z + element.height / 2; // Tip of the cone
      break;
    case "torus":
      elementGCode = generateTorus3D(element, settings);
      lastZ = element.z + (element.tubeRadius || 10); // Top of the tube
      break;
    // --- Add cases for other supported primitive types ---
    // case 'pyramid': ...
    // case 'hemisphere': ...
    // case 'prism': ...
    // case 'ellipsoid': ...
    // case 'capsule': ...
    case "text": // Handle text - likely needs conversion first
    case "text3d":
      elementGCode = generateText3D(element, settings);
      lastZ = element.z + (element.depth || 5);
      break;
    case "line":
      // Direct printing of a single line doesn't usually make sense.
      // Generate it as if it were a composite of one layer.
      console.warn("Generating single line element directly. Consider using composite or providing thickness.");
      // Create temporary composite settings for one layer
      const singleLayerSettings = { ...settings, layerHeight: element.strokeWidth || settings.extrusionWidth };
      const tempComposite = {
        id: "line-wrapper",
        elements: [element],
        z: element.z,
        height: singleLayerSettings.layerHeight
      };
      return generateCompositeElement3D(tempComposite, singleLayerSettings);

    case "composite":
    case "component":
    case "group":
      // Composites should ideally be handled by generateCompositeElement3D
      // which includes start/end code. Calling this directly might be unexpected.
      console.warn(
        "Generating composite element via generate3DPrinterGCodeForElement. Use generateCompositeElement3D for full start/end code."
      );
      return generateCompositeElement3D(element, settings); // Delegate entirely

    default:
      elementGCode = `; WARNING: Unsupported element type '${element.type}' for direct 3D printing.\n`;
      // Maybe try to print its bounding box?
      const width = element.width || element.radius * 2 || 10;
      const depth = element.depth || element.radius * 2 || 10;
      const height = element.height || element.radius * 2 || 10;
      const bboxElement = { type: "cube", x: element.x, y: element.y, z: element.z, width, depth, height };
      elementGCode += `; Approximating with bounding box.\n`;
      elementGCode += generateCube3D(bboxElement, settings);
      lastZ = element.z + height / 2;
  }

  // Combine start code, element-specific code, and end code
  let fullGCode = "";
  fullGCode += generatePrintStartGCode(settings);
  fullGCode += elementGCode;
  fullGCode += generatePrintEndGCode(settings, lastZ);

  return fullGCode;
}

// --- New Recursive Geometry Collector ---

/**
 * Recursively traverses the element structure and collects the 2D slice geometry
 * for all primitive elements intersecting the given Z layer height.
 */
function getPrimitivesAtLayer(
  element: any,
  layerZ: number,
  settings: PrinterSettings // Needed if slice geometry depends on settings (e.g., strokeWidth)
): SliceGeometry {
  let layerGeometry: SliceGeometry = [];

  if (!element) return layerGeometry;

  // Check approximate Z bounds first for efficiency
  const bounds = getElementBounds(element);
  if (!bounds || layerZ < bounds.minZ - settings.layerHeight || layerZ > bounds.maxZ + settings.layerHeight) {
    // Element doesn't exist near this layer, skip deeper traversal
    // Added tolerance using layerHeight
    return layerGeometry;
  }

  switch (element.type) {
    // Primitive Types: Calculate and return their slice geometry
    case "cube":
    case "cylinder":
    case "sphere":
    case "cone":
    case "torus":
    case "ellipsoid":
      // Simulate calling the slice function just for geometry (ignore gcode/E)
      // Note: This is slightly inefficient as it recalculates geometry
      // A better refactor would separate geometry calculation completely.
      const tempResult =
        element.type === "cube"
          ? generateCubeSlice(element, settings, layerZ, 0)
          : element.type === "cylinder"
            ? generateCylinderSlice(element, settings, layerZ, 0)
            : element.type === "sphere"
              ? generateSphereSlice(element, settings, layerZ, 0)
              : element.type === "cone"
                ? generateConeSlice(element, settings, layerZ, 0)
                : element.type === "torus"
                  ? generateTorusSlice(element, settings, layerZ, 0)
                  : /*element.type === 'ellipsoid'*/ generateEllipsoidSlice(element, settings, layerZ, 0);
      layerGeometry.push(...tempResult.geometry);
      break;
    case "line":
      // Lines currently don't return area geometry, skip for now.
      // If needed, represent as thin rectangle based on strokeWidth.
      break;
    // Skip Text types for geometry collection for now
    case "text":
    case "text3d":
      break;

    // Composite Types: Recurse into sub-elements
    case "composite":
    case "component":
    case "group":
      if (element.elements && Array.isArray(element.elements)) {
        for (const subElement of element.elements) {
          layerGeometry.push(...getPrimitivesAtLayer(subElement, layerZ, settings));
        }
      }
      break;

    default:
      // console.warn(`getPrimitivesAtLayer: Unknown element type '${element.type}'`);
      break;
  }

  return layerGeometry;
}

// --- Simple Polygon Offset (Approximate) ---
function offsetPolygonSimple(polygon: Polygon, distance: number): Polygon | null {
  if (polygon.length < 3) return null;
  const newPolygon: Polygon = [];
  const len = polygon.length;

  for (let i = 0; i < len; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % len];
    const p3 = polygon[(i + 2) % len];

    // Calculate vectors for the segments
    const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

    // Calculate normals (perpendicular vectors pointing outwards for CCW polygon)
    const norm1 = { x: -v1.y, y: v1.x };
    const norm2 = { x: -v2.y, y: v2.x };

    // Normalize the normals
    const mag1 = Math.sqrt(norm1.x * norm1.x + norm1.y * norm1.y);
    const mag2 = Math.sqrt(norm2.x * norm2.x + norm2.y * norm2.y);
    if (mag1 === 0 || mag2 === 0) continue; // Skip degenerate segments
    const unitNorm1 = { x: norm1.x / mag1, y: norm1.y / mag1 };
    const unitNorm2 = { x: norm2.x / mag2, y: norm2.y / mag2 };

    // Calculate the bisector vector (average of the two normals)
    const bisector = { x: unitNorm1.x + unitNorm2.x, y: unitNorm1.y + unitNorm2.y };
    const bisectorMag = Math.sqrt(bisector.x * bisector.x + bisector.y * bisector.y);
    if (bisectorMag < 1e-6) continue; // Normals are likely opposite (straight line)

    // Normalize the bisector
    const unitBisector = { x: bisector.x / bisectorMag, y: bisector.y / bisectorMag };

    // Calculate the angle between the normals (or segments) to adjust offset distance
    // Dot product of unit normals gives cosine of angle between them
    const dot = unitNorm1.x * unitNorm2.x + unitNorm1.y * unitNorm2.y;
    // Angle between normals = acos(dot). Angle of corner = PI - angle between normals.
    // We need sine of half the *inner* angle of the corner vertex (p2)
    // Or use vector math: length adjustment = 1 / cos(angle_between_bisector_and_normal)
    // Easier: offset = distance / sin(theta/2) where theta is corner angle
    // sin(theta/2) = sqrt((1 - cos(theta))/2) = sqrt((1 + dot_normals)/2)
    const sinHalfTheta = Math.sqrt(Math.max(0, (1 + dot) / 2));

    if (sinHalfTheta < 1e-3) continue; // Avoid division by zero for straight lines

    const adjustedDistance = distance / sinHalfTheta;

    // Calculate the new point position along the bisector
    newPolygon.push({
      x: p2.x + unitBisector.x * adjustedDistance,
      y: p2.y + unitBisector.y * adjustedDistance
    });
  }

  return newPolygon.length >= 3 ? newPolygon : null;
}
