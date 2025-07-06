// 3DPrinterToolpathHelpers.tsx
// Helper functions for 3D printer toolpath generation

import { generateElementToolpath } from "@/src/lib/toolpath";

/**
 * Extract dimensions from a CAD element
 */
export const extractElementDimensions = (element: any) => {
  if (!element) {
    return { width: 0, height: 0, depth: 0, volume: 0 };
  }

  let width = 0,
    height = 0,
    depth = 0,
    volume = 0;

  switch (element.type) {
    case "cube":
      width = element.width || 0;
      height = element.height || 0;
      depth = element.depth || 0;
      volume = width * height * depth;
      break;
    case "sphere":
      const radius = element.radius || 0;
      width = radius * 2;
      height = radius * 2;
      depth = radius * 2;
      volume = (4 / 3) * Math.PI * Math.pow(radius, 3);
      break;
    case "cylinder":
      const cylinderRadius = element.radius || 0;
      const cylinderHeight = element.height || 0;
      width = cylinderRadius * 2;
      height = cylinderHeight;
      depth = cylinderRadius * 2;
      volume = Math.PI * Math.pow(cylinderRadius, 2) * cylinderHeight;
      break;
    case "cone":
      const coneRadius = element.radius || 0;
      const coneHeight = element.height || 0;
      width = coneRadius * 2;
      height = coneHeight;
      depth = coneRadius * 2;
      volume = (1 / 3) * Math.PI * Math.pow(coneRadius, 2) * coneHeight;
      break;
    case "rectangle":
      width = element.width || 0;
      height = element.height || 0;
      depth = 0;
      volume = 0; // 2D shape
      break;
    case "circle":
      const circleRadius = element.radius || 0;
      width = circleRadius * 2;
      height = circleRadius * 2;
      depth = 0;
      volume = 0; // 2D shape
      break;
    case "polygon":
      const polygonRadius = element.radius || 0;
      width = polygonRadius * 2;
      height = polygonRadius * 2;
      depth = 0;
      volume = 0; // 2D shape
      break;
    default:
      // For other shapes or composite objects, estimate a bounding box
      width = element.width || element.size || 50;
      height = element.height || element.size || 50;
      depth = element.depth || element.size || 10;
      volume = width * height * depth * 0.7; // Rough estimate
  }

  return { width, height, depth, volume };
};

/**
 * Calculate optimal print settings based on model dimensions
 */
export const calculateOptimal3DPrintSettings = (element: any) => {
  const { width, height, depth } = extractElementDimensions(element);
  const maxDimension = Math.max(width, height, depth);

  // Determine layer height based on model size
  let layerHeight = 0.2; // default
  if (maxDimension < 30) {
    layerHeight = 0.1; // finer detail for smaller objects
  } else if (maxDimension > 150) {
    layerHeight = 0.3; // faster printing for larger objects
  }

  // Determine infill density based on model size
  let infillDensity = 20; // default
  if (maxDimension < 30) {
    infillDensity = 30; // stronger small objects
  } else if (maxDimension > 150) {
    infillDensity = 15; // save material on large objects
  }

  return {
    layerHeight,
    infillDensity,
    shellCount: 3,
    printSpeed: 60,
    supportType: depth > width / 2 ? "minimal" : "none"
  };
};

/**
 * Estimate print time based on model and settings
 */
export const estimatePrintTime = (element: any, settings: any, options: any) => {
  const { width, height, depth, volume } = extractElementDimensions(element);
  const { infillDensity, supportType, layerHeight } = options;

  // Base calculation
  const layers = Math.ceil(height / layerHeight);
  const layerArea = width * depth;

  // Time factors (simplified)
  const infillFactor = infillDensity / 100;
  const supportFactor = supportType === "none" ? 0 : supportType === "minimal" ? 0.2 : 0.4;

  // Rough time calculation (in minutes)
  const printSpeed = settings.printSpeed || 60; // mm/s

  // Time to print perimeter (minutes)
  const perimeterLength = 2 * (width + depth);
  const perimeterTime = (perimeterLength * layers) / (printSpeed * 60);

  // Time for infill
  const infillTime = (layerArea * layers * infillFactor) / (printSpeed * 1.5 * 60);

  // Time for support
  const supportTime = (layerArea * layers * supportFactor) / (printSpeed * 2 * 60);

  // Total time with buffer for moves
  const totalTime = Math.round((perimeterTime + infillTime + supportTime) * 1.2);

  return Math.max(10, totalTime); // Minimum 10 minutes
};

/**
 * Estimate material usage based on model and settings
 */
export const estimateMaterialUsage = (element: any, options: any) => {
  const { width, height, depth, volume } = extractElementDimensions(element);
  const { infillDensity, shellCount, supportType, material } = options;

  // Convert volume to material weight
  // Density factors (g/cm³) for different materials
  const densityFactor =
    material === "plastic"
      ? 1.24 // PLA
      : material === "aluminum"
        ? 2.7
        : material === "wood"
          ? 0.8
          : 1.24; // Default to PLA

  // Material usage calculation
  const infillFactor = infillDensity / 100;
  const shellVolume = 2 * (width * depth + width * height + depth * height) * shellCount * 0.4; // Shell thickness factor
  const infillVolume = (volume - shellVolume) * infillFactor;

  // Support material
  const supportFactor = supportType === "none" ? 0 : supportType === "minimal" ? 0.15 : 0.3;
  const supportVolume = volume * supportFactor;

  // Total material volume
  const totalVolume = (shellVolume + infillVolume + supportVolume) / 1000; // convert to cm³

  // Weight calculation
  const weight = Math.round(totalVolume * densityFactor * 10) / 10; // Round to 1 decimal place

  return Math.max(1, weight); // Minimum 1g
};

/**
 * Generate 3D printer G-code from a CAD element
 */
export const generate3DPrinterFromElement = (element: any, settings: any, options: any) => {
  const { infillDensity, infillPattern, supportType, shellCount, printResolution, printOrientation } = options;

  // Extract dimensions
  const { width, height, depth } = extractElementDimensions(element);

  // Printer settings
  const layerHeight = settings.layerHeight || 0.2;
  const extrusionWidth = settings.nozzleDiameter || 0.4;
  const printSpeed = settings.printSpeed || 60;
  const printTemp = settings.printTemperature || 200;
  const bedTemp = settings.bedTemperature || 60;

  // G-code generation
  let gcode = "";

  // Header
  gcode += "; Generated 3D Printer G-code\n";
  gcode += `; Model: ${element.type || "CAD Element"}\n`;
  gcode += `; Material: ${settings.material === "plastic" ? "PLA" : settings.material}\n`;
  gcode += `; Dimensions: ${width.toFixed(2)} x ${depth.toFixed(2)} x ${height.toFixed(2)} mm\n`;
  gcode += `; Infill: ${infillDensity}% ${infillPattern}\n`;
  gcode += `; Support: ${supportType}\n`;
  gcode += `; Shells: ${shellCount}\n`;
  gcode += `; Layer Height: ${layerHeight} mm\n`;
  gcode += `; Date: ${new Date().toISOString()}\n\n`;

  // Startup commands
  gcode += "M82 ; Set extruder to absolute mode\n";
  gcode += "G21 ; Set units to millimeters\n";
  gcode += "G90 ; Use absolute coordinates\n";
  gcode += `M104 S${printTemp} ; Set extruder temperature\n`;
  gcode += `M140 S${bedTemp} ; Set bed temperature\n`;
  gcode += `M109 S${printTemp} ; Wait for extruder temperature\n`;
  gcode += `M190 S${bedTemp} ; Wait for bed temperature\n`;
  gcode += "G28 ; Home all axes\n";
  gcode += "G1 Z5 F5000 ; Move Z up a bit\n";
  gcode += "G1 X0 Y0 Z0.3 F3000 ; Move to start position\n";
  gcode += "G1 E5 F1800 ; Prime the extruder\n";
  gcode += "G92 E0 ; Reset extruder position\n\n";

  // Calculate number of layers
  const layers = Math.ceil(height / layerHeight);

  // Generate layers based on element type
  switch (element.type) {
    case "cube":
      gcode += generateCubeGCode(
        element,
        layers,
        layerHeight,
        extrusionWidth,
        printSpeed,
        infillDensity,
        infillPattern
      );
      break;
    case "cylinder":
      gcode += generateCylinderGCode(
        element,
        layers,
        layerHeight,
        extrusionWidth,
        printSpeed,
        infillDensity,
        infillPattern
      );
      break;
    case "sphere":
      gcode += generateSphereGCode(
        element,
        layers,
        layerHeight,
        extrusionWidth,
        printSpeed,
        infillDensity,
        infillPattern
      );
      break;
    default:
      // Default to simple rectangular object
      try {
        // Import from our new toolpath generator modules
        const { generateDefaultToolpath } = require("src/lib/toolpath");
        gcode += generateDefaultToolpath(
          element,
          layers,
          layerHeight,
          extrusionWidth,
          printSpeed,
          infillDensity,
          infillPattern
        );
      } catch (error) {
        console.error("Error generating toolpath:", error);
        gcode += `; Error generating generic toolpath: ${error}\n; Falling back to component toolpath\n`;
        gcode += generateElementToolpath(element, settings);
      }
  }

  // End G-code
  gcode += "\n; End of print\n";
  gcode += "G1 E-2 F1800 ; Retract filament\n";
  gcode += `G1 Z${(height + 10).toFixed(2)} F3000 ; Move Z up\n`;
  gcode += "G1 X0 Y200 F3000 ; Move to front\n";
  gcode += "M104 S0 ; Turn off extruder\n";
  gcode += "M140 S0 ; Turn off bed\n";
  gcode += "M84 ; Disable motors\n";

  return gcode;
};

// Helper function to generate G-code for a cube
const generateCubeGCode = (
  element: any,
  layers: number,
  layerHeight: number,
  extrusionWidth: number,
  printSpeed: number,
  infillDensity: number,
  infillPattern: string
) => {
  let gcode = "";

  const { width, height, depth } = element;

  // Calculate center point
  const centerX = 0;
  const centerY = 0;

  // Calculate extrusion values
  const extrusionPerMM = (extrusionWidth * layerHeight) / (Math.PI * Math.pow(1.75 / 2, 2)); // Based on 1.75mm filament

  // For each layer
  for (let layer = 0; layer < layers; layer++) {
    const z = layerHeight * (layer + 1);

    gcode += `\n; Layer ${layer + 1}, Z=${z.toFixed(3)}\n`;
    gcode += `G1 Z${z.toFixed(3)} F3000 ; Move to new layer\n`;

    // Perimeter
    const startX = centerX - width / 2;
    const startY = centerY - depth / 2;

    // Reset extruder position for this layer
    gcode += "G92 E0 ; Reset extruder position\n";

    // Move to start position
    gcode += `G1 X${startX.toFixed(3)} Y${startY.toFixed(3)} F3000 ; Move to start position\n`;

    // Print 2 perimeters
    for (let shell = 0; shell < 2; shell++) {
      const offset = shell * extrusionWidth;
      gcode += `G1 X${(startX + offset).toFixed(3)} Y${(startY + offset).toFixed(3)} F${printSpeed * 60} E0.5 ; Start perimeter\n`;

      // Rectangle perimeter
      const shellWidth = width - offset * 2;
      const shellDepth = depth - offset * 2;
      const perimeter = 2 * (shellWidth + shellDepth);

      gcode += `G1 X${(startX + shellWidth - offset).toFixed(3)} Y${(startY + offset).toFixed(3)} E${(extrusionPerMM * shellWidth * 0.25 + 0.5).toFixed(5)} ; Perimeter\n`;
      gcode += `G1 X${(startX + shellWidth - offset).toFixed(3)} Y${(startY + shellDepth - offset).toFixed(3)} E${(extrusionPerMM * (shellWidth + shellDepth) * 0.25 + 0.5).toFixed(5)} ; Perimeter\n`;
      gcode += `G1 X${(startX + offset).toFixed(3)} Y${(startY + shellDepth - offset).toFixed(3)} E${(extrusionPerMM * (shellWidth * 2 + shellDepth) * 0.25 + 0.5).toFixed(5)} ; Perimeter\n`;
      gcode += `G1 X${(startX + offset).toFixed(3)} Y${(startY + offset).toFixed(3)} E${(extrusionPerMM * perimeter * 0.25 + 0.5).toFixed(5)} ; Perimeter\n`;
    }

    // Infill based on layer (alternate patterns)
    if (layer % 2 === 0) {
      // Horizontal lines
      const infillSpacing = extrusionWidth * (100 / infillDensity) * 5;
      for (let y = startY + extrusionWidth * 4; y < startY + depth - extrusionWidth * 4; y += infillSpacing) {
        gcode += `G1 X${(startX + extrusionWidth * 4).toFixed(3)} Y${y.toFixed(3)} F3000 ; Move to infill start\n`;
        gcode += `G1 X${(startX + width - extrusionWidth * 4).toFixed(3)} Y${y.toFixed(3)} F${printSpeed * 60} E${(extrusionPerMM * (width - extrusionWidth * 8) + 0.5).toFixed(5)} ; Infill line\n`;
      }
    } else {
      // Vertical lines
      const infillSpacing = extrusionWidth * (100 / infillDensity) * 5;
      for (let x = startX + extrusionWidth * 4; x < startX + width - extrusionWidth * 4; x += infillSpacing) {
        gcode += `G1 X${x.toFixed(3)} Y${(startY + extrusionWidth * 4).toFixed(3)} F3000 ; Move to infill start\n`;
        gcode += `G1 X${x.toFixed(3)} Y${(startY + depth - extrusionWidth * 4).toFixed(3)} F${printSpeed * 60} E${(extrusionPerMM * (depth - extrusionWidth * 8) + 0.5).toFixed(5)} ; Infill line\n`;
      }
    }
  }

  return gcode;
};

// Helper function to generate G-code for a cylinder
const generateCylinderGCode = (
  element: any,
  layers: number,
  layerHeight: number,
  extrusionWidth: number,
  printSpeed: number,
  infillDensity: number,
  infillPattern: string
) => {
  let gcode = "";

  const radius = element.radius;

  // Calculate extrusion values
  const extrusionPerMM = (extrusionWidth * layerHeight) / (Math.PI * Math.pow(1.75 / 2, 2)); // Based on 1.75mm filament

  // For each layer
  for (let layer = 0; layer < layers; layer++) {
    const z = layerHeight * (layer + 1);

    gcode += `\n; Layer ${layer + 1}, Z=${z.toFixed(3)}\n`;
    gcode += `G1 Z${z.toFixed(3)} F3000 ; Move to new layer\n`;

    // Reset extruder position for this layer
    gcode += "G92 E0 ; Reset extruder position\n";

    // Perimeter - 2 shells
    for (let shell = 0; shell < 2; shell++) {
      const shellRadius = radius - shell * extrusionWidth;

      if (shellRadius <= 0) continue;

      // Calculate circumference
      const circumference = 2 * Math.PI * shellRadius;

      // Move to start of perimeter
      gcode += `G1 X${shellRadius.toFixed(3)} Y0 F3000 ; Move to perimeter start\n`;

      // Print circle (G2 = clockwise)
      gcode += `G1 F${printSpeed * 60} E0.5 ; Start extrusion\n`;
      gcode += `G2 X${shellRadius.toFixed(3)} Y0 I${(-shellRadius).toFixed(3)} J0 E${(extrusionPerMM * circumference + 0.5).toFixed(5)} ; Perimeter circle\n`;
    }

    // Infill based on layer pattern
    if (infillDensity > 0) {
      const infillRadius = radius - 2 * extrusionWidth;

      if (infillRadius <= 0) continue;

      if (layer % 2 === 0) {
        // Horizontal infill lines
        const infillSpacing = extrusionWidth * (100 / infillDensity) * 3;
        for (let y = -infillRadius + infillSpacing; y < infillRadius; y += infillSpacing) {
          // Calculate x position at this y
          const x = Math.sqrt(Math.max(0, Math.pow(infillRadius, 2) - Math.pow(y, 2)));

          if (x > 0) {
            gcode += `G1 X${(-x).toFixed(3)} Y${y.toFixed(3)} F3000 ; Move to infill start\n`;
            gcode += `G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${printSpeed * 60} E${(extrusionPerMM * 2 * x + 0.5).toFixed(5)} ; Infill line\n`;
          }
        }
      } else {
        // Vertical infill lines
        const infillSpacing = extrusionWidth * (100 / infillDensity) * 3;
        for (let x = -infillRadius + infillSpacing; x < infillRadius; x += infillSpacing) {
          // Calculate y position at this x
          const y = Math.sqrt(Math.max(0, Math.pow(infillRadius, 2) - Math.pow(x, 2)));

          if (y > 0) {
            gcode += `G1 X${x.toFixed(3)} Y${(-y).toFixed(3)} F3000 ; Move to infill start\n`;
            gcode += `G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${printSpeed * 60} E${(extrusionPerMM * 2 * y + 0.5).toFixed(5)} ; Infill line\n`;
          }
        }
      }
    }
  }

  return gcode;
};

// Helper function to generate G-code for a sphere
const generateSphereGCode = (
  element: any,
  layers: number,
  layerHeight: number,
  extrusionWidth: number,
  printSpeed: number,
  infillDensity: number,
  infillPattern: string
) => {
  let gcode = "";

  const radius = element.radius;

  // Calculate extrusion values
  const extrusionPerMM = (extrusionWidth * layerHeight) / (Math.PI * Math.pow(1.75 / 2, 2)); // Based on 1.75mm filament

  // Center points
  const centerZ = radius;

  // For each layer
  for (let layer = 0; layer < layers; layer++) {
    const z = layerHeight * (layer + 1);

    // Calculate radius at this layer using the sphere equation
    const distFromCenter = Math.abs(z - centerZ);
    const layerRadius = Math.sqrt(Math.max(0, Math.pow(radius, 2) - Math.pow(distFromCenter, 2)));

    if (layerRadius <= 0) continue;

    gcode += `\n; Layer ${layer + 1}, Z=${z.toFixed(3)}, Radius: ${layerRadius.toFixed(3)}\n`;
    gcode += `G1 Z${z.toFixed(3)} F3000 ; Move to new layer\n`;

    // Reset extruder position for this layer
    gcode += "G92 E0 ; Reset extruder position\n";

    // Perimeter - 2 shells
    for (let shell = 0; shell < 2; shell++) {
      const shellRadius = layerRadius - shell * extrusionWidth;

      if (shellRadius <= 0) continue;

      // Calculate circumference
      const circumference = 2 * Math.PI * shellRadius;

      // Move to start of perimeter
      gcode += `G1 X${shellRadius.toFixed(3)} Y0 F3000 ; Move to perimeter start\n`;

      // Print circle (G2 = clockwise)
      gcode += `G1 F${printSpeed * 60} E0.5 ; Start extrusion\n`;
      gcode += `G2 X${shellRadius.toFixed(3)} Y0 I${(-shellRadius).toFixed(3)} J0 E${(extrusionPerMM * circumference + 0.5).toFixed(5)} ; Perimeter circle\n`;
    }

    // Infill - scaled with sphere radius
    if (infillDensity > 0 && layerRadius > extrusionWidth * 3) {
      const infillRadius = layerRadius - 2 * extrusionWidth;

      // Alternate infill pattern
      if (layer % 2 === 0) {
        // Horizontal lines
        const infillSpacing = extrusionWidth * (100 / infillDensity) * 3;
        for (let y = -infillRadius + infillSpacing; y < infillRadius; y += infillSpacing) {
          // Calculate x position at this y for a circle
          const x = Math.sqrt(Math.max(0, Math.pow(infillRadius, 2) - Math.pow(y, 2)));

          if (x > 0) {
            gcode += `G1 X${(-x).toFixed(3)} Y${y.toFixed(3)} F3000 ; Move to infill start\n`;
            gcode += `G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${printSpeed * 60} E${(extrusionPerMM * 2 * x + 0.5).toFixed(5)} ; Infill line\n`;
          }
        }
      } else {
        // Radial lines from center for variety
        const segments = Math.max(8, Math.floor(infillDensity / 5) * 2);
        const angleStep = 360 / segments;

        for (let i = 0; i < segments; i++) {
          const angle = i * angleStep;
          const x = infillRadius * Math.cos((angle * Math.PI) / 180);
          const y = infillRadius * Math.sin((angle * Math.PI) / 180);

          gcode += `G1 X0 Y0 F3000 ; Move to center\n`;
          gcode += `G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${printSpeed * 60} E${(extrusionPerMM * infillRadius + 0.5).toFixed(5)} ; Infill line\n`;
        }
      }
    }
  }

  return gcode;
};
