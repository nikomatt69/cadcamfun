import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { projectView } from "../../drawing/project.ts"
import { generateSheet } from "../../drawing/sheet.ts"
import { rebuildExact } from "../history-brep.ts"
import { model } from "../script.ts"
import { drawingEdges } from "./drawing-edges.ts"
import { makeBox, makeCylinder } from "./primitives.ts"
import { extrudeProfile, roundedRectangleLoop } from "./sweep.ts"

setDefaultTimeout(60_000)

describe("exact edges for the drawing generator", () => {
  test("a box: twelve straight crease edges, one segment each", () => {
    const d = drawingEdges(makeBox(20, 15, 10))
    const edges = d.edges.filter((e) => e.edge !== undefined)
    expect(new Set(edges.map((e) => e.edge)).size).toBe(12)
    expect(edges.every((e) => e.kind === "crease" && e.curve === "line")).toBe(true)
    expect(edges.length).toBe(12)
    // Planar faces add no silhouette candidates.
    expect(d.edges.length).toBe(12)
  })

  test("a cylinder: circles are creases on the true radius, the seam is smooth, the wall gives silhouettes", () => {
    const d = drawingEdges(makeCylinder(5, 12))
    const circles = d.edges.filter((e) => e.curve === "circle")
    expect(circles.length).toBeGreaterThan(16)
    expect(circles.every((e) => e.kind === "crease")).toBe(true)
    for (const e of circles) for (const p of [e.a, e.b]) expect(Math.abs(Math.hypot(p.x, p.y) - 5)).toBeLessThan(1e-6)
    expect(d.edges.filter((e) => e.curve === "line").every((e) => e.kind === "smooth")).toBe(true)
    const front = projectView(d.mesh, "front", { edges: d.edges })
    // Outline: the two silhouette lines at x = +-5 and the two circles seen edge-on.
    const vertical = front.visible.filter((s) => Math.abs(s.a.x - s.b.x) < 1e-6)
    expect(vertical.length).toBeGreaterThanOrEqual(2)
    expect(vertical.every((s) => Math.abs(Math.abs(s.a.x) - 5) < 0.05)).toBe(true)
    expect(front.bounds.maxX - front.bounds.minX).toBeCloseTo(10, 2)
    expect(front.bounds.maxY - front.bounds.minY).toBeCloseTo(12, 6)
  })

  test("a rounded block: the tangent edges between a wall and its fillet are smooth, not drawn in the front view", () => {
    const d = drawingEdges(extrudeProfile({ loops: [roundedRectangleLoop(0, 0, 40, 25, 5)] }, 6))
    const vertical = d.edges.filter((e) => e.edge !== undefined && e.curve === "line" && Math.abs(e.a.z - e.b.z) > 1)
    expect(vertical.length).toBe(8)
    expect(vertical.every((e) => e.kind === "smooth")).toBe(true)
    const front = projectView(d.mesh, "front", { edges: d.edges })
    const lines = front.visible.filter((s) => Math.abs(s.a.x - s.b.x) < 1e-6 && Math.abs(s.a.y - s.b.y) > 1)
    // Only the two silhouettes of the end fillets; no line at x = 5 or x = 35.
    expect(lines.every((s) => Math.abs(s.a.x) < 1e-3 || Math.abs(s.a.x - 40) < 1e-3)).toBe(true)
    expect(lines.length).toBe(2)
  })
})

describe("sheets drawn from the exact model", () => {
  const plate = () => {
    const m = model()
    m.extrude(m.sketch("XY").rectangle([0, 0], 40, 25), { depth: 6, id: "plate" })
    m.hole({ plane: "XY", offset: 6, at: [20, 12.5], diameter: 8, depth: 6 })
    return m
  }

  test("a plate with a hole: exact edges, the hole on its true radius in the top view", () => {
    const sheet = generateSheet(plate().build(), { views: ["front", "top"], iso: false })
    expect(sheet.edgeSource).toBe("exact")
    expect(sheet.warnings.some((w) => w.includes("drawn from the mesh"))).toBe(false)
    expect(sheet.views.map((v) => v.name)).toEqual(expect.arrayContaining(["front", "top"]))
  })

  test("the top view's hole is on the exact circle", () => {
    const body = rebuildExact(plate().build()).bodies[0]!.brep!
    const d = drawingEdges(body)
    const top = projectView(d.mesh, "top", { edges: d.edges })
    const onHole = top.visible.flatMap((s) => [s.a, s.b]).map((p) => Math.hypot(p.x - 20, p.y - 12.5)).filter((r) => r < 6)
    expect(onHole.length).toBeGreaterThan(16)
    expect(Math.max(...onHole.map((r) => Math.abs(r - 4)))).toBeLessThan(1e-5)
    // The bore's wall is seen end-on: none of its edges is drawn hidden off the circle.
    expect(top.hidden.every((s) => Math.abs(Math.hypot(s.a.x - 20, s.a.y - 12.5) - 4) < 1e-3 || Math.hypot(s.a.x - 20, s.a.y - 12.5) > 6)).toBe(true)
  })

  test("a feature with no exact model falls back to the mesh, and says so", () => {
    const m = plate()
    m.fillet({ radius: 1 })
    const sheet = generateSheet(m.build(), { views: ["front"], iso: false })
    expect(sheet.edgeSource).toBe("mesh")
    expect(sheet.warnings.some((w) => w.includes("drawn from the mesh") && w.includes("no exact model"))).toBe(true)
  })

  test("exact: false keeps the mesh edges", () => {
    expect(generateSheet(plate().build(), { views: ["front"], iso: false, exact: false }).edgeSource).toBe("mesh")
  })
})
