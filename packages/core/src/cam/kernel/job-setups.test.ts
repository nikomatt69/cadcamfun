/** Spec 69 C1: `ManufacturingJob.setups[]`; a v1 job loads as one setup and its NC does not change by a byte. */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import type { ManufacturingJob } from "./contracts.ts"
import { runJob } from "./execute.ts"
import { findMachine } from "./machines.ts"
import { JobSetupSchema } from "./schema.ts"
import { jobOfSnapshot } from "./snapshot.ts"
import { carryLimitsOf, expandSetupPatterns, runSetups, setupsOf } from "./setups.ts"

setDefaultTimeout(100_000)

const plate = { id: "plate", type: "cube", x: 0, y: 0, z: 0, width: 40, height: 30, depth: 8 }
const v1: ManufacturingJob = {
  schemaVersion: 1, id: "v1-plate", name: "Plate", material: "6061", part: { kind: "elements", elements: [plate] },
  machine: findMachine("vmc-standard")!, quality: { resolution: 0.4 }
}

describe("a v1 job is one setup", () => {
  test("setupsOf synthesises one setup from the job's own fields", () => {
    const withFields: ManufacturingJob = { ...v1, setupOrientation: "-Z", workOffset: "G56", origin: "stock-corner" }
    const { setups, synthesised } = setupsOf(withFields)
    expect(synthesised).toBe(true)
    expect(setups).toHaveLength(1)
    expect(setups[0]).toMatchObject({ orientation: "-Z", workOffset: "G56", origin: "stock-corner" })
  })

  test("runSetups on a v1 job gives the NC, the identity and the claims of runJob, byte for byte", () => {
    const direct = runJob(v1)
    const viaSetups = runSetups(v1)
    if (direct.status !== "ok" || viaSetups.status !== "ok") throw new Error("both must run")
    const one = viaSetups.value.setups[0]!.artifact
    expect(viaSetups.value.setups).toHaveLength(1)
    expect(one.nc).toBe(direct.value.nc)
    expect(one.identity).toEqual(direct.value.identity)
    expect(one.claims).toEqual(direct.value.claims)
    expect(one.release).toBe(direct.value.release)
  })

  test("a v1 job that names its datum keeps it", () => {
    const named: ManufacturingJob = { ...v1, workOffset: "G57" }
    const direct = runJob(named), via = runSetups(named)
    if (direct.status !== "ok" || via.status !== "ok") throw new Error("both must run")
    expect(via.value.setups[0]!.workOffset).toBe("G57")
    expect(via.value.setups[0]!.artifact.nc).toBe(direct.value.nc)
  })

  test("the job-level setup fields survive the snapshot", () => {
    const j = jobOfSnapshot({ schemaVersion: 1, id: "s", name: "S", material: "6061", elements: [plate], setups: [{ id: "a" }, { id: "b", orientation: "-Z" }] })
    if (j.status !== "ok") throw new Error("snapshot must load")
    expect(j.value.setups?.map((s) => s.id)).toEqual(["a", "b"])
  })
})

describe("a job that lists setups", () => {
  const listed: ManufacturingJob = { ...v1, id: "two", setups: [{ id: "top" }, { id: "back", orientation: "-Z" }] }

  test("runJob refuses it with the reason (one NC cannot hold two fixings)", () => {
    const r = runJob(listed)
    expect(r.status).toBe("failed")
    if (r.status === "failed") expect(r.issues[0]!.message).toMatch(/runSetups/)
  })

  test("runSetups gives each setup its own offset and program", () => {
    const r = runSetups(listed)
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    expect(r.value.setups.map((s) => s.workOffset)).toEqual(["G54", "G55"])
    expect(r.value.setups[0]!.artifact.nc).not.toBe(r.value.setups[1]!.artifact.nc)
    expect(r.value.setups[1]!.artifact.setupOrientation).toBe("-Z")
  })

  test("the schema takes a setup record and refuses a bad one", () => {
    const ok = Schema.decodeUnknownSync(JobSetupSchema)({ id: "a", orientation: "+X", workOffset: "G55", fixtures: [{ id: "f", min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }] })
    expect(ok.orientation).toBe("+X")
    expect(() => Schema.decodeUnknownSync(JobSetupSchema)({ id: "a", orientation: "diagonal" })).toThrow()
  })
})

describe("N identical parts as a pattern of one setup", () => {
  const op = (id: string, x: number) => ({ id, strategy: "drill", tool: "drill-5", points: [{ x, y: 12 }], top: 8, bottom: 0 }) as never

  test("a pattern expands to numbered copies moved by the step, each on the next free register; the original keeps its own", () => {
    const r = expandSetupPatterns([{ id: "p", workOffset: "G55", operations: [op("pk", 10)], pattern: { count: 3, dx: 60, dy: 0 } }])
    if (r.status !== "ok") throw new Error("must expand")
    expect(r.value.map((s) => s.id)).toEqual(["p", "p.1", "p.2"])
    expect(r.value[0]!.workOffset).toBe("G55")
    expect(r.value[1]!.workOffset).toBeUndefined()
    expect(JSON.stringify(r.value[2]!.operations)).toContain("\"x\":130")
    expect("pattern" in r.value[0]!).toBe(false)
  })

  test("more than six copies, or none, is refused: the control has six registers", () => {
    expect(expandSetupPatterns([{ id: "p", pattern: { count: 7, dx: 1, dy: 0 } }]).status).toBe("failed")
    expect(expandSetupPatterns([{ id: "p", pattern: { count: 0, dx: 1, dy: 0 } }]).status).toBe("failed")
  })

  test("a setup without a pattern is left as it is", () => {
    const r = expandSetupPatterns([{ id: "a" }, { id: "b", orientation: "-Z" }])
    expect(r).toEqual({ status: "ok", value: [{ id: "a" }, { id: "b", orientation: "-Z" }] })
  })

  test("the three copies run as three programs on G54, G55, G56, and the job carries the stock when asked", () => {
    const part = [0, 1, 2].map((n) => ({ ...plate, id: `plate-${n}`, x: 60 * n }))
    const snap = jobOfSnapshot({
      schemaVersion: 1, id: "vise", name: "Vise", material: "6061", elements: part, machine: "vmc-standard", resolution: 0.5, carryStock: true,
      setups: (() => { const e = expandSetupPatterns([{ id: "p", pattern: { count: 3, dx: 60, dy: 0 } }]); if (e.status !== "ok") throw new Error("expand"); return e.value })()
    })
    if (snap.status !== "ok") throw new Error("snapshot")
    expect(snap.value.carryStock).toBe(true)
    const ran = runSetups(snap.value)
    if (ran.status !== "ok") throw new Error(ran.issues.map((i) => i.message).join("; "))
    expect(ran.value.setups.map((r) => r.workOffset)).toEqual(["G54", "G55", "G56"])
    expect(ran.value.stockCarried).toBe(true)
  })

  test("a carried stock is flagged after a setup that cuts under an overhang, and only then", () => {
    expect(carryLimitsOf([{ id: "top", kinds: ["flat", "ball"] }, { id: "back", kinds: ["flat"] }])).toEqual([])
    const limits = carryLimitsOf([{ id: "side", kinds: ["flat", "tslot", "tslot"] }, { id: "back", kinds: ["flat"] }])
    expect(limits).toHaveLength(1)
    expect(limits[0]).toMatch(/setup side cuts under overhangs \(tslot\).*back and the setups after it/)
    // The last setup hands nothing on, so an undercut there is not a carry problem.
    expect(carryLimitsOf([{ id: "top", kinds: ["flat"] }, { id: "last", kinds: ["dovetail"] }])).toEqual([])
  })
})
