// Enhanced G-code parser with support for arcs (G2/G3) and fixed cycles
import * as THREE from 'three';

export interface ToolpathPoint {
  x: number;
  y: number;
  z: number;
  feedrate?: number;
  type?: string;
  isRapid?: boolean;
  i?: number; // Arc center X offset for G2/G3
  j?: number; // Arc center Y offset for G2/G3
  k?: number; // Arc center Z offset for G2/G3
  r?: number; // Arc radius or cycle R value
  p?: number; // Dwell time for cycles
  q?: number; // Peck increment for peck drilling
  isArc?: boolean; // Flag for arc moves
  isFixedCycle?: boolean; // Flag for fixed cycle
  cycleType?: string; // Type of fixed cycle (G81, G83, etc.)
  loopCount?: number; // Number of repeats for a cycle
}

export interface ParsedGCode {
  points: ToolpathPoint[];
  arcs: ToolpathArc[];
  fixedCycles: FixedCycle[];
  maxBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
}

export interface ToolpathArc {
  startPoint: ToolpathPoint;
  endPoint: ToolpathPoint;
  center: THREE.Vector3;
  radius: number;
  startAngle: number;
  endAngle: number;
  clockwise: boolean;
  feedrate?: number;
  plane: 'XY' | 'XZ' | 'YZ';
}

export interface FixedCycle {
  type: string; // G81, G83, etc.
  startPoint: ToolpathPoint;
  depth: number;
  retractHeight: number;
  feedrate?: number;
  peckIncrement?: number; // For peck drilling cycles
  dwellTime?: number; // For dwell cycles
  points: ToolpathPoint[]; // All positions where the cycle executes
}

// Parse G-code into toolpath points, including arcs and fixed cycles
export const parseGCode = (gcode: string): ParsedGCode => {
  const points: ToolpathPoint[] = [];
  const arcs: ToolpathArc[] = [];
  const fixedCycles: FixedCycle[] = [];
  
  const lines = gcode.split('\n');
  
  // Current state
  let currentX = 0;
  let currentY = 0;
  let currentZ = 0;
  let currentF = 0;
  
  // Active plane selection (default: XY plane)
  let activePlane: 'XY' | 'XZ' | 'YZ' = 'XY';
  
  // For fixed cycles
  let fixedCycleActive = false;
  let fixedCycleType = '';
  let fixedCycleZ = 0;
  let fixedCycleR = 0;
  let fixedCycleQ = 0;
  let fixedCycleP = 0;
  
  // Default retract mode
  let retractMode = 'G98'; // Return to initial level
  
  // Bounds tracking
  const maxBounds = {
    minX: Number.MAX_VALUE,
    maxX: Number.MIN_VALUE,
    minY: Number.MAX_VALUE,
    maxY: Number.MIN_VALUE,
    minZ: Number.MAX_VALUE,
    maxZ: Number.MIN_VALUE
  };
  
  // Update bounds function
  const updateBounds = (x: number, y: number, z: number) => {
    maxBounds.minX = Math.min(maxBounds.minX, x);
    maxBounds.maxX = Math.max(maxBounds.maxX, x);
    maxBounds.minY = Math.min(maxBounds.minY, y);
    maxBounds.maxY = Math.max(maxBounds.maxY, y);
    maxBounds.minZ = Math.min(maxBounds.minZ, z);
    maxBounds.maxZ = Math.max(maxBounds.maxZ, z);
  };
  
  // Helper function to create arc points for visualization
  const createArcPoints = (
    startX: number, startY: number, startZ: number,
    endX: number, endY: number, endZ: number,
    centerX: number, centerY: number,
    clockwise: boolean,
    feedrate: number
  ): ToolpathArc => {
    const startPoint = { x: startX, y: startY, z: startZ };
    const endPoint = { x: endX, y: endY, z: endZ };
    
    // Calculate radius
    const radius = Math.sqrt(
      Math.pow(startX - centerX, 2) + Math.pow(startY - centerY, 2)
    );
    
    // Calculate start and end angles
    const startAngle = Math.atan2(startY - centerY, startX - centerX);
    const endAngle = Math.atan2(endY - centerY, endX - centerX);
    
    // Return arc information
    return {
      startPoint,
      endPoint,
      center: new THREE.Vector3(centerX, centerY, startZ),
      radius,
      startAngle,
      endAngle,
      clockwise,
      feedrate,
      plane: activePlane
    };
  };
  
  // Process each line of G-code
  lines.forEach(line => {
    // Skip comments and empty lines
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith(';') || trimmedLine.startsWith('(')) return;
    
    // Plane selection
    if (trimmedLine.match(/G1[7-9]/)) {
      if (trimmedLine.includes('G17')) activePlane = 'XY';
      else if (trimmedLine.includes('G18')) activePlane = 'XZ';
      else if (trimmedLine.includes('G19')) activePlane = 'YZ';
    }
    
    // Fixed cycle commands
    const fixedCycleMatch = trimmedLine.match(/G8[0-9]/);
    if (fixedCycleMatch) {
      const cycleCode = fixedCycleMatch[0];
      
      // Fixed cycle parameters
      const zMatch = trimmedLine.match(/Z([+-]?\d*\.?\d+)/);
      const rMatch = trimmedLine.match(/R([+-]?\d*\.?\d+)/);
      const qMatch = trimmedLine.match(/Q([+-]?\d*\.?\d+)/);
      const pMatch = trimmedLine.match(/P([+-]?\d*\.?\d+)/);
      
      // Process the key parameters
      if (cycleCode === 'G80') {
        // Cancel fixed cycle
        fixedCycleActive = false;
        fixedCycleType = '';
      } else {
        // Start a new fixed cycle
        fixedCycleActive = true;
        fixedCycleType = cycleCode;
        
        // Required parameters
        if (zMatch) fixedCycleZ = parseFloat(zMatch[1]);
        if (rMatch) fixedCycleR = parseFloat(rMatch[1]);
        
        // Optional parameters
        if (qMatch) fixedCycleQ = parseFloat(qMatch[1]);
        if (pMatch) fixedCycleP = parseFloat(pMatch[1]);
        
        // Check if X or Y is specified to execute the cycle immediately
        const xMatch = trimmedLine.match(/X([+-]?\d*\.?\d+)/);
        const yMatch = trimmedLine.match(/Y([+-]?\d*\.?\d+)/);
        
        if (xMatch) currentX = parseFloat(xMatch[1]);
        if (yMatch) currentY = parseFloat(yMatch[1]);
        
        // Initial position for the cycle
        if (xMatch || yMatch) {
          // Create a fixed cycle record
          const newCycle: FixedCycle = {
            type: fixedCycleType,
            startPoint: { x: currentX, y: currentY, z: currentZ },
            depth: fixedCycleZ,
            retractHeight: fixedCycleR,
            feedrate: currentF,
            points: [{ x: currentX, y: currentY, z: currentZ }]
          };
          
          if (fixedCycleQ) newCycle.peckIncrement = fixedCycleQ;
          if (fixedCycleP) newCycle.dwellTime = fixedCycleP;
          
          fixedCycles.push(newCycle);
          
          // Add points to the toolpath for visualization
          
          // Initial position (rapid to XY)
          points.push({
            x: currentX,
            y: currentY, 
            z: currentZ,
            type: 'G0',
            isRapid: true,
            isFixedCycle: true,
            cycleType: fixedCycleType
          });
          
          // Rapid to R level
          points.push({
            x: currentX,
            y: currentY,
            z: fixedCycleR,
            type: 'G0',
            isRapid: true,
            isFixedCycle: true,
            cycleType: fixedCycleType
          });
          
          // Visualization for different cycle types
          switch (fixedCycleType) {
            case 'G81': // Simple drilling
              // Drill to depth
              points.push({
                x: currentX,
                y: currentY,
                z: fixedCycleZ,
                feedrate: currentF,
                type: 'G1',
                isRapid: false,
                isFixedCycle: true,
                cycleType: fixedCycleType
              });
              
              // Retract rapidly
              points.push({
                x: currentX,
                y: currentY,
                z: fixedCycleR,
                type: 'G0',
                isRapid: true,
                isFixedCycle: true,
                cycleType: fixedCycleType
              });
              break;
              
            case 'G83': // Peck drilling
              if (fixedCycleQ) {
                let currentDepth = fixedCycleR;
                
                // Generate peck drilling motion
                while (currentDepth > fixedCycleZ) {
                  // Calculate next peck depth
                  currentDepth = Math.max(fixedCycleZ, currentDepth - fixedCycleQ);
                  
                  // Drill to current depth
                  points.push({
                    x: currentX,
                    y: currentY,
                    z: currentDepth,
                    feedrate: currentF,
                    type: 'G1',
                    isRapid: false,
                    isFixedCycle: true,
                    cycleType: fixedCycleType
                  });
                  
                  // Retract to R level after each peck
                  points.push({
                    x: currentX,
                    y: currentY,
                    z: fixedCycleR,
                    type: 'G0',
                    isRapid: true,
                    isFixedCycle: true,
                    cycleType: fixedCycleType
                  });
                }
              }
              break;
              
            case 'G84': // Tapping
              // Downward motion to depth
              points.push({
                x: currentX,
                y: currentY,
                z: fixedCycleZ,
                feedrate: currentF,
                type: 'G1',
                isRapid: false,
                isFixedCycle: true,
                cycleType: fixedCycleType
              });
              
              // Upward motion at same feedrate (for tapping)
              points.push({
                x: currentX,
                y: currentY,
                z: fixedCycleR,
                feedrate: currentF,
                type: 'G1',
                isRapid: false,
                isFixedCycle: true,
                cycleType: fixedCycleType
              });
              break;
              
            default:
              // Generic visualization for other cycles
              points.push({
                x: currentX,
                y: currentY,
                z: fixedCycleZ,
                feedrate: currentF,
                type: 'G1',
                isRapid: false,
                isFixedCycle: true,
                cycleType: fixedCycleType
              });
              
              points.push({
                x: currentX,
                y: currentY,
                z: fixedCycleR,
                type: 'G0',
                isRapid: true,
                isFixedCycle: true,
                cycleType: fixedCycleType
              });
          }
          
          // Update bounds
          updateBounds(currentX, currentY, currentZ);
          updateBounds(currentX, currentY, fixedCycleZ);
        }
      }
      return; // Continue to next line
    }
    
    // Handle situation where a fixed cycle is active and we're just getting XY coordinates
    if (fixedCycleActive) {
      const xMatch = trimmedLine.match(/X([+-]?\d*\.?\d+)/);
      const yMatch = trimmedLine.match(/Y([+-]?\d*\.?\d+)/);
      
      if (xMatch || yMatch) {
        // Update current position
        if (xMatch) currentX = parseFloat(xMatch[1]);
        if (yMatch) currentY = parseFloat(yMatch[1]);
        
        // Create a new fixed cycle at this position
        const newCycle: FixedCycle = {
          type: fixedCycleType,
          startPoint: { x: currentX, y: currentY, z: currentZ },
          depth: fixedCycleZ,
          retractHeight: fixedCycleR,
          feedrate: currentF,
          points: [{ x: currentX, y: currentY, z: currentZ }]
        };
        
        if (fixedCycleQ) newCycle.peckIncrement = fixedCycleQ;
        if (fixedCycleP) newCycle.dwellTime = fixedCycleP;
        
        fixedCycles.push(newCycle);
        
        // Add points to the toolpath for visualization (similar to above)
        points.push({
          x: currentX,
          y: currentY, 
          z: currentZ,
          type: 'G0',
          isRapid: true,
          isFixedCycle: true,
          cycleType: fixedCycleType
        });
        
        points.push({
          x: currentX,
          y: currentY,
          z: fixedCycleR,
          type: 'G0',
          isRapid: true,
          isFixedCycle: true,
          cycleType: fixedCycleType
        });
        
        points.push({
          x: currentX,
          y: currentY,
          z: fixedCycleZ,
          feedrate: currentF,
          type: 'G1',
          isRapid: false,
          isFixedCycle: true,
          cycleType: fixedCycleType
        });
        
        points.push({
          x: currentX,
          y: currentY,
          z: fixedCycleR,
          type: 'G0',
          isRapid: true,
          isFixedCycle: true,
          cycleType: fixedCycleType
        });
        
        // Update bounds
        updateBounds(currentX, currentY, currentZ);
        updateBounds(currentX, currentY, fixedCycleZ);
        
        return; // Continue to next line
      }
    }
    
    // Extract command type for linear moves
    const isG0 = trimmedLine.includes('G0') || trimmedLine.includes('G00');
    const isG1 = trimmedLine.includes('G1') || trimmedLine.includes('G01');
    
    // Extract arc moves
    const isG2 = trimmedLine.includes('G2') || trimmedLine.includes('G02'); // Clockwise
    const isG3 = trimmedLine.includes('G3') || trimmedLine.includes('G03'); // Counter-clockwise
    
    // Extract coordinates for all types of moves
    const xMatch = trimmedLine.match(/X([+-]?\d*\.?\d+)/);
    const yMatch = trimmedLine.match(/Y([+-]?\d*\.?\d+)/);
    const zMatch = trimmedLine.match(/Z([+-]?\d*\.?\d+)/);
    const fMatch = trimmedLine.match(/F([+-]?\d*\.?\d+)/);
    
    // Update feedrate if specified
    if (fMatch) currentF = parseFloat(fMatch[1]);
    
    // Handle linear moves (G0, G1)
    if (isG0 || isG1) {
      // Update coordinates if specified
      const newX = xMatch ? parseFloat(xMatch[1]) : currentX;
      const newY = yMatch ? parseFloat(yMatch[1]) : currentY;
      const newZ = zMatch ? parseFloat(zMatch[1]) : currentZ;
      
      // Add point to toolpath
      points.push({
        x: newX,
        y: newY,
        z: newZ,
        feedrate: currentF,
        type: isG0 ? 'G0' : 'G1',
        isRapid: isG0
      });
      
      // Update current position
      currentX = newX;
      currentY = newY;
      currentZ = newZ;
      
      // Update bounds
      updateBounds(currentX, currentY, currentZ);
    }
    
    // Handle arc moves (G2, G3)
    else if (isG2 || isG3) {
      // Arc center offsets or radius
      const iMatch = trimmedLine.match(/I([+-]?\d*\.?\d+)/);
      const jMatch = trimmedLine.match(/J([+-]?\d*\.?\d+)/);
      const kMatch = trimmedLine.match(/K([+-]?\d*\.?\d+)/);
      const rMatch = trimmedLine.match(/R([+-]?\d*\.?\d+)/);
      
      // End position
      const newX = xMatch ? parseFloat(xMatch[1]) : currentX;
      const newY = yMatch ? parseFloat(yMatch[1]) : currentY;
      const newZ = zMatch ? parseFloat(zMatch[1]) : currentZ;
      
      // Center-format arcs
      if ((iMatch || jMatch || kMatch)) {
        const i = iMatch ? parseFloat(iMatch[1]) : 0;
        const j = jMatch ? parseFloat(jMatch[1]) : 0;
        const k = kMatch ? parseFloat(kMatch[1]) : 0;
        
        // Calculate center point based on active plane
        let centerX = 0, centerY = 0, centerZ = 0;
        
        if (activePlane === 'XY') {
          centerX = currentX + i;
          centerY = currentY + j;
          centerZ = currentZ;
        } else if (activePlane === 'XZ') {
          centerX = currentX + i;
          centerY = currentY;
          centerZ = currentZ + k;
        } else if (activePlane === 'YZ') {
          centerX = currentX;
          centerY = currentY + j;
          centerZ = currentZ + k;
        }
        
        // Create arc object
        const arc = createArcPoints(
          currentX, currentY, currentZ,
          newX, newY, newZ,
          centerX, centerY,
          isG2, // clockwise if G2
          currentF
        );
        
        arcs.push(arc);
        
        // Add arc point to toolpath for linking
        points.push({
          x: newX,
          y: newY,
          z: newZ,
          feedrate: currentF,
          type: isG2 ? 'G2' : 'G3',
          isRapid: false,
          isArc: true,
          i, j, k
        });
      }
      // Radius-format arcs
      else if (rMatch) {
        const r = parseFloat(rMatch[1]);
        
        // Calculate arc center (simplified - this is an approximation)
        // For proper implementation, solve the quadratic equation for center point
        const dx = newX - currentX;
        const dy = newY - currentY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Midpoint of the chord
        const midX = (currentX + newX) / 2;
        const midY = (currentY + newY) / 2;
        
        // Distance from midpoint to center
        const h = Math.sqrt(r * r - (dist / 2) * (dist / 2));
        
        // Center point (perpendicular to chord)
        // Sign depends on arc direction and whether R is positive or negative
        const sign = (isG2 ? -1 : 1) * (r > 0 ? 1 : -1);
        const centerX = midX + sign * h * (dy / dist);
        const centerY = midY - sign * h * (dx / dist);
        
        // Create arc object
        const arc = createArcPoints(
          currentX, currentY, currentZ,
          newX, newY, newZ,
          centerX, centerY,
          isG2, // clockwise if G2
          currentF
        );
        
        arcs.push(arc);
        
        // Add arc point to toolpath for linking
        points.push({
          x: newX,
          y: newY,
          z: newZ,
          feedrate: currentF,
          type: isG2 ? 'G2' : 'G3',
          isRapid: false,
          isArc: true,
          r
        });
      }
      
      // Update current position
      currentX = newX;
      currentY = newY;
      currentZ = newZ;
      
      // Update bounds
      updateBounds(currentX, currentY, currentZ);
    }
  });
  
  // Create result object
  return {
    points,
    arcs,
    fixedCycles,
    maxBounds
  };
};
