// src/lib/genericToolpathUtils.ts
import { Element } from 'src/store/elementsStore';
import { extractElementGeometry, ElementGeometry, getElementDepth } from './elementGeometryUtils';

/**
 * Generate a generic toolpath for any element based on its geometry
 * @param element The element to generate a toolpath for
 * @param settings The toolpath generation settings
 * @returns G-code string for the element
 */
export function generateGenericToolpath(element: Element, settings: any): string {
  // Extract element geometry
  const geometry = extractElementGeometry(element);
  
  // Generate appropriate toolpath based on element geometry
  if (geometry.radius !== undefined && (geometry.elementType === 'circle' || geometry.elementType.includes('sphere'))) {
    return generateCircularContourToolpath(geometry, settings);
  } else if (geometry.path && geometry.path.length > 0) {
    return generatePathToolpath(geometry, settings);
  } else if (geometry.width && geometry.height) {
    return generateRectangularContourToolpath(geometry, settings);
  } else {
    // Default to bounding box if no specific geometry can be determined
    return generateBoundingBoxToolpath(geometry, settings);
  }
}

/**
 * Generate G-code for a circular contour
 */
function generateCircularContourToolpath(geometry: ElementGeometry, settings: any): string {
  const { radius, center } = geometry;
  if (!radius) return '; Error: No radius defined for circular element\n';
  
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  // Calculate offset distance based on selected offset type
  let effectiveRadius = radius;
  if (offset === 'inside') {
    effectiveRadius = Math.max(0, radius - toolDiameter / 2);
  } else if (offset === 'outside') {
    effectiveRadius = radius + toolDiameter / 2;
  }
  
  if (effectiveRadius <= 0) {
    return `; Cannot generate toolpath: radius (${radius}mm) too small for tool diameter (${toolDiameter}mm) with inside offset\n`;
  }
  
  let gcode = `; Generic circular contour: ${geometry.elementType} at (${center.x}, ${center.y}, ${center.z}), radius ${radius}mm\n`;
  
  // Determine the machining depth based on element type
  const elementDepth = getElementDepth(geometry.originalElement);
  const machiningDepth = Math.min(depth, elementDepth);
  
  // For each Z level
  for (let z = 0; z > -machiningDepth; z -= stepdown) {
    const currentZ = Math.max(-machiningDepth, z);
    const actualZ = center.z + currentZ;
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
    
    // Move to start point on circle
    gcode += `G0 X${(center.x + effectiveRadius).toFixed(3)} Y${center.y.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Full circle - I and J are relative offsets from current position to center
    if (direction === 'climb') {
      gcode += `G3 X${(center.x + effectiveRadius).toFixed(3)} Y${center.y.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Clockwise full circle\n`;
    } else {
      gcode += `G2 X${(center.x + effectiveRadius).toFixed(3)} Y${center.y.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Counter-clockwise full circle\n`;
    }
  }
  
  return gcode;
}

/**
 * Generate G-code for a path-based contour (like polygon or complex shape)
 */
function generatePathToolpath(geometry: ElementGeometry, settings: any): string {
  const { path, center, elementType } = geometry;
  if (!path || path.length < 2) return '; Error: Path has too few points\n';
  
  const { depth, stepdown, feedrate, plungerate, direction } = settings;
  
  let gcode = `; Generic path contour: ${elementType} at (${center.x}, ${center.y}, ${center.z})\n`;
  
  // Determine the machining depth based on element type
  const elementDepth = getElementDepth(geometry.originalElement);
  const machiningDepth = Math.min(depth, elementDepth);
  
  // For each Z level
  for (let z = 0; z > -machiningDepth; z -= stepdown) {
    const currentZ = Math.max(-machiningDepth, z);
    const actualZ = center.z + currentZ;
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
    
    // Prepare path points
    let pathPoints = [...path];
    
    // If direction is conventional (reverse path)
    if (direction === 'conventional') {
      pathPoints = pathPoints.slice().reverse();
    }
    
    // Move to first point
    gcode += `G0 X${pathPoints[0].x.toFixed(3)} Y${pathPoints[0].y.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Follow path
    for (let i = 1; i < pathPoints.length; i++) {
      const point = pathPoints[i];
      gcode += `G1 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} F${feedrate} ; Path point ${i}\n`;
    }
  }
  
  return gcode;
}

/**
 * Generate G-code for a rectangular contour
 */
function generateRectangularContourToolpath(geometry: ElementGeometry, settings: any): string {
  const { width, height, center, elementType } = geometry;
  if (!width || !height) return '; Error: No dimensions defined for rectangular element\n';
  
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  // Calculate offset distance based on selected offset type
  let offsetDistance = 0;
  if (offset === 'inside') {
    offsetDistance = -toolDiameter / 2;
  } else if (offset === 'outside') {
    offsetDistance = toolDiameter / 2;
  }
  
  // Calculate rectangle coordinates with offset
  const rectWidth = width + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
  const rectHeight = height + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
  
  if (rectWidth <= 0 || rectHeight <= 0) {
    return `; Cannot generate toolpath: dimensions (${width}x${height}mm) too small for tool diameter (${toolDiameter}mm) with inside offset\n`;
  }
  
  let gcode = `; Generic rectangular contour: ${elementType} at (${center.x}, ${center.y}, ${center.z}), size ${width}x${height}mm\n`;
  
  // Determine the machining depth based on element type
  const elementDepth = getElementDepth(geometry.originalElement);
  const machiningDepth = Math.min(depth, elementDepth);
  
  // Calculate rectangle corners
  const halfWidth = rectWidth / 2;
  const halfHeight = rectHeight / 2;
  
  // For each Z level
  for (let z = 0; z > -machiningDepth; z -= stepdown) {
    const currentZ = Math.max(-machiningDepth, z);
    const actualZ = center.z + currentZ;
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
    
    // Define rectangle corners
    const corners = [
      { x: center.x - halfWidth, y: center.y - halfHeight },
      { x: center.x + halfWidth, y: center.y - halfHeight },
      { x: center.x + halfWidth, y: center.y + halfHeight },
      { x: center.x - halfWidth, y: center.y + halfHeight },
      { x: center.x - halfWidth, y: center.y - halfHeight } // Close the loop
    ];
    
    // Reverse for conventional milling
    const cornerPoints = direction === 'conventional' ? [...corners].reverse() : corners;
    
    // Move to first corner
    gcode += `G0 X${cornerPoints[0].x.toFixed(3)} Y${cornerPoints[0].y.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Move through all corners
    for (let i = 1; i < cornerPoints.length; i++) {
      gcode += `G1 X${cornerPoints[i].x.toFixed(3)} Y${cornerPoints[i].y.toFixed(3)} F${feedrate} ; Corner ${i}\n`;
    }
  }
  
  return gcode;
}

/**
 * Generate G-code using the bounding box when no specific geometry can be determined
 */
function generateBoundingBoxToolpath(geometry: ElementGeometry, settings: any): string {
  const { boundingBox, center, elementType } = geometry;
  if (!boundingBox) return '; Error: No bounding box defined for element\n';
  
  const { width = 0, height = 0 } = boundingBox;
  if (width <= 0 || height <= 0) return '; Error: Invalid bounding box dimensions\n';
  
  // Use rectangular contour for the bounding box
  return generateRectangularContourToolpath({
    ...geometry,
    width,
    height
  }, settings);
}

/**
 * Analyzes the element to suggest appropriate machining parameters
 * @param element The element to analyze
 * @returns Suggested parameters object
 */
export function suggestMachiningParameters(element: Element): any {
  const geometry = extractElementGeometry(element);
  const suggestions: any = {};
  
  // Suggest depth based on element type
  suggestions.depth = getElementDepth(element);
  
  // Suggest stepdown based on element dimensions
  const maxDimension = Math.max(
    geometry.width || 0,
    geometry.height || 0,
    geometry.depth || 0,
    geometry.radius ? geometry.radius * 2 : 0
  );
  
  if (maxDimension > 100) {
    suggestions.stepdown = 2.0; // Larger steps for bigger parts
  } else if (maxDimension > 50) {
    suggestions.stepdown = 1.0; // Medium steps
  } else {
    suggestions.stepdown = 0.5; // Small steps for detailed parts
  }
  
  // Suggest operation type based on element type
  if (geometry.elementType.includes('circle') || geometry.elementType.includes('sphere')) {
    suggestions.operationType = 'contour';
  } else if (
    geometry.elementType.includes('rectangle') || 
    geometry.elementType.includes('cube') || 
    geometry.elementType.includes('polygon')
  ) {
    // For closed shapes with interior, pocket can be appropriate
    suggestions.operationType = 'pocket';
  } else if (geometry.elementType.includes('line')) {
    suggestions.operationType = 'profile';
  } else {
    // Default to contour for unknown shapes
    suggestions.operationType = 'contour';
  }
  
  return suggestions;
}