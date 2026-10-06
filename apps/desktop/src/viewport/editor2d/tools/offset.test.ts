/**
 * Offset tool tests (Apple §16 §7 craft: every behaviour tested deliberately).
 *
 * The offset tool clones a polyline / rectangle / circle / arc by a distance
 * that the user picks with a drag. These tests pin the geometry so a future
 * refactor of `offsetPolyline` doesn't silently break the viewport preview.
 */
import { describe, expect, test } from "bun:test"
import {
  baseEntity,
  emptyDrawing,
  type Drawing,
  type Entity,
  type LineEntity,
  type PolylineEntity,
  type RectangleEntity
} from "@cadcamfun/core"
import { offsetTool } from "./offset.ts"
import { type ToolContext } from "./tool.ts"

const emptyContext: ToolContext = { selection: [], entity: () => undefined }

const withEntity = (entity: Entity): ToolContext => ({
  selection: [entity.id],
  entity: (id) => (id === entity.id ? entity : undefined)
})

const pointEvent = (point: { x: number; y: number }, hits: ReadonlyArray<string> = []) => ({
  point,
  modifiers: { shift: false, alt: false, ctrl: false },
  hits
})

describe("offset tool", () => {
  test("offsets a closed rectangle by the drag distance", () => {
    const rect: RectangleEntity = {
      ...baseEntity("rect"),
      _tag: "Rectangle",
      corner1: { x: 0, y: 0 },
      corner2: { x: 10, y: 10 }
    }
    const ctx = withEntity(rect)
    let tool = offsetTool(() => ctx)()
    tool = tool.onPointerDown(pointEvent({ x: 5, y: 5 }, [rect.id]), tool)
    tool = tool.onPointerMove(pointEvent({ x: 5, y: 25 }, [rect.id]), tool)
    const preview = tool.preview(tool)
    expect(preview).toHaveLength(1)
    const poly = preview[0] as PolylineEntity
    expect(poly._tag).toBe("Polyline")
    expect(poly.closed).toBe(true)
    // The box grew outward; every vertex is further from the centre than 5.
    const radius = (p: { x: number; y: number }) => Math.hypot(p.x - 5, p.y - 5)
    for (const vertex of poly.points) expect(radius(vertex)).toBeGreaterThan(5)
  })

  test("commits an addEntity command with the previewed geometry", () => {
    const line: LineEntity = {
      ...baseEntity("line"),
      _tag: "Line",
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 }
    }
    const ctx = withEntity(line)
    let tool = offsetTool(() => ctx)()
    tool = tool.onPointerDown(pointEvent({ x: 50, y: 0 }, [line.id]), tool)
    tool = tool.onPointerMove(pointEvent({ x: 50, y: 10 }, [line.id]), tool)
    const cmd = tool.command(tool)
    expect(cmd).toBeDefined()
    expect(cmd?.label).toBe("offset")
    const drawing: Drawing = emptyDrawing("d", "D")
    const applied = cmd!.apply({
      ...drawing,
      entities: [line]
    })
    expect(applied.entities.length).toBeGreaterThan(0)
    expect(applied.entities.some((entity) => entity._tag === "Polyline")).toBe(true)
  })

  test("Escape clears the gesture", () => {
    const line: LineEntity = {
      ...baseEntity("line"),
      _tag: "Line",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 }
    }
    const ctx = withEntity(line)
    let tool = offsetTool(() => ctx)()
    tool = tool.onPointerDown(pointEvent({ x: 5, y: 0 }, [line.id]), tool)
    tool = tool.onPointerMove(pointEvent({ x: 5, y: 5 }, [line.id]), tool)
    tool = tool.onKey("Escape", tool)
    expect(tool.preview(tool)).toEqual([])
    expect(tool.command(tool)).toBeUndefined()
  })

  test("does not preview when no selection and no hit", () => {
    let tool = offsetTool(() => emptyContext)()
    tool = tool.onPointerDown(pointEvent({ x: 0, y: 0 }, []), tool)
    expect(tool.preview(tool)).toEqual([])
  })
})