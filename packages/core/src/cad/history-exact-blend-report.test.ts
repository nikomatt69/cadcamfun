/**
 * Exact replay rigor (spec 40/58): the exact body of a history is the whole model or it says why it is not.
 *
 * Before: the top rim of a cylinder was rejected by `blendBrep` ("the faces reach only 0.000 mm": the reach of a disc face was
 * measured from boundary points that all lie on the rim itself) and the exact replay only warned, so the exact body stayed
 * un-filleted while the mesh showed the fillet. Now the disc reaches the axis (the rim builds, with the analytic volume) and an
 * edge the exact blend still refuses leaves the body without an exact model, with the edge and the reason.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuildExact } from "./history-brep.ts"
import { blendBrep, blendCandidates, massProperties, makeBox, selectBlendEdges } from "./brep/index.ts"
import { model } from "./script.ts"
import { CELLS } from "./history-cells.ts"
import { meshVolume } from "./solid.ts"

setDefaultTimeout(120_000)

describe("rim fillet of a cylinder (fillet.top-rim-cylinder)", () => {
  const cell = CELLS.find((c) => c.id === "fillet.top-rim-cylinder")!
  const m = model()
  cell.build(m)
  const ex = rebuildExact(m.build())

  test("the exact body carries the fillet: analytic volume, no warning", () => {
    expect(ex.warnings.filter((w) => /not blended/.test(w))).toEqual([])
    const body = ex.bodies[0]!
    expect(body.reason).toBeUndefined()
    // circle(…, 12) is the diameter: r = 6, height 15, fillet 2. Pappus: removed = 2 pi (rho_c * A + int x dA).
    const rf = 2, rho = 6 - rf, h = 15
    const A = rf * rf * (1 - Math.PI / 4)
    const removed = 2 * Math.PI * (rho * A + (rf ** 3) / 2 - (rf ** 3) / 3)
    const analytic = Math.PI * 36 * h - removed
    const exact = massProperties(body.brep!).volume
    expect(Math.abs(exact - analytic) / analytic).toBeLessThan(2e-3)
    // It is not the sharp cylinder: the mesh shows the fillet and the exact body agrees with the mesh to the tessellation.
    expect(Math.PI * 36 * h - exact).toBeGreaterThan(0.9 * removed)
    expect(Math.abs(exact - meshVolume(ex.result.bodies[0]!.mesh)) / exact).toBeLessThan(5e-3)
  })

  test("the disc face reaches the axis in the blend candidates", () => {
    const body = ex.timeline![2]!.bodies[0]!.brep // after sketch + extrude, before the fillet
    const rims = blendCandidates(body, 25).filter((c) => c.curved)
    expect(rims.length).toBeGreaterThan(0)
    for (const c of rims) expect(Math.min(c.reachA, c.reachB)).toBeGreaterThan(5.99)
  })
})

describe("an edge the exact blend refuses", () => {
  test("blendBrep still names it in `rejected` (a fillet wider than the face)", () => {
    const box = makeBox(10, 10, 10)
    const edges = selectBlendEdges(blendCandidates(box, 25), { parallel: "z" })
    const res = blendBrep(box, edges, 8, "fillet")
    expect(res.rejected.length + res.failures.length).toBeGreaterThan(0)
  })

  test("the exact replay does not keep an un-blended body as the exact model", () => {
    // R8 on the edges of a 40 x 30 x 10 plate fits the mesh rule, the exact blend of the two near-flat 10 mm top rim edges does not
    // fit: whichever refuses, the body keeps its mesh and the reason names the blend (or the feature fails as a whole).
    const m = model()
    const b = m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10 })
    m.fillet({ radius: 6, edges: { parallel: "x" }, targets: [b] })
    const ex = rebuildExact(m.build())
    const errs = ex.result.issues.filter((i) => i.severity === "error")
    const body = ex.bodies[0]!
    // Either the mesh refused the feature (error issue, the exact replay skipped it and the body is the plate), or the exact body
    // is missing with a reason; an exact body that silently lacks the blend is the one outcome that is not allowed.
    if (errs.length === 0) {
      if (body.brep !== undefined) {
        const exact = massProperties(body.brep).volume
        const mesh = meshVolume(ex.result.bodies[0]!.mesh)
        expect(Math.abs(exact - mesh) / mesh).toBeLessThan(0.01)
      } else expect(body.reason!.length).toBeGreaterThan(0)
    }
  })
})
