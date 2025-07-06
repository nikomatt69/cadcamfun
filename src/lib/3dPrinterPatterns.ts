// src/lib/3dPrinterPatterns.ts
/**
 * Functions for generating common 3D printing patterns for G-code toolpaths
 */

/**
 * Generate G-code for a rectangle perimeter
 */
export const generate3DPrinterRectanglePerimeter = (
  x: number,
  y: number,
  width: number,
  depth: number,
  printSpeed: number,
  extrusionMultiplier: number = 1
): string => {
  let gcode = "";

  // Calculate corners
  const left = x - width / 2;
  const right = x + width / 2;
  const bottom = y - depth / 2;
  const top = y + depth / 2;

  // Calculate perimeter length for extrusion amount
  const perimeter = 2 * width + 2 * depth;

  // Move to starting corner
  gcode += `G1 X${left.toFixed(3)} Y${bottom.toFixed(3)} F3000 E0.1 ; Move to perimeter start\n`;

  // Draw rectangle perimeter
  gcode += `G1 F${printSpeed} ; Set print speed\n`;
  gcode += `G1 X${right.toFixed(3)} Y${bottom.toFixed(3)} E${(extrusionMultiplier * 0.25).toFixed(5)} ; Bottom edge\n`;
  gcode += `G1 X${right.toFixed(3)} Y${top.toFixed(3)} E${(extrusionMultiplier * 0.5).toFixed(5)} ; Right edge\n`;
  gcode += `G1 X${left.toFixed(3)} Y${top.toFixed(3)} E${(extrusionMultiplier * 0.75).toFixed(5)} ; Top edge\n`;
  gcode += `G1 X${left.toFixed(3)} Y${bottom.toFixed(3)} E${extrusionMultiplier.toFixed(5)} ; Left edge\n`;

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position after perimeter\n";

  return gcode;
};

/**
 * Generate G-code for a circle perimeter
 */
export const generate3DPrinterCirclePerimeter = (
  x: number,
  y: number,
  radius: number,
  printSpeed: number,
  extrusionMultiplier: number = 1
): string => {
  let gcode = "";

  // Calculate circumference for extrusion amount
  const circumference = 2 * Math.PI * radius;

  // Move to starting point on circle
  gcode += `G1 X${(x + radius).toFixed(3)} Y${y.toFixed(3)} F3000 E0.1 ; Move to perimeter start\n`;

  // Draw circle - counterclockwise G3
  gcode += `G1 F${printSpeed} ; Set print speed\n`;
  gcode += `G3 X${(x + radius).toFixed(3)} Y${y.toFixed(3)} I${(-radius).toFixed(3)} J0 E${extrusionMultiplier.toFixed(5)} ; Circle perimeter\n`;

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position after perimeter\n";

  return gcode;
};

/**
 * Generate G-code for grid infill pattern
 */
export const generate3DPrinterGridInfill = (
  x: number,
  y: number,
  width: number,
  depth: number,
  spacing: number,
  printSpeed: number,
  layer: number = 0 // Used to alternate patterns between layers
): string => {
  let gcode = "";

  // Calculate start coordinates
  const startX = x - width / 2;
  const startY = y - depth / 2;
  const endX = x + width / 2;
  const endY = y + depth / 2;

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position for infill\n";

  // Horizontal lines (X direction)
  for (let offsetY = 0; offsetY < depth; offsetY += spacing * 2) {
    const currentY = startY + offsetY;
    if (currentY > endY) break;

    // Move to start of line
    gcode += `G1 X${startX.toFixed(3)} Y${currentY.toFixed(3)} F3000 E0.1 ; Move to infill line start\n`;

    // Draw line
    gcode += `G1 X${endX.toFixed(3)} Y${currentY.toFixed(3)} F${printSpeed} E0.5 ; Infill line X\n`;
  }

  // Vertical lines (Y direction)
  for (let offsetX = 0; offsetX < width; offsetX += spacing * 2) {
    const currentX = startX + offsetX;
    if (currentX > endX) break;

    // Move to start of line
    gcode += `G1 X${currentX.toFixed(3)} Y${startY.toFixed(3)} F3000 E0.1 ; Move to infill line start\n`;

    // Draw line
    gcode += `G1 X${currentX.toFixed(3)} Y${endY.toFixed(3)} F${printSpeed} E0.5 ; Infill line Y\n`;
  }

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position after infill\n";

  return gcode;
};

/**
 * Generate G-code for lines infill pattern
 */
export const generate3DPrinterLinesInfill = (
  x: number,
  y: number,
  width: number,
  depth: number,
  spacing: number,
  printSpeed: number,
  layer: number = 0 // Used to alternate direction between layers
): string => {
  let gcode = "";

  // Calculate start coordinates
  const startX = x - width / 2;
  const startY = y - depth / 2;
  const endX = x + width / 2;
  const endY = y + depth / 2;

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position for infill\n";

  // Determine direction based on layer number
  const isHorizontal = layer % 2 === 0;

  if (isHorizontal) {
    // Horizontal lines (X direction)
    for (let offsetY = 0; offsetY < depth; offsetY += spacing) {
      const currentY = startY + offsetY;
      if (currentY > endY) break;

      // Move to start of line
      gcode += `G1 X${startX.toFixed(3)} Y${currentY.toFixed(3)} F3000 E0.1 ; Move to infill line start\n`;

      // Draw line
      gcode += `G1 X${endX.toFixed(3)} Y${currentY.toFixed(3)} F${printSpeed} E0.5 ; Infill line\n`;
    }
  } else {
    // Vertical lines (Y direction)
    for (let offsetX = 0; offsetX < width; offsetX += spacing) {
      const currentX = startX + offsetX;
      if (currentX > endX) break;

      // Move to start of line
      gcode += `G1 X${currentX.toFixed(3)} Y${startY.toFixed(3)} F3000 E0.1 ; Move to infill line start\n`;

      // Draw line
      gcode += `G1 X${currentX.toFixed(3)} Y${endY.toFixed(3)} F${printSpeed} E0.5 ; Infill line\n`;
    }
  }

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position after infill\n";

  return gcode;
};

/**
 * Generate G-code for triangular infill pattern
 */
export const generate3DPrinterTriangularInfill = (
  x: number,
  y: number,
  width: number,
  depth: number,
  spacing: number,
  printSpeed: number,
  layer: number = 0 // Used to offset pattern between layers
): string => {
  let gcode = "";

  // Calculate start coordinates
  const startX = x - width / 2;
  const startY = y - depth / 2;
  const endX = x + width / 2;
  const endY = y + depth / 2;

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position for infill\n";

  // Calculate offset for this layer
  const layerOffset = (layer % 2) * (spacing / 2);

  // First set of diagonal lines (/)
  for (let offset = -depth; offset < width + depth; offset += spacing) {
    const offsetWithLayer = offset + layerOffset;

    // Calculate start and end points for this diagonal
    let lineStartX = startX + offsetWithLayer;
    let lineStartY = startY;
    let lineEndX = lineStartX - depth;
    let lineEndY = endY;

    // Adjust if line starts outside the bounding box
    if (lineStartX < startX) {
      const diff = startX - lineStartX;
      lineStartX = startX;
      lineStartY = startY + diff;
    } else if (lineStartX > endX) {
      const diff = lineStartX - endX;
      lineStartX = endX;
      lineStartY = startY + diff;
    }

    // Adjust if line ends outside the bounding box
    if (lineEndX < startX) {
      const diff = startX - lineEndX;
      lineEndX = startX;
      lineEndY = endY - diff;
    } else if (lineEndX > endX) {
      const diff = lineEndX - endX;
      lineEndX = endX;
      lineEndY = endY - diff;
    }

    // Only draw if line is inside bounding box
    if (
      lineStartX >= startX &&
      lineStartX <= endX &&
      lineStartY >= startY &&
      lineStartY <= endY &&
      lineEndX >= startX &&
      lineEndX <= endX &&
      lineEndY >= startY &&
      lineEndY <= endY
    ) {
      // Move to start of line
      gcode += `G1 X${lineStartX.toFixed(3)} Y${lineStartY.toFixed(3)} F3000 E0.1 ; Move to infill start\n`;

      // Draw diagonal line
      gcode += `G1 X${lineEndX.toFixed(3)} Y${lineEndY.toFixed(3)} F${printSpeed} E0.5 ; Diagonal infill\n`;
    }
  }

  // Second set of diagonal lines (\)
  for (let offset = -depth; offset < width + depth; offset += spacing) {
    const offsetWithLayer = offset + layerOffset;

    // Calculate start and end points for this diagonal
    let lineStartX = startX + offsetWithLayer;
    let lineStartY = endY;
    let lineEndX = lineStartX - depth;
    let lineEndY = startY;

    // Adjust if line starts outside the bounding box
    if (lineStartX < startX) {
      const diff = startX - lineStartX;
      lineStartX = startX;
      lineStartY = endY - diff;
    } else if (lineStartX > endX) {
      const diff = lineStartX - endX;
      lineStartX = endX;
      lineStartY = endY - diff;
    }

    // Adjust if line ends outside the bounding box
    if (lineEndX < startX) {
      const diff = startX - lineEndX;
      lineEndX = startX;
      lineEndY = startY + diff;
    } else if (lineEndX > endX) {
      const diff = lineEndX - endX;
      lineEndX = endX;
      lineEndY = startY + diff;
    }

    // Only draw if line is inside bounding box
    if (
      lineStartX >= startX &&
      lineStartX <= endX &&
      lineStartY >= startY &&
      lineStartY <= endY &&
      lineEndX >= startX &&
      lineEndX <= endX &&
      lineEndY >= startY &&
      lineEndY <= endY
    ) {
      // Move to start of line
      gcode += `G1 X${lineStartX.toFixed(3)} Y${lineStartY.toFixed(3)} F3000 E0.1 ; Move to infill start\n`;

      // Draw diagonal line
      gcode += `G1 X${lineEndX.toFixed(3)} Y${lineEndY.toFixed(3)} F${printSpeed} E0.5 ; Diagonal infill\n`;
    }
  }

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position after infill\n";

  return gcode;
};

/**
 * Generate G-code for honeycomb infill pattern
 */
export const generate3DPrinterHoneycombInfill = (
  x: number,
  y: number,
  width: number,
  depth: number,
  spacing: number,
  printSpeed: number,
  layer: number = 0 // Used to offset pattern between layers
): string => {
  let gcode = "";

  // Calculate start coordinates
  const startX = x - width / 2;
  const startY = y - depth / 2;
  const endX = x + width / 2;
  const endY = y + depth / 2;

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position for honeycomb infill\n";

  // Honeycomb parameters
  const hexRadius = spacing / 2;
  const hexHeight = hexRadius * Math.sqrt(3);
  const hexWidth = hexRadius * 2;

  // Calculate offset for this layer
  const layerOffset = (layer % 2) * (hexWidth / 2);
  const rowOffset = (layer % 2) * (hexHeight / 2);

  // Draw hexagons in a grid
  for (let row = 0; row < Math.ceil(depth / hexHeight); row++) {
    const evenRow = row % 2 === 0;
    const yCenter = startY + row * hexHeight * 0.75 + rowOffset;

    // Skip if this row is outside our bounds
    if (yCenter - hexHeight / 2 > endY || yCenter + hexHeight / 2 < startY) continue;

    for (let col = 0; col < Math.ceil(width / hexWidth) + 1; col++) {
      // Offset every other row
      const colOffset = evenRow ? 0 : hexWidth / 2;
      const xCenter = startX + col * hexWidth + colOffset + layerOffset;

      // Skip if this hexagon is outside our bounds
      if (xCenter - hexWidth / 2 > endX || xCenter + hexWidth / 2 < startX) continue;

      // Generate points for hexagon
      const points = [];
      for (let i = 0; i < 6; i++) {
        const angle = ((i * 60 - 30) * Math.PI) / 180;
        const hx = xCenter + hexRadius * Math.cos(angle);
        const hy = yCenter + hexRadius * Math.sin(angle);
        points.push([hx, hy]);
      }
      points.push(points[0]); // Close the loop

      // Move to first point
      gcode += `G1 X${points[0][0].toFixed(3)} Y${points[0][1].toFixed(3)} F3000 E0.1 ; Move to hexagon start\n`;

      // Draw hexagon
      for (let i = 1; i < points.length; i++) {
        gcode += `G1 X${points[i][0].toFixed(3)} Y${points[i][1].toFixed(3)} F${printSpeed} E0.3 ; Hexagon side ${i}\n`;
      }
    }
  }

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position after honeycomb infill\n";

  return gcode;
};

/**
 * Generate G-code for solid infill (used for top/bottom layers)
 */
export const generate3DPrinterSolidInfill = (
  x: number,
  y: number,
  width: number,
  depth: number,
  spacing: number,
  printSpeed: number,
  layer: number = 0 // Used to alternate direction between layers
): string => {
  let gcode = "";

  // Calculate start coordinates
  const startX = x - width / 2;
  const startY = y - depth / 2;
  const endX = x + width / 2;
  const endY = y + depth / 2;

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position for solid infill\n";

  // Alternate direction based on layer
  const isHorizontal = layer % 2 === 0;

  if (isHorizontal) {
    // Dense horizontal lines
    for (let offsetY = 0; offsetY < depth; offsetY += spacing) {
      const currentY = startY + offsetY;
      if (currentY > endY) break;

      // Alternate direction for better efficiency
      const startFromLeft = (offsetY / spacing) % 2 === 0;

      if (startFromLeft) {
        // Move to left side
        gcode += `G1 X${startX.toFixed(3)} Y${currentY.toFixed(3)} F3000 E0.1 ; Move to infill start\n`;
        // Draw line to right
        gcode += `G1 X${endX.toFixed(3)} Y${currentY.toFixed(3)} F${printSpeed} E0.6 ; Solid infill line\n`;
      } else {
        // Move to right side
        gcode += `G1 X${endX.toFixed(3)} Y${currentY.toFixed(3)} F3000 E0.1 ; Move to infill start\n`;
        // Draw line to left
        gcode += `G1 X${startX.toFixed(3)} Y${currentY.toFixed(3)} F${printSpeed} E0.6 ; Solid infill line\n`;
      }
    }
  } else {
    // Dense vertical lines
    for (let offsetX = 0; offsetX < width; offsetX += spacing) {
      const currentX = startX + offsetX;
      if (currentX > endX) break;

      // Alternate direction for better efficiency
      const startFromBottom = (offsetX / spacing) % 2 === 0;

      if (startFromBottom) {
        // Move to bottom
        gcode += `G1 X${currentX.toFixed(3)} Y${startY.toFixed(3)} F3000 E0.1 ; Move to infill start\n`;
        // Draw line to top
        gcode += `G1 X${currentX.toFixed(3)} Y${endY.toFixed(3)} F${printSpeed} E0.6 ; Solid infill line\n`;
      } else {
        // Move to top
        gcode += `G1 X${currentX.toFixed(3)} Y${endY.toFixed(3)} F3000 E0.1 ; Move to infill start\n`;
        // Draw line to bottom
        gcode += `G1 X${currentX.toFixed(3)} Y${startY.toFixed(3)} F${printSpeed} E0.6 ; Solid infill line\n`;
      }
    }
  }

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position after solid infill\n";

  return gcode;
};

/**
 * Generate G-code for circular infill pattern
 */
export const generate3DPrinterCircularInfill = (
  x: number,
  y: number,
  radius: number,
  spacing: number,
  printSpeed: number,
  clockwise: boolean = true
): string => {
  let gcode = "";

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position for circular infill\n";

  // Generate concentric circles for infill
  for (let r = spacing; r < radius; r += spacing) {
    // If this would be the last circle and it's very close to the perimeter, skip it
    if (r > radius - spacing / 2) break;

    // Move to start point on circle
    gcode += `G1 X${(x + r).toFixed(3)} Y${y.toFixed(3)} F3000 E0.1 ; Move to circle start\n`;

    // Draw circle
    if (clockwise) {
      gcode += `G2 X${(x + r).toFixed(3)} Y${y.toFixed(3)} I${(-r).toFixed(3)} J0 F${printSpeed} E0.5 ; Clockwise circle\n`;
    } else {
      gcode += `G3 X${(x + r).toFixed(3)} Y${y.toFixed(3)} I${(-r).toFixed(3)} J0 F${printSpeed} E0.5 ; Counter-clockwise circle\n`;
    }
  }

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position after circular infill\n";

  return gcode;
};

/**
 * Generate G-code for spiral infill pattern
 */
export const generate3DPrinterSpiralInfill = (
  x: number,
  y: number,
  radius: number,
  spacing: number,
  printSpeed: number
): string => {
  let gcode = "";

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position for spiral infill\n";

  // Calculate number of points for spiral
  const numPoints = Math.ceil((radius / spacing) * 20); // More points for smoother spiral
  const extrusionPerPoint = 0.02; // Small extrusion between points

  // Start from center
  gcode += `G1 X${x.toFixed(3)} Y${y.toFixed(3)} F3000 E0.1 ; Move to spiral start\n`;

  // Generate spiral points
  let currentExtrusion = 0.1;
  for (let i = 1; i <= numPoints; i++) {
    const ratio = i / numPoints;
    const spiralRadius = radius * ratio;
    const angle = i * 0.5; // Adjust for spiral spacing

    const newX = x + spiralRadius * Math.cos(angle);
    const newY = y + spiralRadius * Math.sin(angle);

    currentExtrusion += extrusionPerPoint;
    gcode += `G1 X${newX.toFixed(3)} Y${newY.toFixed(3)} F${printSpeed} E${currentExtrusion.toFixed(5)} ; Spiral point\n`;
  }

  // Reset extruder
  gcode += "G92 E0 ; Reset extruder position after spiral infill\n";

  return gcode;
};
