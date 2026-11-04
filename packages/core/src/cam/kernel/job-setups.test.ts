/** Spec 69 C1: `ManufacturingJob.setups[]`; a v1 job loads as one setup and its NC does not change by a byte. */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import type { ManufacturingJob } from "./contracts.ts"
import { runJob } from "./execute.ts"
import { findMachine } from "./machines.ts"
import { JobSetupSchema } from "./schema.ts"
import { jobOfSnapshot } from "./snapshot.ts"
import { runSetups, setupsOf } from "./setups.ts"

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
