// src/lib/3dPrinterElementUtils.ts
/**
 * Utility functions for 3D printing from CAD elements
 */

/**
 * Extract dimensions from a CAD element
 */
export const extractElementDimensions = (
  element: any
): {
  width: number;
  height: number;
  depth: number;
  volume: number;
} => {
  let width = 0,
    height = 0,
    depth = 0,
    volume = 0;

  switch (element.type) {
    case "cube":
      width = element.width || 10;
      height = element.height || 10;
      depth = element.depth || 10;
      volume = width * height * depth;
      break;
    case "sphere":
      width = element.radius * 2 || 10;
      height = element.radius * 2 || 10;
      depth = element.radius * 2 || 10;
      volume = (4 / 3) * Math.PI * Math.pow(element.radius, 3);
      break;
    case "cylinder":
      width = element.radius * 2 || 10;
      height = element.height || 10;
      depth = element.radius * 2 || 10;
      volume = Math.PI * Math.pow(element.radius, 2) * element.height;
      break;
    case "cone":
      width = element.radius * 2 || 10;
      height = element.height || 10;
      depth = element.radius * 2 || 10;
      volume = (1 / 3) * Math.PI * Math.pow(element.radius, 2) * element.height;
      break;
    case "rectangle":
      width = element.width || 10;
      height = 5; // Default extrusion height for 2D elements
      depth = element.height || 10; // In 3D printing, we'll extrude the 2D shape
      volume = width * height * depth;
      break;
    case "circle":
      width = element.radius * 2 || 10;
      height = 5; // Default extrusion height for 2D elements
      depth = element.radius * 2 || 10;
      volume = Math.PI * Math.pow(element.radius, 2) * height;
      break;
    case "polygon":
      // Approximation for polygon - using bounding box
      width = element.radius * 2 || 10;
      height = 5; // Default extrusion height for 2D elements
      depth = element.radius * 2 || 10;
      // Approximate volume based on number of sides
      const sides = element.sides || 6;
      const apothem = element.radius * Math.cos(Math.PI / sides);
      volume = sides * element.radius * apothem * height;
      break;
    case "pyramid":
      width = element.baseWidth || element.width || 10;
      height = element.height || 10;
      depth = element.baseDepth || element.depth || 10;
      volume = (1 / 3) * width * depth * height;
      break;
    case "hemisphere":
      width = element.radius * 2 || 10;
      height = element.radius || 10;
      depth = element.radius * 2 || 10;
      volume = (2 / 3) * Math.PI * Math.pow(element.radius, 3);
      break;
    case "prism":
      width = element.radius * 2 || 10;
      height = element.height || 10;
      depth = element.radius * 2 || 10;
      // Approximate volume based on number of sides
      const prismSides = element.sides || 6;
      const prismApothem = element.radius * Math.cos(Math.PI / prismSides);
      volume = prismSides * element.radius * prismApothem * height;
      break;
    case "ellipsoid":
      width = (element.radiusX || element.width / 2 || 5) * 2;
      height = (element.radiusZ || element.depth / 2 || 5) * 2;
      depth = (element.radiusY || element.height / 2 || 5) * 2;
      volume = (4 / 3) * Math.PI * (width / 2) * (depth / 2) * (height / 2);
      break;
    case "capsule":
      width = element.radius * 2 || 10;
      height = element.height || 15;
      depth = element.radius * 2 || 10;
      // Volume = cylinder + two hemispheres
      volume =
        Math.PI * Math.pow(element.radius, 2) * (height - 2 * element.radius) +
        (4 / 3) * Math.PI * Math.pow(element.radius, 3);
      break;
    case "extrude":
      if (element.shapeType === "rectangle" || element.baseShape?.type === "rectangle") {
        width = element.width || element.baseShape?.width || 10;
        height = element.height || 10;
        depth = element.length || element.baseShape?.length || 10;
        volume = width * height * depth;
      } else if (element.shapeType === "circle" || element.baseShape?.type === "circle") {
        const radius = element.radius || element.baseShape?.radius || 5;
        width = radius * 2;
        height = element.height || 10;
        depth = radius * 2;
        volume = Math.PI * Math.pow(radius, 2) * height;
      } else {
        width = 10;
        height = 10;
        depth = 10;
        volume = 1000;
      }
      break;
    default:
      // Default dimensions for unsupported elements
      width = 10;
      height = 10;
      depth = 10;
      volume = 1000;
  }

  return { width, height, depth, volume };
};

/**
 * Calculate optimal 3D printing parameters based on element geometry
 */
export const calculateOptimal3DPrintSettings = (
  element: any,
  infillDensity: number,
  printResolution: "standard" | "high" | "low",
  shellCount: number
) => {
  const { width, height, depth, volume } = extractElementDimensions(element);
  const maxDimension = Math.max(width, depth);

  // Calculate optimal layer height based on element size and complexity
  let optLayerHeight: number;
  if (printResolution === "high") {
    optLayerHeight = 0.1; // Fine detail
  } else if (printResolution === "low") {
    optLayerHeight = 0.3; // Fast printing
  } else {
    // Standard resolution - adaptive based on height
    optLayerHeight = Math.min(0.2, Math.max(0.12, height / 100));
  }

  // Calculate optimal print speed based on element geometry
  let optPrintSpeed: number;
  switch (element.type) {
    case "sphere":
    case "cone":
    case "ellipsoid":
    case "capsule":
      // Complex curved surfaces need slower printing
      optPrintSpeed = 40;
      break;
    case "cube":
    case "rectangle":
    case "prism":
      // Simple geometry can print faster
      optPrintSpeed = 60;
      break;
    default:
      optPrintSpeed = 50; // Default speed
  }

  // Calculate optimal infill based on volume and strength needs
  let optInfillDensity = infillDensity;
  if (volume > 50000) {
    // Large volume
    optInfillDensity = Math.min(infillDensity, 15); // Reduce infill to save material
  } else if (volume < 5000) {
    // Small volume
    optInfillDensity = Math.max(infillDensity, 30); // Increase infill for strength
  }

  // Calculate optimal shell count
  let optShellCount = shellCount;
  if (maxDimension < 10) {
    optShellCount = Math.max(2, shellCount); // Minimum 2 shells for small parts
  } else if (maxDimension > 100) {
    optShellCount = Math.max(3, shellCount); // Minimum 3 shells for large parts
  }

  return {
    layerHeight: optLayerHeight,
    printSpeed: optPrintSpeed,
    infillDensity: optInfillDensity,
    shellCount: optShellCount
  };
};

/**
 * Helper function to calculate extrusion amount for a given distance
 */
export const calculateExtrusion = (
  distance: number,
  layerHeight: number,
  extrusionWidth: number,
  filamentDiameter: number,
  multiplier: number = 1
) => {
  // Calculate the volume of filament needed
  const filamentArea = Math.PI * Math.pow(filamentDiameter / 2, 2);
  const extrusionArea = extrusionWidth * layerHeight;
  const extrusionMultiplier = (extrusionArea / filamentArea) * multiplier;

  return distance * extrusionMultiplier;
};

/**
 * Estimate print time for an element
 */
export const estimatePrintTime = (
  element: any,
  layerHeight: number,
  printSpeed: number,
  infillDensity: number,
  supportType: "none" | "minimal" | "full",
  shellCount: number
) => {
  const { width, height, depth, volume } = extractElementDimensions(element);

  // Factors affecting print time
  const layerChangeFactor = layerHeight === 0.1 ? 1.3 : layerHeight === 0.2 ? 1.0 : 0.7;
  const infillFactor = infillDensity / 20; // 20% is baseline
  const supportFactor = supportType === "none" ? 1.0 : supportType === "minimal" ? 1.3 : 1.7;

  // Base time calculation - very rough estimate
  const printSpeedMmPerMin = printSpeed * 60;
  const layerCount = Math.ceil(height / layerHeight);
  const shellLength = (width + depth) * 2 * shellCount;
  const infillLength = (width * depth * (infillDensity / 100)) / layerHeight;

  const timePerLayer = (shellLength + infillLength) / printSpeedMmPerMin;
  const totalTime = timePerLayer * layerCount * layerChangeFactor * supportFactor;

  return Math.round(totalTime);
};

/**
 * Estimate material usage in grams
 */
export const estimateMaterialUsage = (
  element: any,
  infillDensity: number,
  shellCount: number,
  supportType: "none" | "minimal" | "full",
  material: string
) => {
  const { volume } = extractElementDimensions(element);

  // Factors affecting material usage
  const infillFactor = infillDensity / 100;
  const shellFactor = shellCount / 2; // 2 shells is baseline
  const supportFactor = supportType === "none" ? 1.0 : supportType === "minimal" ? 1.2 : 1.5;

  // Filament density (g/cm³)
  const filamentDensity = material === "plastic" ? 1.24 : 1.1;

  // Calculate material volume needed
  const effectiveVolume = volume * (0.2 + infillFactor * 0.8) * shellFactor * supportFactor;

  // Convert to grams
  const materialWeight = (effectiveVolume / 1000) * filamentDensity;

  return Math.round(materialWeight * 10) / 10; // Round to one decimal place
};
