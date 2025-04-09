import * as THREE from 'three';
import { FixedCycleType, FixedCycleParams } from 'src/components/cam/toolpathUtils/fixedCycles/fixedCyclesParser';

// Base props for the enhanced visualizer
export interface EnhancedToolpathVisualizerProps {
  width: string;
  height: string;
  gcode: string;
  isSimulating: boolean;
  selectedTool?: string | null;
  showWorkpiece?: boolean;
  onSimulationComplete?: () => void;
  onSimulationProgress?: (progress: number) => void;
  onToolChange?: (toolName: string) => void;

}

// Detected cycle representation
export interface DetectedCycle {
  type: FixedCycleType;
  params: FixedCycleParams;
  gCode: string;
  startLine: number;
  endLine: number;
  children?: DetectedCycle[];
}

// Toolpath point with additional fixed cycle information
export interface ToolpathPoint {
  x: number;
  y: number;
  z: number;
  feedrate?: number;
  type?: string;
  isRapid?: boolean;
  isFixedCycle?: boolean;
  cycleType?: string;
  cycleParams?: any;
  i?: number;
  j?: number;
  k?: number;
  r?: number;
  isArc?: boolean;
  arcCenter?: { x: number; y: number; z?: number };
  arcRadius?: number;
  arcStartAngle?: number;
  arcEndAngle?: number;
  isClockwise?: boolean;
  isShape?: boolean;
  shapeType?: 'circle' | 'sphere' | 'cone' | 'extrude';
  shapeParams?: any;
}

// Methods that must be exposed by the ToolpathVisualizer for interaction
export interface ToolpathVisualizerRef {
  stopAnimation: () => void;
  animateCustomPath: (points: ToolpathPoint[], speed: number, onComplete?: () => void) => void;
  focusCamera: (x: number, y: number, z: number) => void;
  onSceneCreated?: (scene: THREE.Scene) => void;
}