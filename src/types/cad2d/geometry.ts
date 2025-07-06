// Tipi geometrici base per CAD 2D

export interface Point2D {
  x: number;
  y: number;
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface BoundingBox {
  min: Point2D;
  max: Point2D;
}

export interface Transform2D {
  translation: Vector2D;
  rotation: number; // in radianti
  scale: Vector2D;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export enum LineType {
  CONTINUOUS = "CONTINUOUS",
  DASHED = "DASHED",
  DOTTED = "DOTTED",
  CENTER = "CENTER",
  PHANTOM = "PHANTOM"
}

export interface LineStyle {
  color: Color;
  width: number;
  type: LineType;
}

export interface LayerProperties {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color: Color;
  lineStyle: LineStyle;
  opacity: number;
}

export interface CoordinateSystem {
  origin: Point2D;
  scale: number;
  rotation: number;
  unit: "mm" | "cm" | "m" | "inch" | "ft";
}

export interface SnapSettings {
  gridSnap: boolean;
  objectSnap: boolean;
  angleSnap: boolean;
  snapTolerance: number;
}

export enum SnapType {
  ENDPOINT = "ENDPOINT",
  MIDPOINT = "MIDPOINT",
  CENTER = "CENTER",
  INTERSECTION = "INTERSECTION",
  PERPENDICULAR = "PERPENDICULAR",
  TANGENT = "TANGENT",
  NEAREST = "NEAREST",
  QUADRANT = "QUADRANT"
}

export interface GridSettings {
  visible: boolean;
  spacing: number;
  majorSpacing: number;
  style: "dots" | "lines";
  color: Color;
  opacity: number;
}
