import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, makeBox, makeCylinder, tessellateBrep, transformBrep, translation, type Brep } from "../../cad/brep/index.ts"
import { DEFAULT_PROBE_SETTINGS, deviceOfSettings, type KernelProbing, type ProbeDevice } from "../probing/device.ts"
import type { ProbeAction, ProbeCycle } from "../probing/types.ts"
import { findMachine } from "./machines.ts"
import { prepareJob, runJob, type CamArtifact, type KernelMachine, type ManufacturingJob, type OperationSpec } from "./index.ts"
import { simulateProbing } from "./probing.ts"
import { workplaneFrame } from "./workplane.ts"

setDefaultTimeout(100_000)

// A plate 100 x 60 x 20 with its top at z = 0 and a 20 mm bore at (30, 30), as the blank arrives: bored, bigger than the part by the margin.
const at = (x: number, y: number, z: number) => translation({ x, y, z })
const part = (): Brep => booleanBrep(transformBrep(makeBox(100, 60, 20), at(0, 0, -20)), transformBrep(makeCylinder(10, 40), at(30, 30, -30)), "subtract").brep
const G54 = { kind: "g5x" as const, code: "G54" as const }
const device: ProbeDevice = deviceOfSettings({ ...DEFAULT_PROBE_SETTINGS, stylusDiameter: 4 })
const probing = (extra: Partial<KernelProbing> = {}): KernelProbing => ({ probes: [device], macroStyle: "inline", skipFrame: "program", tiltedPlane: false, offsets: {}, calibrationSource: "baked", ...extra })
const machineOf = (id: string, post?: KernelMachine["post"], extra: Partial<KernelProbing> = {}): KernelMachine => ({ ...findMachine(id)!, ...(post !== undefined ? { post } : {}), probing: probing(extra) })

const blank = (body: Brep) => ({ stock: { min: { x: -2, y: -2, z: -20 }, max: { x: 102, y: 62, z: 0 } }, stockModel: { kind: "mesh" as const, mesh: tessellateBrep(body) } })
const jobOf = (machine: KernelMachine, operations: ReadonlyArray<OperationSpec>, over: Partial<ManufacturingJob> = {}): ManufacturingJob => {
  const body = part()
  return { schemaVersion: 1, id: "probe-job", name: "Probe", material: "6061", machine, origin: "stock-corner", part: { kind: "elements", elements: [{ id: "p", type: "brep", brep: body, x: 0, y: 0, z: 0 }] }, ...blank(body), operations, ...over }
}
const probeOp = (id: string, cycle: ProbeCycle, actions: ReadonlyArray<ProbeAction> = []): OperationSpec => ({ id, strategy: "probe", tool: device.id, cycle, actions })
const setOffset = (axes: Record<string, string>): ProbeAction => ({ kind: "set-offset", ref: G54, axes: axes as never, policy: { mode: "set" } })
const ok = (r: ReturnType<typeof runJob>): CamArtifact => { if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; ")); return r.value }

const PROBES: ReadonlyArray<OperationSpec> = [
  probeOp("bore", { kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5, top: 0 }, [setOffset({ X: "x", Y: "y" })]),
  probeOp("top", { kind: "z-surface", at: { x: 10, y: 10 }, expectedZ: 0 }, [setOffset({ Z: "z" })]),
  probeOp("west", { kind: "edge", at: { x: 0, y: 20, z: -5 }, normal: { x: -1, y: 0 } })
]

describe("probe operations in a job", () => {
  for (const [label, machine] of [
    ["fanuc", machineOf("vmc-standard")],
    ["haas", machineOf("haas-vf2")],
    ["siemens", machineOf("siemens-840d-vmc")],
    ["generic", machineOf("hsc-mill")],
    ["linuxcnc", machineOf("vmc-standard", "linuxcnc")]
  ] as const) {
    test(`${label}: a bore, the top face and a side face are probed and the program is released`, () => {
      const art = ok(runJob(jobOf(machine, PROBES)))
      expect(art.release).toBe("verified-program")
      const claim = art.claims.find((c) => c.id === "probing")!
      expect(claim.status, claim.detail).toBe("passed")
      expect(art.probing).toEqual({ operations: ["bore", "top", "west"], textReplay: "agrees" })
      expect(art.operations.map((o) => o.cut)).toEqual(["probe", "probe", "probe"])
      expect(art.operations[0]!.probe).toMatchObject({ cycle: "bore", device: "probe" })
      expect(art.operations[0]!.probe!.touches).toBeGreaterThanOrEqual(6)
      expect(art.operations[0]!.probe!.offsetTargets).toEqual(["G54:XY"])
      // A sensor, not a cutter: the spindle never starts, nothing is cut, the probe has its tool number.
      expect(art.nc).not.toMatch(/\bM0?[34]\b/)
      expect(art.nc).toMatch(/T99|T=99|TOOL CALL 99/)
      expect(art.operations.every((o) => o.removedVolume === 0)).toBe(true)
    })
  }

  test("the cycle is in the setup's coordinates: the work zero moves it", () => {
    const art = ok(runJob(jobOf(machineOf("vmc-standard"), [PROBES[0]!], { origin: "stock-center" })))
    // The stock's centre (50, 30) is the zero: the bore at setup (30, 30) is at work (-20, 0).
    expect(art.nc).toMatch(/G0 X-20\.000 Y0\.000/)
    expect(art.claims.find((c) => c.id === "probing")!.status).toBe("passed")
  })

  test("a probe the machine does not have, a post without probing words, a machine without a probe, a probe with its own words", () => {
    const refusal = (job: ManufacturingJob): string => { const r = prepareJob(job); if (r.status === "ok") throw new Error("prepared"); return r.issues.map((i) => i.message).join("; ") }
    expect(refusal(jobOf(machineOf("vmc-standard"), [{ ...PROBES[0]!, tool: "no-such-probe" } as OperationSpec]))).toMatch(/no probe 'no-such-probe'/)
    expect(refusal(jobOf(machineOf("vmc-standard", "okuma"), [PROBES[0]!]))).toMatch(/writes no probing words/)
    expect(refusal(jobOf({ ...findMachine("vmc-standard")! }, [PROBES[0]!]))).toMatch(/has no probe/)
    expect(refusal(jobOf({ ...findMachine("vmc-standard")!, probing: probing({ probes: [{ ...device, on: ["M69"] }] }) }, [PROBES[0]!]))).toMatch(/on \/ off words/)
    expect(refusal(jobOf(machineOf("vmc-standard"), [probeOp("cal", { kind: "stylus-calibrate", artefact: { kind: "height", at: { x: 0, y: 0 }, z: 0 } })]))).toMatch(/cam\.probing/)
  })

  test("a probe that cannot find its feature on the part as drawn fails the claim and blocks the release", () => {
    // The bore is declared 30 mm wide: the probe touches nothing where it expects the wall.
    const art = ok(runJob(jobOf(machineOf("vmc-standard"), [probeOp("wide", { kind: "bore", centre: { x: 30, y: 30 }, diameter: 30, depth: 5, top: 0 })])))
    const claim = art.claims.find((c) => c.id === "probing")!
    expect(claim.status).toBe("failed")
    expect(art.release).not.toBe("verified-program")
  })
})

describe("the closed loop: a stock clamped away from where the program believes it is", () => {
  const machine = machineOf("vmc-standard")
  const misplaced = { x: 0.7, y: -0.4, z: 0.15 }

  test("the probe's offset change recovers the misplacement", () => {
    const prepared = prepareJob(jobOf(machine, PROBES))
    if (prepared.status !== "ok") throw new Error(prepared.issues.map((i) => i.message).join("; "))
    const runs = simulateProbing(prepared.value, { placement: { translate: misplaced } })
    if ("refused" in runs) throw new Error(runs.refused)
    expect(runs.every((r) => r.outcome.stopped === undefined)).toBe(true)
    const g54 = runs[runs.length - 1]!.outcome.offsets["G54"]!
    // The bore is a faceted mesh in this world: its centre is exact to the facets, the plane exactly.
    expect(Math.abs(g54.x - misplaced.x)).toBeLessThan(6e-3)
    expect(Math.abs(g54.y - misplaced.y)).toBeLessThan(6e-3)
    expect(g54.z).toBeCloseTo(misplaced.z, 9)
    expect(runs[0]!.outcome.contacts.length).toBeGreaterThanOrEqual(6)
  })

  // The cut that follows runs at the zero the control holds: zero too far by `d` puts the path `d` off the part; the probe moves the zero by
  // what it measured, so the path lands on the part.
  const ring = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }]
  const cutJob = (dx: number, dy: number): ManufacturingJob => {
    const body = part()
    return {
      schemaVersion: 1, id: "cut", name: "Cut", material: "6061", machine, origin: "stock-corner", part: { kind: "elements", elements: [{ id: "p", type: "brep", brep: body, x: 0, y: 0, z: 0 }] },
      stock: { min: { x: -4, y: -4, z: -20 }, max: { x: 104, y: 64, z: 0 } },
      operations: [{ id: "outline", strategy: "profile", tool: "flat-6", loop: ring.map((p) => ({ x: p.x + dx, y: p.y + dy })), side: "outside", top: 0, bottom: -10, allowance: 0, finish: true, leadIn: "direct" }]
    }
  }
  const gouge = (a: CamArtifact) => a.claims.find((c) => c.id === "no-gouge")!

  test("without the probe the cut gouges the part, with the recovered offset it does not", () => {
    const prepared = prepareJob(jobOf(machine, PROBES))
    if (prepared.status !== "ok") throw new Error("not prepared")
    const runs = simulateProbing(prepared.value, { placement: { translate: misplaced } })
    if ("refused" in runs) throw new Error(runs.refused)
    const g54 = runs[runs.length - 1]!.outcome.offsets["G54"]!
    // The part sits at `misplaced`; the program, zeroed on the nominal place, cuts `misplaced` away from the part's wall.
    const wrong = ok(runJob(cutJob(-misplaced.x, -misplaced.y)))
    expect(gouge(wrong).status).toBe("failed")
    // The corrected zero is the measured one: the same program shifted by what the probe measured lands on the wall.
    const right = ok(runJob(cutJob(-misplaced.x + g54.x, -misplaced.y + g54.y)))
    expect(gouge(right).status, gouge(right).detail).toBe("passed")
  })
})

describe("probing inside a tilted plane (5-axis: the plane the control swivels to)", () => {
  // A plate with a bore whose axis is the work plane's normal (0, -1, 1) / sqrt 2: the part is built in the plane and turned out into the CAD world.
  const normal = { x: 0, y: -1, z: 1 }
  const plane = workplaneFrame({ normal })
  if (!("frame" in plane)) throw new Error("no plane")
  const f = plane.frame
  const toWorld = { m: [f.xAxis.x, f.yAxis.x, f.zAxis.x, f.xAxis.y, f.yAxis.y, f.zAxis.y, f.xAxis.z, f.yAxis.z, f.zAxis.z] as never, t: { x: 0, y: 0, z: 0 } }
  const tilted = (): Brep => transformBrep(booleanBrep(transformBrep(makeBox(60, 40, 20), at(0, 0, -20)), transformBrep(makeCylinder(8, 40), at(30, 20, -30)), "subtract").brep, toWorld)
  const body = tilted()
  const base = findMachine("trunnion-5ax")!
  const machineAt = (post: KernelMachine["post"], base2: KernelMachine = base): KernelMachine => ({ ...base2, post, probing: probing({ tiltedPlane: true }) })
  const bore = probeOp("tilted-bore", { kind: "bore", centre: { x: 30, y: 20 }, diameter: 16, depth: 5, top: 0 }, [setOffset({ X: "x", Y: "y" })])
  const job = (machine: KernelMachine, over: Partial<ManufacturingJob> = {}): ManufacturingJob => ({
    schemaVersion: 1, id: "tilt", name: "Tilted bore", material: "6061", machine, workplane: { normal }, part: { kind: "elements", elements: [{ id: "p", type: "brep", brep: body, x: 0, y: 0, z: 0 }] },
    operations: [bore], ...over
  })
  const kern = findMachine("kern-micro-hd-hsk40")!

  for (const [label, machine, word, over] of [
    ["fanuc G68.2", machineAt("fanuc"), /G68\.2/, {}],
    ["siemens CYCLE800", machineAt("siemens"), /CYCLE800\(/, { post: { options: { swivel: { dataRecord: "TC1" } } } }],
    ["heidenhain PLANE SPATIAL", machineAt("heidenhain", kern), /PLANE SPATIAL/, {}]
  ] as const) {
    test(`${label}: the plane is set before the touches and the bore is found in it`, () => {
      // The Klartext post cannot write a step-level preset update: that control measures and reports (its own cycles set the preset).
      const probeOnly = label.startsWith("heidenhain") ? probeOp("tilted-bore", bore.strategy === "probe" ? bore.cycle : (undefined as never)) : bore
      const art = ok(runJob(job(machine, { ...over, operations: [probeOnly] })))
      const claim = art.claims.find((c) => c.id === "probing")!
      expect(claim.status, claim.detail).toBe("passed")
      expect(art.probing!.textReplay).toBe("agrees")
      const plane = art.nc.search(word)
      const touch = art.nc.search(/G31|G38\.[23]|MEAS=1|TCH PROBE 0\.0/)
      expect(plane).toBeGreaterThan(-1)
      expect(touch).toBeGreaterThan(plane)
      expect(art.nc).not.toMatch(/\bM0?[34]\b/)
    })
  }

  test("a machine whose probing does not say it probes inside a tilted plane is refused", () => {
    const r = prepareJob(job({ ...base, probing: probing({ tiltedPlane: false }) }))
    expect(r.status).toBe("failed")
    expect(r.status === "failed" && r.issues.map((i) => i.message).join(" ")).toMatch(/tilted plane/)
  })

  test("a part shifted in the plane is recovered in the machine's axes (the offset takes the shift along the plane's axes)", () => {
    const prepared = prepareJob(job(machineAt("fanuc")))
    if (prepared.status !== "ok") throw new Error(prepared.issues.map((i) => i.message).join("; "))
    // A shift of 0.4 along the plane's x and -0.3 along its y, in the machine's axes.
    const d = { x: 0.4 * f.xAxis.x - 0.3 * f.yAxis.x, y: 0.4 * f.xAxis.y - 0.3 * f.yAxis.y, z: 0.4 * f.xAxis.z - 0.3 * f.yAxis.z }
    const runs = simulateProbing(prepared.value, { placement: { translate: d } })
    if ("refused" in runs) throw new Error(runs.refused)
    expect(runs[0]!.outcome.stopped).toBeUndefined()
    const g54 = runs[0]!.outcome.offsets["G54"]!
    // The bore is a faceted mesh: its centre is exact to the facets.
    expect(Math.abs(g54.x - d.x)).toBeLessThan(6e-3)
    expect(Math.abs(g54.y - d.y)).toBeLessThan(6e-3)
    expect(Math.abs(g54.z - d.z)).toBeLessThan(6e-3)
  })
})
