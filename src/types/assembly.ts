// Types for assembly management and joints

import { Vector3, Rotation } from "./cad";

/**
 * Types of nodes in the assembly tree
 */
export type NodeType = "component" | "subassembly" | "group" | "elements";

/**
 * Base node in the assembly tree
 */
export interface AssemblyNode {
  id: string;
  type: NodeType;
  name: string;
  position: Vector3;
  rotation: Rotation;
  visible: boolean;
  locked: boolean;
  parent: string | null;
  children: string[];
  metadata?: Record<string, any>;
  componentId?: string; // Reference to a component if type is 'component'
  jointId?: string; // Reference to the joint connecting this node to its parent
}

/**
 * Type of joint/constraint between components
 */
export type JointType =
  | "fixed" // No movement allowed
  | "revolute" // Rotation around a single axis
  | "prismatic" // Translation along a single axis
  | "cylindrical" // Rotation and translation along the same axis
  | "planar" // Movement constrained to a plane
  | "spherical" // Rotation around a point (ball joint)
  | "free"; // No constraints (6 degrees of freedom)

/**
 * Limits for joint movement
 */
export interface JointLimits {
  // Rotational limits in degrees
  minAngle?: number;
  maxAngle?: number;

  // Translational limits in user units
  minDistance?: number;
  maxDistance?: number;

  // Deprecated/Alternative limits (keep for compatibility or remove if refactored)
  minRotation?: number; // Radians? Needs clarification
  maxRotation?: number; // Radians? Needs clarification
  minTranslation?: number;
  maxTranslation?: number;

  // Angular velocity limits
  maxAngularVelocity?: number;

  // Linear velocity limits
  maxLinearVelocity?: number;

  // Force limits
  maxForce?: number;
  maxTorque?: number;
}

/**
 * Joint definition
 */
export interface Joint {
  id: string;
  name: string;
  type: JointType;
  parent: string; // Parent node ID
  child: string; // Child node ID
  origin: Vector3; // Joint origin relative to the parent node? Needs clarification
  primaryAxis: Vector3; // Primary axis for revolute and prismatic joints (normalized)
  secondaryAxis?: Vector3; // Secondary axis for some joint types (normalized)
  limits?: JointLimits; // Optional joint limits
  value?: number; // Current joint value (angle in degrees or distance)
  visible?: boolean; // For visualization
  color?: number; // For visualization
}

/**
 * Motion state for a joint
 */
export interface JointMotion {
  joint: Joint;
  primaryValue: number;
  secondaryValue?: number;
}

/**
 * Type of constraint between entities (nodes or features)
 */
export type ConstraintType =
  | "fixed" // Fix entity in place
  | "point" // Coincident points
  | "distance" // Fixed distance between entities
  | "angle" // Fixed angle between entities
  | "parallel" // Entities are parallel
  | "perpendicular" // Entities are perpendicular
  | "tangent" // Entities are tangent
  | "concentric"; // Entities are concentric

/**
 * Constraint definition
 */
export interface Constraint {
  id: string;
  name: string;
  type: ConstraintType;
  entityA: string; // ID of the first entity (node or feature)
  entityB: string; // ID of the second entity (node or feature)
  parameters: Record<string, any>; // Constraint-specific parameters (e.g., distance, angle)
}

/**
 * Assembly history action types for undo/redo
 */
export type AssemblyActionType =
  | "ADD_NODE"
  | "REMOVE_NODE"
  | "UPDATE_NODE"
  | "REPARENT_NODE"
  | "ADD_JOINT"
  | "REMOVE_JOINT"
  | "UPDATE_JOINT"
  | "ADD_CONSTRAINT"
  | "REMOVE_CONSTRAINT"
  | "UPDATE_CONSTRAINT"
  | "SET_ACTIVE_NODE"
  | "SELECT_NODES";

/**
 * Assembly history action for undo/redo
 */
export interface AssemblyAction {
  type: AssemblyActionType;
  payload: any;
  previousState?: any;
}

/**
 * Main assembly state
 */
export interface AssemblyState {
  nodes: Record<string, AssemblyNode>;
  joints: Record<string, Joint>;
  constraints: Record<string, Constraint>; // Added constraints
  rootNodes: string[];
  activeNode: string | null;
  selectedNodes: string[];
  visibleJoints: boolean;
  history: AssemblyAction[];
  historyIndex: number;
  // Removed deprecated fields if unused
  // operations: AssemblyAction[]; // Use history instead
  // currentPosition: number;      // Use historyIndex instead
}

/**
 * Assembly node event types
 */
export type AssemblyNodeEventType =
  | "nodeAdded"
  | "nodeRemoved"
  | "nodeUpdated"
  | "nodeReparented"
  | "jointAdded"
  | "jointRemoved"
  | "jointUpdated"
  | "constraintAdded" // Added constraint events
  | "constraintRemoved"
  | "constraintUpdated"
  | "activeNodeChanged"
  | "selectionChanged"
  | "stateChanged";

/**
 * Assembly event listener
 */
export interface AssemblyEventListener {
  (eventType: AssemblyNodeEventType, payload: any): void;
}

/**
 * State change handler type
 */
export type StateChangeHandler = (newState: AssemblyState) => void;
