import {
  Constraint,
  ConstraintType,
  CoincidentConstraint,
  ConcentricConstraint,
  ParallelConstraint,
  PerpendicularConstraint
} from "../../types/constraints";
import { Vector3 } from "../../types/cad";

/**
 * Helper class for creating and solving geometric constraints
 */
export class GeometricConstraintHelper {
  /**
   * Create a coincident constraint between two points
   */
  public static createCoincidentConstraint(
    point1Id: string,
    point2Id: string,
    priority: number = 10
  ): CoincidentConstraint {
    return {
      id: "", // Will be assigned by the ConstraintEngine
      type: ConstraintType.COINCIDENT,
      entityIds: [point1Id, point2Id],
      active: true,
      priority
    };
  }

  /**
   * Create a concentric constraint between two circular entities
   */
  public static createConcentricConstraint(
    circle1Id: string,
    circle2Id: string,
    priority: number = 10
  ): ConcentricConstraint {
    return {
      id: "", // Will be assigned by the ConstraintEngine
      type: ConstraintType.CONCENTRIC,
      entityIds: [circle1Id, circle2Id],
      active: true,
      priority
    };
  }

  /**
   * Create a parallel constraint between two linear entities
   */
  public static createParallelConstraint(line1Id: string, line2Id: string, priority: number = 10): ParallelConstraint {
    return {
      id: "", // Will be assigned by the ConstraintEngine
      type: ConstraintType.PARALLEL,
      entityIds: [line1Id, line2Id],
      active: true,
      priority
    };
  }

  /**
   * Create a perpendicular constraint between two linear entities
   */
  public static createPerpendicularConstraint(
    line1Id: string,
    line2Id: string,
    priority: number = 10
  ): PerpendicularConstraint {
    return {
      id: "", // Will be assigned by the ConstraintEngine
      type: ConstraintType.PERPENDICULAR,
      entityIds: [line1Id, line2Id],
      active: true,
      priority
    };
  }

  /**
   * Create a horizontal constraint for a linear entity
   */
  public static createHorizontalConstraint(lineId: string, priority: number = 10): Constraint {
    return {
      id: "", // Will be assigned by the ConstraintEngine
      type: ConstraintType.HORIZONTAL,
      entityIds: [lineId],
      active: true,
      priority
    };
  }

  /**
   * Create a vertical constraint for a linear entity
   */
  public static createVerticalConstraint(lineId: string, priority: number = 10): Constraint {
    return {
      id: "", // Will be assigned by the ConstraintEngine
      type: ConstraintType.VERTICAL,
      entityIds: [lineId],
      active: true,
      priority
    };
  }

  /**
   * Create a tangent constraint between a curve and another entity
   */
  public static createTangentConstraint(curve1Id: string, curve2Id: string, priority: number = 10): Constraint {
    return {
      id: "", // Will be assigned by the ConstraintEngine
      type: ConstraintType.TANGENT,
      entityIds: [curve1Id, curve2Id],
      active: true,
      priority
    };
  }

  /**
   * Apply a coincident constraint to points
   */
  public static applyCoincidentConstraint(
    point1Position: Vector3,
    point2Position: Vector3
  ): { point1NewPosition: Vector3; point2NewPosition: Vector3 } {
    // In a real implementation, would decide how to move points based on priorities
    // For simplicity, we'll just average the positions
    const midPoint = {
      x: (point1Position.x + point2Position.x) / 2,
      y: (point1Position.y + point2Position.y) / 2,
      z: (point1Position.z + point2Position.z) / 2
    };

    return {
      point1NewPosition: midPoint,
      point2NewPosition: midPoint
    };
  }

  /**
   * Calculate if two lines are parallel
   */
  public static areLinesParallel(
    line1Start: Vector3,
    line1End: Vector3,
    line2Start: Vector3,
    line2End: Vector3,
    tolerance: number = 0.001
  ): boolean {
    const dir1 = this.normalizeVector({
      x: line1End.x - line1Start.x,
      y: line1End.y - line1Start.y,
      z: line1End.z - line1Start.z
    });

    const dir2 = this.normalizeVector({
      x: line2End.x - line2Start.x,
      y: line2End.y - line2Start.y,
      z: line2End.z - line2Start.z
    });

    // Check if cross product is close to zero (parallel)
    const cross = this.crossProduct(dir1, dir2);
    const magnitude = this.vectorLength(cross);

    return magnitude < tolerance;
  }

  /**
   * Calculate if two lines are perpendicular
   */
  public static areLinesPerpendicularc(
    line1Start: Vector3,
    line1End: Vector3,
    line2Start: Vector3,
    line2End: Vector3,
    tolerance: number = 0.001
  ): boolean {
    const dir1 = this.normalizeVector({
      x: line1End.x - line1Start.x,
      y: line1End.y - line1Start.y,
      z: line1End.z - line1Start.z
    });

    const dir2 = this.normalizeVector({
      x: line2End.x - line2Start.x,
      y: line2End.y - line2Start.y,
      z: line2End.z - line2Start.z
    });

    // Check if dot product is close to zero (perpendicular)
    const dot = this.dotProduct(dir1, dir2);

    return Math.abs(dot) < tolerance;
  }

  // Helper Math functions

  private static normalizeVector(v: Vector3): Vector3 {
    const length = this.vectorLength(v);
    if (length === 0) return { x: 0, y: 0, z: 0 };

    return {
      x: v.x / length,
      y: v.y / length,
      z: v.z / length
    };
  }

  private static vectorLength(v: Vector3): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  private static dotProduct(a: Vector3, b: Vector3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  private static crossProduct(a: Vector3, b: Vector3): Vector3 {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }
}
