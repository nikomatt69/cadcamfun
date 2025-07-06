// Export di tutti i tipi CAD 2D

export * from "./geometry";
export * from "./entities";
export * from "./tools";
export * from "./commands";

// Tipo principale per lo stato del CAD
import { Entity, EntityGroup, Selection } from "./entities";
import { LayerProperties, CoordinateSystem, SnapSettings, GridSettings } from "./geometry";
import { ToolState, ToolOptions } from "./tools";
import { CommandHistory } from "./commands";

export interface CADState {
  // Documento
  documentId: string;
  documentName: string;
  isDirty: boolean;

  // Entità e layer
  entities: Map<string, Entity>;
  layers: Map<string, LayerProperties>;
  activeLayerId: string;
  groups: Map<string, EntityGroup>;

  // Selezione
  selection: Selection;

  // Sistema di coordinate e visualizzazione
  coordinateSystem: CoordinateSystem;
  viewMatrix: DOMMatrix;
  zoom: number;
  pan: { x: number; y: number };

  // Impostazioni
  snapSettings: SnapSettings;
  gridSettings: GridSettings;

  // Tool corrente
  toolState: ToolState;
  toolOptions: ToolOptions;

  // Storia comandi
  commandHistory: CommandHistory;

  // Stato UI
  showGrid: boolean;
  showRulers: boolean;
  showLayerPanel: boolean;
  showPropertiesPanel: boolean;
  showCommandLine: boolean;
}

export interface CADViewport {
  width: number;
  height: number;
  devicePixelRatio: number;
  bounds: {
    min: { x: number; y: number };
    max: { x: number; y: number };
  };
}

export interface CADPreferences {
  theme: "light" | "dark";
  autoSave: boolean;
  autoSaveInterval: number;
  undoLevels: number;
  selectionColor: string;
  highlightColor: string;
  backgroundColor: string;
  cursorSize: number;
  crosshairSize: number;
}

export interface CADDocument {
  id: string;
  name: string;
  version: string;
  created: Date;
  modified: Date;
  author: string;
  description?: string;
  state: CADState;
  preferences: CADPreferences;
}
