import { expect, setDefaultTimeout, test } from "bun:test"
import { applyPoint } from "../../cad/brep/math.ts"
import { DEFAULT_SETTINGS } from "../generator/schema.ts"
import { millSetupFromArtifact } from "../viewer/machine-setup.ts"
import { interpretGcode } from "../testing/gcode-interpreter.ts"
import { prepareJob, planOnly, runJob, SETUP_ORIENTATIONS, setupTransform, type ManufacturingJob } from "./index.ts"

setDefaultTimeout(90_000)

const sideJob = (): ManufacturingJob => ({
  schemaVersion: 1, id: "side", name: "Side hole", material: "6061", setupOrientation: "+X",
  part: { kind: "elements", elements: [{ id: "p", type: "parametric", x: 0, y: 0, z: 0, history: {
    parameters: {}, features: [
      { id: "b", type: "primitive", element: "cube", params: { width: 20, height: 16, depth: 10 }, operation: "new" },
      { id: "h", type: "hole", plane: "YZ", offset: 10, at: [0, 0], diameter: 4, depth: 6 }
    ]
  } }] },
  stock: { min: { x: -10, y: -8, z: -5 }, max: { x: 11, y: 8, z: 5 } },
  quality: { resolution: 0.25 }
})

const prepared = (job: ManufacturingJob) => {
  const r = prepareJob(job)
  if (r.status !== "ok") throw new Error(JSON.stringify(r.issues))
  return r.value
}

test("six manual setups map the chosen CAD direction to spindle Z and preserve handedness", () => {
  const directions = { "+Z": [0, 0, 1], "-Z": [0, 0, -1], "+X": [1, 0, 0], "-X": [-1, 0, 0], "+Y": [0, 1, 0], "-Y": [0, -1, 0] } as const
  for (const orientation of SETUP_ORIENTATIONS) {
    const [x, y, z] = directions[orientation]
    const tr = setupTransform(orientation)
    expect(applyPoint(tr, { x, y, z })).toEqual({ x: 0, y: 0, z: 1 })
    const m = tr.m
    const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])
    expect(det).toBe(1)
  }
  expect(applyPoint(setupTransform("+X"), { x: 11, y: 3, z: -2 })).toEqual({ x: 3, y: -2, z: 11 })
})

test("the side hole is actually drilled after refixturing and stock rotates with the part", () => {
  const job = sideJob(), before = JSON.stringify(job)
  const p = prepared(job)
  expect(p.bounds).toEqual({ min: [-8, -5, -10], max: [8, 5, 10] })
  expect(p.stock).toEqual({ min: { x: -8, y: -5, z: -10 }, max: { x: 8, y: 5, z: 11 } })
  expect(p.origin).toEqual({ x: 0, y: 0, z: 11 })
  const drill = p.operations.find((op) => op.strategy === "drill" && op.cut === "drill")
  expect(drill).toBeDefined()
  if (drill?.strategy === "drill") {
    expect(drill.points).toEqual([{ x: 0, y: 0 }])
    expect(drill.top).toBeCloseTo(10, 6)
    expect(drill.bottom).toBeLessThan(4)
  }
  expect(JSON.stringify(job)).toBe(before)
  const top = planOnly({ ...job, setupOrientation: "+Z" })
  if (top.status === "ok") expect(top.value.operations.some((op) => op.strategy === "drill")).toBe(false)
  else expect(top.issues.map((i) => i.message).join(" ")).toMatch(/another setup|3\+2/)
})

test("a separate side NC replays in setup coordinates with unresolved workholding and part coverage", () => {
  const job = sideJob(), p = prepared(job)
  // Drill only: the caller can choose operations without a full-stock roughing pass.
  const input = { ...job, operations: p.operations.filter((op) => op.strategy === "drill") }
  const a = runJob(input), b = runJob(input)
  if (a.status !== "ok" || b.status !== "ok") throw new Error(JSON.stringify([a, b]))
  expect(a.value.setupOrientation).toBe("+X")
  const preview = millSetupFromArtifact(a.value, { ...DEFAULT_SETTINGS, workholding: "vise", workholdingConfigured: true })
  expect(preview.workholding.kind).toBe("none")
  expect(preview.assumed).toContain("workholding")
  expect(preview.stock.max.z).toBe(0)
  expect(a.value.nc.toUpperCase()).toContain("MANUAL +X SETUP")
  expect(a.value.nc).not.toMatch(/^[^;\n]*(?:A|B|C)-?\d/m)
  expect(a.value.claims.find((c) => c.id === "setup-workholding")?.status).toBe("unresolved")
  expect(a.value.claims.find((c) => c.id === "part-coverage")?.status).toBe("unresolved")
  expect(a.value.release).not.toBe("verified-program")
  const nc = interpretGcode(a.value.nc)
  expect(nc.errors).toEqual([])
  expect(nc.minZ).toBeLessThan(-7)
  expect(a.value.identity).toEqual(b.value.identity)
  expect(a.value.nc).toBe(b.value.nc)
  const plan = planOnly(input)
  if (plan.status !== "ok") throw new Error("plan failed")
  expect(plan.value.notes.join(" ")).toContain("workholding and full-part coverage unverified")
})

test("a top-only replay cannot certify hidden surfaces even with explicit operations", () => {
  const job = sideJob()
  const top = runJob({ ...job, setupOrientation: "+Z", stock: undefined, operations: [{ id: "face", strategy: "face", tool: "flat-6", bottom: 5 }] })
  if (top.status !== "ok") throw new Error(JSON.stringify(top.issues))
  expect(top.value.claims.find((c) => c.id === "part-coverage")?.status).toBe("unresolved")
  expect(top.value.claims.find((c) => c.id === "part-coverage")?.detail).toContain("hidden from this setup")
  expect(top.value.release).not.toBe("verified-program")
})
