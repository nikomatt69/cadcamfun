// src/types/cad.ts
// Comprehensive CAD type definitions

import * as THREE from 'three';

// ============================================
// Element Types
// ============================================

export type ElementType = 
  | 'line' 
  | 'circle' 
  | 'arc' 
  | 'rectangle' 
  | 'polygon'
  | 'polyline'
  | 'spline'
  | 'cube' 
  | 'sphere' 
  | 'cylinder' 
  | 'cone' 
  | 'torus'
  | 'text'
  | 'group'
  | 'workpiece'
  | 'path'
  | 'component'
  | 'imported';

// 2D Element properties
export interface BaseElement2D {
  // Position
  x: number;
  y: number;
  z?: number;
  
  // Dimensions
  width?: number;
  height?: number;
  radius?: number;
  
  // Style
  color?: string;
  fill?: string;
  strokeWidth?: number;
  strokeColor?: string;
  
  // For arcs
  startAngle?: number;
  endAngle?: number;
  clockwise?: boolean;
  
  // For polygons
  sides?: number;
  
  // For splines/polylines
  points?: Array<{ x: number; y: number; z?: number }>;
  
  // Transformation
  rotation?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
}

// 3D Element properties
export interface BaseElement3D {
  // Position
  x: number;
  y: number;
  z: number;
  
  // Dimensions
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  diameter?: number;
  
  // Style
  color?: string;
  material?: string;
  
  // Rotation (Euler angles in degrees)
  rotation?: {
    x?: number;
    y?: number;
    z?: number;
  };
  
  // Scale
  scale?: {
    x?: number;
    y?: number;
    z?: number;
  };
  
  // 3D-specific
  segments?: number; // For sphere, cylinder, etc.
  radialSegments?: number;
  heightSegments?: number;
  
  // For text
  text?: string;
  fontSize?: number;
  fontFamily?: string;
}

// Complete CAD Element
export interface CADElement {
  id: string;
  type: ElementType;
  layerId: string;
  name?: string;
  
  // 2D/3D properties
  x: number;
  y: number;
  z: number;
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  diameter?: number;
  
  // Style
  color?: string;
  fill?: string;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  
  // Transformation
  rotation?: { x?: number; y?: number; z?: number };
  scale?: { x?: number; y?: number; z?: number };
  position?: { x?: number; y?: number; z?: number };
  
  // Geometry
  points?: Array<{ x: number; y: number; z?: number }>;
  segments?: number;
  
  // Group
  isGroup?: boolean;
  elements?: CADElement[];
  
  // Metadata
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
  
  // AI suggestions
  aiSuggestions?: AIDesignSuggestion[];
  
  // Additional properties
  [key: string]: unknown;
}

// ============================================
// Tool Types
// ============================================

export type ToolType = 
  | 'select'
  | 'pan'
  | 'zoom'
  | 'line'
  | 'circle'
  | 'arc'
  | 'rectangle'
  | 'polygon'
  | 'polyline'
  | 'spline'
  | 'cube'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'text'
  | 'measure'
  | 'grid'
  | 'layer'
  | 'snap'
  | 'group'
  | 'ungroup';

export interface ToolDefinition {
  type: ToolType;
  name: string;
  icon: string;
  shortcut?: string;
  category: 'draw' | 'edit' | 'view' | 'transform' | 'annotation';
  description?: string;
}

// ============================================
// View Types
// ============================================

export type ViewMode = '2d' | '3d' | '2.5d';

export type ProjectionType = 'orthographic' | 'perspective';

export interface CameraState {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  zoom: number;
  rotation?: { x: number; y: number; z: number };
}

// ============================================
// Selection Types
// ============================================

export interface SelectionBox {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export interface SelectionFilter {
  types?: ElementType[];
  layers?: string[];
  visible?: boolean;
}

// ============================================
// Rendering Types
// ============================================

export interface RenderOptions {
  antialias?: boolean;
  alpha?: boolean;
  preserveDrawingBuffer?: boolean;
  powerPreference?: 'high-performance' | 'low-power' | 'default';
  shadowMap?: boolean;
  antialiasSamples?: number;
}

export interface GridOptions {
  visible: boolean;
  size: number;
  divisions: number;
  colorCenterLine?: string;
  colorGrid?: string;
  opacity?: number;
}

export interface AxisOptions {
  visible: boolean;
  size?: number;
  xColor?: string;
  yColor?: string;
  zColor?: string;
}

// ============================================
// Snap Types
// ============================================

export enum SnapType {
  GRID = 'grid',
  ENDPOINT = 'endpoint',
  MIDPOINT = 'midpoint',
  INTERSECTION = 'intersection',
  CENTER = 'center',
  QUADRANT = 'quadrant',
  NEAREST = 'nearest',
  TANGENT = 'tangent',
  PERPENDICULAR = 'perpendicular',
  PARALLEL = 'parallel',
  EQUIDISTANT = 'equidistant',
  HORIZONTAL = 'horizontal',
  VERTICAL = 'vertical',
}

export interface SnapSettings {
  enabled: boolean;
  gridEnabled: boolean;
  objectSnapEnabled: boolean;
  gridSize: number;
  snapTolerance: number;
}

export interface SnapPoint {
  x: number;
  y: number;
  z: number;
  type: SnapType;
  elementId?: string;
  priority?: number;
}

// ============================================
// CAD Events
// ============================================

export interface CADEvent {
  type: string;
  timestamp: number;
  userId?: string;
}

export interface ElementEvent extends CADEvent {
  type: 'element_created' | 'element_modified' | 'element_deleted' | 'element_selected';
  elementId: string;
  element?: CADElement;
}

export interface ToolEvent extends CADEvent {
  type: 'tool_changed' | 'tool_executed';
  tool: ToolType;
}

export interface ViewEvent extends CADEvent {
  type: 'view_changed' | 'camera_moved' | 'zoom_changed';
  viewMode: ViewMode;
}

// ============================================
// A11y Types (already imported elsewhere)
// ============================================

export interface AIDesignSuggestion {
  id: string;
  description: string;
  preview?: string;
  type: 'optimization' | 'alternative' | 'improvement';
  confidence?: number;
  potentialImpact?: {
    performanceGain?: number;
    costReduction?: number;
    manufacturabilityScore?: number;
  };
}
