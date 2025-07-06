// Types for the parametric modeling constraint system

// Constraint types
export enum ConstraintType {
  // Geometric constraints
  COINCIDENT = "coincident",
  CONCENTRIC = "concentric",
  COLINEAR = "colinear",
  PARALLEL = "parallel",
  PERPENDICULAR = "perpendicular",
  TANGENT = "tangent",
  SYMMETRIC = "symmetric",
  HORIZONTAL = "horizontal",
  VERTICAL = "vertical",
  EQUAL = "equal",
  FIXED = "fixed",

  // Dimensional constraints
  DISTANCE = "distance",
  ANGLE = "angle",
  RADIUS = "radius",
  DIAMETER = "diameter",
  LENGTH = "length"
}

// Base constraint interface
export interface Constraint {
  id: string;
  type: ConstraintType;
  entityIds: string[]; // IDs of the entities this constraint applies to
  active: boolean;
  priority: number; // For determining constraint resolution order
  parameters?: Record<string, any>;
}

// Geometric constraint interfaces
export interface CoincidentConstraint extends Constraint {
  type: ConstraintType.COINCIDENT;
  // Points or vertices that should be in the same location
}

export interface ConcentricConstraint extends Constraint {
  type: ConstraintType.CONCENTRIC;
  // Circles, arcs, or curved elements that share the same center
}

export interface ParallelConstraint extends Constraint {
  type: ConstraintType.PARALLEL;
  // Lines or edges that must remain parallel
}

export interface PerpendicularConstraint extends Constraint {
  type: ConstraintType.PERPENDICULAR;
  // Lines or edges that must remain at 90 degrees
}

// Dimensional constraint interfaces
export interface DistanceConstraint extends Constraint {
  type: ConstraintType.DISTANCE;
  value: number;
  unit: string;
  // Distance between points, lines, etc.
}

export interface AngleConstraint extends Constraint {
  type: ConstraintType.ANGLE;
  value: number;
  unit: "deg" | "rad";
  // Angle between lines, planes, etc.
}

export interface RadiusConstraint extends Constraint {
  type: ConstraintType.RADIUS;
  value: number;
  unit: string;
  // Radius of circles, arcs, etc.
}

// Constraint-related history entry for timeline
export interface ConstraintHistoryEntry {
  id: string;
  timestamp: number;
  constraintId: string;
  type: "add" | "modify" | "remove";
  previousState?: Partial<Constraint>;
  newState?: Partial<Constraint>;
}

// Parameter that can be modified later
export interface ParametricParameter {
  id: string;
  name: string;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  description?: string;
  constraints: string[]; // IDs of constraints using this parameter
}

// Relationship between parameters
export interface ParametricEquation {
  id: string;
  resultParameterId: string;
  expression: string; // e.g., "p1 + p2 * 2"
  dependencies: string[]; // IDs of parameters used in expression
}
