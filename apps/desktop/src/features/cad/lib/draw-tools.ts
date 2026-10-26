/**
 * The two-click drawing tools (line, circle, rectangle): what two points on the work plane make, and the outline the
 * rubber band shows while the second point is still moving. Pure, so the canvas only has to collect the clicks.
 */
import { formDefaults } from "./formDefaults.ts"

export type DrawTool = "line" | "circle" | "rectangle"
export const DRAW_TOOLS: ReadonlyArray<DrawTool> = ["line", "circle", "rectangle"]

export interface Point3 { readonly x: number; readonly y: number; readonly z: number }

/** Anything shorter than this is a double click, not a shape. */
const MIN = 1e-6

/**
 * The element two clicks make, or `undefined` when they make nothing (the same point twice, a rectangle with no width).
 * A line runs from the first point to the second; a circle has its centre at the first and passes through the second; a
 * rectangle has the two points for opposite corners and is stored by its centre, as the rest of the editor does.
 */
export const elementFromPoints = (tool: DrawTool, start: Point3, end: Point3): Record<string, unknown> | undefined => {
  const dx = end.x - start.x, dy = end.y - start.y
  switch (tool) {
    case "line":
      if (Math.hypot(dx, dy, end.z - start.z) < MIN) return undefined
      return { ...formDefaults("line"), type: "line", x1: start.x, y1: start.y, z1: start.z, x2: end.x, y2: end.y, z2: end.z }
    case "circle": {
      const radius = Math.hypot(dx, dy)
      if (radius < MIN) return undefined
      return { ...formDefaults("circle"), type: "circle", x: start.x, y: start.y, z: start.z, radius }
    }
    case "rectangle": {
      const width = Math.abs(dx), height = Math.abs(dy)
      if (width < MIN || height < MIN) return undefined
      return { ...formDefaults("rectangle"), type: "rectangle", x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, z: start.z, width, height }
    }
  }
}

/** The point the user draws from, for the snaps that are relative to it (perpendicular, tangent, parallel): a line's start. */
export const anchorOf = (tool: DrawTool, start: Point3 | undefined): Point3 | undefined => (tool === "line" ? start : undefined)

/** The outline of the shape the cursor would make now, as a polyline (closed shapes repeat their first point). */
export const previewOutline = (tool: DrawTool, start: Point3, end: Point3): ReadonlyArray<Point3> => {
  switch (tool) {
    case "line":
      return [start, end]
    case "circle": {
      const radius = Math.hypot(end.x - start.x, end.y - start.y)
      const steps = 64
      return Array.from({ length: steps + 1 }, (_, i) => {
        const angle = (i / steps) * Math.PI * 2
        return { x: start.x + radius * Math.cos(angle), y: start.y + radius * Math.sin(angle), z: start.z }
      })
    }
    case "rectangle":
      return [start, { x: end.x, y: start.y, z: start.z }, { x: end.x, y: end.y, z: start.z }, { x: start.x, y: end.y, z: start.z }, start]
  }
}

/** After a finished shape: a line carries on from where it ended (a chain of lines), the others start over. */
export const nextStart = (tool: DrawTool, end: Point3): Point3 | undefined => (tool === "line" ? end : undefined)
