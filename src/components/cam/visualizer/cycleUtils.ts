import * as THREE from 'three';
import { ToolpathPoint, DetectedCycle } from './types';
import { FixedCycleType } from 'src/components/cam/toolpathUtils/fixedCycles/fixedCyclesParser';

/**
 * Generates a sequence of toolpath points that represent the tool movement 
 * for a specific fixed cycle
 */
export function generateCyclePoints(cycle: DetectedCycle): ToolpathPoint[] {
  const points: ToolpathPoint[] = [];
  const { type, params } = cycle;
  
  // Base position for the cycle
  const { x = 0, y = 0, z = 0, r = 0, q, p } = params;
  
  // Add approach point (rapid to R plane)
  points.push({
    x,
    y,
    z: r,
    isRapid: true,
    type: 'G0',
    isFixedCycle: true,
    cycleType: type,
    cycleParams: params
  });
  
  switch (type) {
    case FixedCycleType.DRILLING: // G81
      // Simple drilling cycle - straight down to Z depth
      points.push({
        x,
        y,
        z,
        isRapid: false,
        type: 'G1',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Rapid retract to R plane
      points.push({
        x,
        y,
        z: r,
        isRapid: true,
        type: 'G0',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      break;
      
    case FixedCycleType.DRILLING_DWELL: // G82
      // Drilling with dwell - down to Z depth
      points.push({
        x,
        y,
        z,
        isRapid: false,
        type: 'G1',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Dwell at bottom (visualized as same point)
      points.push({
        x,
        y,
        z,
        isRapid: false,
        type: 'dwell',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Rapid retract to R plane
      points.push({
        x,
        y,
        z: r,
        isRapid: true,
        type: 'G0',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      break;
      
    case FixedCycleType.PECK_DRILLING: // G83
      // Peck drilling with multiple pecks
      const pecks = Math.ceil(Math.abs(r - z) / (q || 1));
      let currentDepth = r;
      
      for (let i = 0; i < pecks; i++) {
        // Calculate next peck depth
        const nextDepth = Math.max(z, r - (i + 1) * (q || 1));
        
        // Peck down
        points.push({
          x,
          y,
          z: nextDepth,
          isRapid: false,
          type: 'G1',
          isFixedCycle: true,
          cycleType: type,
          cycleParams: params
        });
        
        // Rapid retract to R plane after each peck except the last
        if (i < pecks - 1 || nextDepth > z) {
          points.push({
            x,
            y,
            z: r,
            isRapid: true,
            type: 'G0',
            isFixedCycle: true,
            cycleType: type,
            cycleParams: params
          });
        }
        
        currentDepth = nextDepth;
      }
      
      // Final retract after reaching final depth
      points.push({
        x,
        y,
        z: r,
        isRapid: true,
        type: 'G0',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      break;
      
    case FixedCycleType.RIGHT_TAPPING: // G84
      // Down to Z depth
      points.push({
        x,
        y,
        z,
        isRapid: false,
        type: 'G1',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Reverse spindle and retract at feed rate (not rapid)
      points.push({
        x,
        y,
        z: r,
        isRapid: false,
        type: 'G1',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      break;
      
    case FixedCycleType.BORING: // G85
      // Boring down to Z depth
      points.push({
        x,
        y,
        z,
        isRapid: false,
        type: 'G1',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Retract at feed rate (not rapid)
      points.push({
        x,
        y,
        z: r,
        isRapid: false,
        type: 'G1',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      break;
      
    case FixedCycleType.BORING_DWELL: // G86
      // Boring down to Z depth
      points.push({
        x,
        y,
        z,
        isRapid: false,
        type: 'G1',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Dwell at bottom
      points.push({
        x,
        y,
        z,
        isRapid: false,
        type: 'dwell',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Rapid retract
      points.push({
        x,
        y,
        z: r,
        isRapid: true,
        type: 'G0',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      break;
      
    case FixedCycleType.BACK_BORING: // G87
      // This is a complex cycle - simplified visualization
      // Rapid to center
      points.push({
        x,
        y,
        z: r,
        isRapid: true,
        type: 'G0',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Orient spindle and offset
      points.push({
        x: x + 2, // Offset for visualization
        y,
        z: r,
        isRapid: true,
        type: 'G0',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Rapid down to Z
      points.push({
        x: x + 2,
        y,
        z,
        isRapid: true,
        type: 'G0',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Move back to center
      points.push({
        x,
        y,
        z,
        isRapid: false,
        type: 'G1',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Cutting move upward
      points.push({
        x,
        y,
        z: r - 2, // Cutting portion
        isRapid: false,
        type: 'G1',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Offset for clearance
      points.push({
        x: x + 2,
        y,
        z: r - 2,
        isRapid: true,
        type: 'G0',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Rapid to R plane
      points.push({
        x: x + 2,
        y,
        z: r,
        isRapid: true,
        type: 'G0',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Back to center
      points.push({
        x,
        y,
        z: r,
        isRapid: true,
        type: 'G0',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      break;
      
    case FixedCycleType.BORING_WITH_RETRACT: // G88
      // Down to Z depth
      points.push({
        x,
        y,
        z,
        isRapid: false,
        type: 'G1',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Dwell at bottom
      points.push({
        x,
        y,
        z,
        isRapid: false,
        type: 'dwell',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Manual retract (visualized as rapid)
      points.push({
        x,
        y,
        z: r,
        isRapid: true,
        type: 'G0',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      break;
      
    case FixedCycleType.BORING_WITH_RETRACT: // G89
      // Down to Z depth
      points.push({
        x,
        y,
        z,
        isRapid: false,
        type: 'G1',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Dwell at bottom
      points.push({
        x,
        y,
        z,
        isRapid: false,
        type: 'dwell',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      // Feed rate retract
      points.push({
        x,
        y,
        z: r,
        isRapid: false,
        type: 'G1',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      break;
      
    default:
      // Generic approach for unsupported cycles
      points.push({
        x,
        y,
        z,
        isRapid: false,
        type: 'G1',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
      
      points.push({
        x,
        y,
        z: r,
        isRapid: true,
        type: 'G0',
        isFixedCycle: true,
        cycleType: type,
        cycleParams: params
      });
  }
  
  return points;
}

/**
 * Creates a Three.js visual representation of a fixed cycle
 */
export function createCycleVisualization(cycle: DetectedCycle): THREE.Group {
  const group = new THREE.Group();
  group.name = `FixedCycle-${cycle.type}`;
  
  const { params } = cycle;
  const { x = 0, y = 0, z = 0, r = 0, q, p } = params;
  
  // Create the R-plane representation (reference plane)
  const rPlaneGeometry = new THREE.CircleGeometry(5, 32);
  const rPlaneMaterial = new THREE.MeshBasicMaterial({
    color: 0x4287f5,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide
  });
  const rPlane = new THREE.Mesh(rPlaneGeometry, rPlaneMaterial);
  rPlane.position.set(x, y, r);
  rPlane.rotation.x = Math.PI / 2; // Lay flat on XY plane
  group.add(rPlane);
  
  // Create Z-depth indicator
  const zPlaneGeometry = new THREE.CircleGeometry(3, 32);
  const zPlaneMaterial = new THREE.MeshBasicMaterial({
    color: 0xf54242, // Red for Z depth
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide
  });
  const zPlane = new THREE.Mesh(zPlaneGeometry, zPlaneMaterial);
  zPlane.position.set(x, y, z);
  zPlane.rotation.x = Math.PI / 2;
  group.add(zPlane);
  
  // Create connecting line from R to Z
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x4287f5 });
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x, y, r),
    new THREE.Vector3(x, y, z)
  ]);
  const line = new THREE.Line(lineGeometry, lineMaterial);
  group.add(line);
  
  // Create cycle-specific visualizations
  switch (cycle.type) {
    case FixedCycleType.PECK_DRILLING: // G83
      if (q) {
        // Visualize the peck depths
        const pecks = Math.ceil(Math.abs(r - z) / q);
        for (let i = 1; i <= pecks; i++) {
          const peckDepth = r - (i * q);
          if (peckDepth >= z) { // Don't go past Z depth
            // Create a small indicator for each peck depth
            const peckMarkerGeometry = new THREE.RingGeometry(1, 1.5, 16);
            const peckMarkerMaterial = new THREE.MeshBasicMaterial({
              color: 0xf5a742, // Orange for peck depths
              transparent: true,
              opacity: 0.5,
              side: THREE.DoubleSide
            });
            const peckMarker = new THREE.Mesh(peckMarkerGeometry, peckMarkerMaterial);
            peckMarker.position.set(x, y, peckDepth);
            peckMarker.rotation.x = Math.PI / 2;
            group.add(peckMarker);
            
            // Add dotted lines to show retract movements
            const retractLineGeometry = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(x, y, peckDepth),
              new THREE.Vector3(x, y, r)
            ]);
            const retractLineMaterial = new THREE.LineDashedMaterial({
              color: 0xf5a742,
              dashSize: 0.5,
              gapSize: 0.5
            });
            const retractLine = new THREE.Line(retractLineGeometry, retractLineMaterial);
            retractLine.computeLineDistances(); // Required for dashed lines
            group.add(retractLine);
          }
        }
      }
      break;
      
    case FixedCycleType.RIGHT_TAPPING: // G84
      // Add spiral pattern to indicate threading
      const spiralPoints = [];
      const spiralSegments = 20;
      const spiralRadius = 2;
      for (let i = 0; i <= spiralSegments; i++) {
        const t = i / spiralSegments;
        const spiralZ = r - (r - z) * t;
        const angle = t * Math.PI * 6; // Multiple rotations
        const spiralX = x + spiralRadius * Math.cos(angle) * t;
        const spiralY = y + spiralRadius * Math.sin(angle) * t;
        spiralPoints.push(new THREE.Vector3(spiralX, spiralY, spiralZ));
      }
      
      const spiralGeometry = new THREE.BufferGeometry().setFromPoints(spiralPoints);
      const spiralMaterial = new THREE.LineBasicMaterial({ color: 0x42f5ef }); // Cyan
      const spiral = new THREE.Line(spiralGeometry, spiralMaterial);
      group.add(spiral);
      break;
      
    case FixedCycleType.BORING:
    case FixedCycleType.BORING_DWELL:
    case FixedCycleType.BORING_WITH_RETRACT:
      // Add an enlarged hole marker for boring operations
      const boringHoleGeometry = new THREE.RingGeometry(3, 3.5, 32);
      const boringHoleMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x42f59e, // Green
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
      });
      const boringHole = new THREE.Mesh(boringHoleGeometry, boringHoleMaterial);
      boringHole.position.set(x, y, z);
      boringHole.rotation.x = Math.PI / 2;
      group.add(boringHole);
      
      // Add slower retract indication for G85/G89
      if (cycle.type === FixedCycleType.BORING || 
          cycle.type === FixedCycleType.BORING_WITH_RETRACT) {
        const feedRetractGeometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, y, z),
          new THREE.Vector3(x, y, r)
        ]);
        const feedRetractMaterial = new THREE.LineBasicMaterial({
          color: 0x42f59e, // Green
          linewidth: 2
        });
        const feedRetractLine = new THREE.Line(feedRetractGeometry, feedRetractMaterial);
        group.add(feedRetractLine);
      }
      break;
  }
  
  // Add tooltip/label for the cycle
  const cycleLabel = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xffffff,
    sizeAttenuation: false
  }));
  cycleLabel.position.set(x + 7, y, r);
  cycleLabel.scale.set(0.5, 0.5, 1);
  cycleLabel.userData.type = cycle.type;
  cycleLabel.userData.isLabel = true;
  group.add(cycleLabel);
  
  return group;
}