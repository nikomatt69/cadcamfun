// Toolpath Visualization Utilities
import * as THREE from 'three';
import { FixedCycle, ToolpathArc, ToolpathPoint } from './fixed-gcode-parser';



/**
 * Creates a visualized toolpath with arcs and fixed cycles
 */
export const createToolpathVisualization = (
  parsedGCode: {
    points: ToolpathPoint[];
    arcs: ToolpathArc[];
    fixedCycles: FixedCycle[];
  },
  arcSegments: number = 32, // Number of segments to use for arcs
  arcColor: number = 0x0088ff, // Color for arc segments
  rapidColor: number = 0xff0000, // Color for rapid movements
  cutColor: number = 0x00ff00, // Color for cutting movements
  drillColor: number = 0xffaa00, // Color for drilling operations
  lineWidth: number = 2 // Width of the lines
): {
  toolpathObject: THREE.Group;
  paths: THREE.Line[];
  arcs: THREE.Line[];
  drills: THREE.Mesh[];
} => {
  const toolpathGroup = new THREE.Group();
  toolpathGroup.name = 'Toolpath';
  
  const paths: THREE.Line[] = [];
  const arcObjects: THREE.Line[] = [];
  const drillObjects: THREE.Mesh[] = [];
  
  // Create materials
  const rapidMaterial = new THREE.LineBasicMaterial({
    color: rapidColor,
    linewidth: lineWidth,
  });
  
  const cutMaterial = new THREE.LineBasicMaterial({
    color: cutColor,
    linewidth: lineWidth,
  });
  
  const arcMaterial = new THREE.LineBasicMaterial({
    color: arcColor,
    linewidth: lineWidth + 1, // Make arcs slightly thicker
  });
  
  const drillMaterial = new THREE.MeshStandardMaterial({
    color: drillColor,
    transparent: true,
    opacity: 0.5,
  });
  
  // Create linear moves (connecting the points)
  if (parsedGCode.points.length > 0) {
    let currentSegment: THREE.Vector3[] = [];
    let isCurrentSegmentRapid = false;
    let inArc = false;
    
    // Process each point
    for (let i = 0; i < parsedGCode.points.length; i++) {
      const point = parsedGCode.points[i];
      
      // Skip arc endpoints - we'll render them separately
      if (point.isArc && i > 0) {
        if (!inArc) {
          // End current segment
          if (currentSegment.length > 1) {
            const geometry = new THREE.BufferGeometry().setFromPoints(currentSegment);
            const material = isCurrentSegmentRapid ? rapidMaterial : cutMaterial;
            const line = new THREE.Line(geometry, material);
            paths.push(line);
            toolpathGroup.add(line);
            
            // Reset segment
            currentSegment = [];
            inArc = true;
          }
        }
        continue;
      }
      
      // Skip fixed cycle visualization points - we'll render them separately
      if (point.isFixedCycle) {
        continue;
      }
      
      // End current segment if rapid/cut type changes
      if (currentSegment.length > 0 && isCurrentSegmentRapid !== point.isRapid) {
        const geometry = new THREE.BufferGeometry().setFromPoints(currentSegment);
        const material = isCurrentSegmentRapid ? rapidMaterial : cutMaterial;
        const line = new THREE.Line(geometry, material);
        paths.push(line);
        toolpathGroup.add(line);
        
        // Reset segment
        currentSegment = [];
      }
      
      // Add point to current segment
      currentSegment.push(new THREE.Vector3(point.x, point.y, point.z));
      isCurrentSegmentRapid = point.isRapid === true;
      inArc = false;
    }
    
    // Add final segment if any points remain
    if (currentSegment.length > 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints(currentSegment);
      const material = isCurrentSegmentRapid ? rapidMaterial : cutMaterial;
      const line = new THREE.Line(geometry, material);
      paths.push(line);
      toolpathGroup.add(line);
    }
  }
  
  // Create arc visualizations
  parsedGCode.arcs.forEach(arc => {
    const arcPoints: THREE.Vector3[] = [];
    
    // For XY plane arcs (most common)
    if (arc.plane === 'XY') {
      // Calculate total angle to sweep
      let startAngle = arc.startAngle;
      let endAngle = arc.endAngle;
      
      // Adjust for full circles and ensure correct direction
      if (Math.abs(endAngle - startAngle) < 0.001) {
        endAngle = startAngle + (arc.clockwise ? -2 * Math.PI : 2 * Math.PI);
      } else if (arc.clockwise && endAngle > startAngle) {
        endAngle = endAngle - 2 * Math.PI;
      } else if (!arc.clockwise && endAngle < startAngle) {
        endAngle = endAngle + 2 * Math.PI;
      }
      
      // Generate points along the arc
      const angleStep = (endAngle - startAngle) / arcSegments;
      const z = arc.startPoint.z; // Z remains constant for XY plane
      
      for (let i = 0; i <= arcSegments; i++) {
        const angle = startAngle + angleStep * i;
        const x = arc.center.x + arc.radius * Math.cos(angle);
        const y = arc.center.y + arc.radius * Math.sin(angle);
        arcPoints.push(new THREE.Vector3(x, y, z));
      }
    }
    // For XZ plane arcs
    else if (arc.plane === 'XZ') {
      // Similar implementation but using X and Z axes
      let startAngle = arc.startAngle;
      let endAngle = arc.endAngle;
      
      if (Math.abs(endAngle - startAngle) < 0.001) {
        endAngle = startAngle + (arc.clockwise ? -2 * Math.PI : 2 * Math.PI);
      } else if (arc.clockwise && endAngle > startAngle) {
        endAngle = endAngle - 2 * Math.PI;
      } else if (!arc.clockwise && endAngle < startAngle) {
        endAngle = endAngle + 2 * Math.PI;
      }
      
      const angleStep = (endAngle - startAngle) / arcSegments;
      const y = arc.startPoint.y; // Y remains constant for XZ plane
      
      for (let i = 0; i <= arcSegments; i++) {
        const angle = startAngle + angleStep * i;
        const x = arc.center.x + arc.radius * Math.cos(angle);
        const z = arc.center.z + arc.radius * Math.sin(angle);
        arcPoints.push(new THREE.Vector3(x, y, z));
      }
    }
    // For YZ plane arcs
    else if (arc.plane === 'YZ') {
      // Similar implementation but using Y and Z axes
      let startAngle = arc.startAngle;
      let endAngle = arc.endAngle;
      
      if (Math.abs(endAngle - startAngle) < 0.001) {
        endAngle = startAngle + (arc.clockwise ? -2 * Math.PI : 2 * Math.PI);
      } else if (arc.clockwise && endAngle > startAngle) {
        endAngle = endAngle - 2 * Math.PI;
      } else if (!arc.clockwise && endAngle < startAngle) {
        endAngle = endAngle + 2 * Math.PI;
      }
      
      const angleStep = (endAngle - startAngle) / arcSegments;
      const x = arc.startPoint.x; // X remains constant for YZ plane
      
      for (let i = 0; i <= arcSegments; i++) {
        const angle = startAngle + angleStep * i;
        const y = arc.center.y + arc.radius * Math.cos(angle);
        const z = arc.center.z + arc.radius * Math.sin(angle);
        arcPoints.push(new THREE.Vector3(x, y, z));
      }
    }
    
    // Create the arc line
    if (arcPoints.length > 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints(arcPoints);
      const arcLine = new THREE.Line(geometry, arcMaterial);
      arcObjects.push(arcLine);
      toolpathGroup.add(arcLine);
    }
  });
  
  // Create visualizations for fixed cycles
  parsedGCode.fixedCycles.forEach(cycle => {
    // Create a cylinder to represent drill holes
    if (cycle.type === 'G81' || cycle.type === 'G83' || cycle.type === 'G84') {
      const { x, y } = cycle.startPoint;
      const retractZ = cycle.retractHeight;
      const depthZ = cycle.depth;
      const height = Math.abs(retractZ - depthZ);
      const radius = height / 20; // Reasonable size relative to hole depth
      
      // Create cylinder geometry
      const geometry = new THREE.CylinderGeometry(
        radius, // top radius
        radius, // bottom radius
        height, // height
        16, // radial segments
        1, // height segments
        false // open-ended?
      );
      
      // Position cylinder properly
      const mesh = new THREE.Mesh(geometry, drillMaterial);
      mesh.position.set(x, y, (retractZ + depthZ) / 2);
      
      // Rotate to align with Z axis
      mesh.rotation.x = Math.PI / 2;
      
      drillObjects.push(mesh);
      toolpathGroup.add(mesh);
      
      // For peck drilling, add markers to show pecking levels
      if (cycle.type === 'G83' && cycle.peckIncrement) {
        const peckIncrement = cycle.peckIncrement;
        let currentDepth = retractZ;
        
        while (currentDepth > depthZ) {
          currentDepth = Math.max(depthZ, currentDepth - peckIncrement);
          
          // Create a small ring to show peck depth
          const ringGeometry = new THREE.RingGeometry(
            radius * 1.5, // inner radius
            radius * 2, // outer radius
            16 // segments
          );
          const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            side: THREE.DoubleSide
          });
          const ring = new THREE.Mesh(ringGeometry, ringMaterial);
          
          // Position the ring at the peck depth
          ring.position.set(x, y, currentDepth);
          ring.rotation.x = Math.PI / 2;
          
          toolpathGroup.add(ring);
        }
      }
    }
    
    // For threading cycles
    if (cycle.type === 'G84') {
      // Add spiral line to represent threads
      const { x, y } = cycle.startPoint;
      const retractZ = cycle.retractHeight;
      const depthZ = cycle.depth;
      const height = Math.abs(retractZ - depthZ);
      const radius = height / 15;
      
      // Create a helix to represent the thread
      const spiralPoints: THREE.Vector3[] = [];
      const turns = Math.ceil(height / (radius * 0.5)); // Reasonable thread pitch
      const pointsPerTurn = 32;
      
      for (let i = 0; i <= turns * pointsPerTurn; i++) {
        const angle = (i / pointsPerTurn) * Math.PI * 2;
        const z = retractZ - (height * i) / (turns * pointsPerTurn);
        
        // Increasing radius spiral
        const r = radius * (0.7 + 0.3 * (i / (turns * pointsPerTurn)));
        
        const x1 = x + r * Math.cos(angle);
        const y1 = y + r * Math.sin(angle);
        
        spiralPoints.push(new THREE.Vector3(x1, y1, z));
      }
      
      // Create the spiral line
      const spiralGeometry = new THREE.BufferGeometry().setFromPoints(spiralPoints);
      const spiralMaterial = new THREE.LineBasicMaterial({
        color: 0xff00ff,
        linewidth: 2
      });
      const spiralLine = new THREE.Line(spiralGeometry, spiralMaterial);
      
      toolpathGroup.add(spiralLine);
    }
  });
  
  return {
    toolpathObject: toolpathGroup,
    paths,
    arcs: arcObjects,
    drills: drillObjects
  };
};

/**
 * Creates a sphere at each toolpath point for debugging
 */
export const createToolpathPointMarkers = (
  points: ToolpathPoint[],
  markerSize: number = 0.5,
  rapidColor: number = 0xff0000,
  cutColor: number = 0x00ff00,
  arcColor: number = 0x0088ff,
  cycleColor: number = 0xffaa00
): THREE.Group => {
  const markersGroup = new THREE.Group();
  markersGroup.name = 'ToolpathMarkers';
  
  // Create materials
  const rapidMaterial = new THREE.MeshBasicMaterial({ color: rapidColor });
  const cutMaterial = new THREE.MeshBasicMaterial({ color: cutColor });
  const arcMaterial = new THREE.MeshBasicMaterial({ color: arcColor });
  const cycleMaterial = new THREE.MeshBasicMaterial({ color: cycleColor });
  
  // Create sphere geometry
  const geometry = new THREE.SphereGeometry(markerSize, 8, 8);
  
  // Create a marker for each point
  points.forEach(point => {
    let material;
    
    if (point.isArc) {
      material = arcMaterial;
    } else if (point.isFixedCycle) {
      material = cycleMaterial;
    } else if (point.isRapid) {
      material = rapidMaterial;
    } else {
      material = cutMaterial;
    }
    
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(point.x, point.y, point.z);
    markersGroup.add(marker);
  });
  
  return markersGroup;
};

/**
 * Animate the tool along the toolpath
 */
export const animateToolAlongPath = (
  tool: THREE.Object3D,
  points: ToolpathPoint[],
  currentIndex: number,
  speedFactor: number = 1
): (() => boolean) => {
  if (!tool || points.length === 0) {
    return () => false;
  }
  
  let index = currentIndex;
  let lastTime = performance.now();
  
  // Calculate time based on move type and feedrate
  const getStepTime = (fromIndex: number, toIndex: number): number => {
    if (fromIndex >= points.length || toIndex >= points.length) {
      return 0;
    }
    
    const from = points[fromIndex];
    const to = points[toIndex];
    
    // Calculate distance
    const distance = Math.sqrt(
      Math.pow(to.x - from.x, 2) +
      Math.pow(to.y - from.y, 2) +
      Math.pow(to.z - from.z, 2)
    );
    
    // Get feedrate (mm/min)
    let feedrate = to.isRapid ? 5000 : (to.feedrate || 1000);
    
    // Convert mm/min to mm/ms
    const speed = feedrate / 60000;
    
    // Calculate time in milliseconds
    return distance / speed / speedFactor;
  };
  
  // Animation update function
  return () => {
    // End of toolpath
    if (index >= points.length - 1) {
      return false;
    }
    
    const currentTime = performance.now();
    const delta = currentTime - lastTime;
    
    // Get current and next points
    const current = points[index];
    const next = points[index + 1];
    
    // Calculate movement time for this segment
    const moveTime = getStepTime(index, index + 1);
    
    // Calculate progress (0 to 1)
    let progress = moveTime > 0 ? delta / moveTime : 1;
    
    // Clamp progress
    progress = Math.min(progress, 1);
    
    // Linear interpolation between points
    const x = current.x + (next.x - current.x) * progress;
    const y = current.y + (next.y - current.y) * progress;
    const z = current.z + (next.z - current.z) * progress;
    
    // Update tool position
    tool.position.set(x, y, z);
    
    // If we've reached the next point, move to the next segment
    if (progress >= 1) {
      index++;
      lastTime = currentTime;
    }
    
    // Special effects for different moves
    if (next.isRapid) {
      // No glow for rapid moves
      setToolGlow(tool, 0);
    } else if (next.isArc) {
      // Stronger glow for arc moves
      setToolGlow(tool, 0.7);
    } else if (next.isFixedCycle) {
      // Flashing glow for fixed cycles
      const pulseValue = (Math.sin(currentTime / 200) + 1) / 2;
      setToolGlow(tool, 0.3 + pulseValue * 0.5);
    } else {
      // Normal glow for cutting
      setToolGlow(tool, 0.5);
    }
    
    // Return true if animation should continue
    return true;
  };
};

/**
 * Set cutting glow effect on the tool
 */
export const setToolGlow = (tool: THREE.Object3D, intensity: number): void => {
  if (!tool) return;
  
  // Find cutter part by name
  tool.traverse((child) => {
    if (child instanceof THREE.Mesh && 
        (child.name.includes('cutter') || child.name.includes('flute'))) {
      if (child.material instanceof THREE.MeshStandardMaterial) {
        // Set emissive properties for glow effect
        child.material.emissive.setRGB(1, 0.5, 0);
        child.material.emissiveIntensity = intensity;
      }
    }
  });
};

/**
 * Create a cone to visualize a drilling operation
 */
export const createDrillingCone = (
  startX: number, 
  startY: number, 
  startZ: number,
  endZ: number,
  radius: number = 1,
  color: number = 0xffaa00
): THREE.Mesh => {
  const height = Math.abs(endZ - startZ);
  
  // Create cone geometry
  const geometry = new THREE.ConeGeometry(
    radius,
    height,
    16, // radial segments
    1, // height segments
    false // open-ended?
  );
  
  // Create material with transparency
  const material = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  });
  
  // Create mesh
  const cone = new THREE.Mesh(geometry, material);
  
  // Position cone
  cone.position.set(startX, startY, (startZ + endZ) / 2);
  
  // Rotate to point downward (assuming Z is "up")
  cone.rotation.x = Math.PI;
  
  return cone;
};