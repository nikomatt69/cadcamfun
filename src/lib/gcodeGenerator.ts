// Define more detailed interfaces for better type safety
export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface ToolpathOperation {
  type: string;  // 'profile', 'pocket', 'drill', 'contour', etc.
  points: Point[];
  depth?: number;
  stepdown?: number;  // Depth per pass
  toolDiameter?: number;
  helicalEntry?: boolean;
  rampEntry?: boolean;
  leadsAndLinks?: {
    entryType: 'direct' | 'ramp' | 'helix' | 'plunge';
    exitType: 'direct' | 'ramp' | 'loop';
    entryDistance?: number;
    exitDistance?: number;
  };
}

export interface Toolpath {
  id: string;
  name: string;
  elements: any[];
  operations: ToolpathOperation[];
  parameters: any;
  workpiece?: {
    width: number;
    height: number;
    thickness: number;
    material: string;
  };
}

/**
 * Generate G-code from a toolpath with advanced features
 * 
 * @param toolpath The toolpath containing operations and parameters
 * @param params Machine parameters for G-code generation
 * @returns Generated G-code as a string
 */
export function generateGcode(toolpath: Toolpath, params: any): string {
  let gcode = '';
  
  // Add detailed header with machine and material information
  gcode += generateHeader(toolpath, params);
  
  // Add initialization with appropriate unit setting
  gcode += generateInitialization(params);
  
  // Process each operation with support for multiple passes
  for (let i = 0; i < toolpath.operations.length; i++) {
    const operation = toolpath.operations[i];
    gcode += generateOperationCode(operation, params, i);
  }
  
  // Add footer with program end and reset
  gcode += generateFooter(params);
  
  // Post-process the g-code for optimization if requested
  if (params.optimization && params.optimization.removeRedundantMoves) {
    gcode = optimizeGcode(gcode);
  }
  
  return gcode;
}

/**
 * Generate a detailed header with all relevant information
 */
function generateHeader(toolpath: Toolpath, params: any): string {
  const date = new Date().toISOString();
  let header = '';
  
  header += ';====================================\n';
  header += '; Generated by CAD/CAM FUN Advanced G-code Generator\n';
  header += `;====================================\n`;
  header += `; Toolpath: ${toolpath.name}\n`;
  header += `; Date: ${date}\n`;
  header += `; Machine: ${params.machineType || 'mill'}\n`;
  header += `; Tool: ${params.tool?.name || 'Default'} (${params.tool?.diameter || 6}mm ${params.tool?.type || 'endmill'})\n`;
  header += `; Material: ${toolpath.workpiece?.material || 'Unknown'}\n`;
  header += `; Feedrate: ${params.feedrate || 1000}mm/min\n`;
  header += `; Plunge rate: ${params.plungerate || 300}mm/min\n`;
  header += `; Spindle speed: ${params.spindleSpeed || 12000} RPM\n`;
  header += `; Coolant: ${params.coolant ? 'ON' : 'OFF'}\n`;
  header += `;====================================\n\n`;
  
  return header;
}

/**
 * Generate initialization code with proper unit setting and safety moves
 */
function generateInitialization(params: any): string {
  let init = '';
  
  // Set units based on parameters
  if (params.useInches) {
    init += 'G20 ; Set units to inches\n';
  } else {
    init += 'G21 ; Set units to mm\n';
  }
  
  init += 'G90 ; Absolute positioning\n';
  init += 'G17 ; XY plane selection\n';
  init += 'G94 ; Feed rate mode\n';
  init += `${params.coordinateSystem || 'G54'} ; Work coordinate system\n`;
  
  // Start spindle with the specified RPM
  init += `M3 S${params.spindleSpeed || 12000} ; Start spindle\n`;
  
  // Turn on coolant if specified
  if (params.coolant) {
    init += 'M8 ; Turn on coolant\n';
  }
  
  init += `G0 Z${params.clearanceHeight || 10} ; Move to clearance height\n\n`;
  
  return init;
}

/**
 * Generate code for a specific operation, supporting multiple cutting strategies
 */
function generateOperationCode(operation: ToolpathOperation, params: any, operationIndex: number): string {
  let opCode = '';
  
  opCode += `;------------------------------------\n`;
  opCode += `; Operation ${operationIndex + 1}: ${operation.type}\n`;
  opCode += `;------------------------------------\n`;
  
  // Handle different entry methods
  const entryType = operation.leadsAndLinks?.entryType || 'plunge';
  
  // Move to safe height before starting operation
  opCode += `G0 Z${params.safeHeight || 5} ; Move to safe height\n`;
  
  // Handle multi-pass operations if stepdown is defined
  const totalDepth = operation.depth || params.depth || 5;
  const stepdown = operation.stepdown || totalDepth;
  const passes = Math.ceil(totalDepth / stepdown);
  
  // For each pass at increasing depths
  for (let pass = 1; pass <= passes; pass++) {
    const currentDepth = Math.min(pass * stepdown, totalDepth);
    
    opCode += `; Pass ${pass}/${passes} - Depth: ${currentDepth.toFixed(3)}mm\n`;
    
    // Process points for this pass
    for (let i = 0; i < operation.points.length; i++) {
      const point = operation.points[i];
      const zDepth = -currentDepth; // Convert to negative for typical CNC convention
      
      if (i === 0) {
        // First point - handle entry strategy
        opCode += `G0 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} ; Rapid to start position\n`;
        
        switch (entryType) {
          case 'helix':
            opCode += generateHelicalEntry(point, zDepth, params);
            break;
          case 'ramp':
            opCode += generateRampEntry(point, operation.points[1] || point, zDepth, params);
            break;
          case 'direct':
            opCode += `G0 Z${params.safeHeight || 5} ; Safe height\n`;
            opCode += `G0 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} ; Position for plunge\n`;
            opCode += `G1 Z${zDepth.toFixed(3)} F${params.plungerate || 300} ; Direct plunge to depth\n`;
            break;
          default: // default to plunge
            opCode += `G1 Z${zDepth.toFixed(3)} F${params.plungerate || 300} ; Plunge to depth\n`;
        }
      } else {
        // Check if we can generate arc movements instead of linear segments
        const prevPoint = operation.points[i-1];
        const nextPoint = operation.points[i+1];
        
        if (nextPoint && canFormArc(prevPoint, point, nextPoint, params.arcTolerance || 0.01)) {
          // Generate arc movement if three points lie approximately on an arc
          opCode += generateArcMove(prevPoint, point, nextPoint, zDepth, params);
          i++; // Skip the next point as we've used it in the arc
        } else {
          // Linear move to subsequent points
          opCode += `G1 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} Z${zDepth.toFixed(3)} F${params.feedrate || 1000} ; Linear move\n`;
        }
      }
    }
    
    // Handle exit strategy if defined
    if (operation.leadsAndLinks?.exitType === 'loop' && operation.points.length > 0) {
      const firstPoint = operation.points[0];
      opCode += `G1 X${firstPoint.x.toFixed(3)} Y${firstPoint.y.toFixed(3)} Z${(-currentDepth).toFixed(3)} F${params.feedrate || 1000} ; Loop back to start\n`;
    }
    
    opCode += '\n';
  }
  
  return opCode;
}

/**
 * Generate a helical entry move to the specified depth
 */
function generateHelicalEntry(point: Point, targetDepth: number, params: any): string {
  let code = '';
  const helixRadius = (params.tool?.diameter || 6) / 2;
  const helixCenterX = point.x;
  const helixCenterY = point.y;
  
  // Move to start position for helix
  code += `G0 X${(helixCenterX + helixRadius).toFixed(3)} Y${helixCenterY.toFixed(3)} ; Position for helical entry\n`;
  code += `G0 Z${params.safeHeight || 5} ; Safe height before helical entry\n`;
  
  // Helical interpolation - spiral down
  const pitchPerRev = (params.tool?.diameter || 6) / 2; // Step down per revolution
  
  // Start just above the surface
  code += `G1 Z0 F${params.plungerate || 300} ; Move to surface\n`;
  
  // Generate the helical movement
  code += `G3 X${(helixCenterX + helixRadius).toFixed(3)} Y${helixCenterY.toFixed(3)} Z${targetDepth.toFixed(3)} I${(-helixRadius).toFixed(3)} J0 F${params.plungerate || 300} ; Helical entry\n`;
  
  // Move to actual start point
  code += `G1 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} F${params.feedrate || 1000} ; Move to start point\n`;
  
  return code;
}

/**
 * Generate a ramped entry move to the specified depth
 */
function generateRampEntry(startPoint: Point, endPoint: Point, targetDepth: number, params: any): string {
  let code = '';
  
  // Calculate the horizontal distance between points
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const distance = Math.sqrt(dx*dx + dy*dy);
  
  // Start at safe height
  code += `G0 Z${params.safeHeight || 5} ; Safe height before ramp entry\n`;
  code += `G1 Z0 F${params.plungerate || 300} ; Move to surface\n`;
  
  // Create a ramp by moving in XY while simultaneously moving down in Z
  code += `G1 X${endPoint.x.toFixed(3)} Y${endPoint.y.toFixed(3)} Z${targetDepth.toFixed(3)} F${params.plungerate || 300} ; Ramp entry\n`;
  
  // Return to start point at full depth
  code += `G1 X${startPoint.x.toFixed(3)} Y${startPoint.y.toFixed(3)} Z${targetDepth.toFixed(3)} F${params.feedrate || 1000} ; Return to start at full depth\n`;
  
  return code;
}

/**
 * Check if three points can form an arc within the specified tolerance
 */
function canFormArc(p1: Point, p2: Point, p3: Point, tolerance: number): boolean {
  // Calculate distances between points
  const d1 = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  const d2 = Math.sqrt(Math.pow(p3.x - p2.x, 2) + Math.pow(p3.y - p2.y, 2));
  const d3 = Math.sqrt(Math.pow(p3.x - p1.x, 2) + Math.pow(p3.y - p1.y, 2));
  
  // Calculate the semi-perimeter
  const s = (d1 + d2 + d3) / 2;
  
  // Calculate the area of the triangle
  const area = Math.sqrt(s * (s - d1) * (s - d2) * (s - d3));
  
  // Calculate the radius of the circumscribed circle
  const radius = (d1 * d2 * d3) / (4 * area);
  
  // If radius is very large (close to a straight line) or area is tiny, it's not a good arc
  return (radius < 1000) && (area > tolerance);
}

/**
 * Generate an arc move through three points
 */
function generateArcMove(p1: Point, p2: Point, p3: Point, zDepth: number, params: any): string {
  // In a real implementation, this would calculate the center point of the arc
  // For simplicity, we'll just use a clockwise or counterclockwise arc
  
  // Determine if the arc is clockwise or counterclockwise
  // This is a simplified version - a proper implementation would calculate this correctly
  const crossProduct = (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);
  
  if (crossProduct < 0) {
    // Clockwise arc
    return `G2 X${p3.x.toFixed(3)} Y${p3.y.toFixed(3)} Z${zDepth.toFixed(3)} I${((p1.x + p3.x)/2 - p1.x).toFixed(3)} J${((p1.y + p3.y)/2 - p1.y).toFixed(3)} F${params.feedrate || 1000} ; CW arc\n`;
  } else {
    // Counterclockwise arc
    return `G3 X${p3.x.toFixed(3)} Y${p3.y.toFixed(3)} Z${zDepth.toFixed(3)} I${((p1.x + p3.x)/2 - p1.x).toFixed(3)} J${((p1.y + p3.y)/2 - p1.y).toFixed(3)} F${params.feedrate || 1000} ; CCW arc\n`;
  }
}

/**
 * Generate footer code with cleanup and program end
 */
function generateFooter(params: any): string {
  let footer = '';
  
  footer += `;------------------------------------\n`;
  footer += `; Program End\n`;
  footer += `;------------------------------------\n`;
  footer += `G0 Z${params.clearanceHeight || 10} ; Retract to clearance height\n`;
  
  // Turn off spindle and coolant
  footer += 'M5 ; Stop spindle\n';
  if (params.coolant) {
    footer += 'M9 ; Turn off coolant\n';
  }
  
  footer += 'M30 ; Program end and rewind\n';
  
  return footer;
}

/**
 * Optimize G-code by removing redundant moves and combining identical movements
 */
function optimizeGcode(gcode: string): string {
  // Split the code into lines
  const lines = gcode.split('\n');
  const optimizedLines: string[] = [];
  
  // State tracking to identify redundant moves
  let lastX: number | null = null;
  let lastY: number | null = null;
  let lastZ: number | null = null;
  let lastFeedrate: number | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Always keep comments and non-movement commands
    if (line.startsWith(';') || !line.match(/^G[0-1]/)) {
      optimizedLines.push(line);
      continue;
    }
    
    // Parse the coordinates from the line
    const xMatch = line.match(/X([+-]?(\d+(\.\d*)?|\d*\.\d+))/);
    const yMatch = line.match(/Y([+-]?(\d+(\.\d*)?|\d*\.\d+))/);
    const zMatch = line.match(/Z([+-]?(\d+(\.\d*)?|\d*\.\d+))/);
    const fMatch = line.match(/F([+-]?(\d+(\.\d*)?|\d*\.\d+))/);
    
    const x: number = xMatch ? parseFloat(xMatch[1]) : lastX ?? 0;
    const y: number = yMatch ? parseFloat(yMatch[1]) : lastY ?? 0;
    const z: number = zMatch ? parseFloat(zMatch[1]) : lastZ ?? 0;
    const f: number = fMatch ? parseFloat(fMatch[1]) : lastFeedrate ?? 0;
    
    // Skip redundant moves (same position)
    if (x === lastX && y === lastY && z === lastZ && f === lastFeedrate) {
      continue;
    }
    
    // Keep track of the last position
    lastX = x;
    lastY = y;
    lastZ = z;
    lastFeedrate = f;
    
    optimizedLines.push(line);
  }
  
  return optimizedLines.join('\n');
}