/**
 * The coverage matrix of spec 40 (U0): for every feature kind and option set, does the exact replay (`rebuildExact`) keep an exact
 * B-rep, or does the body fall back to its mesh, and why. The `BASELINE` below is the recorded state. The test fails when a cell
 * LOSES exactness (a regression) or when a mesh-only cell has no reason; a cell that GAINS exactness fails too, with the one-line
 * change to make, so the baseline always says what is true and an improvement is a visible, reviewed edit.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { History } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { model, type ModelScript } from "./script.ts"
import { massProperties, validateBrep } from "./brep/index.ts"
import { meshVolume } from "./solid.ts"

setDefaultTimeout(110_000)

type Cell = { readonly id: string; readonly build: (m: ModelScript) => void; readonly meshTolerance?: number; readonly expectIssues?: boolean }

const plate = (m: ModelScript, depth = 10): string => m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth })

const CELLS: ReadonlyArray<Cell> = [
  // extrude
  { id: "extrude.plain", build: (m) => { plate(m) } },
  { id: "extrude.down", build: (m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10, direction: "down" }) } },
  { id: "extrude.symmetric", build: (m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10, direction: "symmetric" }) } },
  { id: "extrude.edge-chamfer", build: (m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10, edge: { style: "chamfer", size: 1.5 } }) } },
  { id: "extrude.edge-fillet", build: (m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10, edge: { style: "fillet", size: 2 } }) } },
  { id: "extrude.corner-fillet", build: (m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10, corner: { style: "fillet", size: 4 } }) } },
  { id: "extrude.taper", build: (m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10, taper: 5 }) } },
  { id: "extrude.cylinder", build: (m) => { m.extrude(m.sketch("XY").circle([0, 0], 20), { depth: 15 }) } },
  { id: "extrude.cut", build: (m) => { const b = plate(m); m.extrude(m.sketch("XY", 10).circle([20, 15], 10), { depth: 4, direction: "down", operation: "subtract", targets: [b] }) } },
  // revolve
  { id: "revolve.full", build: (m) => { m.revolve(m.sketch("XY").rectangle([5, 0], 3, 10), { axis: "y" }) } },
  { id: "revolve.partial", build: (m) => { m.revolve(m.sketch("XY").rectangle([5, 0], 3, 10), { axis: "y", angle: 180 }) } },
  // holes
  { id: "hole.simple", build: (m) => { plate(m); m.hole({ plane: "XY", offset: 10, at: [20, 15], diameter: 8, depth: 10 }) } },
  { id: "hole.counterbore", build: (m) => { plate(m); m.hole({ plane: "XY", offset: 10, at: [20, 15], diameter: 6, depth: 10, kind: "counterbore", headDiameter: 11, headDepth: 4 }) } },
  { id: "hole.countersink", build: (m) => { plate(m); m.hole({ plane: "XY", offset: 10, at: [20, 15], diameter: 6, depth: 10, kind: "countersink", headDiameter: 12, angle: 90 }) } },
  { id: "hole.tapped", build: (m) => { plate(m); m.hole({ plane: "XY", offset: 10, at: [20, 15], diameter: 5, depth: 10, thread: { designation: "M6", depth: 8 } }) } },
  // patterns and mirrors
  { id: "pattern.linear", build: (m) => { plate(m); const h = m.hole({ plane: "XY", offset: 10, at: [6, 6], diameter: 4, depth: 10 }); m.pattern({ feature: h, kind: "linear", count: 3, step: [10, 0, 0] }) } },
  { id: "pattern.circular", build: (m) => { plate(m); const h = m.hole({ plane: "XY", offset: 10, at: [30, 15], diameter: 3, depth: 10 }); m.pattern({ feature: h, kind: "circular", count: 4, centre: [20, 15] }) } },
  { id: "pattern.grid", build: (m) => { plate(m); const h = m.hole({ plane: "XY", offset: 10, at: [6, 6], diameter: 3, depth: 10 }); m.pattern({ feature: h, kind: "grid", count: 3, step: [10, 0, 0], countB: 2, stepB: [0, 10, 0] }) } },
  { id: "pattern.bodies", build: (m) => { const b = m.extrude(m.sketch("XY").circle([0, 0], 8), { depth: 5 }); m.pattern({ bodies: [b], kind: "linear", count: 3, step: [20, 0, 0] }) } },
  { id: "mirror.feature", build: (m) => { plate(m); const h = m.hole({ plane: "XY", offset: 10, at: [6, 6], diameter: 4, depth: 10 }); m.mirror({ feature: h, plane: "ZX", offset: 15 }) } },
  { id: "mirror.bodies-join", build: (m) => { const b = m.extrude(m.sketch("XY").rectangle([0, 0], 20, 10), { depth: 5 }); m.mirror({ bodies: [b], plane: "YZ", offset: 0, join: true }) } },
  // sweep, loft
  { id: "sweep.line", build: (m) => { const p = m.sketch("XY").circle([0, 0], 6); const path = m.sketch("ZX").path([[0, 0], [30, 0]]); m.sweep(p, path) } },
  { id: "sweep.bent", build: (m) => { const p = m.sketch("XY").circle([0, 0], 4); const path = m.sketch("ZX").path([[0, 0], [30, 0], [30, 25]]); m.sweep(p, path, { bendRadius: 8 }) } },
  { id: "loft.rect-rect", build: (m) => { const a = m.sketch("XY").rectangle([0, 0], 30, 30); const b = m.sketch("XY", 25).rectangle([5, 5], 20, 20); m.loft([a, b]) } },
  { id: "loft.rect-circle", build: (m) => { const a = m.sketch("XY").rectangle([-15, -15], 30, 30); const b = m.sketch("XY", 25).circle([0, 0], 10); m.loft([a, b]) } },
  // shell
  { id: "shell.extrusion", build: (m) => { const b = plate(m, 20); m.shell(b, { thickness: 2, open: "top" }) } },
  { id: "shell.revolution", build: (m) => { const b = m.revolve(m.sketch("XY").rectangle([0, 0], 10, 20), { axis: "y" }); m.shell(b, { thickness: 2, open: "top" }) } },
  { id: "shell.boolean-result", build: (m) => { const b = plate(m, 20); m.extrude(m.sketch("XY", 20).circle([20, 15], 8), { depth: 10, operation: "union", targets: [b] }); m.shell(b, { thickness: 2, open: "bottom" }) } },
  // blends
  { id: "fillet.straight", build: (m) => { plate(m); m.fillet({ radius: 2, edges: { parallel: "z" } }) } },
  { id: "fillet.top-rim-cylinder", build: (m) => { m.extrude(m.sketch("XY").circle([0, 0], 12), { depth: 15 }); m.fillet({ radius: 2, edges: { curved: true, within: { min: [-20, -20, 14], max: [20, 20, 16] } } }) } },
  { id: "fillet.variable", build: (m) => { plate(m); m.fillet({ radius: 1, edges: { parallel: "z", within: { min: [-1, -1, -1], max: [1, 1, 11] } } }) } },
  { id: "fillet.non-coaxial", build: (m) => {
    const a = m.extrude(m.sketch("XY").circle([0, 0], 10), { depth: 40 })
    m.extrude(m.sketch("YZ", 0).circle([0, 20], 6), { depth: 20, operation: "union", targets: [a] })
    m.fillet({ radius: 1.5, edges: { curved: true, within: { min: [-12, -12, 10], max: [12, 12, 30] } } })
  }, expectIssues: true },  // known gap (spec 43 B1): the pipe T intersection curve is not found as a blend edge
  { id: "chamfer.straight", build: (m) => { plate(m); m.chamfer({ size: 1.5, edges: { parallel: "z" } }) } },
  // face edits
  { id: "pushpull.planar", build: (m) => { plate(m); m.pushPull({ near: [20, 15, 10], normal: [0, 0, 1], distance: 4 }) } },
  { id: "draft.planar", build: (m) => { plate(m); m.draft({ near: [0, 15, 5], normal: [-1, 0, 0], angle: 3, pull: [0, 0, 1], neutral: 0 }) } },
  { id: "pushpull.curved", build: (m) => { m.extrude(m.sketch("XY").circle([0, 0], 10), { depth: 15 }); m.pushPull({ near: [10, 0, 7], normal: [1, 0, 0], distance: 2 }) } },
  { id: "draft.curved", build: (m) => { m.extrude(m.sketch("XY").circle([0, 0], 10), { depth: 15 }); m.draft({ near: [10, 0, 7], normal: [1, 0, 0], angle: 3, pull: [0, 0, 1], neutral: 0 }) } },
  // catalogue
  { id: "primitive.cube", build: (m) => { m.primitive({ element: "cube", params: { width: 10, height: 20, depth: 30 } }) } },
  { id: "primitive.cylinder", build: (m) => { m.primitive({ element: "cylinder", params: { radius: 5, height: 12 } }) } },
  { id: "primitive.cone", build: (m) => { m.primitive({ element: "cone", params: { radius: 5, height: 12 } }) } },
  { id: "primitive.sphere", build: (m) => { m.primitive({ element: "sphere", params: { radius: 6 } }) } },
  { id: "primitive.torus", build: (m) => { m.primitive({ element: "torus", params: { radius: 10, tubeRadius: 2 } }) } },
  { id: "primitive.prism", build: (m) => { m.primitive({ element: "prism", params: { radius: 6, height: 10, sides: 6 } }) } },
  { id: "primitive.ellipsoid", build: (m) => { m.primitive({ element: "ellipsoid", params: { radiusX: 8, radiusY: 5, radiusZ: 4 } }) } },
  { id: "primitive.gear", build: (m) => { m.primitive({ element: "gear", params: { module: 2, teeth: 16, width: 8 } }) } },
  { id: "primitive.capsule", build: (m) => { m.primitive({ element: "capsule", params: { radius: 3, height: 14 } }) } },
  // other features
  { id: "coil.round", build: (m) => { m.coil({ radius: 8, pitch: 4, turns: 5, wireDiameter: 1.2 }) } },
  { id: "thread.external", build: (m) => { m.extrude(m.sketch("XY").circle([0, 0], 3), { depth: 14 }); m.thread({ kind: "external", diameter: 6, pitch: 1, length: 8, at: [0, 0], offset: 0 }) } },
  { id: "rib", build: (m) => { plate(m); m.rib(m.sketch("ZX", 15).path([[10, 0], [10, 40]]), { thickness: 3, depth: 10 }) } },
  { id: "sheet.flange", build: (m) => { const path = m.sketch("ZX").path([[0, 0], [40, 0]]).toString(); m.add({ id: "sheet1", type: "sheet", sketch: path, thickness: 2, width: 30, bendRadius: 2, operation: "new", flanges: [{ end: "end", length: 12, angle: 90 }] }) } },
  { id: "text", build: (m) => { plate(m, 4); m.text({ text: "AB", height: 8, depth: 1, plane: "XY", offset: 4, at: [5, 10] }) } },
  { id: "scale.uniform", build: (m) => { plate(m); m.scale({ factor: 1.5 }) } },
  { id: "scale.nonuniform", build: (m) => { plate(m); m.scale({ factor: [1, 2, 3] }) } },
  { id: "move.rotate", build: (m) => { plate(m); m.move({ rotate: { axis: "z", angle: 30 }, translate: [5, 0, 0] }) } },
  { id: "split.above", build: (m) => { plate(m); m.split({ plane: "XY", offset: 5, keep: "above" }) } },
  { id: "combine.cut", build: (m) => { const a = plate(m); const b = m.extrude(m.sketch("XY", 2).circle([20, 15], 6), { depth: 4, operation: "new" }); m.combine({ target: a, tools: [b], operation: "cut" }) } }
]

/**
 * The recorded state. `exact`: every body of the cell has an exact B-rep. `mesh`: at least one body keeps only its mesh (the
 * reason is asserted non-empty). Update a line only together with the change that moved the cell.
 */
const BASELINE: Readonly<Record<string, "exact" | "mesh">> = {
  "extrude.plain": "exact",
  "extrude.down": "exact",
  "extrude.symmetric": "exact",
  "extrude.edge-chamfer": "exact",
  "extrude.edge-fillet": "exact",
  "extrude.corner-fillet": "exact",
  "extrude.taper": "exact",
  "extrude.cylinder": "exact",
  "extrude.cut": "exact",
  "revolve.full": "exact",
  "revolve.partial": "exact",
  "hole.simple": "exact",
  "hole.counterbore": "exact",
  "hole.countersink": "exact",
  "hole.tapped": "exact",
  "pattern.linear": "exact",
  "pattern.circular": "exact",
  "pattern.grid": "exact",
  "pattern.bodies": "exact",
  "mirror.feature": "exact",
  "mirror.bodies-join": "exact",
  "sweep.line": "exact",
  "sweep.bent": "exact",
  "loft.rect-rect": "exact",
  "loft.rect-circle": "exact",
  "shell.extrusion": "exact",
  "shell.revolution": "exact",
  "shell.boolean-result": "exact",
  "fillet.straight": "exact",
  "fillet.top-rim-cylinder": "exact",
  "fillet.variable": "exact",
  "fillet.non-coaxial": "exact",
  "chamfer.straight": "exact",
  "pushpull.planar": "exact",
  "draft.planar": "exact",
  "pushpull.curved": "mesh",
  "draft.curved": "mesh",
  "primitive.cube": "exact",
  "primitive.cylinder": "exact",
  "primitive.cone": "exact",
  "primitive.sphere": "exact",
  "primitive.torus": "exact",
  "primitive.prism": "exact",
  "primitive.ellipsoid": "mesh",
  "primitive.gear": "mesh",
  "primitive.capsule": "mesh",
  "coil.round": "exact",
  "thread.external": "mesh",
  "rib": "exact",
  "sheet.flange": "exact",
  "text": "exact",
  "scale.uniform": "exact",
  "scale.nonuniform": "mesh",
  "move.rotate": "exact",
  "split.above": "exact",
  "combine.cut": "exact"
}

describe("exactness coverage matrix (spec 40 U0)", () => {
  const outcomes = new Map<string, { state: "exact" | "mesh"; reasons: string[]; issues: string[] }>()

  for (const cell of CELLS) {
    test(cell.id, () => {
      const m = model()
      cell.build(m)
      const history: History = m.build()
      const ex = rebuildExact(history)
      expect(ex.bodies.length).toBeGreaterThan(0)
      const reasons = ex.bodies.filter((b) => b.brep === undefined).map((b) => b.reason ?? "")
      for (const r of reasons) expect(r.length).toBeGreaterThan(0)
      const issues = ex.result.issues.filter((i) => i.severity === "error").map((i) => `${i.feature}: ${i.message}`)
      // A cell that documents a refusal ("known gap") must keep refusing until the baseline is edited; every other cell must be clean.
      if (cell.expectIssues === true) expect(issues.length).toBeGreaterThan(0)
      else expect(issues).toEqual([])
      outcomes.set(cell.id, { state: reasons.length === 0 ? "exact" : "mesh", reasons, issues })
      // An exact body is a valid solid whose volume agrees with the mesh the viewport shows.
      ex.bodies.forEach((b, i) => {
        if (b.brep === undefined) return
        expect(validateBrep(b.brep).issues.map((x) => x.message)).toEqual([])
        const exact = massProperties(b.brep).volume
        const mesh = meshVolume(ex.result.bodies[i]!.mesh)
        expect(Math.abs(exact - mesh) / Math.max(Math.abs(mesh), 1e-9)).toBeLessThan(cell.meshTolerance ?? 0.03)
      })
      const recorded = BASELINE[cell.id]
      if (recorded === "exact") expect({ cell: cell.id, state: outcomes.get(cell.id)!.state, reasons }).toEqual({ cell: cell.id, state: "exact", reasons: [] })
      if (recorded === "mesh" && outcomes.get(cell.id)!.state === "exact") throw new Error(`${cell.id} is now exact: set BASELINE["${cell.id}"] = "exact"`)
      if (recorded === undefined) console.log(`MATRIX ${cell.id} ${outcomes.get(cell.id)!.state} ${JSON.stringify(reasons)} ${JSON.stringify(issues)}`)
    })
  }

  test("every cell is recorded in the baseline", () => {
    expect(CELLS.filter((c) => BASELINE[c.id] === undefined).map((c) => c.id)).toEqual([])
  })
})
