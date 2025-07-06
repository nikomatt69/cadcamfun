// Tipi per le entità CAD 2D

import { Point2D, BoundingBox, LineStyle, Transform2D } from "./geometry";

export enum EntityType {
  LINE = "LINE",
  CIRCLE = "CIRCLE",
  ARC = "ARC",
  POLYLINE = "POLYLINE",
  RECTANGLE = "RECTANGLE",
  ELLIPSE = "ELLIPSE",
  TEXT = "TEXT",
  DIMENSION = "DIMENSION",
  HATCH = "HATCH",
  BLOCK = "BLOCK",
  SPLINE = "SPLINE"
}

export interface BaseEntity {
  id: string;
  type: EntityType;
  layerId: string;
  selected: boolean;
  visible: boolean;
  locked: boolean;
  lineStyle?: LineStyle;
  transform?: Transform2D;
  userData?: Record<string, any>;
}

export interface LineEntity extends BaseEntity {
  type: EntityType.LINE;
  start: Point2D;
  end: Point2D;
}

export interface CircleEntity extends BaseEntity {
  type: EntityType.CIRCLE;
  center: Point2D;
  radius: number;
}

export interface ArcEntity extends BaseEntity {
  type: EntityType.ARC;
  center: Point2D;
  radius: number;
  startAngle: number; // in radianti
  endAngle: number; // in radianti
  clockwise: boolean;
}

export interface PolylineEntity extends BaseEntity {
  type: EntityType.POLYLINE;
  points: Point2D[];
  closed: boolean;
}

export interface RectangleEntity extends BaseEntity {
  type: EntityType.RECTANGLE;
  corner1: Point2D;
  corner2: Point2D;
}

export interface EllipseEntity extends BaseEntity {
  type: EntityType.ELLIPSE;
  center: Point2D;
  radiusX: number;
  radiusY: number;
  rotation: number; // in radianti
}

export interface TextEntity extends BaseEntity {
  type: EntityType.TEXT;
  position: Point2D;
  text: string;
  fontSize: number;
  fontFamily: string;
  rotation: number; // in radianti
  alignment: "left" | "center" | "right";
  baseline: "top" | "middle" | "bottom";
}

export interface DimensionEntity extends BaseEntity {
  type: EntityType.DIMENSION;
  start: Point2D;
  end: Point2D;
  text: string;
  textPosition: Point2D;
  arrowSize: number;
  textSize: number;
  dimensionType: "linear" | "aligned" | "angular" | "radial" | "diameter";
}

export interface HatchEntity extends BaseEntity {
  type: EntityType.HATCH;
  boundary: Point2D[];
  pattern: "solid" | "lines" | "dots" | "cross";
  scale: number;
  angle: number; // in radianti
  fillColor?: string;
}

export interface BlockEntity extends BaseEntity {
  type: EntityType.BLOCK;
  name: string;
  basePoint: Point2D;
  entities: Entity[];
}

export interface SplineEntity extends BaseEntity {
  type: EntityType.SPLINE;
  controlPoints: Point2D[];
  degree: number;
  closed: boolean;
}

export type Entity =
  | LineEntity
  | CircleEntity
  | ArcEntity
  | PolylineEntity
  | RectangleEntity
  | EllipseEntity
  | TextEntity
  | DimensionEntity
  | HatchEntity
  | BlockEntity
  | SplineEntity;

export interface EntityGroup {
  id: string;
  name: string;
  entities: string[]; // array di entity IDs
  locked: boolean;
}

export interface Selection {
  entities: string[]; // array di entity IDs
  boundingBox: BoundingBox | null;
}
