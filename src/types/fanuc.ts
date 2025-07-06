/**
 * Represents the position of the CNC machine axes.
 */
export interface FanucPosition {
  x: number;
  y: number;
  z: number;
  a?: number;
  b?: number;
  c?: number;
}

/**
 * Represents the status of the Fanuc CNC controller.
 */
export interface FanucStatus {
  mode: "AUTO" | "MDI" | "JOG" | "HANDLE" | "EDIT" | "REF" | "RESET" | "STOP" | "MSTR" | "UNKNOWN";
  status: "READY" | "RUNNING" | "HOLD" | "ALARM" | "RESET" | "STOP" | "MSTR" | "IDLE" | "UNKNOWN"; // IDLE might be READY/STOP
  alarm: string | null;
  feedOverride: number; // Percentage (e.g., 100.0)
  spindleOverride: number; // Percentage (e.g., 100.0)
  rapidOverride: number; // Percentage (e.g., 100)
  activeToolNumber: number;
  spindleSpeed: number; // Actual RPM
  feedRate: number; // Actual feed rate (mm/min or inch/min)
  position: FanucPosition; // Absolute position
  workOffset: string; // e.g., "G54"
  program: {
    name: string; // e.g., "O1000"
    number: number; // e.g., 1000
    block: number; // Current block number being executed
    progress: number; // Estimated percentage (0-100)
  };
  temperature?: {
    // Optional temperature readings
    spindle?: number;
    controller?: number;
  };
}

/**
 * Represents a configurable CNC machine.
 */
export interface Machine {
  id: string;
  name: string;
  ip: string;
  port: number;
}

/**
 * Represents a program stored on the CNC machine.
 */
export interface CncProgram {
  number: number;
  name: string; // Usually Oxxxx
  size: number; // In bytes
  comment: string;
  date?: string; // Optional modified date
}

/**
 * Represents tool offset data.
 */
export interface ToolOffsets {
  toolNumber: number;
  length: number; // Total length (Geometry + Wear)
  radius: number; // Total radius (Geometry + Wear)
  geometry: {
    length: number;
    radius: number;
  };
  wear: {
    length: number;
    radius: number;
  };
}

/**
 * Represents work offset data (WCS).
 */
export interface WorkOffset {
  number: number; // 1-6 for G54-G59, higher for G54.1 Px
  name: string; // e.g., "G54", "G54.1 P1"
  x: number;
  y: number;
  z: number;
  a?: number;
  b?: number;
  c?: number;
}
