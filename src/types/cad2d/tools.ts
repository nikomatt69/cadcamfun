// Tipi per gli strumenti CAD 2D

import { Point2D } from "./geometry";
import { Entity } from "./entities";

export enum ToolType {
  // Strumenti di selezione
  SELECT = "SELECT",
  SELECT_WINDOW = "SELECT_WINDOW",
  SELECT_CROSSING = "SELECT_CROSSING",

  // Strumenti di disegno
  LINE = "LINE",
  POLYLINE = "POLYLINE",
  RECTANGLE = "RECTANGLE",
  CIRCLE = "CIRCLE",
  ARC = "ARC",
  ELLIPSE = "ELLIPSE",
  SPLINE = "SPLINE",
  TEXT = "TEXT",

  // Strumenti di modifica
  MOVE = "MOVE",
  COPY = "COPY",
  ROTATE = "ROTATE",
  SCALE = "SCALE",
  MIRROR = "MIRROR",
  OFFSET = "OFFSET",
  TRIM = "TRIM",
  EXTEND = "EXTEND",
  FILLET = "FILLET",
  CHAMFER = "CHAMFER",
  ARRAY = "ARRAY",

  // Strumenti di quota
  DIM_LINEAR = "DIM_LINEAR",
  DIM_ALIGNED = "DIM_ALIGNED",
  DIM_ANGULAR = "DIM_ANGULAR",
  DIM_RADIUS = "DIM_RADIUS",
  DIM_DIAMETER = "DIM_DIAMETER",

  // Strumenti di visualizzazione
  PAN = "PAN",
  ZOOM = "ZOOM",
  ZOOM_WINDOW = "ZOOM_WINDOW",
  ZOOM_EXTENTS = "ZOOM_EXTENTS",

  // Altri strumenti
  MEASURE = "MEASURE",
  HATCH = "HATCH",
  BLOCK_CREATE = "BLOCK_CREATE",
  BLOCK_INSERT = "BLOCK_INSERT"
}

export interface ToolState {
  currentTool: ToolType;
  isActive: boolean;
  data: any; // Dati specifici per ogni tool
}

export interface DrawingToolState {
  points: Point2D[];
  preview: Entity | null;
  stage: number;
}

export interface ModifyToolState {
  selectedEntities: string[];
  basePoint: Point2D | null;
  referencePoint: Point2D | null;
  preview: Entity[] | null;
}

export interface ToolOptions {
  // Opzioni comuni
  snapEnabled: boolean;
  gridSnapEnabled: boolean;
  orthoMode: boolean;
  polarTracking: boolean;

  // Opzioni specifiche per tool
  [key: string]: any;
}

export interface ToolCommand {
  id: string;
  name: string;
  icon: string;
  shortcut?: string;
  toolType: ToolType;
  category: "draw" | "modify" | "dimension" | "view" | "utility";
  description: string;
}

export interface ToolFeedback {
  message: string;
  type: "info" | "warning" | "error" | "prompt";
  requiresInput: boolean;
  inputType?: "point" | "distance" | "angle" | "text" | "number";
}

export interface ToolContext {
  tool: ToolType;
  state: ToolState;
  options: ToolOptions;
  feedback: ToolFeedback | null;
  cancel: () => void;
  complete: () => void;
  setOption: (key: string, value: any) => void;
}
