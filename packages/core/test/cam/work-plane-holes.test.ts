/**
 * A hole on a work plane (spec 33 C12): the plane a `plane` feature made carries the hole's frame, so the exact model cuts it
 * and the CAM sees where it starts and which way it goes. A tilted hole cannot be drilled in a 3-axis setup: the planner says
 * so instead of dropping it.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { DimConstraint, Feature, History } from "../../src/cad/history.ts"
import type { SketchEntity } from "../../src/cad/sketch.ts"
import { historyFeatures } from "../../src/cam/generator/history-features.ts"
import { planOnly } from "../../src/cam/kernel/index.ts"

setDefaultTimeout(90_000)

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })

/** A 40 x 25 plate 6 mm thick, its top at z = 6. */
const plate = (extra: Feature[] = []): History => ({
  parameters: { width: 40, depth: 25, thick: 6 },
  features: [
    {
      id: "s1", type: "sketch", plane: "XY",
      sketch: {
        entities: [pt("p1", 0, 0), pt("p2", 40, 0), pt("p3", 40, 25), pt("p4", 0, 25), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")],
        constraints: [
          { type: "fixed", point: "p1", x: 0, y: 0 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" },
          { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
          { type: "length", line: "l1", value: "width" }, { type: "length", line: "l2", value: "depth" }
        ] as DimConstraint[]
      }
    },
    { id: "plate", type: "extrude", sketch: "s1", depth: "thick", operation: "new" },
    ...extra
  ]
})

/** A work plane tilted 30 degrees about X, crossing the plate at y = 12.5. */
const tilted = { id: "w", type: "plane", from: { kind: "angle", base: "XY", angle: 30, about: "u", at: 12.5 } } as const

const element = (history: History) => ({ id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, history })

describe("a hole on a work plane keeps the plane's frame", () => {
  test("the CAM sees the hole's entry and its direction on a tilted plane", () => {
    const f = historyFeatures(element(plate([
      tilted,
      { id: "h1", type: "hole", plane: "w", at: [20, 0], diameter: 8, depth: 6 }
    ])))!
    expect(f).toBeDefined()
    expect(f.holes).toHaveLength(1)
    const hole = f.holes[0]!
    // The plane's origin is on the X axis at y = 12.5, turned 30 degrees about X: the hole's entry is on it.
    expect(hole.entry.x).toBeCloseTo(20, 6)
    expect(hole.entry.y).toBeCloseTo(12.5, 6)
    expect(hole.entry.z).toBeCloseTo(0, 6)
    // The direction is the plane's normal, turned 30 degrees about X: the hole goes down and towards +Y.
    expect(hole.direction.x).toBeCloseTo(0, 6)
    expect(hole.direction.y).toBeCloseTo(Math.sin(Math.PI / 6), 6)
    expect(hole.direction.z).toBeCloseTo(-Math.cos(Math.PI / 6), 6)
  })

  test("a hole on a base plane keeps its own frame", () => {
    const f = historyFeatures(element(plate([
      { id: "h1", type: "hole", plane: "XY", offset: 6, at: [20, 12.5], diameter: 8, depth: 6 }
    ])))!
    const hole = f.holes[0]!
    expect(hole.entry).toEqual({ x: 20, y: 12.5, z: 6 })
    expect(hole.direction).toEqual({ x: 0, y: 0, z: -1 })
  })

  test("the planner says a tilted hole needs an indexed setup instead of dropping it", () => {
    const r = planOnly({
      schemaVersion: 1, id: "j", name: "Plate", material: "6061",
      part: { kind: "elements", elements: [{ id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, history: plate([tilted, { id: "h1", type: "hole", plane: "w", at: [20, 0], diameter: 8, depth: 6 }]) }] },
      stock: { min: { x: -3, y: -3, z: 0 }, max: { x: 43, y: 28, z: 8 } }
    })
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    // The hole is reported, not silently forgotten.
    expect(r.value.unmachined.join(" ")).toContain("h1")
    expect(r.value.unmachined.join(" ")).toMatch(/3\+2|another setup/)
  })
})
