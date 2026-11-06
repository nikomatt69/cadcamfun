/** Spec 69 C1: `ManufacturingJob.setups[]`; a v1 job loads as one setup and its NC does not change by a byte. */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import type { ManufacturingJob } from "./contracts.ts"
import { runJob, solidOf } from "./execute.ts"
import type { Feature } from "../../cad/history.ts"
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

describe("a carried stock keeps the void of an undercut (tri-dexel hand-over)", () => {
  // A 30 mm plate with a Ø12 pilot and a Ø16 x 12 mm counterbore bored up from the underside by a back-boring bar: under the plate
  // the counterbore is a void below material, which a height field (one solid run per column) cannot hold.
  const rect = (id: string, x: number, y: number, width: number, height: number): Feature =>
    ({ id, type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: `${id}r`, kind: "rectangle", at: [x, y], width, height }] } }) as Feature
  const under = { id: "under", type: "plane", from: { kind: "points", points: [[0, 0, 0], [1, 0, 0], [0, -1, 0]] } } as Feature
  const bb = { id: "bb", type: "hole", plane: "under", at: [40, -25], diameter: 12, depth: 30, kind: "counterbore", headDiameter: 16, headDepth: 12 } as Feature
  const part = { id: "p", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, history: { parameters: {}, features: [rect("base", 0, 0, 80, 50), { id: "plate", type: "extrude", sketch: "base", depth: 30, operation: "new" } as Feature, under, bb] } }
  const carriedJob = (): ManufacturingJob => ({
    schemaVersion: 1, id: "undercut", name: "Undercut plate", material: "6061", part: { kind: "elements", elements: [part] },
    stock: { min: { x: -2, y: -2, z: 0 }, max: { x: 82, y: 52, z: 31 } }, machine: findMachine("vmc-standard")!, quality: { resolution: 0.5 },
    breadth: { holeCycles: true }, carryStock: true, setups: [{ id: "top" }, { id: "back", orientation: "-Z" }]
  })

  test("the setup that bores under the plate keeps the counterbore as a void on its tri-dexel, and the flip starts from it", () => {
    const ran = runSetups(carriedJob())
    if (ran.status !== "ok") throw new Error(ran.issues.map((i) => i.message).join("; "))
    const [top, back] = ran.value.setups
    expect(top!.artifact.tools.some((t) => t.kind === "boringbar")).toBe(true)
    const held = solidOf(top!.artifact)
    expect(held?.carry.complete).toBe(true)
    // In the top setup's frame the stock stands from z 0 to 31 over the stock box; the counterbore (Ø16, 12 mm up from the underside)
    // is air under solid plate: a ray through it holds two runs (the stock above the ceiling, none below).
    const at = (x: number, z: number) => held!.carry.stock.solidAt({ x: x - held!.carry.origin.x, y: 25 - held!.carry.origin.y, z: z - held!.carry.origin.z })
    const probe = (x: number, z: number): boolean => at(x, z)
    // r = 7 from the bore axis (between the pilot and the counterbore wall): void below the ceiling at z = 12, plate above it.
    const x = 40 + 7
    expect(probe(x, 5)).toBe(false)
    expect(probe(x, 20)).toBe(true)
    // Far from the bore the plate stands the whole way up.
    expect(probe(10, 5)).toBe(true)
    // The next setup's carried stock is read from that solid: its artifact says the stock was carried and the limit is lifted.
    expect(back!.artifact.stock.initialVolume).toBeLessThan(top!.artifact.stock.initialVolume)
    const coverage = ran.value.claims.find((c) => c.id === "part-coverage")!
    expect(coverage.detail).toMatch(/tri-dexel that keeps the void/)
    expect(coverage.detail).not.toMatch(/height field, which cannot hold that void/)
  })

  test("when the tri-dexel replay cannot see every move the limit stays, named, and the claim is unresolved", () => {
    const ran = runSetups(carriedJob(), { replayWorkLimit: 2e5 })
    if (ran.status !== "ok") throw new Error(ran.issues.map((i) => i.message).join("; "))
    const coverage = ran.value.claims.find((c) => c.id === "part-coverage")!
    expect(coverage.status).toBe("unresolved")
    expect(coverage.detail).toMatch(/height field, which cannot hold that void/)
    expect(ran.value.release).not.toBe("verified-program")
  })

  const jaws = [
    { id: "jaw-l", role: "jaw" as const, min: { x: -22, y: -10, z: 6 }, max: { x: -2, y: 62, z: 31 } },
    { id: "jaw-r", role: "jaw" as const, min: { x: 82, y: -10, z: 6 }, max: { x: 102, y: 62, z: 31 } }
  ]
  const held = (): ManufacturingJob => { const j = carriedJob(); return { ...j, setups: [{ id: "top" }, { id: "back", orientation: "-Z", fixtures: jaws }] } }
  const claimOf = (r: { artifact: { claims: ReadonlyArray<{ id: string; status: string; detail: string }> } }, id: string) => r.artifact.claims.find((c) => c.id === id)!

  test("the setup that bores under the plate has its own claims judged on the tri-dexel, the bar's shifted pass through the pilot included", () => {
    const ran = runSetups(carriedJob())
    if (ran.status !== "ok") throw new Error(ran.issues.map((i) => i.message).join("; "))
    const top = ran.value.setups[0]!
    for (const id of ["no-rapid-in-stock", "holder-clearance", "no-gouge", "material-removed"]) {
      expect(claimOf(top, id).status, id).toBe("passed")
      expect(claimOf(top, id).detail, id).toMatch(/tri-dexel/)
    }
    // The declared removal (drill cycles) is named, not hidden: the pass is "no cut below the part beyond the error", whatever is declared.
    expect(claimOf(top, "no-gouge").detail).toMatch(/declares removal the part mesh does not carry/)
    expect(top.artifact.issues.filter((i) => i.severity === "error")).toEqual([])
    // Without a fixing for the flipped setup the job is not released: its workholding is still unresolved, and says so.
    expect(ran.value.release).toBe("preview")
    expect(ran.value.claims.find((c) => c.id === "setup-workholding")?.status).toBe("unresolved")
  })

  test("with the flipped setup held by jaws the whole job reaches verified-program", () => {
    const ran = runSetups(held())
    if (ran.status !== "ok") throw new Error(ran.issues.map((i) => i.message).join("; "))
    expect(ran.value.claims.filter((c) => c.status !== "passed" && !(c.status === "unsupported" && c.id === "machine-travel")).map((c) => `${c.id}: ${c.detail}`)).toEqual([])
    expect(ran.value.release).toBe("verified-program")
  })

  test("a replay that stopped at its budget leaves the undercut setup's claims unresolved and the job unreleased", () => {
    const ran = runSetups(held(), { replayWorkLimit: 2e5 })
    if (ran.status !== "ok") throw new Error(ran.issues.map((i) => i.message).join("; "))
    const top = ran.value.setups[0]!
    for (const id of ["no-gouge", "material-removed"]) expect(claimOf(top, id).status, id).toBe("unresolved")
    expect(ran.value.release).not.toBe("verified-program")
  })

  test("the volume one setup hands on and the next one starts from differ by less than the declared error times the stock's surface", () => {
    const ran = runSetups(carriedJob())
    if (ran.status !== "ok") throw new Error(ran.issues.map((i) => i.message).join("; "))
    const [top, back] = ran.value.setups
    const solid = solidOf(top!.artifact)!
    const gap = Math.abs(back!.artifact.stock.initialVolume - top!.artifact.stock.finalVolume)
    // The stock box is 84 x 54 x 31 mm; the bore and the pilot add less than 3000 mm² of wall.
    const surface = 2 * (84 * 54 + 84 * 31 + 54 * 31) + 3000
    const bound = solid.verdict().errorBound * 2
    expect(gap).toBeGreaterThan(0)
    expect(gap).toBeLessThanOrEqual(bound * surface)
    // And it is a lattice effect, not a lost feature: under 2 % of the stock.
    expect(gap / top!.artifact.stock.finalVolume).toBeLessThan(0.02)
  })

  test("a carried job without an undercut is not run twice and keeps no tri-dexel", () => {
    const plain: ManufacturingJob = { ...v1, id: "plain", carryStock: true, setups: [{ id: "top" }, { id: "back", orientation: "-Z" }] }
    const ran = runSetups(plain)
    if (ran.status !== "ok") throw new Error(ran.issues.map((i) => i.message).join("; "))
    expect(ran.value.setups.every((r) => solidOf(r.artifact) === undefined)).toBe(true)
  })
})
