// src/types/CADTypes.ts
import { AIAction } from "./AITypes";

// CAD-specific action types
export type CADActionType = "generateCADElement" | "updateCADElement" | "removeCADElement" | "groupCADElements";

// CAD element properties
export interface CADElementPayload {
  type: string;
  x?: number;
  y?: number;
  z?: number;
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  color?: string;
  rotation?: {
    x: number;
    y: number;
    z: number;
  };
}

// Payloads for CAD actions
export interface GenerateCADElementPayload {
  elements: CADElementPayload[];
}

export interface UpdateCADElementPayload {
  id: string;
  properties: Partial<CADElementPayload>;
}

export interface RemoveCADElementPayload {
  id: string;
}

export interface GroupCADElementsPayload {
  elementIds: string[];
  groupName?: string;
}

// Extended AIAction type with CAD-specific actions
export interface CADAction extends AIAction {
  type: CADActionType;
  payload: GenerateCADElementPayload | UpdateCADElementPayload | RemoveCADElementPayload | GroupCADElementsPayload;
}

// CAD Context data structure
export interface CADContextData {
  elementCount: number;
  elementTypes: string[];
  elementSummary: Array<{
    id: string;
    type: string;
    position: {
      x: number;
      y: number;
      z: number;
    };
    dimensions?: {
      width?: number;
      height?: number;
      depth?: number;
      radius?: number;
    };
    color?: string;
  }>;
}
