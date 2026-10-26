// src/lib/enhancedSnapService.ts

import { type Point, type Element } from "../store/elementsStore.ts";
import { Vector2 } from "three";

// Define enhanced snap types
export enum SnapType {
  GRID = "grid",
  ENDPOINT = "endpoint",
  MIDPOINT = "midpoint",
  INTERSECTION = "intersection",
  CENTER = "center",
  QUADRANT = "quadrant",
  NEAREST = "nearest",
  TANGENT = "tangent",
  PERPENDICULAR = "perpendicular",
  PARALLEL = "parallel",
  EQUIDISTANT = "equidistant",
  HORIZONTAL = "horizontal",
  VERTICAL = "vertical"
}

interface SnapSettings {
  enabled: boolean;
  types: Record<SnapType, boolean>;
  gridSize: number;
  tolerance: number;
  smartTolerance: number;
}

interface SnapPoint {
  x: number;
  y: number;
  z: number;
  type: SnapType;
  source?: Element;
  priority?: number;
}

/**
 * Snap a point to the nearest valid snap location with intelligent snap
 */
export function snapPoint(point: Point, elements: Element[], settings: SnapSettings, anchor?: Point): SnapPoint {
  if (!settings.enabled) {
    return { ...point, type: SnapType.NEAREST };
  }

  const snapPoints: SnapPoint[] = [];

  // Add grid snap points
  if (settings.types[SnapType.GRID]) {
    const gridPoint = snapToGrid(point, settings.gridSize);
    snapPoints.push({ ...gridPoint, type: SnapType.GRID, priority: 1 });
  }

  // Get active element (typically the one being created/modified)
  const activeElement = elements.find(el => el.isActive);
  // The point the user is drawing or moving from: perpendicular, tangent and parallel are relative to it. Without one
  // (placing a part, dropping from the library) there is nothing to be perpendicular or parallel to.
  const from = anchor ?? anchorOf(activeElement);

  // Collect basic snap points from elements
  elements.forEach(element => {
    // Skip active element to avoid self-snapping during editing
    if (element === activeElement) return;

    const elementSnapPoints = getElementSnapPoints(element, settings);
    snapPoints.push(...elementSnapPoints);
  });

  // Add intelligent snap points if enabled
  if (settings.types[SnapType.INTERSECTION]) {
    const intersectionPoints = findIntersectionPoints(elements, settings);
    snapPoints.push(...intersectionPoints);
  }

  if (settings.types[SnapType.HORIZONTAL] || settings.types[SnapType.VERTICAL]) {
    const alignmentPoints = findAlignmentPoints(point, elements, settings);
    snapPoints.push(...alignmentPoints);
  }

  if (settings.types[SnapType.PERPENDICULAR] && from) {
    snapPoints.push(...findPerpendicularPoints(point, from, elements, activeElement));
  }

  if (settings.types[SnapType.TANGENT] && from) {
    snapPoints.push(...findTangentPoints(point, from, elements, activeElement));
  }

  if (settings.types[SnapType.PARALLEL] && from) {
    snapPoints.push(...findParallelPoints(point, from, elements, activeElement));
  }

  if (settings.types[SnapType.EQUIDISTANT]) {
    const equidistantPoints = findEquidistantPoints(point, elements, settings);
    snapPoints.push(...equidistantPoints);
  }

  // Find the closest valid snap point, considering priority
  const closestPoint = findClosestSnapPoint(point, snapPoints, settings.tolerance);

  if (closestPoint) {
    return closestPoint;
  }

  // The point on an edge is always at least as close as the ends or the middle of that edge, so it would shadow them:
  // it only applies when nothing more specific is within reach.
  if (settings.types[SnapType.NEAREST]) {
    const onEdge = findClosestSnapPoint(point, findNearestPoints(point, elements, activeElement), settings.tolerance);
    if (onEdge) return onEdge;
  }

  // If no snap point is found within tolerance, return the original point
  return { ...point, type: SnapType.NEAREST };
}

/**
 * Find the closest snap point, considering both distance and priority
 *
 * Works on squared distances throughout: the comparison against the tolerance is order-preserving, so
 * no square root is taken on the pointer-move path.
 */
function findClosestSnapPoint(point: Point, snapPoints: SnapPoint[], tolerance: number): SnapPoint | null {
  if (snapPoints.length === 0) {
    return null;
  }

  let closestPoint: SnapPoint | null = null;
  let minDistanceSq = Infinity;
  let highestPriority = 0;
  const toleranceSq = tolerance * tolerance;

  snapPoints.forEach(snapPoint => {
    const dx = snapPoint.x - point.x, dy = snapPoint.y - point.y, dz = snapPoint.z - point.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;

    const priority = snapPoint.priority || 0;

    // Distance is within tolerance and either closer than current closest
    // or same distance but higher priority
    if (distanceSq <= toleranceSq && (distanceSq < minDistanceSq || (distanceSq === minDistanceSq && priority > highestPriority))) {
      minDistanceSq = distanceSq;
      highestPriority = priority;
      closestPoint = snapPoint;
    }
  });

  return closestPoint;
}

/**
 * Snap a point to the grid
 */
function snapToGrid(point: Point, gridSize: number): Point {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
    z: Math.round(point.z / gridSize) * gridSize
  };
}

/**
 * Get all basic snap points for a given element
 */
function getElementSnapPoints(element: Element, settings: SnapSettings): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];

  switch (element.type) {
    case "line":
      if (settings.types[SnapType.ENDPOINT]) {
        // Add endpoints (high priority)
        snapPoints.push({
          x: element.x1,
          y: element.y1,
          z: element.z1 || 0,
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
        snapPoints.push({
          x: element.x2,
          y: element.y2,
          z: element.z2 || 0,
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
      }

      if (settings.types[SnapType.MIDPOINT]) {
        // Add midpoint
        snapPoints.push({
          x: (element.x1 + element.x2) / 2,
          y: (element.y1 + element.y2) / 2,
          z: ((element.z1 || 0) + (element.z2 || 0)) / 2,
          type: SnapType.MIDPOINT,
          source: element,
          priority: 8
        });
      }

      // Add points along the line for nearest snap
      if (settings.types[SnapType.NEAREST]) {
        // We could add more points here for longer lines
        // but we'll rely on the findClosestPointOnLine function
      }
      break;

    case "circle":
      if (settings.types[SnapType.CENTER]) {
        // Add center
        snapPoints.push({
          x: element.x,
          y: element.y,
          z: element.z || 0,
          type: SnapType.CENTER,
          source: element,
          priority: 9
        });
      }

      if (settings.types[SnapType.QUADRANT]) {
        // Add quadrant points
        snapPoints.push({
          x: element.x + element.radius,
          y: element.y,
          z: element.z || 0,
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({
          x: element.x,
          y: element.y + element.radius,
          z: element.z || 0,
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({
          x: element.x - element.radius,
          y: element.y,
          z: element.z || 0,
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({
          x: element.x,
          y: element.y - element.radius,
          z: element.z || 0,
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
      }
      break;

    case "rectangle":
      if (settings.types[SnapType.CENTER]) {
        // Add center
        snapPoints.push({
          x: element.x,
          y: element.y,
          z: element.z || 0,
          type: SnapType.CENTER,
          source: element,
          priority: 9
        });
      }

      if (settings.types[SnapType.ENDPOINT]) {
        // Add corners
        const halfWidth = element.width / 2;
        const halfHeight = element.height / 2;

        // If the rectangle has rotation, we need to apply it
        if (element.angle) {
          const radians = (element.angle * Math.PI) / 180;
          const cos = Math.cos(radians);
          const sin = Math.sin(radians);

          // Top-left corner
          const x1 = element.x - halfWidth;
          const y1 = element.y - halfHeight;
          snapPoints.push({
            x: element.x + (x1 - element.x) * cos - (y1 - element.y) * sin,
            y: element.y + (x1 - element.x) * sin + (y1 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });

          // Top-right corner
          const x2 = element.x + halfWidth;
          const y2 = element.y - halfHeight;
          snapPoints.push({
            x: element.x + (x2 - element.x) * cos - (y2 - element.y) * sin,
            y: element.y + (x2 - element.x) * sin + (y2 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });

          // Bottom-right corner
          const x3 = element.x + halfWidth;
          const y3 = element.y + halfHeight;
          snapPoints.push({
            x: element.x + (x3 - element.x) * cos - (y3 - element.y) * sin,
            y: element.y + (x3 - element.x) * sin + (y3 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });

          // Bottom-left corner
          const x4 = element.x - halfWidth;
          const y4 = element.y + halfHeight;
          snapPoints.push({
            x: element.x + (x4 - element.x) * cos - (y4 - element.y) * sin,
            y: element.y + (x4 - element.x) * sin + (y4 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });
        } else {
          // Without rotation, the corners are simpler
          snapPoints.push({
            x: element.x - halfWidth,
            y: element.y - halfHeight,
            z: element.z || 0,
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });
          snapPoints.push({
            x: element.x + halfWidth,
            y: element.y - halfHeight,
            z: element.z || 0,
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });
          snapPoints.push({
            x: element.x + halfWidth,
            y: element.y + halfHeight,
            z: element.z || 0,
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });
          snapPoints.push({
            x: element.x - halfWidth,
            y: element.y + halfHeight,
            z: element.z || 0,
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });
        }
      }

      if (settings.types[SnapType.MIDPOINT]) {
        // Add midpoints of sides
        const halfWidth = element.width / 2;
        const halfHeight = element.height / 2;

        // Similar to corners, apply rotation if needed
        if (element.angle) {
          const radians = (element.angle * Math.PI) / 180;
          const cos = Math.cos(radians);
          const sin = Math.sin(radians);

          // Top midpoint
          const x1 = element.x;
          const y1 = element.y - halfHeight;
          snapPoints.push({
            x: element.x + (x1 - element.x) * cos - (y1 - element.y) * sin,
            y: element.y + (x1 - element.x) * sin + (y1 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });

          // Right midpoint
          const x2 = element.x + halfWidth;
          const y2 = element.y;
          snapPoints.push({
            x: element.x + (x2 - element.x) * cos - (y2 - element.y) * sin,
            y: element.y + (x2 - element.x) * sin + (y2 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });

          // Bottom midpoint
          const x3 = element.x;
          const y3 = element.y + halfHeight;
          snapPoints.push({
            x: element.x + (x3 - element.x) * cos - (y3 - element.y) * sin,
            y: element.y + (x3 - element.x) * sin + (y3 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });

          // Left midpoint
          const x4 = element.x - halfWidth;
          const y4 = element.y;
          snapPoints.push({
            x: element.x + (x4 - element.x) * cos - (y4 - element.y) * sin,
            y: element.y + (x4 - element.x) * sin + (y4 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });
        } else {
          snapPoints.push({
            x: element.x,
            y: element.y - halfHeight,
            z: element.z || 0,
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });
          snapPoints.push({
            x: element.x + halfWidth,
            y: element.y,
            z: element.z || 0,
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });
          snapPoints.push({
            x: element.x,
            y: element.y + halfHeight,
            z: element.z || 0,
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });
          snapPoints.push({
            x: element.x - halfWidth,
            y: element.y,
            z: element.z || 0,
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });
        }
      }
      break;

    // Additional cases for 3D elements like cube and sphere...
    case "cube":
      if (settings.types[SnapType.CENTER]) {
        snapPoints.push({
          x: element.x,
          y: element.y,
          z: element.z || 0,
          type: SnapType.CENTER,
          source: element,
          priority: 9
        });
      }

      if (settings.types[SnapType.ENDPOINT]) {
        // Add 8 corners of the cube
        const halfWidth = element.width / 2;
        const halfHeight = element.height / 2;
        const halfDepth = element.depth / 2;

        // Front face (4 corners)
        snapPoints.push({
          x: element.x - halfWidth,
          y: element.y - halfHeight,
          z: (element.z || 0) - halfDepth,
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
        snapPoints.push({
          x: element.x + halfWidth,
          y: element.y - halfHeight,
          z: (element.z || 0) - halfDepth,
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
        snapPoints.push({
          x: element.x + halfWidth,
          y: element.y + halfHeight,
          z: (element.z || 0) - halfDepth,
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
        snapPoints.push({
          x: element.x - halfWidth,
          y: element.y + halfHeight,
          z: (element.z || 0) - halfDepth,
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });

        // Back face (4 corners)
        snapPoints.push({
          x: element.x - halfWidth,
          y: element.y - halfHeight,
          z: (element.z || 0) + halfDepth,
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
        snapPoints.push({
          x: element.x + halfWidth,
          y: element.y - halfHeight,
          z: (element.z || 0) + halfDepth,
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
        snapPoints.push({
          x: element.x + halfWidth,
          y: element.y + halfHeight,
          z: (element.z || 0) + halfDepth,
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
        snapPoints.push({
          x: element.x - halfWidth,
          y: element.y + halfHeight,
          z: (element.z || 0) + halfDepth,
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
      }
      break;

    // Cylinder, cone and torus stand on the Z axis (see `createThreeObject`): the centre, the ends of the axis and the four
    // quadrant points of each end circle (or, for the torus, of the ring's outer edge).
    case "cylinder":
    case "cone": {
      const z = element.z || 0, half = (element.height || 0) / 2, r = element.radius || 0;
      const add = (x: number, y: number, zz: number, type: SnapType, priority: number) => snapPoints.push({ x, y, z: zz, type, source: element, priority });
      if (settings.types[SnapType.CENTER]) add(element.x, element.y, z, SnapType.CENTER, 9);
      if (settings.types[SnapType.ENDPOINT]) {
        add(element.x, element.y, z - half, SnapType.ENDPOINT, 10);
        add(element.x, element.y, z + half, SnapType.ENDPOINT, 10);
      }
      if (settings.types[SnapType.QUADRANT]) {
        // A cone's top is its apex: only the base circle has quadrants.
        const ends = element.type === "cone" ? [z - half] : [z - half, z + half];
        for (const level of ends) {
          add(element.x + r, element.y, level, SnapType.QUADRANT, 7);
          add(element.x - r, element.y, level, SnapType.QUADRANT, 7);
          add(element.x, element.y + r, level, SnapType.QUADRANT, 7);
          add(element.x, element.y - r, level, SnapType.QUADRANT, 7);
        }
      }
      break;
    }

    case "torus": {
      const z = element.z || 0, outer = (element.radius || 0) + (element.tubeRadius || element.tube || (element.radius || 0) / 4);
      if (settings.types[SnapType.CENTER]) snapPoints.push({ x: element.x, y: element.y, z, type: SnapType.CENTER, source: element, priority: 9 });
      if (settings.types[SnapType.QUADRANT]) {
        for (const [dx, dy] of [[outer, 0], [-outer, 0], [0, outer], [0, -outer]] as const) {
          snapPoints.push({ x: element.x + dx, y: element.y + dy, z, type: SnapType.QUADRANT, source: element, priority: 7 });
        }
      }
      break;
    }

    case "sphere":
      if (settings.types[SnapType.CENTER]) {
        snapPoints.push({
          x: element.x,
          y: element.y,
          z: element.z || 0,
          type: SnapType.CENTER,
          source: element,
          priority: 9
        });
      }

      if (settings.types[SnapType.QUADRANT]) {
        // Add 6 points at sphere's poles and equator
        snapPoints.push({
          x: element.x + element.radius,
          y: element.y,
          z: element.z || 0,
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({
          x: element.x - element.radius,
          y: element.y,
          z: element.z || 0,
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({
          x: element.x,
          y: element.y + element.radius,
          z: element.z || 0,
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({
          x: element.x,
          y: element.y - element.radius,
          z: element.z || 0,
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({
          x: element.x,
          y: element.y,
          z: (element.z || 0) + element.radius,
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({
          x: element.x,
          y: element.y,
          z: (element.z || 0) - element.radius,
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
      }
      break;
  }

  return snapPoints;
}

/**
 * The planar extent of the elements that can cross: the ones without a 2D footprint (a solid, a
 * dimension, a piece of text) have no snap crossings to offer, so they are never paired.
 */
interface Bounds {
  minX: number; maxX: number; minY: number; maxY: number
}

const boundsOf = (element: Element): Bounds | null => {
  switch (element.type) {
    case "line":
      return {
        minX: Math.min(element.x1, element.x2), maxX: Math.max(element.x1, element.x2),
        minY: Math.min(element.y1, element.y2), maxY: Math.max(element.y1, element.y2),
      };
    case "circle":
      return {
        minX: element.x - element.radius, maxX: element.x + element.radius,
        minY: element.y - element.radius, maxY: element.y + element.radius,
      };
    case "rectangle":
      return {
        minX: element.x - element.width / 2, maxX: element.x + element.width / 2,
        minY: element.y - element.height / 2, maxY: element.y + element.height / 2,
      };
    default:
      return null;
  }
};

/**
 * Find the intersection points between elements
 *
 * Every pair is tested, which is quadratic in the drawing size and was paid in full on every
 * pointer move. Two elements can only cross inside their shared extent, so the bounding boxes reject
 * the vast majority of pairs for the price of four comparisons instead of an algebraic solve.
 */
function findIntersectionPoints(elements: Element[], settings: SnapSettings): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];

  // Check all pairs of elements for intersection
  const boxes: Array<{ element: Element; bounds: Bounds | null }> = elements.map((element) => ({ element, bounds: boundsOf(element) }));

  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    if (!a.bounds) continue;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]!;
      if (!b.bounds) continue;
      // Disjoint extents: no crossing is possible, skip the solve entirely.
      if (a.bounds.maxX < b.bounds.minX || b.bounds.maxX < a.bounds.minX ||
          a.bounds.maxY < b.bounds.minY || b.bounds.maxY < a.bounds.minY) continue;

      // Find intersections based on element types
      const intersections = findIntersectionPointsBetweenElements(a.element, b.element);

      // Add to snap points with high priority
      intersections.forEach(point => {
        snapPoints.push({
          ...point,
          type: SnapType.INTERSECTION,
          priority: 15 // Higher priority than endpoints
        });
      });
    }
  }

  return snapPoints;
}

/**
 * Find intersection points between two specific elements
 */
function findIntersectionPointsBetweenElements(elementA: Element, elementB: Element): Point[] {
  const intersections: Point[] = [];

  // Line-Line intersection
  if (elementA.type === "line" && elementB.type === "line") {
    const intersection = findLineLineIntersection(
      { x: elementA.x1, y: elementA.y1 },
      { x: elementA.x2, y: elementA.y2 },
      { x: elementB.x1, y: elementB.y1 },
      { x: elementB.x2, y: elementB.y2 }
    );

    if (intersection) {
      intersections.push({
        x: intersection.x,
        y: intersection.y,
        z: ((elementA.z1 || 0) + (elementA.z2 || 0) + (elementB.z1 || 0) + (elementB.z2 || 0)) / 4
      });
    }
  }

  // Line-Circle intersection
  else if (
    (elementA.type === "line" && elementB.type === "circle") ||
    (elementA.type === "circle" && elementB.type === "line")
  ) {
    const line = elementA.type === "line" ? elementA : elementB;
    const circle = elementA.type === "circle" ? elementA : elementB;

    const lineIntersections = findLineCircleIntersections(
      { x: line.x1, y: line.y1 },
      { x: line.x2, y: line.y2 },
      { x: circle.x, y: circle.y },
      circle.radius
    );

    lineIntersections.forEach(point => {
      intersections.push({
        x: point.x,
        y: point.y,
        z: ((line.z1 || 0) + (line.z2 || 0) + (circle.z || 0)) / 3
      });
    });
  }

  // Circle-Circle intersection
  else if (elementA.type === "circle" && elementB.type === "circle") {
    const circleIntersections = findCircleCircleIntersections(
      { x: elementA.x, y: elementA.y },
      elementA.radius,
      { x: elementB.x, y: elementB.y },
      elementB.radius
    );

    circleIntersections.forEach(point => {
      intersections.push({
        x: point.x,
        y: point.y,
        z: ((elementA.z || 0) + (elementB.z || 0)) / 2
      });
    });
  }

  // Line-Rectangle intersection
  else if (
    (elementA.type === "line" && elementB.type === "rectangle") ||
    (elementA.type === "rectangle" && elementB.type === "line")
  ) {
    const line = elementA.type === "line" ? elementA : elementB;
    const rect = elementA.type === "rectangle" ? elementA : elementB;

    const rectIntersections = findLineRectangleIntersections(
      { x: line.x1, y: line.y1 },
      { x: line.x2, y: line.y2 },
      rect
    );

    rectIntersections.forEach(point => {
      intersections.push({
        x: point.x,
        y: point.y,
        z: ((line.z1 || 0) + (line.z2 || 0) + (rect.z || 0)) / 3
      });
    });
  }

  return intersections;
}

/**
 * Find intersection point between two lines
 */
function findLineLineIntersection(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number }
): { x: number; y: number } | null {
  // p1 + t (p2 - p1) = p3 + u (p4 - p3), solved for t and u; both must lie on their segment.
  const rx = p2.x - p1.x, ry = p2.y - p1.y;
  const sx = p4.x - p3.x, sy = p4.y - p3.y;
  const denominator = rx * sy - ry * sx;
  // Parallel (or one of them has no length): no single crossing.
  if (Math.abs(denominator) < 1e-12) return null;
  const t = ((p3.x - p1.x) * sy - (p3.y - p1.y) * sx) / denominator;
  const u = ((p3.x - p1.x) * ry - (p3.y - p1.y) * rx) / denominator;
  // A little slack, so a crossing exactly at an end (a vertical line met at its corner) is not lost to rounding.
  const eps = 1e-9;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { x: p1.x + t * rx, y: p1.y + t * ry };
}

/**
 * Find intersection points between a line and a circle
 */
function findLineCircleIntersections(
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
  circleCenter: { x: number; y: number },
  radius: number
): Array<{ x: number; y: number }> {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const length = Math.hypot(dx, dy);
  if (length === 0 || radius <= 0) return [];
  const ux = dx / length, uy = dy / length;

  // Where the line comes closest to the centre, and how far that is from the centre.
  const along = (circleCenter.x - lineStart.x) * ux + (circleCenter.y - lineStart.y) * uy;
  const closestX = lineStart.x + along * ux, closestY = lineStart.y + along * uy;
  const distanceSquared = (closestX - circleCenter.x) ** 2 + (closestY - circleCenter.y) ** 2;
  if (distanceSquared > radius * radius + 1e-9) return [];

  // The crossings sit on the line itself, half a chord to either side of that closest point.
  const half = Math.sqrt(Math.max(0, radius * radius - distanceSquared));
  const offsets = half < 1e-9 ? [0] : [-half, half];
  const eps = 1e-9;
  return offsets
    .map((offset) => ({ t: along + offset, x: closestX + offset * ux, y: closestY + offset * uy }))
    // Only the part of the line that is drawn counts.
    .filter(({ t }) => t >= -eps && t <= length + eps)
    .map(({ x, y }) => ({ x, y }));
}

/**
 * Find intersection points between two circles
 */
function findCircleCircleIntersections(
  center1: { x: number; y: number },
  radius1: number,
  center2: { x: number; y: number },
  radius2: number
): Array<{ x: number; y: number }> {
  const intersections: Array<{ x: number; y: number }> = [];

  // Distance between circle centers
  const dx = center2.x - center1.x;
  const dy = center2.y - center1.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Check if circles are separate, contained, or identical
  if (
    distance > radius1 + radius2 ||
    distance < Math.abs(radius1 - radius2) ||
    (distance === 0 && radius1 === radius2)
  ) {
    return intersections;
  }

  // Calculate intersection points
  const a = (radius1 * radius1 - radius2 * radius2 + distance * distance) / (2 * distance);
  const h = Math.sqrt(radius1 * radius1 - a * a);

  const pointOnLine = {
    x: center1.x + (dx * a) / distance,
    y: center1.y + (dy * a) / distance
  };

  // First intersection
  const intersection1 = {
    x: pointOnLine.x + (h * dy) / distance,
    y: pointOnLine.y - (h * dx) / distance
  };

  intersections.push(intersection1);

  // If circles are tangent, there's only one intersection
  if (distance === radius1 + radius2 || distance === Math.abs(radius1 - radius2)) {
    return intersections;
  }

  // Second intersection
  const intersection2 = {
    x: pointOnLine.x - (h * dy) / distance,
    y: pointOnLine.y + (h * dx) / distance
  };

  intersections.push(intersection2);

  return intersections;
}

/**
 * Find intersection points between a line and a rectangle
 */
function findLineRectangleIntersections(
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
  rect: Element
): Array<{ x: number; y: number }> {
  const intersections: Array<{ x: number; y: number }> = [];

  // Get rectangle corners
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;

  let corners: Array<{ x: number; y: number }> = [];

  // Apply rotation if rectangle has angle
  if (rect.angle) {
    const radians = (rect.angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    // Calculate rotated corners
    const topLeft = {
      x: rect.x + (-halfWidth * cos - -halfHeight * sin),
      y: rect.y + (-halfWidth * sin + -halfHeight * cos)
    };

    const topRight = {
      x: rect.x + (halfWidth * cos - -halfHeight * sin),
      y: rect.y + (halfWidth * sin + -halfHeight * cos)
    };

    const bottomRight = {
      x: rect.x + (halfWidth * cos - halfHeight * sin),
      y: rect.y + (halfWidth * sin + halfHeight * cos)
    };

    const bottomLeft = {
      x: rect.x + (-halfWidth * cos - halfHeight * sin),
      y: rect.y + (-halfWidth * sin + halfHeight * cos)
    };

    corners = [topLeft, topRight, bottomRight, bottomLeft];
  } else {
    // Regular rectangle corners
    corners = [
      { x: rect.x - halfWidth, y: rect.y - halfHeight },
      { x: rect.x + halfWidth, y: rect.y - halfHeight },
      { x: rect.x + halfWidth, y: rect.y + halfHeight },
      { x: rect.x - halfWidth, y: rect.y + halfHeight }
    ];
  }

  // Check intersection with each edge of the rectangle
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;

    const intersection = findLineLineIntersection(lineStart, lineEnd, corners[i]!, corners[j]!);

    if (intersection) {
      intersections.push(intersection);
    }
  }

  return intersections;
}

/**
 * Find horizontal and vertical alignment points
 */
function findAlignmentPoints(point: Point, elements: Element[], settings: SnapSettings): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];
  const { tolerance } = settings;

  // Get significant points from all elements
  const allPoints: Point[] = [];

  elements.forEach(element => {
    // Collection of significant points from each element
    switch (element.type) {
      case "line":
        allPoints.push({ x: element.x1, y: element.y1, z: element.z1 || 0 });
        allPoints.push({ x: element.x2, y: element.y2, z: element.z2 || 0 });
        break;

      case "circle":
        allPoints.push({ x: element.x, y: element.y, z: element.z || 0 });
        // Quadrant points
        allPoints.push({ x: element.x + element.radius, y: element.y, z: element.z || 0 });
        allPoints.push({ x: element.x, y: element.y + element.radius, z: element.z || 0 });
        allPoints.push({ x: element.x - element.radius, y: element.y, z: element.z || 0 });
        allPoints.push({ x: element.x, y: element.y - element.radius, z: element.z || 0 });
        break;

      case "rectangle":
        allPoints.push({ x: element.x, y: element.y, z: element.z || 0 });
        // Corners and midpoints handled in getElementSnapPoints
        break;
    }
  });

  // Check for horizontal alignment
  if (settings.types[SnapType.HORIZONTAL]) {
    allPoints.forEach(p => {
      if (Math.abs(p.y - point.y) < tolerance) {
        snapPoints.push({
          x: point.x,
          y: p.y,
          z: point.z,
          type: SnapType.HORIZONTAL,
          priority: 11 // High priority for alignment
        });
      }
    });
  }

  // Check for vertical alignment
  if (settings.types[SnapType.VERTICAL]) {
    allPoints.forEach(p => {
      if (Math.abs(p.x - point.x) < tolerance) {
        snapPoints.push({
          x: p.x,
          y: point.y,
          z: point.z,
          type: SnapType.VERTICAL,
          priority: 11 // High priority for alignment
        });
      }
    });
  }

  return snapPoints;
}

/**
 * Find perpendicular points for a given point and elements
 */
function findPerpendicularPoints(point: Point, from: Point, elements: Element[], activeElement: Element | undefined): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];
  for (const line of elements) {
    if (line.type !== "line" || line === activeElement) continue;
    // The foot of the perpendicular from the start point onto the line: drawing from `from` to it meets the line at 90 degrees.
    const dx = line.x2 - line.x1, dy = line.y2 - line.y1;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) continue;
    const t = ((from.x - line.x1) * dx + (from.y - line.y1) * dy) / lengthSquared;
    if (t < 0 || t > 1) continue;
    snapPoints.push({ x: line.x1 + t * dx, y: line.y1 + t * dy, z: point.z, type: SnapType.PERPENDICULAR, source: line, priority: 12 });
  }
  return snapPoints;
}

/** The start of the line being drawn, when there is one. */
function anchorOf(active: Element | undefined): Point | undefined {
  if (!active || active.type !== "line") return undefined;
  const x = active.x1 ?? active.startX, y = active.y1 ?? active.startY;
  return typeof x === "number" && typeof y === "number" ? { x, y, z: active.z1 || 0 } : undefined;
}

/**
 * Points on the lines parallel to an existing line through the start point: the cursor projected onto that ray, so the line
 * being drawn comes out parallel.
 */
function findParallelPoints(point: Point, from: Point, elements: Element[], activeElement: Element | undefined): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];
  for (const line of elements) {
    if (line.type !== "line" || line === activeElement) continue;
    const dx = line.x2 - line.x1, dy = line.y2 - line.y1;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    const ux = dx / length, uy = dy / length;
    const along = (point.x - from.x) * ux + (point.y - from.y) * uy;
    snapPoints.push({ x: from.x + along * ux, y: from.y + along * uy, z: point.z, type: SnapType.PARALLEL, source: line, priority: 11 });
  }
  return snapPoints;
}

/** The closest point on the outline of each line, circle and rectangle: where the cursor sits on an edge. */
function findNearestPoints(point: Point, elements: Element[], activeElement: Element | undefined): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];
  const push = (x: number, y: number, z: number, source: Element) => snapPoints.push({ x, y, z, type: SnapType.NEAREST, source, priority: 1 });
  for (const element of elements) {
    if (element === activeElement) continue;
    if (element.type === "line") {
      const near = findClosestPointOnLine(point, { x: element.x1, y: element.y1 }, { x: element.x2, y: element.y2 });
      if (near) push(near.x, near.y, point.z, element);
    } else if (element.type === "circle" && element.radius > 0) {
      const dx = point.x - element.x, dy = point.y - element.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) push(element.x + (dx / distance) * element.radius, element.y + (dy / distance) * element.radius, point.z, element);
    } else if (element.type === "rectangle") {
      const hw = element.width / 2, hh = element.height / 2;
      const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([cx, cy]) => ({ x: element.x + cx!, y: element.y + cy! }));
      let best: { x: number; y: number } | undefined, bestSq = Infinity;
      for (let i = 0; i < 4; i++) {
        const near = findClosestPointOnLine(point, corners[i]!, corners[(i + 1) % 4]!);
        if (!near) continue;
        const sq = (near.x - point.x) ** 2 + (near.y - point.y) ** 2;
        if (sq < bestSq) { bestSq = sq; best = near; }
      }
      if (best) push(best.x, best.y, point.z, element);
    }
  }
  return snapPoints;
}

/**
 * Find the closest point on a line to a given point
 */
function findClosestPointOnLine(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): { x: number; y: number } | null {
  // Vector of the line
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  // Line length squared
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    // Line start and end are the same point
    return { x: lineStart.x, y: lineStart.y };
  }

  // Calculate projection of point onto line
  const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared;

  // If t is outside [0,1], the closest point is one of the endpoints
  if (t < 0) {
    return { x: lineStart.x, y: lineStart.y };
  }
  if (t > 1) {
    return { x: lineEnd.x, y: lineEnd.y };
  }

  // Closest point is on the line segment
  return {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy
  };
}

/**
 * Find tangent points from a point to circles
 */
function findTangentPoints(_point: Point, from: Point, elements: Element[], activeElement: Element | undefined): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];
  for (const circle of elements) {
    if (circle.type !== "circle" || circle === activeElement) continue;
    // The two points where a line from the start point just touches the circle.
    for (const tangent of findTangentPointsToCircle(from, { x: circle.x, y: circle.y }, circle.radius)) {
      snapPoints.push({ x: tangent.x, y: tangent.y, z: from.z, type: SnapType.TANGENT, source: circle, priority: 12 });
    }
  }
  return snapPoints;
}

/**
 * Calculate tangent points from a point to a circle
 */
function findTangentPointsToCircle(
  point: { x: number; y: number },
  circleCenter: { x: number; y: number },
  radius: number
): Array<{ x: number; y: number }> {
  const tangentPoints: Array<{ x: number; y: number }> = [];

  // Vector from circle center to point
  const dx = point.x - circleCenter.x;
  const dy = point.y - circleCenter.y;

  // Distance from point to circle center
  const distance = Math.sqrt(dx * dx + dy * dy);

  // If point is inside the circle, no tangent points
  if (distance <= radius) {
    return tangentPoints;
  }

  // At the centre, the radius to a tangent point makes an angle acos(r / d) with the line to the external point.
  const angle = Math.acos(radius / distance);

  // Angle from circle center to point
  const baseAngle = Math.atan2(dy, dx);

  // First tangent point
  const angle1 = baseAngle - angle;
  tangentPoints.push({
    x: circleCenter.x + radius * Math.cos(angle1),
    y: circleCenter.y + radius * Math.sin(angle1)
  });

  // Second tangent point
  const angle2 = baseAngle + angle;
  tangentPoints.push({
    x: circleCenter.x + radius * Math.cos(angle2),
    y: circleCenter.y + radius * Math.sin(angle2)
  });

  return tangentPoints;
}

/**
 * Find equidistant points between elements
 *
 * Quadratic in the number of significant points; the only thing worth reporting is a midpoint within `smartTolerance`
 * of the cursor, wherever the two source points are. Tested on squared distances, so no square root is taken.
 */
function findEquidistantPoints(point: Point, elements: Element[], settings: SnapSettings): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];

  // Get all significant points
  const significantPoints: Point[] = [];

  elements.forEach(element => {
    switch (element.type) {
      case "line":
        significantPoints.push({ x: element.x1, y: element.y1, z: element.z1 || 0 });
        significantPoints.push({ x: element.x2, y: element.y2, z: element.z2 || 0 });
        break;

      case "circle":
        significantPoints.push({ x: element.x, y: element.y, z: element.z || 0 });
        break;

      case "rectangle":
        // Center
        significantPoints.push({ x: element.x, y: element.y, z: element.z || 0 });
        break;
    }
  });

  const toleranceSq = settings.smartTolerance ** 2;
  // The pairs are quadratic in the points, and this runs on every pointer move: a drawing this large has to switch it off.
  if (significantPoints.length > 300) return snapPoints;

  // Check for equidistant points between pairs of points
  for (let i = 0; i < significantPoints.length; i++) {
    for (let j = i + 1; j < significantPoints.length; j++) {
      const p1 = significantPoints[i]!;
      const p2 = significantPoints[j]!;

      // Calculate midpoint
      const midpoint = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
        z: (p1.z + p2.z) / 2
      };

      // Check if mouse is near the midpoint
      const dx = midpoint.x - point.x, dy = midpoint.y - point.y;
      if (dx * dx + dy * dy <= toleranceSq) {
        snapPoints.push({
          ...midpoint,
          type: SnapType.EQUIDISTANT,
          priority: 7
        });
      }
    }
  }

  return snapPoints;
}

// Default settings
export const defaultSnapSettings: SnapSettings = {
  enabled: true,
  types: {
    [SnapType.GRID]: true,
    [SnapType.ENDPOINT]: true,
    [SnapType.MIDPOINT]: true,
    // Pairwise snaps are O(n²) in the size of the drawing and are paid on every pointer move, so
    // they are opt-in: the five that only need one element at a time stay on by default.
    [SnapType.INTERSECTION]: false,
    [SnapType.CENTER]: true,
    [SnapType.QUADRANT]: true,
    [SnapType.NEAREST]: true,
    [SnapType.TANGENT]: false,
    [SnapType.PERPENDICULAR]: false,
    [SnapType.PARALLEL]: false,
    [SnapType.EQUIDISTANT]: false,
    [SnapType.HORIZONTAL]: false,
    [SnapType.VERTICAL]: false
  },
  gridSize: 10,
  tolerance: 10,
  smartTolerance: 15
};
