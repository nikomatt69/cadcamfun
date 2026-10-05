/**
 * Spatial index and 2D tool state-machine tests (spec 06-desktop-ui.md §2-§3).
 *
 * No canvas and no DOM: the tools are pure state machines, so `bun:test` is the
 * right runner for the editor's core logic.
 */
import { describe, expect, test } from "bun:test"
import { boundingBox, circle, emptyDrawing, line, type Bounds2D } from "@cadcamfun/core"
import { createSpatialIndex, distanceToBox, entityIndex } from "../src/viewport/spatial/grid.ts"
import {
  CLICK_SLOP,
  arcTool,
  noModifiers,
  polylineTool,
  selectionOf,
  selectTool,
  twoPointTool
} from "../src/viewport/editor2d/tools/index.ts"
import type { PointerEvent, Tool } from "../src/viewport/editor2d/tools/tool.ts"

const box = (minX: number, minY: number, maxX: number, maxY: number): Bounds2D => ({
  minX,
  minY,
  maxX,
  maxY
})

describe("spatial index", () => {
  test("queries return every item whose bounds touch the box", () => {
    const index = createSpatialIndex<{ id: string; bounds: Bounds2D }>({ cellSize: 10 })
    index.build([
      { id: "a", bounds: box(0, 0, 5, 5) },
      { id: "b", bounds: box(20, 20, 25, 25) },
      { id: "c", bounds: box(4, 4, 30, 6) } // straddles the grid lines
    ])
    expect([...index.query(box(0, 0, 6, 6))].sort()).toEqual(["a", "c"])
    expect([...index.query(box(0, 0, 100, 100))].sort()).toEqual(["a", "b", "c"])
    expect(index.query(box(50, 50, 60, 60))).toEqual([])
  })

  test("an item spanning many cells is still found exactly once", () => {
    const index = createSpatialIndex<{ id: string; bounds: Bounds2D }>({ cellSize: 1 })
    index.build([{ id: "huge", bounds: box(-1000, -1000, 1000, 1000) }])
    const found = index.query(box(5, 5, 6, 6))
    expect(found).toEqual(["huge"])
    expect(index.size).toBe(1)
  })

  test("upsert replaces an item without leaving it in the old cell", () => {
    const index = createSpatialIndex<{ id: string; bounds: Bounds2D }>({ cellSize: 10 })
    index.upsert("a", { id: "a", bounds: box(0, 0, 1, 1) })
    index.upsert("a", { id: "a", bounds: box(100, 100, 101, 101) })
    expect(index.query(box(0, 0, 2, 2))).toEqual([])
    expect(index.query(box(99, 99, 102, 102))).toEqual(["a"])
    expect(index.size).toBe(1)
  })

  test("remove frees the cells", () => {
    const index = createSpatialIndex<{ id: string; bounds: Bounds2D }>({ cellSize: 10 })
    index.build([{ id: "a", bounds: box(0, 0, 1, 1) }])
    expect(index.occupiedCells).toBe(1)
    index.remove("a")
    expect(index.occupiedCells).toBe(0)
    expect(index.query(box(0, 0, 2, 2))).toEqual([])
  })

  test("nearest respects the radius and prefers the closer item", () => {
    const index = createSpatialIndex<{ id: string; bounds: Bounds2D }>({ cellSize: 10 })
    index.build([
      { id: "far", bounds: box(8, 0, 9, 1) },
      { id: "near", bounds: box(1, 0, 2, 1) }
    ])
    expect(index.nearest({ x: 0, y: 0 }, 5)?.id).toBe("near")
    expect(index.nearest({ x: 0, y: 0 }, 0.5)).toBeUndefined()
  })

  test("entities are indexed with their exact WP1 bounding boxes", () => {
    const index = entityIndex([circle("c", { x: 100, y: 0 }, 5), line("l", { x: 0, y: 0 }, { x: 1, y: 0 })], {
      cellSize: 10
    })
    expect(index.query(boundingBox(circle("probe", { x: 100, y: 0 }, 5)))).toEqual(["c"])
    expect(index.bounds.minX).toBe(0)
    expect(index.bounds.maxX).toBe(105)
  })

  test("distanceToBox is zero inside", () => {
    expect(distanceToBox({ x: 1, y: 1 }, box(0, 0, 2, 2))).toBe(0)
    expect(distanceToBox({ x: 5, y: 1 }, box(0, 0, 2, 2))).toBe(3)
  })

  test("10 000 entities build fast and query fast", () => {
    const index = createSpatialIndex<{ id: string; bounds: Bounds2D }>({ cellSize: 20 })
    const items = Array.from({ length: 10_000 }, (_, i) => ({
      id: `e${i}`,
      bounds: box(i % 100, Math.floor(i / 100), (i % 100) + 1, Math.floor(i / 100) + 1)
    }))
    const built = performance.now()
    index.build(items)
    const buildMs = performance.now() - built
    const queried = performance.now()
    for (let i = 0; i < 1000; i++) index.query(box(10, 10, 12, 12))
    const queryMs = performance.now() - queried
    expect(index.size).toBe(10_000)
    // Generous budgets: the point is "not a linear scan", not a benchmark.
    expect(buildMs).toBeLessThan(2000)
    expect(queryMs / 1000).toBeLessThan(1)
  })
})

// ---------------------------------------------------------------- tools

const pointer = (x: number, y: number, overrides: Partial<PointerEvent> = {}): PointerEvent => ({
  point: { x, y },
  modifiers: noModifiers,
  ...overrides
})

const applyCommand = (tool: Tool, drawing = emptyDrawing("d", "Part")) =>
  tool.command(tool)?.apply(drawing)

describe("two-point tools", () => {
  test("a line commits on release with the dragged endpoint", () => {
    let tool = twoPointTool("line")()
    tool = tool.onPointerDown(pointer(0, 0), tool)
    expect(twoPointTool("line")().status.ready).toBe(false)
    tool = tool.onPointerMove(pointer(10, 5), tool)
    tool = tool.onPointerUp(pointer(10, 5), tool)
    expect(tool.status.ready).toBe(true)
    const drawing = applyCommand(tool)!
    const entity = drawing.entities[0]!
    expect(entity._tag).toBe("Line")
    expect(entity._tag === "Line" ? entity.end : { x: 0, y: 0 }).toEqual({ x: 10, y: 5 })
  })

  test("no command before the gesture completes", () => {
    const tool = twoPointTool("line")()
    expect(tool.command(tool)).toBeUndefined()
  })

  test("shift constrains a rectangle to a square", () => {
    let tool = twoPointTool("rectangle")()
    tool = tool.onPointerDown(pointer(0, 0), tool)
    tool = tool.onPointerMove(pointer(10, 3), tool)
    // Shift snaps the corner so the rectangle stays square.
    tool = tool.onPointerMove(pointer(10, 3, { modifiers: { ...noModifiers, shift: true } }), tool)
    const drawing = applyCommand(tool)!
    const entity = drawing.entities[0]!
    expect(entity._tag === "Rectangle" ? entity.corner2 : { x: 0, y: 0 }).toEqual({ x: 10, y: 10 })
  })

  test("a zero-radius circle is refused", () => {
    let tool = twoPointTool("circle")()
    tool = tool.onPointerDown(pointer(2, 2), tool)
    tool = tool.onPointerUp(pointer(2, 2), tool)
    expect(tool.command(tool)).toBeUndefined()
  })

  test("escape cancels the gesture", () => {
    let tool = twoPointTool("line")()
    tool = tool.onPointerDown(pointer(0, 0), tool)
    tool = tool.onKey("Escape", tool)
    expect(tool.status.ready).toBe(false)
    expect(tool.command(tool)).toBeUndefined()
  })

  test("preview shows the geometry before committing", () => {
    let tool = twoPointTool("rectangle")()
    tool = tool.onPointerDown(pointer(0, 0), tool)
    tool = tool.onPointerMove(pointer(4, 2), tool)
    expect(tool.preview(tool)).toHaveLength(1)
  })

  test("two gestures never reuse an id", () => {
    let tool = twoPointTool("line")()
    tool = tool.onPointerDown(pointer(0, 0), tool)
    tool = tool.onPointerUp(pointer(1, 0), tool)
    const first = applyCommand(tool)!.entities[0]!.id
    tool = tool.onPointerDown(pointer(5, 5), tool)
    tool = tool.onPointerUp(pointer(6, 5), tool)
    const second = applyCommand(tool)!.entities[0]!.id
    expect(second).not.toBe(first)
  })
})

describe("select tool", () => {
  const lookup = (ids: ReadonlyArray<string>) => () => ids
  const withHits = (x: number, y: number, hits: string[]): PointerEvent =>
    pointer(x, y, { hits })

  test("a click selects the topmost entity", () => {
    let tool = selectTool(lookup(["a", "b"]))()
    tool = tool.onPointerDown(withHits(1, 1, ["a", "b"]), tool)
    tool = tool.onPointerUp(withHits(1, 1, ["a", "b"]), tool)
    expect(selectionOf(tool)).toEqual(["a"])
  })

  test("shift-click adds and toggles", () => {
    const shift = { ...noModifiers, shift: true }
    const shifted = (x: number, y: number, hits: string[]): PointerEvent =>
      pointer(x, y, { modifiers: shift, hits })
    let tool = selectTool(lookup(["a"]))()
    tool = tool.onPointerDown(withHits(1, 1, ["a"]), tool)
    tool = tool.onPointerUp(withHits(1, 1, ["a"]), tool)
    tool = tool.onPointerDown(shifted(2, 2, ["b"]), tool)
    tool = tool.onPointerUp(shifted(2, 2, ["b"]), tool)
    expect(selectionOf(tool)).toEqual(["a", "b"])
    tool = tool.onPointerDown(shifted(2, 2, ["b"]), tool)
    tool = tool.onPointerUp(shifted(2, 2, ["b"]), tool)
    expect(selectionOf(tool)).toEqual(["a"])
  })

  test("a rubber band selects everything it touches and replaces the selection", () => {
    const inside = ["a", "b"]
    let tool = selectTool(lookup(inside))()
    tool = tool.onPointerDown(pointer(0, 0), tool)
    tool = tool.onPointerMove(pointer(50, 50), tool)
    tool = tool.onPointerUp(pointer(50, 50), tool)
    expect([...selectionOf(tool)].sort()).toEqual(["a", "b"])
  })

  test("a drag under the click slop is still a click", () => {
    let tool = selectTool(lookup([]))()
    tool = tool.onPointerDown(pointer(0, 0), tool)
    tool = tool.onPointerMove(pointer(CLICK_SLOP / 2, 0), tool)
    tool = tool.onPointerUp(withHits(CLICK_SLOP / 2, 0, ["a"]), tool)
    expect(selectionOf(tool)).toEqual(["a"])
  })

  test("delete emits a command for the current selection only", () => {
    let tool = selectTool(lookup(["a"]))()
    tool = tool.onPointerDown(pointer(1, 1, { hits: ["a"] }), tool)
    tool = tool.onPointerUp(pointer(1, 1, { hits: ["a"] }), tool)
    const drawing = applyCommand(tool, addTwo())!
    expect(drawing.entities).toHaveLength(1)
    expect(drawing.entities[0]!.id).toBe("b")
  })

  test("an empty selection deletes nothing", () => {
    const tool = selectTool(lookup([]))()
    expect(tool.command(tool)).toBeUndefined()
  })
})

const addTwo = () =>
  ({
    ...emptyDrawing("d", "Part"),
    entities: [circle("a", { x: 0, y: 0 }, 1), circle("b", { x: 3, y: 0 }, 1)]
  })

describe("polyline tool", () => {
  test("points accumulate and commit as one entity", () => {
    let tool = polylineTool()()
    tool = tool.onPointerUp(pointer(0, 0), tool)
    tool = tool.onPointerMove(pointer(5, 0), tool)
    tool = tool.onPointerUp(pointer(5, 0), tool)
    tool = tool.onPointerMove(pointer(5, 5), tool)
    expect(tool.preview(tool)).toHaveLength(1)
    const drawing = applyCommand(tool)!
    const entity = drawing.entities[0]!
    expect(entity._tag === "Polyline" ? entity.points : []).toHaveLength(2)
  })

  test("a single point is not a polyline", () => {
    let tool = polylineTool()()
    tool = tool.onPointerUp(pointer(0, 0), tool)
    expect(tool.command(tool)).toBeUndefined()
  })

  test("escape clears the chain", () => {
    let tool = polylineTool()()
    tool = tool.onPointerUp(pointer(0, 0), tool)
    tool = tool.onPointerUp(pointer(5, 0), tool)
    tool = tool.onKey("Escape", tool)
    expect(tool.command(tool)).toBeUndefined()
  })
})

describe("arc tool", () => {
  test("three points produce an arc through the middle one", () => {
    let tool = arcTool()()
    tool = tool.onPointerUp(pointer(10, 0), tool)
    tool = tool.onPointerUp(pointer(5, 5), tool)
    tool = tool.onPointerMove(pointer(0, 0), tool)
    tool = tool.onPointerUp(pointer(0, 0), tool)
    const drawing = applyCommand(tool)!
    const entity = drawing.entities[0]!
    expect(entity._tag).toBe("Arc")
    if (entity._tag !== "Arc") return
    // Circumcentre of (10,0), (5,5), (0,0) is (5,0) with radius 5.
    expect(Math.hypot(entity.center.x - 5, entity.center.y)).toBeLessThan(1e-9)
    expect(entity.radius).toBeCloseTo(5, 9)
  })

  test("collinear points produce nothing", () => {
    let tool = arcTool()()
    tool = tool.onPointerUp(pointer(0, 0), tool)
    tool = tool.onPointerUp(pointer(5, 0), tool)
    tool = tool.onPointerUp(pointer(10, 0), tool)
    expect(tool.command(tool)).toBeUndefined()
  })
})
