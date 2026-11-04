/** Spec 69 C1, 3+2: a setup in a tilted work plane writes the control's plane word and replays in the plane. */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { applyPoint } from "../../cad/brep/math.ts"
import { findMachine } from "./machines.ts"
import type { CamArtifact, ManufacturingJob, OperationSpec } from "./contracts.ts"
import { runJob } from "./execute.ts"
import { runSetups } from "./setups.ts"
import { jobTransform, workplaneFrame } from "./workplane.ts"

setDefaultTimeout(100_000)

const block = {
  positions: [0, 0, 0, 60, 0, 0, 60, 40, 0, 0, 40, 0, 0, 0, 10, 60, 0, 10, 60, 40, 10, 0, 40, 10],
  indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
}
const s = Math.sin(Math.PI / 6), c = Math.cos(Math.PI / 6)
const workplane = { normal: { x: 0, y: -s, z: c } }

const job = (over: Partial<ManufacturingJob> = {}): ManufacturingJob => {
  const t = jobTransform({ workplane })
  const zs = block.positions.flatMap((_, i) => (i % 3 === 0 ? [applyPoint(t, { x: block.positions[i]!, y: block.positions[i + 1]!, z: block.positions[i + 2]! }).z] : []))
  const top = Math.max(...zs)
  const centre = applyPoint(t, { x: 30, y: 20, z: 5 })
  const hole: OperationSpec = { id: "hole", strategy: "drill", tool: "drill-5", points: [{ x: centre.x, y: centre.y }], top, bottom: top - 4 } as OperationSpec
  return { schemaVersion: 1, id: "wp", name: "Tilted", material: "6061", part: { kind: "meshes", meshes: [block] }, machine: findMachine("trunnion-5ax")!, quality: { resolution: 0.5 }, workplane, operations: [hole], ...over }
}
const ok = (r: ReturnType<typeof runJob>): CamArtifact => {
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}

describe("workplaneFrame", () => {
  test("is right-handed and orthonormal, with the normal as the tool axis", () => {
    const f = workplaneFrame(workplane)
    if (!("frame" in f)) throw new Error(f.error)
    expect(f.frame.zAxis.z).toBeCloseTo(c, 9)
    expect(f.frame.xAxis).toEqual({ x: 1, y: 0, z: 0 })
    expect(f.frame.yAxis.y).toBeCloseTo(c, 9)
  })
  test("a zero normal and an x hint along the normal are refused", () => {
    expect("error" in workplaneFrame({ normal: { x: 0, y: 0, z: 0 } })).toBe(true)
    expect("error" in workplaneFrame({ normal: { x: 0, y: 0, z: 1 }, xHint: { x: 0, y: 0, z: 2 } })).toBe(true)
  })
})

describe("a tilted plane in a kernel job", () => {
  const a = ok(runJob(job()))

  test("the NC carries the control's plane word and the artifact the plane", () => {
    expect(a.nc).toMatch(/G68\.2/)
    expect(a.nc).toMatch(/G69/)
    expect(a.workplane).toEqual(workplane)
  })
  test("the replay is read back in the plane: it agrees with the planned motion", () => {
    expect(a.claims.find((x) => x.id === "nc-replay")!.status).toBe("passed")
    expect(a.claims.find((x) => x.id === "machine-clearance")!.status).not.toBe("passed")
  })
  test("without a tilt the NC has no plane word", () => {
    const { workplane: _w, ...flat } = job()
    const b = ok(runJob({ ...flat, operations: [{ id: "hole", strategy: "drill", tool: "drill-5", points: [{ x: 30, y: 20 }], top: 10, bottom: 6 } as OperationSpec] }))
    expect(b.nc).not.toMatch(/G68\.2/)
  })
  test("the planner is refused in a tilted plane, and so is a manual orientation beside it", () => {
    const { operations: _o, ...planned } = job()
    const r1 = runJob(planned)
    expect(r1.status === "failed" && r1.issues[0]!.message).toMatch(/explicit operations/)
    const r2 = runJob(job({ setupOrientation: "-Z" }))
    expect(r2.status === "failed" && r2.issues[0]!.message).toMatch(/not both/)
  })
  test("a setup list takes the plane per setup", () => {
    const { workplane: _w, operations, ...base } = job()
    const r = runSetups({ ...base, setups: [{ id: "tilt", workplane, operations }] })
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    expect(r.value.setups[0]!.artifact.nc).toMatch(/G68\.2/)
  })
})
