import {
  Constraint,
  ConstraintType,
  DistanceConstraint,
  AngleConstraint,
  RadiusConstraint
} from "../../types/constraints";
import { Vector3 } from "../../types/cad";

/**
 * Helper class for creating and working with dimensional constraints
 */
export class DimensionalConstraintHelper {
  /**
   * Create a distance constraint between two entities
   */
  public static createDistanceConstraint(
    entity1Id: string,
    entity2Id: string,
    distance: number,
    unit: string = "mm",
    priority: number = 10
  ): DistanceConstraint {
    return {
      id: "", // Will be assigned by the ConstraintEngine
      type: ConstraintType.DISTANCE,
      entityIds: [entity1Id, entity2Id],
      active: true,
      priority,
      value: distance,
      unit
    };
  }

  /**
   * Create an angle constraint between two linear entities
   */
  public static createAngleConstraint(
    line1Id: string,
    line2Id: string,
    angle: number,
    unit: "deg" | "rad" = "deg",
    priority: number = 10
  ): AngleConstraint {
    return {
      id: "", // Will be assigned by the ConstraintEngine
      type: ConstraintType.ANGLE,
      entityIds: [line1Id, line2Id],
      active: true,
      priority,
      value: angle,
      unit
    };
  }

  /**
   * Create a radius constraint for a circular entity
   */
  public static createRadiusConstraint(
    circleId: string,
    radius: number,
    unit: string = "mm",
    priority: number = 10
  ): RadiusConstraint {
    return {
      id: "", // Will be assigned by the ConstraintEngine
      type: ConstraintType.RADIUS,
      entityIds: [circleId],
      active: true,
      priority,
      value: radius,
      unit
    };
  }

  /**
   * Create a diameter constraint for a circular entity
   */
  public static createDiameterConstraint(
    circleId: string,
    diameter: number,
    unit: string = "mm",
    priority: number = 10
  ): Constraint {
    return {
      id: "", // Will be assigned by the ConstraintEngine
      type: ConstraintType.DIAMETER,
      entityIds: [circleId],
      active: true,
      priority,
      parameters: {
        value: diameter,
        unit
      }
    };
  }

  /**
   * Create a length constraint for a linear entity
   */
  public static createLengthConstraint(
    lineId: string,
    length: number,
    unit: string = "mm",
    priority: number = 10
  ): Constraint {
    return {
      id: "", // Will be assigned by the ConstraintEngine
      type: ConstraintType.LENGTH,
      entityIds: [lineId],
      active: true,
      priority,
      parameters: {
        value: length,
        unit
      }
    };
  }

  /**
   * Calculate distance between two points
   */
  public static calculateDistance(point1: Vector3, point2: Vector3): number {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    const dz = point2.z - point1.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Calculate the angle between two lines
   */
  public static calculateAngle(
    line1Start: Vector3,
    line1End: Vector3,
    line2Start: Vector3,
    line2End: Vector3,
    returnUnit: "deg" | "rad" = "deg"
  ): number {
    // Calculate direction vectors
    const dir1 = {
      x: line1End.x - line1Start.x,
      y: line1End.y - line1Start.y,
      z: line1End.z - line1Start.z
    };

    const dir2 = {
      x: line2End.x - line2Start.x,
      y: line2End.y - line2Start.y,
      z: line2End.z - line2Start.z
    };

    // Calculate magnitude of vectors
    const mag1 = Math.sqrt(dir1.x * dir1.x + dir1.y * dir1.y + dir1.z * dir1.z);
    const mag2 = Math.sqrt(dir2.x * dir2.x + dir2.y * dir2.y + dir2.z * dir2.z);

    // Avoid division by zero
    if (mag1 === 0 || mag2 === 0) {
      return 0;
    }

    // Calculate dot product
    const dot = dir1.x * dir2.x + dir1.y * dir2.y + dir1.z * dir2.z;

    // Calculate angle in radians
    let angleRad = Math.acos(Math.min(1, Math.max(-1, dot / (mag1 * mag2))));

    // Convert to degrees if requested
    if (returnUnit === "deg") {
      return angleRad * (180 / Math.PI);
    }

    return angleRad;
  }

  /**
   * Adjust points to satisfy a distance constraint
   */
  public static adjustPointsToDistance(
    point1: Vector3,
    point2: Vector3,
    targetDistance: number
  ): { point1New: Vector3; point2New: Vector3 } {
    // Calculate current distance
    const currentDistance = this.calculateDistance(point1, point2);

    // If points are coincident, move them apart
    if (currentDistance < 0.0001) {
      // Create an arbitrary direction
      return {
        point1New: { x: point1.x - targetDistance / 2, y: point1.y, z: point1.z },
        point2New: { x: point2.x + targetDistance / 2, y: point2.y, z: point2.z }
      };
    }

    // Calculate direction vector
    const dirX = (point2.x - point1.x) / currentDistance;
    const dirY = (point2.y - point1.y) / currentDistance;
    const dirZ = (point2.z - point1.z) / currentDistance;

    // Calculate midpoint
    const midX = (point1.x + point2.x) / 2;
    const midY = (point1.y + point2.y) / 2;
    const midZ = (point1.z + point2.z) / 2;

    // Calculate new points at required distance
    const halfDistance = targetDistance / 2;

    return {
      point1New: {
        x: midX - dirX * halfDistance,
        y: midY - dirY * halfDistance,
        z: midZ - dirZ * halfDistance
      },
      point2New: {
        x: midX + dirX * halfDistance,
        y: midY + dirY * halfDistance,
        z: midZ + dirZ * halfDistance
      }
    };
  }

  /**
   * Convert between different units
   */
  public static convertValue(value: number, fromUnit: string, toUnit: string): number {
    // Conversion factors to millimeters (mm)
    const toMm: Record<string, number> = {
      "mm": 1,
      "cm": 10,
      "m": 1000,
      "in": 25.4,
      "ft": 304.8
    };

    // Convert to mm first, then to target unit
    const valueInMm = value * (toMm[fromUnit] || 1);
    const result = valueInMm / (toMm[toUnit] || 1);

    return result;
  }
}
