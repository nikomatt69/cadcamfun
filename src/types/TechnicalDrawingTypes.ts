// src/types/TechnicalDrawingTypes.ts

import { z } from "zod";

// Base coordinates and points
export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Drawing layer definition
export interface DrawingLayer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  order?: number;
  description?: string;
}

// Common properties for all drawing entities
export interface BaseDrawingEntity {
  id: string;
  type: string;
  layer: string;
  visible: boolean;
  locked: boolean;
  style: DrawingStyle;
  metadata?: Record<string, any>; // Optional metadata for annotations, BOM info, etc.
  groupId?: string; // For grouped entities
}

// Styling for drawing entities
export interface DrawingStyle {
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: "solid" | "dashed" | "dotted" | "dash-dot" | "center" | "phantom" | "hidden";
  fillColor?: string;
  fillOpacity?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
}

// Specific entities
export interface LineEntity extends BaseDrawingEntity {
  type: "line";
  startPoint: Point;
  endPoint: Point;
}

export interface CircleEntity extends BaseDrawingEntity {
  type: "circle";
  center: Point;
  radius: number;
}

export interface ArcEntity extends BaseDrawingEntity {
  type: "arc";
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
  counterclockwise?: boolean;
}

export interface RectangleEntity extends BaseDrawingEntity {
  type: "rectangle";
  position: Point;
  width: number;
  height: number;
  rotation?: number;
  cornerRadius?: number; // For rounded rectangles
}

export interface PolylineEntity extends BaseDrawingEntity {
  type: "polyline";
  points: Point[];
  closed?: boolean;
}

export interface EllipseEntity extends BaseDrawingEntity {
  type: "ellipse";
  center: Point;
  radiusX: number;
  radiusY: number;
  rotation?: number;
}

export interface SplineEntity extends BaseDrawingEntity {
  type: "spline";
  points: Point[];
  controlPoints?: Point[];
  closed?: boolean;
}

export interface PolygonEntity extends BaseDrawingEntity {
  type: "polygon";
  center: Point;
  radius: number;
  sides: number;
  rotation?: number;
}

export interface PathEntity extends BaseDrawingEntity {
  type: "path";
  commands: string; // SVG-style path commands
  startPoint: Point;
}

export interface HatchEntity extends BaseDrawingEntity {
  type: "hatch";
  boundary: Point[]; // Outline points of the hatch
  pattern: "solid" | "lines" | "dots" | "cross" | "diagonal" | "custom";
  patternScale?: number;
  patternAngle?: number;
  patternSpacing?: number;
  patternDefinition?: string; // Custom pattern definition
}

// Dimensions
export interface LinearDimension extends BaseDrawingEntity {
  type: "linear-dimension";
  startPoint: Point;
  endPoint: Point;
  offsetDistance: number;
  text?: string;
  textPosition?: Point;
  extension1Length?: number;
  extension2Length?: number;
  angle?: number;
}

export interface AlignedDimension extends BaseDrawingEntity {
  type: "aligned-dimension";
  startPoint: Point;
  endPoint: Point;
  offsetDistance: number;
  text?: string;
  textPosition?: Point;
}

export interface AngularDimension extends BaseDrawingEntity {
  type: "angular-dimension";
  vertex: Point;
  startPoint: Point;
  endPoint: Point;
  radius?: number;
  text?: string;
}

export interface RadialDimension extends BaseDrawingEntity {
  type: "radial-dimension";
  center: Point;
  pointOnCircle: Point;
  text?: string;
  leader?: boolean;
}

export interface DiameterDimension extends BaseDrawingEntity {
  type: "diameter-dimension";
  center: Point;
  pointOnCircle: Point;
  text?: string;
  leader?: boolean;
}

export interface ChainDimension extends BaseDrawingEntity {
  type: "chain-dimension";
  points: Point[];
  offsetDistance: number;
  dimensionIds: string[]; // IDs of individual dimensions in the chain
}

// Unified dimension entity used by DimensionTool
export interface DimensionEntity extends BaseDrawingEntity {
  type: "dimension";
  dimensionType: DimensionType;
  points: Point[];
  extensionDistance: number;
  offsetDistance: number;
  text: string;
}

// Annotations
export interface TextAnnotation extends BaseDrawingEntity {
  type: "text-annotation";
  position: Point;
  text: string;
  rotation?: number;
  width?: number; // For text wrapping
  height?: number;
}

export interface LeaderAnnotation extends BaseDrawingEntity {
  type: "leader-annotation";
  startPoint: Point;
  points: Point[];
  text: string;
  textPosition?: Point;
}

export interface SymbolAnnotation extends BaseDrawingEntity {
  type: "symbol-annotation";
  position: Point;
  symbolType: "weld" | "surface-finish" | "datum" | "gdt" | "center-mark" | "section-mark";
  symbolData: any; // Specific to the symbol type
  rotation?: number;
  scale?: number;
}

export interface ToleranceAnnotation extends BaseDrawingEntity {
  type: "tolerance-annotation";
  position: Point;
  primaryValue: string;
  upperTolerance?: string;
  lowerTolerance?: string;
  toleranceType: "bilateral" | "unilateral" | "limit";
}

// Views
export interface DrawingViewport {
  id: string;
  name: string;
  type: "front" | "top" | "side" | "isometric" | "section" | "detail" | "custom";
  position: Point;
  width: number;
  height: number;
  scale: number;
  rotation?: number;
  entities: string[]; // IDs of entities in this viewport
  parentViewportId?: string; // For detail views
  sectionLine?: [Point, Point]; // For section views
  visible: boolean;
  locked: boolean;
}

// Drawing sheet
export interface DrawingSheet {
  id: string;
  size: "A0" | "A1" | "A2" | "A3" | "A4" | "custom";
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
  scale: number;
  units: "mm" | "inch" | "cm";
  margin: { top: number; right: number; bottom: number; left: number };
  titleBlock?: TitleBlock;
  borderVisible?: boolean;
  backgroundColor?: string;
}

export interface TitleBlock {
  position: Point;
  width: number;
  height: number;
  fields: {
    title: string;
    drawingNumber: string;
    revision: string;
    date: string;
    author: string;
    approver: string;
    company: string;
    scale: string;
    sheet: string;
    [key: string]: string;
  };
  template?: string; // ID of title block template
}

// Command history
export interface Command {
  id: string;
  type: string;
  timestamp: number;
  description: string;
  entities?: string[];
  undo: () => void;
  redo: () => void;
}

// Union type for all drawing entities
export type DrawingEntity =
  | LineEntity
  | CircleEntity
  | ArcEntity
  | RectangleEntity
  | PolylineEntity
  | EllipseEntity
  | SplineEntity
  | PolygonEntity
  | PathEntity
  | HatchEntity;

// Union type for all dimension entities
export type Dimension =
  | LinearDimension
  | AlignedDimension
  | AngularDimension
  | RadialDimension
  | DiameterDimension
  | ChainDimension;

// Union type for all annotation entities
export type Annotation = TextAnnotation | LeaderAnnotation | SymbolAnnotation | ToleranceAnnotation;

// Drawing Standards Types
export type DrawingStandard = "ISO" | "ANSI" | "DIN" | "JIS" | "GB" | "custom";

// Zod Schema for validation
export const pointSchema = z.object({
  x: z.number(),
  y: z.number()
});

export const styleSchema = z.object({
  strokeColor: z.string(),
  strokeWidth: z.number(),
  strokeStyle: z.enum(["solid", "dashed", "dotted", "dash-dot", "center", "phantom", "hidden"]),
  fillColor: z.string().optional(),
  fillOpacity: z.number().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().optional(),
  fontWeight: z.enum(["normal", "bold"]).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional()
});

export const baseEntitySchema = z.object({
  id: z.string(),
  type: z.string(),
  layer: z.string(),
  visible: z.boolean(),
  locked: z.boolean(),
  style: styleSchema
});

export const drawingLayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  visible: z.boolean(),
  locked: z.boolean(),
  order: z.number().optional(),
  description: z.string().optional()
});

// Converter functions
export function convert3DTo2D(model3D: any, viewType: "front" | "top" | "side"): DrawingEntity[] {
  // Implementation will depend on your 3D model structure
  const entities: DrawingEntity[] = [];

  // This is a placeholder - actual implementation would:
  // 1. Project 3D vertices to 2D based on view type
  // 2. Create appropriate 2D entities (lines, arcs, etc)
  // 3. Apply proper styles based on drawing standards

  return entities;
}

// Entity Types
export const DrawingEntityType = {
  LINE: "line",
  CIRCLE: "circle",
  ARC: "arc",
  RECTANGLE: "rectangle",
  POLYLINE: "polyline",
  ELLIPSE: "ellipse",
  SPLINE: "spline",
  POLYGON: "polygon",
  PATH: "path",
  HATCH: "hatch",
  TEXT: "text",
  DIMENSION: "dimension"
} as const;

export const DimensionType = {
  LINEAR: "linear-dimension",
  ALIGNED: "aligned-dimension",
  ANGULAR: "angular-dimension",
  RADIAL: "radial-dimension",
  DIAMETRICAL: "diametrical-dimension"
} as const;

// Text alignment options
export enum TextAlignment {
  LEFT = "left",
  CENTER = "center",
  RIGHT = "right"
}

export const AnnotationType = {
  TEXT: "text-annotation",
  LABEL: "label-annotation",
  NOTE: "note-annotation",
  SYMBOL: "symbol-annotation",
  TOLERANCE: "tolerance-annotation"
} as const;

export type DrawingEntityType = (typeof DrawingEntityType)[keyof typeof DrawingEntityType];
export type DimensionType = (typeof DimensionType)[keyof typeof DimensionType];
export type AnnotationType = (typeof AnnotationType)[keyof typeof AnnotationType];

// Snap Modes for CAD functionality
export enum SnapType {
  ENDPOINT = "endpoint",
  MIDPOINT = "midpoint",
  CENTER = "center",
  QUADRANT = "quadrant",
  INTERSECTION = "intersection",
  GRID = "grid",
  NEAREST = "nearest",
  TANGENT = "tangent",
  PERPENDICULAR = "perpendicular",
  EXTENSION = "extension",
  PARALLEL = "parallel",
  NODE = "node", // Snap to points/nodes in entities like polylines or splines
  POLAR = "polar" // For polar tracking lines
}

export type SnapMode = keyof typeof SnapType;

export type EntityType = DrawingEntityType | DimensionType | AnnotationType;

export interface BaseEntity {
  id: string;
  layer: string;
  visible: boolean;
  locked: boolean;
  style: DrawingStyle;
  metadata?: Record<string, any>;
  groupId?: string;
}

export interface DrawingEntityBase extends BaseEntity {
  type: DrawingEntityType;
}

export interface DimensionBase extends BaseEntity {
  type: DimensionType;
}

export interface AnnotationBase extends BaseEntity {
  type: AnnotationType;
}

export type AnyEntity = DrawingEntityBase | DimensionBase | AnnotationBase;
export type EntityWithoutId<T extends AnyEntity> = Omit<T, "id">;

export function isDrawingEntity(entity: Partial<AnyEntity>): entity is Partial<DrawingEntityBase> {
  return entity.type !== undefined && Object.values(DrawingEntityType).includes(entity.type as DrawingEntityType);
}

export function isDimension(entity: Partial<AnyEntity>): entity is Partial<DimensionBase> {
  return entity.type !== undefined && Object.values(DimensionType).includes(entity.type as DimensionType);
}

export function isAnnotation(entity: Partial<AnyEntity>): entity is Partial<AnnotationBase> {
  return entity.type !== undefined && Object.values(AnnotationType).includes(entity.type as AnnotationType);
}

export function createEntity<T extends AnyEntity>(
  type: EntityType,
  partialEntity: Partial<EntityWithoutId<T>> = {}
): EntityWithoutId<T> {
  const baseEntity = {
    type,
    layer: "default",
    visible: true,
    locked: false,
    style: {
      strokeColor: "#000000",
      strokeWidth: 1,
      strokeStyle: "solid",
      fillColor: "none"
    },
    ...partialEntity
  };

  if (isDrawingEntity(baseEntity as Partial<AnyEntity>)) {
    return baseEntity as EntityWithoutId<DrawingEntityBase> as EntityWithoutId<T>;
  } else if (isDimension(baseEntity as Partial<AnyEntity>)) {
    return baseEntity as EntityWithoutId<DimensionBase> as EntityWithoutId<T>;
  } else if (isAnnotation(baseEntity as Partial<AnyEntity>)) {
    return baseEntity as EntityWithoutId<AnnotationBase> as EntityWithoutId<T>;
  }

  throw new Error(`Invalid entity type: ${type}`);
}
