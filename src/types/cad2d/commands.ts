// Tipi per comandi e azioni CAD 2D

import { Entity } from "./entities";
import { Point2D, Transform2D } from "./geometry";
import { ToolType } from "./tools";

export enum CommandType {
  // Comandi entità
  ADD_ENTITY = "ADD_ENTITY",
  DELETE_ENTITY = "DELETE_ENTITY",
  UPDATE_ENTITY = "UPDATE_ENTITY",

  // Comandi di trasformazione
  TRANSFORM_ENTITIES = "TRANSFORM_ENTITIES",
  MOVE_ENTITIES = "MOVE_ENTITIES",
  ROTATE_ENTITIES = "ROTATE_ENTITIES",
  SCALE_ENTITIES = "SCALE_ENTITIES",
  MIRROR_ENTITIES = "MIRROR_ENTITIES",

  // Comandi di selezione
  SELECT_ENTITIES = "SELECT_ENTITIES",
  DESELECT_ENTITIES = "DESELECT_ENTITIES",
  CLEAR_SELECTION = "CLEAR_SELECTION",

  // Comandi layer
  ADD_LAYER = "ADD_LAYER",
  DELETE_LAYER = "DELETE_LAYER",
  UPDATE_LAYER = "UPDATE_LAYER",
  SET_ACTIVE_LAYER = "SET_ACTIVE_LAYER",

  // Comandi di visualizzazione
  SET_ZOOM = "SET_ZOOM",
  SET_PAN = "SET_PAN",
  SET_VIEW = "SET_VIEW",

  // Comandi tool
  SET_TOOL = "SET_TOOL",
  CANCEL_TOOL = "CANCEL_TOOL",

  // Comandi documento
  NEW_DRAWING = "NEW_DRAWING",
  OPEN_DRAWING = "OPEN_DRAWING",
  SAVE_DRAWING = "SAVE_DRAWING",

  // Comandi undo/redo
  UNDO = "UNDO",
  REDO = "REDO",

  // Comandi gruppo
  GROUP_ENTITIES = "GROUP_ENTITIES",
  UNGROUP_ENTITIES = "UNGROUP_ENTITIES"
}

export interface BaseCommand {
  id: string;
  type: CommandType;
  timestamp: number;
}

export interface AddEntityCommand extends BaseCommand {
  type: CommandType.ADD_ENTITY;
  entity: Entity;
}

export interface DeleteEntityCommand extends BaseCommand {
  type: CommandType.DELETE_ENTITY;
  entityIds: string[];
  deletedEntities?: Entity[]; // Per l'undo
}

export interface UpdateEntityCommand extends BaseCommand {
  type: CommandType.UPDATE_ENTITY;
  entityId: string;
  updates: Partial<Entity>;
  previousState?: Partial<Entity>; // Per l'undo
}

export interface TransformEntitiesCommand extends BaseCommand {
  type: CommandType.TRANSFORM_ENTITIES;
  entityIds: string[];
  transform: Transform2D;
  previousTransforms?: Map<string, Transform2D>; // Per l'undo
}

export interface SelectEntitiesCommand extends BaseCommand {
  type: CommandType.SELECT_ENTITIES;
  entityIds: string[];
  mode: "replace" | "add" | "remove" | "toggle";
}

export interface SetToolCommand extends BaseCommand {
  type: CommandType.SET_TOOL;
  tool: ToolType;
  previousTool?: ToolType; // Per l'undo
}

export type Command =
  | AddEntityCommand
  | DeleteEntityCommand
  | UpdateEntityCommand
  | TransformEntitiesCommand
  | SelectEntitiesCommand
  | SetToolCommand;

export interface CommandHistory {
  commands: Command[];
  currentIndex: number;
  maxSize: number;
}

export interface CommandResult {
  success: boolean;
  error?: string;
  affectedEntities?: string[];
}

export interface Action {
  type: string;
  payload?: any;
}

export interface MouseAction extends Action {
  type: "MOUSE_DOWN" | "MOUSE_MOVE" | "MOUSE_UP" | "MOUSE_WHEEL";
  payload: {
    position: Point2D;
    button?: number;
    deltaY?: number;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
  };
}

export interface KeyboardAction extends Action {
  type: "KEY_DOWN" | "KEY_UP";
  payload: {
    key: string;
    code: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
  };
}
