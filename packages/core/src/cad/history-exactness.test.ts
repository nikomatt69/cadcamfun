/**
 * The coverage matrix of spec 40 (U0): for every feature kind and option set, does the exact replay (`rebuildExact`) keep an exact
 * B-rep, or does the body fall back to its mesh, and why. The `BASELINE` below is the recorded state. The test fails when a cell
 * LOSES exactness (a regression) or when a mesh-only cell has no reason; a cell that GAINS exactness fails too, with the one-line
 * change to make, so the baseline always says what is true and an improvement is a visible, reviewed edit.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { History } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { model } from "./script.ts"
import { CELLS } from "./history-cells.ts"
import { massProperties, validateBrep } from "./brep/index.ts"
import { brepBox } from "./history-brep.ts"
import { meshBounds, meshVolume } from "./solid.ts"

setDefaultTimeout(110_000)

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
  "draft.curved": "exact",
  "draft.hole": "exact",
  "draft.boss": "exact",
  "primitive.cube": "exact",
  "primitive.cylinder": "exact",
  "primitive.cone": "exact",
  "primitive.sphere": "exact",
  "primitive.torus": "exact",
  "primitive.prism": "exact",
  "primitive.ellipsoid": "mesh",
  "primitive.gear": "mesh",
  "primitive.capsule": "exact",
  "primitive.hemisphere": "exact",
  "coil.round": "exact",
  "thread.external": "exact",
  "thread.internal": "exact",
  "thread.left": "exact",
  "thread.cut": "exact",
  "thread.axisX": "exact",
  "rib": "exact",
  "sheet.flange": "exact",
  "text": "exact",
  "scale.uniform": "exact",
  "scale.nonuniform": "exact",
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
        // Same place and size: the boxes of the two views agree to a chord sag (the mesh is inscribed in the true surface).
        const eb = brepBox(b.brep), mb = meshBounds(ex.result.bodies[i]!.mesh)
        const slack = (lo: number, hi: number) => 0.2 + 0.02 * Math.abs(hi - lo)
        for (const [a, e, mn, mx] of [["x", [eb.lo.x, eb.hi.x], mb.minX, mb.maxX], ["y", [eb.lo.y, eb.hi.y], mb.minY, mb.maxY], ["z", [eb.lo.z, eb.hi.z], mb.minZ, mb.maxZ]] as const) {
          const tol = slack(e[0], e[1])
          expect({ cell: cell.id, axis: a, near: Math.abs(e[0] - mn) < tol && Math.abs(e[1] - mx) < tol }).toEqual({ cell: cell.id, axis: a, near: true })
        }
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
