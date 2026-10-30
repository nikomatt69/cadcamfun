/**
 * What the desktop panel and the kernel route send: a `KernelSnapshot` with `breadth`, `tcp` or a vendor machine preset, through
 * `jobOfSnapshot` and `runJob`. The panel's switches are only as real as this path (spec 72 wiring of P2-5, step 0.2 and the vendor posts).
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { Feature } from "../../cad/history.ts"
import { dialectOf, getPost } from "../post/index.ts"
import { DEFAULT_CUTTERS, findCutter, jobOfSnapshot, runJob, type CamArtifact, type KernelSnapshot, type ManufacturingJob } from "./index.ts"
import { MACHINE_CATALOGUE } from "./machines.ts"
import { postOfController } from "./machine-profile.ts"

setDefaultTimeout(200_000)

const rect = (id: string, x: number, y: number, width: number, height: number): Feature => ({
  id, type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: `${id}r`, kind: "rectangle", at: [x, y], width, height }] }
})
const sink = { id: "c", type: "hole", plane: "XY", offset: 12, at: [30, 25], diameter: 5, depth: 12, kind: "countersink", headDiameter: 10, angle: 90 } as Feature
const plate: Record<string, unknown> = {
  id: "p", type: "parametric", name: "Plate", x: 0, y: 0, z: 0,
  history: { parameters: {}, features: [rect("base", 0, 0, 80, 50), { id: "plate", type: "extrude", sketch: "base", depth: 12, operation: "new" }, sink] }
}
const plateSnapshot = (over: Partial<KernelSnapshot> = {}): KernelSnapshot => ({
  schemaVersion: 1, id: "panel", name: "Panel job", material: "6061", elements: [plate], resolution: 0.5,
  stock: { x: 40, y: 25, width: 84, height: 54, depth: 13 }, ...over
})

const jobOf = (snapshot: KernelSnapshot): ManufacturingJob => {
  const job = jobOfSnapshot(snapshot)
  if (job.status !== "ok") throw new Error(job.issues.map((i) => i.message).join("; "))
  return job.value
}
const run = (job: ManufacturingJob): CamArtifact => {
  const r = runJob(job)
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}

describe("breadth from a snapshot", () => {
  test("holeCycles reaches the planner: the countersink is a cycle and the notes carry the rule", () => {
    const off = run(jobOf(plateSnapshot()))
    expect(off.notes.some((n) => n.startsWith("H1-countersink-cycle"))).toBe(false)
    const on = run(jobOf(plateSnapshot({ breadth: { holeCycles: true } })))
    expect(on.notes).toContainEqual(expect.stringMatching(/^H1-countersink-cycle: c planned/))
    expect(on.issues.filter((i) => i.severity === "error")).toEqual([])
  })

  test("tilted on a three-axis machine is refused in the notes with the reason, never dropped silently", () => {
    const a = run(jobOf(plateSnapshot({ machine: "vmc-standard", breadth: { tilted: true } })))
    expect(a.notes).toContainEqual(expect.stringMatching(/^Tilted drilling needs a five-axis machine/))
  })

  test("namedFeatures on a snapshot of CAD elements is asked for and answered in the notes", () => {
    const a = run(jobOf(plateSnapshot({ breadth: { namedFeatures: true }, setupOrientation: "-Z" })))
    expect(a.notes).toContainEqual(expect.stringMatching(/^Named features are recognised for the upright setup only/))
  })
})

// The dome on a base of the trunnion (A/C table), as in tip-control-job.test.ts.
const base = { id: "base", type: "cube", x: 0, y: 0, z: 4, width: 40, height: 40, depth: 8 }
const dome = { id: "dome", type: "sphere", x: 0, y: 0, z: 8, radius: 8 }
const ball = findCutter(DEFAULT_CUTTERS, "ball-10")!
const domeSnapshot = (over: Partial<KernelSnapshot> = {}): KernelSnapshot => ({
  schemaVersion: 1, id: "panel-dome", name: "Panel dome", material: "6061", machine: "trunnion-5ax", elements: [base, dome], resolution: 0.4,
  stock: { x: 0, y: 0, width: 44, height: 44, depth: 17 }, tools: [ball],
  operations: [{ id: "five-finish", strategy: "multiaxis", tool: ball.id, top: 17, stepover: 20, toolAxis: "normal" }], ...over
})

describe("tcp from a snapshot", () => {
  test("on a five-axis machine the NC carries the tip-control word and the verdicts are the machine-coordinate job's", () => {
    const off = run(jobOf(domeSnapshot())), on = run(jobOf(domeSnapshot({ tcp: true })))
    expect(on.nc).toMatch(/^G43\.4 H\d+$/m)
    expect(off.nc).not.toMatch(/G43\.4/)
    expect(on.release).toBe(off.release)
    expect(on.claims.map((c) => [c.id, c.status])).toEqual(off.claims.map((c) => [c.id, c.status]))
    expect(on.issues.filter((i) => i.severity === "error").map((i) => i.tag).sort()).toEqual(off.issues.filter((i) => i.severity === "error").map((i) => i.tag).sort())
  })

  test("a three-axis machine is refused with the reason: error issue, empty NC, blocked release", () => {
    const a = run(jobOf(plateSnapshot({ machine: "vmc-standard", tcp: true })))
    const refusal = a.issues.find((i) => i.severity === "error" && /^tcp: true refused/.test(i.message))
    expect(refusal?.tag).toBe("UnsupportedCapability")
    expect(refusal?.message).toMatch(/no five-axis table/)
    expect(a.nc).toBe("")
    expect(a.release).toBe("blocked")
  })

  for (const post of ["okuma", "generic", "linuxcnc"] as const) {
    test(`${post} has no tip-control word: a five-axis machine on it is refused with the reason`, () => {
      const job = jobOf(domeSnapshot({ tcp: true }))
      const a = run({ ...job, machine: { ...job.machine!, post } })
      const refusal = a.issues.find((i) => i.severity === "error" && /^tcp: true refused/.test(i.message))
      expect(refusal?.message).toMatch(/no tool-centre-point word/)
      expect(a.nc).toBe("")
      expect(a.release).toBe("blocked")
    })
  }
})

describe("Mitsubishi and Brother are posts of their own", () => {
  test("PostId, getPost, dialectOf and the controller names know them", () => {
    for (const id of ["mitsubishi", "brother"] as const) {
      expect(getPost(id)?.id).toBe(id)
      expect(dialectOf(id)?.id).toBe(id)
    }
    expect(postOfController("Mitsubishi M800")).toBe("mitsubishi")
    expect(postOfController("MELDAS M80")).toBe("mitsubishi")
    expect(postOfController("Brother Speedio C00")).toBe("brother")
  })

  test("the presets are in the catalogue and each runs a job in its own dialect", () => {
    const mitsubishi = MACHINE_CATALOGUE.find((m) => m.id === "mitsubishi-vmc")
    const brother = MACHINE_CATALOGUE.find((m) => m.id === "brother-speedio")
    expect(mitsubishi?.post).toBe("mitsubishi")
    expect(brother?.post).toBe("brother")
    const a = run(jobOf(plateSnapshot({ machine: "mitsubishi-vmc" })))
    expect(a.machine.post).toBe("mitsubishi")
    expect(a.nc).toMatch(/^G43 H\d+/m)
    expect(a.nc).toMatch(/M6/)
    expect(a.issues.filter((i) => i.severity === "error")).toEqual([])
    const b = run(jobOf(plateSnapshot({ machine: "brother-speedio" })))
    expect(b.machine.post).toBe("brother")
    expect(b.nc).toMatch(/^G100 T\d+ M6$/m)
    expect(b.issues.filter((i) => i.severity === "error")).toEqual([])
  })
})
