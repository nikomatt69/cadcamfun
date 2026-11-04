import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { revolvedVolume } from "../turning/geometry.ts"
import type { LatheJob } from "../turning/plan.ts"
import type { TurningTool } from "../turning/insert.ts"
import { runTurningJob, type TurningArtifact, type TurningJobRequest } from "./turning-job.ts"

setDefaultTimeout(100_000)

const rough: TurningTool = { id: "T1", number: 1, kind: "turning", insert: "CNMG120408", approach: 95 }
const finish: TurningTool = { id: "T2", number: 2, kind: "turning", insert: "DNMG150604", approach: 93 }
const groove: TurningTool = { id: "T3", number: 3, kind: "grooving", bladeWidth: 3, bladeLength: 12 }
const threadTool: TurningTool = { id: "T4", number: 4, kind: "threading", insert: "TNMG160408", noseRadius: 0.1 }
const parting: TurningTool = { id: "T5", number: 5, kind: "parting", bladeWidth: 3, bladeLength: 15 }

const shaft: LatheJob = {
  stock: { diameter: 30, length: 60 },
  contour: [
    { diameter: 18, z: 0 }, { diameter: 20, z: -1 }, { diameter: 20, z: -18 }, { diameter: 26, z: -24 }, { diameter: 26, z: -28 },
    { diameter: 22, z: -28 }, { diameter: 22, z: -32 }, { diameter: 26, z: -32 }, { diameter: 26, z: -45 }
  ],
  tools: [rough, finish, groove, threadTool, parting],
  operations: [
    { kind: "face", tool: "T1" },
    { kind: "rough", tool: "T1", depth: 2, allowance: { x: 0.4, z: 0.2 } },
    { kind: "finish", tool: "T2" },
    { kind: "groove", tool: "T3", z: -28, width: 4, diameter: 22 },
    { kind: "thread", tool: "T4", diameter: 20, pitch: 1.5, zStart: 3, zEnd: -16 },
    { kind: "part", tool: "T5", z: -45 }
  ],
  machine: { maxRpm: 4000 }
}
const req = (over: Partial<TurningJobRequest> = {}, lathe: LatheJob = shaft): TurningJobRequest => ({ schemaVersion: 1, id: "t1", name: "Shaft", lathe, ...over })
const ok = (r: ReturnType<typeof runTurningJob>): TurningArtifact => {
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}

describe("turning job in the kernel (spec 69 I1)", () => {
  for (const dialect of ["fanuc", "siemens"] as const) {
    test(`${dialect}: a turned shaft is a verified program with every claim passed and the analytic volume removed`, () => {
      const a = ok(runTurningJob(req({ dialect })))
      expect(a.claims.map((c) => [c.id, c.status])).toEqual([
        ["operations-complete", "passed"], ["nc-replay", "passed"], ["no-gouge", "passed"], ["no-rapid-in-stock", "passed"], ["material-removed", "passed"]
      ])
      expect(a.release).toBe("verified-program")
      expect(Math.abs(a.verification.partVolume - revolvedVolume(a.plan.contour))).toBeLessThanOrEqual(a.verification.volumeBound)
      expect(a.identity.nc).toHaveLength(64)
    })
  }
  test("Fanuc writes the canned cycles and Siemens explicit moves", () => {
    expect(ok(runTurningJob(req({ dialect: "fanuc" }))).cycles.length).toBeGreaterThan(0)
    expect(ok(runTurningJob(req({ dialect: "siemens" }))).cycles).toEqual([])
  })
  test("the same request gives the same NC and identity", () => {
    const a = ok(runTurningJob(req()))
    const b = ok(runTurningJob(req()))
    expect(b.nc).toBe(a.nc)
    expect(b.identity).toEqual(a.identity)
  })
  test("a profile above the bar fails with the reason and no program", () => {
    const bad: LatheJob = { ...shaft, contour: [{ diameter: 40, z: 0 }, { diameter: 40, z: -20 }], operations: [{ kind: "rough", tool: "T1" }] }
    const r = runTurningJob(req({}, bad))
    expect(r.status).toBe("failed")
    if (r.status === "failed") expect(r.issues.map((i) => i.message).join(" ")).toContain("larger than the Ø30 bar")
  })
  test("an operation naming a tool the job does not have is refused", () => {
    const bad: LatheJob = { ...shaft, operations: [{ kind: "rough", tool: "T9" }] }
    const r = runTurningJob(req({}, bad))
    expect(r.status).toBe("failed")
    if (r.status === "failed") expect(r.issues.map((i) => i.message).join(" ")).toContain("T9")
  })
})
