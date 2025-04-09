import * as THREE from 'three';
import { ToolpathPoint } from '@/src/hooks/useToolpathVisualization';

/**
 * Utilities for smoother toolpath animations and transitions
 */

/**
 * Lerp (Linear interpolation) function
 */
export function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}

/**
 * Smoothly interpolate between two points on the toolpath
 */
export function interpolateToolpathPoints(
  p1: ToolpathPoint,
  p2: ToolpathPoint,
  t: number
): ToolpathPoint {
  return {
    x: lerp(p1.x, p2.x, t),
    y: lerp(p1.y, p2.y, t),
    z: lerp(p1.z, p2.z, t),
    feedrate: p2.feedrate || p1.feedrate,
    type: t < 0.5 ? p1.type : p2.type,
    isRapid: t < 0.5 ? p1.isRapid : p2.isRapid
  };
}

/**
 * Calculate orientation for a tool moving along a toolpath
 * This makes the tool smoothly orient between segments
 */
export function calculateToolOrientation(
  currentPoint: ToolpathPoint,
  nextPoint: ToolpathPoint | null
): THREE.Quaternion {
  // Default orientation (Z axis pointing down)
  const defaultOrientation = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(Math.PI / 2, 0, 0)
  );
  
  // If no next point, use default orientation
  if (!nextPoint) return defaultOrientation;
  
  // Calculate movement vector
  const moveVector = new THREE.Vector3(
    nextPoint.x - currentPoint.x,
    nextPoint.y - currentPoint.y,
    nextPoint.z - currentPoint.z
  );
  
  // If movement is too small, use default orientation
  if (moveVector.length() < 0.001) return defaultOrientation;
  
  // Normalize vector
  moveVector.normalize();
  
  // Calculate orientation to point along the path
  // For most CNC applications, the tool orientation stays vertical
  // So we only need to worry about very specific tool types
  
  // For standard machining, keep tool vertical
  return defaultOrientation;
}

/**
 * Create a continuous toolpath preview with proper coloring
 */
export function createToolpathVisualization(
  points: ToolpathPoint[],
  options: {
    rapidColor?: THREE.Color;
    cutColor?: THREE.Color;
    lineWidth?: number;
    highlightDepth?: boolean;
  } = {}
): THREE.Object3D {
  if (points.length < 2) {
    return new THREE.Group(); // Return empty group if not enough points
  }
  
  const {
    rapidColor = new THREE.Color(0xff0000),
    cutColor = new THREE.Color(0x00ff00),
    lineWidth = 2,
    highlightDepth = false
  } = options;
  
  // Find z-range for depth coloring
  let minZ = Infinity;
  let maxZ = -Infinity;
  
  if (highlightDepth) {
    points.forEach(point => {
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    });
  }
  
  // Create geometry with vertex colors
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const lines: number[] = [];
  
  // Add points and colors
  points.forEach((point, index) => {
    positions.push(point.x, point.y, point.z);
    
    // Add vertex color
    let color;
    
    if (highlightDepth && maxZ !== minZ) {
      // Color based on Z depth (blue to red)
      const t = (point.z - minZ) / (maxZ - minZ);
      color = new THREE.Color(t, 0, 1 - t);
    } else {
      // Color based on move type
      color = point.isRapid || point.type === 'G0' ? rapidColor : cutColor;
    }
    
    colors.push(color.r, color.g, color.b);
    
    // Add line indices
    if (index > 0) {
      lines.push(index - 1, index);
    }
  });
  
  // Set geometry attributes
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  
  // For line segments, we need to use LineSegments with a different buffer
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  lineGeometry.setIndex(lines);
  
  // Create line material
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    linewidth: lineWidth
  });
  
  const toolpathObject = new THREE.LineSegments(lineGeometry, material);
  toolpathObject.userData.isToolpath = true;
  
  return toolpathObject;
}

/**
 * Create a toolpath preview with segments separated by type (rapid vs. cutting)
 * This can be more efficient for rendering and better for visualization
 */
export function createSegmentedToolpathVisualization(
  points: ToolpathPoint[],
  options: {
    rapidColor?: THREE.Color;
    cutColor?: THREE.Color;
    lineWidth?: number;
    highlightDepth?: boolean;
  } = {}
): THREE.Group {
  if (points.length < 2) {
    return new THREE.Group(); // Return empty group if not enough points
  }
  
  const {
    rapidColor = new THREE.Color(0xff0000),
    cutColor = new THREE.Color(0x00ff00),
    lineWidth = 2,
    highlightDepth = false
  } = options;
  
  // Create a group to hold all segments
  const toolpathGroup = new THREE.Group();
  toolpathGroup.userData.isToolpath = true;
  
  // Split points into segments by type
  const segments: ToolpathPoint[][] = [];
  let currentSegment: ToolpathPoint[] = [points[0]];
  let currentType = points[0].isRapid || points[0].type === 'G0';
  
  // Group consecutive points of the same type
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    const pointType = point.isRapid || point.type === 'G0';
    
    if (pointType === currentType) {
      // Same type, add to current segment
      currentSegment.push(point);
    } else {
      // Type changed, start new segment
      segments.push(currentSegment);
      currentSegment = [points[i-1], point]; // Include last point of previous segment for continuity
      currentType = pointType;
    }
  }
  
  // Add the last segment
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }
  
  // Find z-range for depth coloring (across all points)
  let minZ = Infinity;
  let maxZ = -Infinity;
  
  if (highlightDepth) {
    points.forEach(point => {
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    });
  }
  
  // Create a line for each segment
  segments.forEach((segment, segmentIndex) => {
    const segmentType = segment[0].isRapid || segment[0].type === 'G0';
    const segmentColor = segmentType ? rapidColor : cutColor;
    
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    
    segment.forEach(point => {
      positions.push(point.x, point.y, point.z);
      
      // Determine color
      let color;
      if (highlightDepth && maxZ !== minZ) {
        // Color based on Z depth
        const t = (point.z - minZ) / (maxZ - minZ);
        color = new THREE.Color(t, 0, 1 - t);
      } else {
        color = segmentColor;
      }
      
      colors.push(color.r, color.g, color.b);
    });
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    const material = new THREE.LineBasicMaterial({
      vertexColors: highlightDepth,
      color: highlightDepth ? undefined : segmentColor,
      linewidth: lineWidth
    });
    
    const line = new THREE.Line(geometry, material);
    line.userData.isToolpathSegment = true;
    line.userData.segmentIndex = segmentIndex;
    line.userData.isRapid = segmentType;
    
    toolpathGroup.add(line);
  });
  
  return toolpathGroup;
}

/**
 * Create a 3D tube visualization of the toolpath
 * This produces a more visually appealing representation
 */
export function createToolpathTube(
  points: ToolpathPoint[],
  options: {
    rapidColor?: THREE.Color;
    cutColor?: THREE.Color;
    rapidRadius?: number;
    cutRadius?: number;
    tubularSegments?: number;
    radialSegments?: number;
    highlightDepth?: boolean;
  } = {}
): THREE.Group {
  if (points.length < 2) {
    return new THREE.Group(); // Return empty group if not enough points
  }
  
  const {
    rapidColor = new THREE.Color(0xff3333),
    cutColor = new THREE.Color(0x33ff33),
    rapidRadius = 0.5,
    cutRadius = 1.0,
    tubularSegments = 64,
    radialSegments = 8,
    highlightDepth = false
  } = options;
  
  // Create a group to hold all tubes
  const toolpathGroup = new THREE.Group();
  toolpathGroup.userData.isToolpath = true;
  
  // Find z-range for depth coloring (across all points)
  let minZ = Infinity;
  let maxZ = -Infinity;
  
  if (highlightDepth) {
    points.forEach(point => {
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    });
  }
  
  // Split points into segments by type
  const segments: ToolpathPoint[][] = [];
  let currentSegment: ToolpathPoint[] = [points[0]];
  let currentType = points[0].isRapid || points[0].type === 'G0';
  
  // Group consecutive points of the same type
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    const pointType = point.isRapid || point.type === 'G0';
    
    if (pointType === currentType) {
      // Same type, add to current segment
      currentSegment.push(point);
    } else {
      // Type changed, start new segment
      segments.push(currentSegment);
      currentSegment = [point];
      currentType = pointType;
    }
  }
  
  // Add the last segment
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }
  
  // Create a tube for each segment with enough points
  segments.forEach((segment, segmentIndex) => {
    if (segment.length < 2) return; // Need at least 2 points for a curve
    
    const segmentType = segment[0].isRapid || segment[0].type === 'G0';
    const segmentColor = segmentType ? rapidColor : cutColor;
    const radius = segmentType ? rapidRadius : cutRadius;
    
    // Create path from points
    const path = new THREE.CatmullRomCurve3(
      segment.map(p => new THREE.Vector3(p.x, p.y, p.z))
    );
    
    // Create tube along path
    const geometry = new THREE.TubeGeometry(
      path,
      segment.length > 100 ? 100 : segment.length, // Limit segments for performance
      radius,
      radialSegments,
      false
    );
    
    // Create material with appropriate coloring
    let material;
    
    if (highlightDepth) {
      // Create vertex colors based on depth
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      const positionAttr = geometry.attributes.position;
      
      for (let i = 0; i < positionAttr.count; i++) {
        const z = positionAttr.getZ(i);
        const t = (z - minZ) / (maxZ - minZ);
        
        const color = new THREE.Color(t, 0, 1 - t);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
      
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      
      material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.2,
        roughness: 0.8
      });
    } else {
      material = new THREE.MeshStandardMaterial({
        color: segmentColor,
        metalness: 0.2,
        roughness: 0.8
      });
    }
    
    const tube = new THREE.Mesh(geometry, material);
    tube.userData.isToolpathSegment = true;
    tube.userData.segmentIndex = segmentIndex;
    tube.userData.isRapid = segmentType;
    
    // Enable shadows
    tube.castShadow = true;
    tube.receiveShadow = true;
    
    toolpathGroup.add(tube);
  });
  
  return toolpathGroup;
}
