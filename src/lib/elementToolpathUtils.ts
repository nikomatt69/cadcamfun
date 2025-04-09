/**
 * Utility functions to generate toolpaths from various element types
 */

/**
 * Generate toolpath for a pyramid element
 */
export function generatePyramidToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  let gcode = `; Pyramid: center (${element.x}, ${element.y}, ${element.z}), base width ${element.baseWidth || element.width}mm, base depth ${element.baseDepth || element.depth}mm, height ${element.height}mm\n`;
  
  // Calculate offset distance based on selected offset type
  let offsetDistance = 0;
  if (offset === 'inside') {
    offsetDistance = -toolDiameter / 2;
  } else if (offset === 'outside') {
    offsetDistance = toolDiameter / 2;
  }
  
  // Get base dimensions
  const baseWidth = element.baseWidth || element.width || 50;
  const baseDepth = element.baseDepth || element.depth || 50;
  const height = element.height || 50;
  
  // Calculate the top Z of the pyramid
  const topZ = element.z + height / 2;
  const bottomZ = element.z - height / 2;
  
  // For each Z level from top to bottom
  for (let z = 0; z > -Math.min(depth, height); z -= stepdown) {
    const currentZ = Math.max(-Math.min(depth, height), z);
    const actualZ = topZ + currentZ;
    
    // Calculate the slice dimensions at this Z level
    // As we move down from the top, the slice gets larger
    const ratio = 1 - (actualZ - bottomZ) / height;
    const sliceWidth = baseWidth * ratio;
    const sliceDepth = baseDepth * ratio;
    
    // Calculate the corners of this slice
    const halfSliceWidth2 = sliceWidth / 2;
    const halfSliceDepth = sliceDepth / 2;
    
    // Apply offset to the slice dimensions
    const offsetWidth = sliceWidth + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
    const offsetDepth = sliceDepth + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
    
    // Skip if dimensions are too small
    if (offsetWidth <= 0 || offsetDepth <= 0) {
      gcode += `\n; Z Level: ${actualZ.toFixed(3)} - Offset dimensions too small, skipping\n`;
      continue;
    }
    
    const halfOffsetWidth = offsetWidth / 2;
    const halfOffsetDepth = offsetDepth / 2;
    
    // Start point
    const startX = element.x - halfOffsetWidth;
    const startY = element.y - halfOffsetDepth;
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}, Slice width: ${offsetWidth.toFixed(3)}, Slice depth: ${offsetDepth.toFixed(3)}\n`;
    gcode += `G0 X${startX.toFixed(3)} Y${startY.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Contour of the slice (rectangular)
    const corners = [
      [startX, startY],
      [startX + offsetWidth, startY],
      [startX + offsetWidth, startY + offsetDepth],
      [startX, startY + offsetDepth],
      [startX, startY] // Close the loop
    ];
    
    // Reverse order for conventional milling
    if (direction === 'conventional') {
      corners.reverse();
    }
    
    for (let i = 0; i < corners.length; i++) {
      gcode += `G1 X${corners[i][0].toFixed(3)} Y${corners[i][1].toFixed(3)} F${feedrate} ; Corner ${i+1}\n`;
    }
  }
  
  return gcode;
}

/**
 * Generate toolpath for a hemisphere element
 */
export function generateHemisphereToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction: millingDirection } = settings;
  
  let gcode = `; Hemisphere: center (${element.x}, ${element.y}, ${element.z}), radius ${element.radius}mm, direction ${element.direction || 'up'}\n`;
  
  // Get hemisphere properties
  const radius = element.radius || 25;
  const hemisphereDirection = element.direction || 'up'; // 'up' or 'down'
  
  // Determine the Z extents of the hemisphere
  let topZ, bottomZ;
  if (hemisphereDirection === 'up') {
    topZ = element.z + radius;
    bottomZ = element.z;
  } else {
    topZ = element.z;
    bottomZ = element.z - radius;
  }
  
  // For each Z level from top to bottom
  for (let z = 0; z > -Math.min(depth, radius); z -= stepdown) {
    const currentZ = Math.max(-Math.min(depth, radius), z);
    const actualZ = topZ + currentZ;
    
    // Skip if we're below the hemisphere
    if (actualZ < bottomZ) {
      continue;
    }
    
    // Calculate radius at this height using the sphere equation
    const distanceFromCenter = Math.abs(actualZ - (hemisphereDirection === 'up' ? element.z : element.z));
    const radiusAtHeight = Math.sqrt(Math.max(0, Math.pow(radius, 2) - Math.pow(distanceFromCenter, 2)));
    
    // Apply offset to the radius
    let effectiveRadius = radiusAtHeight;
    if (offset === 'inside') {
      effectiveRadius -= toolDiameter / 2;
    } else if (offset === 'outside') {
      effectiveRadius += toolDiameter / 2;
    }
    
    // Skip if radius is too small
    if (effectiveRadius <= 0) {
      gcode += `\n; Z Level: ${actualZ.toFixed(3)} - Radius too small, skipping\n`;
      continue;
    }
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}, Radius: ${effectiveRadius.toFixed(3)}\n`;
    
    // Move to start point on circle
    gcode += `G0 X${(element.x + effectiveRadius).toFixed(3)} Y${element.y.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Full circle
    if (millingDirection === 'climb') {
      gcode += `G3 X${(element.x + effectiveRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Clockwise full circle\n`;
    } else {
      gcode += `G2 X${(element.x + effectiveRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Counter-clockwise full circle\n`;
    }
  }
  
  return gcode;
}

/**
 * Generate toolpath for a prism element
 */
export function generatePrismToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  let gcode = `; Prism: center (${element.x}, ${element.y}, ${element.z}), radius ${element.radius}mm, height ${element.height}mm, sides ${element.sides || 6}\n`;
  
  // Get prism properties
  const radius = element.radius || 25;
  const height = element.height || 50;
  const sides = element.sides || 6;
  
  // Calculate the top Z of the prism
  const topZ = element.z + height / 2;
  const bottomZ = element.z - height / 2;
  
  // Apply offset to the radius
  let effectiveRadius = radius;
  if (offset === 'inside') {
    effectiveRadius -= toolDiameter / 2;
  } else if (offset === 'outside') {
    effectiveRadius += toolDiameter / 2;
  }
  
  // Skip if radius is too small
  if (effectiveRadius <= 0) {
    return `; Prism radius after offset too small, cannot generate toolpath\n`;
  }
  
  // For each Z level from top to bottom
  for (let z = 0; z > -Math.min(depth, height); z -= stepdown) {
    const currentZ = Math.max(-Math.min(depth, height), z);
    const actualZ = topZ + currentZ;
    
    // Skip if we're below the prism
    if (actualZ < bottomZ) {
      continue;
    }
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
    
    // Generate points for the polygon representing the prism cross-section
    const points = [];
    for (let i = 0; i < sides; i++) {
      const angle = i * (2 * Math.PI / sides);
      const x = element.x + effectiveRadius * Math.cos(angle);
      const y = element.y + effectiveRadius * Math.sin(angle);
      points.push([x, y]);
    }
    points.push(points[0]); // Close the loop
    
    // Reverse for conventional milling if needed
    if (direction === 'conventional') {
      points.reverse();
    }
    
    // Move to first point
    gcode += `G0 X${points[0][0].toFixed(3)} Y${points[0][1].toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Move along the polygon
    for (let i = 1; i < points.length; i++) {
      gcode += `G1 X${points[i][0].toFixed(3)} Y${points[i][1].toFixed(3)} F${feedrate} ; Point ${i}\n`;
    }
  }
  
  return gcode;
}

/**
 * Generate toolpath for an ellipsoid element
 */
export function generateEllipsoidToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  let gcode = `; Ellipsoid: center (${element.x}, ${element.y}, ${element.z}), radiusX ${element.radiusX || element.radius}mm, radiusY ${element.radiusY || element.radius}mm, radiusZ ${element.radiusZ || element.radius}mm\n`;
  
  // Get ellipsoid properties
  const radiusX = element.radiusX || element.radius || 25;
  const radiusY = element.radiusY || element.radius || 25;
  const radiusZ = element.radiusZ || element.radius || 25;
  
  // For an ellipsoid, we cut it in slices similar to sphere but with scaled dimensions
  // The number of Z levels depends on the depth and stepdown
  
  // Calculate the top and bottom Z of the ellipsoid
  const topZ = element.z + radiusZ;
  const bottomZ = element.z - radiusZ;
  
  // For each Z level from top to bottom
  for (let z = 0; z > -Math.min(depth, radiusZ * 2); z -= stepdown) {
    const currentZ = Math.max(-Math.min(depth, radiusZ * 2), z);
    const actualZ = topZ + currentZ;
    
    // Skip if we're below the ellipsoid
    if (actualZ < bottomZ) {
      continue;
    }
    
    // Calculate the ratio of distance from center to radius
    const zRatio = Math.abs(actualZ - element.z) / radiusZ;
    
    // If we're outside the ellipsoid, skip
    if (zRatio > 1) {
      continue;
    }
    
    // Calculate radiusX and radiusY at this height using the ellipsoid equation
    // For an ellipsoid: (x/a)² + (y/b)² + (z/c)² = 1
    // At a given z, the slice is an ellipse with scaled radii:
    const scale = Math.sqrt(1 - Math.pow(zRatio, 2));
    const radiusXAtHeight = radiusX * scale;
    const radiusYAtHeight = radiusY * scale;
    
    // Apply offset to the radius
    let effectiveRadiusX = radiusXAtHeight;
    let effectiveRadiusY = radiusYAtHeight;
    
    if (offset === 'inside') {
      effectiveRadiusX -= toolDiameter / 2;
      effectiveRadiusY -= toolDiameter / 2;
    } else if (offset === 'outside') {
      effectiveRadiusX += toolDiameter / 2;
      effectiveRadiusY += toolDiameter / 2;
    }
    
    // Skip if either radius is too small
    if (effectiveRadiusX <= 0 || effectiveRadiusY <= 0) {
      gcode += `\n; Z Level: ${actualZ.toFixed(3)} - Radius too small, skipping\n`;
      continue;
    }
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}, RadiusX: ${effectiveRadiusX.toFixed(3)}, RadiusY: ${effectiveRadiusY.toFixed(3)}\n`;
    
    // Generate points for the ellipse
    const numPoints = Math.max(12, Math.ceil(Math.PI * (effectiveRadiusX + effectiveRadiusY)));
    const points = [];
    
    for (let i = 0; i <= numPoints; i++) {
      const angle = i * (2 * Math.PI / numPoints);
      const x = element.x + effectiveRadiusX * Math.cos(angle);
      const y = element.y + effectiveRadiusY * Math.sin(angle);
      points.push([x, y]);
    }
    
    // Reverse direction for conventional milling if needed
    if (direction === 'conventional') {
      points.reverse();
    }
    
    // Move to first point
    gcode += `G0 X${points[0][0].toFixed(3)} Y${points[0][1].toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Move along the ellipse
    for (let i = 1; i < points.length; i++) {
      gcode += `G1 X${points[i][0].toFixed(3)} Y${points[i][1].toFixed(3)} F${feedrate} ; Point ${i}\n`;
    }
  }
  
  return gcode;
}

/**
 * Generate toolpath for a capsule element
 */
export function generateCapsuleToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  let gcode = `; Capsule: center (${element.x}, ${element.y}, ${element.z}), radius ${element.radius}mm, height ${element.height}mm, orientation ${element.orientation || 'z'}\n`;
  
  // Get capsule properties
  const radius = element.radius || 25;
  const height = element.height || 100;
  const orientation = element.orientation || 'z'; // 'x', 'y', or 'z'
  
  // The capsule consists of a cylinder with hemispheres at both ends
  // We'll generate toolpaths for slices along the main axis
  
  // Calculate half height (excluding hemispheres)
  const halfCylinderHeight = Math.max(0, (height - radius * 2) / 2);
  
  // Full height of the capsule
  const fullHeight = 2 * radius + 2 * halfCylinderHeight;
  
  // Calculate the minimum and maximum points along the main axis
  let minX, maxX, minY, maxY, minZ, maxZ;
  
  if (orientation === 'x') {
    minX = element.x - halfCylinderHeight - radius;
    maxX = element.x + halfCylinderHeight + radius;
    minY = element.y - radius;
    maxY = element.y + radius;
    minZ = element.z - radius;
    maxZ = element.z + radius;
  } else if (orientation === 'y') {
    minX = element.x - radius;
    maxX = element.x + radius;
    minY = element.y - halfCylinderHeight - radius;
    maxY = element.y + halfCylinderHeight + radius;
    minZ = element.z - radius;
    maxZ = element.z + radius;
  } else { // 'z' orientation (default)
    minX = element.x - radius;
    maxX = element.x + radius;
    minY = element.y - radius;
    maxY = element.y + radius;
    minZ = element.z - halfCylinderHeight - radius;
    maxZ = element.z + halfCylinderHeight + radius;
  }
  
  // Apply offset to radius
  let effectiveRadius = radius;
  if (offset === 'inside') {
    effectiveRadius -= toolDiameter / 2;
  } else if (offset === 'outside') {
    effectiveRadius += toolDiameter / 2;
  }
  
  // Skip if radius is too small
  if (effectiveRadius <= 0) {
    return `; Capsule radius after offset too small, cannot generate toolpath\n`;
  }
  
  // Generate slices based on the orientation
  if (orientation === 'z') {
    // Slices perpendicular to Z axis
    for (let z = 0; z > -Math.min(depth, fullHeight); z -= stepdown) {
      const currentZ = Math.max(-Math.min(depth, fullHeight), z);
      const actualZ = maxZ + currentZ;
      
      // Skip if we're below the capsule
      if (actualZ < minZ) {
        continue;
      }
      
      // Determine what type of slice this is (top hemisphere, cylinder, or bottom hemisphere)
      let sliceRadius = effectiveRadius;
      
      if (actualZ > element.z + halfCylinderHeight) {
        // Top hemisphere
        const distFromTop = maxZ - actualZ;
        sliceRadius = calculateHemisphereRadius(radius, distFromTop);
      } else if (actualZ < element.z - halfCylinderHeight) {
        // Bottom hemisphere
        const distFromBottom = actualZ - minZ;
        sliceRadius = calculateHemisphereRadius(radius, distFromBottom);
      }
      
      // Apply offset
      if (offset === 'inside') {
        sliceRadius = Math.max(0, sliceRadius - toolDiameter / 2);
      } else if (offset === 'outside') {
        sliceRadius = sliceRadius + toolDiameter / 2;
      }
      
      // Skip if radius is too small
      if (sliceRadius <= 0) {
        gcode += `\n; Z Level: ${actualZ.toFixed(3)} - Radius too small, skipping\n`;
        continue;
      }
      
      gcode += `\n; Z Level: ${actualZ.toFixed(3)}, Radius: ${sliceRadius.toFixed(3)}\n`;
      
      // Move to start point on circle
      gcode += `G0 X${(element.x + sliceRadius).toFixed(3)} Y${element.y.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
      gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
      
      // Full circle
      if (direction === 'climb') {
        gcode += `G3 X${(element.x + sliceRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-sliceRadius).toFixed(3)} J0 F${feedrate} ; Clockwise full circle\n`;
      } else {
        gcode += `G2 X${(element.x + sliceRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-sliceRadius).toFixed(3)} J0 F${feedrate} ; Counter-clockwise full circle\n`;
      }
    }
  } else if (orientation === 'x' || orientation === 'y') {
    // For X or Y oriented capsules, we'd use a different approach
    // This is a simplified approach, cutting circles perpendicular to Z axis
    const sliceAxis = orientation === 'x' ? 'X' : 'Y';
    const axisCoord = orientation === 'x' ? element.x : element.y;
    const axisMin = orientation === 'x' ? minX : minY;
    const axisMax = orientation === 'x' ? maxX : maxY;
    
    // For each Z level
    for (let z = 0; z > -Math.min(depth, 2 * radius); z -= stepdown) {
      const currentZ = Math.max(-Math.min(depth, 2 * radius), z);
      const actualZ = element.z + radius + currentZ;
      
      // Skip if too deep
      if (actualZ < element.z - radius) {
        continue;
      }
      
      gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
      
      // For each position along the main axis
      const axisStepSize = Math.min(radius/2, stepdown); // Use smaller steps for smoother results
      for (let pos = axisMin; pos <= axisMax; pos += axisStepSize) {
        // Determine radius at this position
        let sliceRadius = effectiveRadius;
        
        if (pos < axisCoord - halfCylinderHeight) {
          // First hemisphere
          const distFromEdge = Math.abs(pos - (axisCoord - halfCylinderHeight));
          sliceRadius = calculateHemisphereRadius(radius, distFromEdge);
        } else if (pos > axisCoord + halfCylinderHeight) {
          // Second hemisphere
          const distFromEdge = Math.abs(pos - (axisCoord + halfCylinderHeight));
          sliceRadius = calculateHemisphereRadius(radius, distFromEdge);
        }
        
        // Skip if radius is too small
        if (sliceRadius <= 0) {
          continue;
        }
        
        gcode += `; ${sliceAxis} Position: ${pos.toFixed(3)}, Radius: ${sliceRadius.toFixed(3)}\n`;
        
        // Calculate position
        const xPos = orientation === 'x' ? pos : element.x;
        const yPos = orientation === 'y' ? pos : element.y;
        
        // Move to position above
        gcode += `G0 X${xPos.toFixed(3)} Y${yPos.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above position\n`;
        gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
        
        // Point drilling
        gcode += `G0 Z${(actualZ + 5).toFixed(3)} ; Retract\n`;
      }
    }
  }
  
  return gcode;
}

// Helper function to calculate radius of a hemisphere slice
function calculateHemisphereRadius(radius: number, distance: number): number {
  if (distance >= radius) return 0;
  // Pythagoras: r² = R² - h²
  return Math.sqrt(Math.pow(radius, 2) - Math.pow(distance, 2));
}

/**
 * Generate toolpath for a triangle element
 */
export function generateTriangleToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  // Check if we have valid triangle points or coordinates
  let points = element.points || [];
  let hasValidPoints = points.length >= 3;
  
  if (!hasValidPoints && element.x !== undefined && element.y !== undefined) {
    // If we don't have points but have center and dimensions, create an equilateral triangle
    const size = element.size || 50;
    const halfSize = size / 2;
    
    // Create equilateral triangle points centered at (x,y)
    points = [
      { x: element.x, y: element.y + halfSize },
      { x: element.x - halfSize * Math.cos(Math.PI/6), y: element.y - halfSize * Math.sin(Math.PI/6) },
      { x: element.x + halfSize * Math.cos(Math.PI/6), y: element.y - halfSize * Math.sin(Math.PI/6) }
    ];
    hasValidPoints = true;
  }
  
  if (!hasValidPoints) {
    return "; Triangle: Invalid or missing point data\n";
  }
  
  let gcode = "; Triangle toolpath\n";
  
  // Find the Z range
  const zValues = points.map((p: {x: number, y: number, z?: number}) => p.z || 0);
  const minZ = Math.min(...zValues);
  const maxZ = Math.max(...zValues);
  
  // Convert to XY coordinate pairs for the polygon
  const trianglePoints = points.map((p: {x: number, y: number, z?: number}) => [p.x, p.y]);
  trianglePoints.push(trianglePoints[0]); // Close the loop
  
  // For each Z level from top to bottom
  for (let z = 0; z > -depth; z -= stepdown) {
    const currentZ = Math.max(-depth, z);
    const actualZ = maxZ + currentZ;
    
    // Skip if below the triangle
    if (actualZ < minZ) {
      continue;
    }
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
    
    // Apply offset if needed
    let effectivePoints = trianglePoints;
    if (offset !== 'center') {
      const newOffsetPoints = offsetPolygon(trianglePoints, offset === 'outside' ? toolDiameter / 2 : -toolDiameter / 2);
      if (newOffsetPoints) {
        effectivePoints = newOffsetPoints;
      } else {
        gcode += "; Offset calculation failed, using original points\n";
      }
    }
    
    // Reverse for conventional milling if needed
    if (direction === 'conventional') {
      effectivePoints.reverse();
    }
    
    // Move to first point
    gcode += `G0 X${effectivePoints[0][0].toFixed(3)} Y${effectivePoints[0][1].toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Move along the triangle
    for (let i = 1; i < effectivePoints.length; i++) {
      gcode += `G1 X${effectivePoints[i][0].toFixed(3)} Y${effectivePoints[i][1].toFixed(3)} F${feedrate} ; Point ${i}\n`;
    }
  }
  
  return gcode;
}

// Helper function to offset a polygon
// This is a simple implementation - for complex polygons or sharp angles, a more robust algorithm might be needed
function offsetPolygon(points: number[][], offsetDistance: number): number[][] | null {
  // Need at least 3 points for a polygon
  if (points.length < 3) {
    return null;
  }
  
  const result = [];
  const n = points.length;
  
  for (let i = 0; i < n - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const prev = i > 0 ? points[i - 1] : points[n - 2]; // Previous point, wrapping around
    
    // Calculate normals
    let nx1 = 0, ny1 = 0, nx2 = 0, ny2 = 0;
    
    // Normal of prev->curr
    if (i > 0) {
      const dx = curr[0] - prev[0];
      const dy = curr[1] - prev[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        nx1 = -dy / len;
        ny1 = dx / len;
      }
    }
    
    // Normal of curr->next
    const dx = next[0] - curr[0];
    const dy = next[1] - curr[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      nx2 = -dy / len;
      ny2 = dx / len;
    }
    
    // Average normal
    const nx = (nx1 + nx2) / 2;
    const ny = (ny1 + ny2) / 2;
    const nLen = Math.sqrt(nx * nx + ny * ny);
    
    // Apply offset
    if (nLen > 0) {
      const ox = curr[0] + offsetDistance * (nx / nLen);
      const oy = curr[1] + offsetDistance * (ny / nLen);
      result.push([ox, oy]);
    } else {
      // Fallback if normal calculation fails
      result.push([curr[0], curr[1]]);
    }
  }
  
  // Add the closing point
  result.push(result[0]);
  
  return result;
}

/**
 * Generate toolpath for an arc element
 */
export function generateArcToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  let gcode = `; Arc: center (${element.centerX || element.x}, ${element.centerY || element.y}, ${element.z}), radius ${element.radius}mm\n`;
  
  // Get arc properties
  const centerX = element.centerX || element.x;
  const centerY = element.centerY || element.y;
  const radius = element.radius || 25;
  
  // Check if we have a partial arc or full circle
  const isFullCircle = element.startAngle === undefined || element.endAngle === undefined;
  
  // Get start and end angles (in degrees, convert to radians)
  let startAngle = isFullCircle ? 0 : (element.startAngle * Math.PI / 180);
  let endAngle = isFullCircle ? 2 * Math.PI : (element.endAngle * Math.PI / 180);
  
  // Handle case where end angle is less than start angle
  if (endAngle < startAngle) {
    endAngle += 2 * Math.PI;
  }
  
  // Apply offset to radius
  let effectiveRadius = radius;
  if (offset === 'inside') {
    effectiveRadius -= toolDiameter / 2;
  } else if (offset === 'outside') {
    effectiveRadius += toolDiameter / 2;
  }
  
  // Skip if radius is too small
  if (effectiveRadius <= 0) {
    return `; Arc radius after offset too small, cannot generate toolpath\n`;
  }
  
  // For each Z level from top to bottom
  for (let z = 0; z > -depth; z -= stepdown) {
    const currentZ = Math.max(-depth, z);
    const actualZ = element.z + currentZ;
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
    
    if (isFullCircle) {
      // Full circle
      const startX = centerX + effectiveRadius;
      const startY = centerY;
      
      gcode += `G0 X${startX.toFixed(3)} Y${startY.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
      gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
      
      // G2/G3 for full circle
      if (direction === 'climb') {
        gcode += `G3 X${startX.toFixed(3)} Y${startY.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Clockwise full circle\n`;
      } else {
        gcode += `G2 X${startX.toFixed(3)} Y${startY.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Counter-clockwise full circle\n`;
      }
    } else {
      // Partial arc
      // Calculate start and end points
      const startX = centerX + effectiveRadius * Math.cos(startAngle);
      const startY = centerY + effectiveRadius * Math.sin(startAngle);
      const endX = centerX + effectiveRadius * Math.cos(endAngle);
      const endY = centerY + effectiveRadius * Math.sin(endAngle);
      
      // Move to start position
      gcode += `G0 X${startX.toFixed(3)} Y${startY.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
      gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
      
      // Calculate I and J values (distance from start point to center)
      const I = centerX - startX;
      const J = centerY - startY;
      
      // Draw arc
      if (direction === 'climb') {
        gcode += `G3 X${endX.toFixed(3)} Y${endY.toFixed(3)} I${I.toFixed(3)} J${J.toFixed(3)} F${feedrate} ; Clockwise arc\n`;
      } else {
        gcode += `G2 X${endX.toFixed(3)} Y${endY.toFixed(3)} I${I.toFixed(3)} J${J.toFixed(3)} F${feedrate} ; Counter-clockwise arc\n`;
      }
    }
  }
  
  return gcode;
}

/**
 * Generate toolpath for an ellipse element
 */
export function generateEllipseToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  let gcode = `; Ellipse: center (${element.x}, ${element.y}, ${element.z}), radiusX ${element.radiusX || element.radius}mm, radiusY ${element.radiusY || element.radius}mm\n`;
  
  // Get ellipse properties
  const radiusX = element.radiusX || element.radius || 25;
  const radiusY = element.radiusY || element.radius || 25;
  
  // Check if we have a partial ellipse or full
  const isFullEllipse = element.startAngle === undefined || element.endAngle === undefined;
  
  // Get start and end angles (in degrees, convert to radians)
  let startAngle = isFullEllipse ? 0 : (element.startAngle * Math.PI / 180);
  let endAngle = isFullEllipse ? 2 * Math.PI : (element.endAngle * Math.PI / 180);
  
  // Handle case where end angle is less than start angle
  if (endAngle < startAngle) {
    endAngle += 2 * Math.PI;
  }
  
  // Apply offset to radii
  let effectiveRadiusX = radiusX;
  let effectiveRadiusY = radiusY;
  
  if (offset === 'inside') {
    // For ellipses, the offset is more complex
    // We use a simplified approach for now
    effectiveRadiusX = Math.max(0, radiusX - toolDiameter / 2);
    effectiveRadiusY = Math.max(0, radiusY - toolDiameter / 2);
  } else if (offset === 'outside') {
    effectiveRadiusX = radiusX + toolDiameter / 2;
    effectiveRadiusY = radiusY + toolDiameter / 2;
  }
  
  // Skip if either radius is too small
  if (effectiveRadiusX <= 0 || effectiveRadiusY <= 0) {
    return `; Ellipse radius after offset too small, cannot generate toolpath\n`;
  }
  
  // For each Z level from top to bottom
  for (let z = 0; z > -depth; z -= stepdown) {
    const currentZ = Math.max(-depth, z);
    const actualZ = element.z + currentZ;
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
    
    // Approximate ellipse with line segments
    // Number of points depends on the ellipse size
    const numPoints = Math.max(24, Math.ceil(Math.PI * (effectiveRadiusX + effectiveRadiusY)));
    const angleStep = (endAngle - startAngle) / (isFullEllipse ? numPoints : (numPoints - 1));
    
    const points = [];
    for (let i = 0; i <= (isFullEllipse ? numPoints : (numPoints - 1)); i++) {
      const angle = startAngle + i * angleStep;
      const x = element.x + effectiveRadiusX * Math.cos(angle);
      const y = element.y + effectiveRadiusY * Math.sin(angle);
      points.push([x, y]);
    }
    
    // If it's a full ellipse, close the loop
    if (isFullEllipse) {
      points.push(points[0]);
    }
    
    // Reverse for conventional milling if needed
    if (direction === 'conventional') {
      points.reverse();
    }
    
    // Move to first point
    gcode += `G0 X${points[0][0].toFixed(3)} Y${points[0][1].toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Move along the ellipse using linear moves
    for (let i = 1; i < points.length; i++) {
      gcode += `G1 X${points[i][0].toFixed(3)} Y${points[i][1].toFixed(3)} F${feedrate} ; Point ${i}\n`;
    }
  }
  
  return gcode;
}

/**
 * Generate toolpath for a 3D text element
 */
export function generateText3DToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  let gcode = `; 3D Text: position (${element.x}, ${element.y}, ${element.z}), text "${element.text || 'Text'}", height ${element.height || '10'}mm\n`;
  
  // Get text properties
  const text = element.text || 'Text';
  const textHeight = element.height || 10;
  const textWidth = element.width || (text.length * textHeight * 0.6); // Estimate width if not provided
  
  gcode += '; Note: Text machining requires converting text to paths for actual machining\n';
  gcode += '; This is a simplified approximation for preview purposes\n';
  
  // Apply offset to dimensions
  let offsetDistance = 0;
  if (offset === 'inside') {
    offsetDistance = -toolDiameter / 2;
  } else if (offset === 'outside') {
    offsetDistance = toolDiameter / 2;
  }
  
  // Calculate dimensions with offset
  const width = textWidth + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
  const height = textHeight + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
  
  // Skip if dimensions are too small
  if (width <= 0 || height <= 0) {
    return `; Text dimensions after offset too small, cannot generate toolpath\n`;
  }
  
  // Start point (top-left corner of text bounding box)
  const startX = element.x - width / 2;
  const startY = element.y - height / 2;
  
  // For each Z level from top to bottom
  for (let z = 0; z > -depth; z -= stepdown) {
    const currentZ = Math.max(-depth, z);
    const actualZ = element.z + currentZ;
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
    
    // Create a rectangular outline around the text area
    const corners = [
      [startX, startY],
      [startX + width, startY],
      [startX + width, startY + height],
      [startX, startY + height],
      [startX, startY] // Close the loop
    ];
    
    // Reverse order for conventional milling
    if (direction === 'conventional') {
      corners.reverse();
    }
    
    // Move to first point
    gcode += `G0 X${corners[0][0].toFixed(3)} Y${corners[0][1].toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Move along the rectangle
    for (let i = 1; i < corners.length; i++) {
      gcode += `G1 X${corners[i][0].toFixed(3)} Y${corners[i][1].toFixed(3)} F${feedrate} ; Corner ${i}\n`;
    }
    
    // Adding a simple zigzag pattern to represent the text inside
    // In a real implementation, this would be replaced with the actual text outline
    const zigzagSpacing = Math.min(toolDiameter, height / 3);
    let zigzagY = startY + zigzagSpacing;
    
    while (zigzagY < startY + height - zigzagSpacing) {
      gcode += `G0 X${startX.toFixed(3)} Y${zigzagY.toFixed(3)} Z${actualZ.toFixed(3)} ; Move to zigzag start\n`;
      gcode += `G1 X${(startX + width).toFixed(3)} Y${zigzagY.toFixed(3)} F${feedrate} ; Zigzag line\n`;
      zigzagY += zigzagSpacing;
    }
  }
  
  return gcode;
} 