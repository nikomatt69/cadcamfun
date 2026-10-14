import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "../../cad/recipes.ts"
import type { History } from "../../cad/history.ts"
import { interpretGcode } from "../testing/gcode-interpreter.ts"
import { DEFAULT_MACHINE } from "./machines.ts"
import {
  DEFAULT_CUTTERS,
  MATERIALS,
  baseChipLoad,
  canonicalJson,
  chipThinning,
  cuttingData,
  deflection,
  effectiveDiameter,
  findCutter,
  findMaterial,
  planOnly,
  recommendForSettings,
  requireMaterial,
  runJob,
  sha256,
  type CamArtifact,
  type Cutter,
  type ManufacturingJob,
  type MachineLimits
} from "./index.ts"
import { DEFAULT_SETTINGS } from "../generator/schema.ts"

setDefaultTimeout(100_000)

const VMC: MachineLimits = { maxRpm: 12000, maxFeed: 12000, powerKw: 11, torqueNm: 70, rigidity: "standard" }
const tool = (id: string): Cutter => findCutter(DEFAULT_CUTTERS, id)!

const plateRecipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, history: plateRecipe.history }
const plateStock = { min: { x: -3, y: -3, z: 0 }, max: { x: 123, y: 83, z: 13 } }
const job = (material: string, over: Partial<ManufacturingJob> = {}): ManufacturingJob => ({
  schemaVersion: 1, id: "plate-job", name: "Plate", material, part: { kind: "elements", elements: [plate] }, stock: plateStock, ...over
})
const ok = (r: ReturnType<typeof runJob>): CamArtifact => {
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}
const claim = (a: CamArtifact, id: string) => a.claims.find((c) => c.id === id)!.status

// ---------------------------------------------------------------- materials and identity

describe("materials", () => {
  test("grades are found by id, EN / AISI number, trade name and legacy family", () => {
    expect(findMaterial("6061")!.id).toBe("al-6061-t6")
    expect(findMaterial("EN AW-7075")!.id).toBe("al-7075-t6")
    expect(findMaterial("1.4301")!.id).toBe("stainless-304")
    expect(findMaterial("Delrin")!.id).toBe("pom-c")
    expect(findMaterial("steel")!.id).toBe("steel-c45")
    expect(findMaterial("aluminum")!.id).toBe("al-6061-t6")
    expect(findMaterial("unobtainium")).toBeUndefined()
    expect(() => requireMaterial("unobtainium")).toThrow(/Unknown material/)
  })

  test("every grade is physically coherent", () => {
    const ids = new Set<string>()
    for (const m of MATERIALS) {
      expect(ids.has(m.id)).toBe(false)
      ids.add(m.id)
      expect(m.kc11).toBeGreaterThan(0)
      expect(m.mc).toBeGreaterThan(0)
      expect(m.mc).toBeLessThan(0.5)
      expect(m.vcCarbide.finish).toBeGreaterThanOrEqual(m.vcCarbide.rough)
      if (m.vcHss !== undefined) expect(m.vcHss.rough).toBeLessThan(m.vcCarbide.rough)
      expect(m.fz10).toBeGreaterThan(0)
      expect(m.adaptiveAe).toBeLessThanOrEqual(m.sideAe)
    }
    // Harder groups cut slower and with higher specific force.
    const al = requireMaterial("6061"), c45 = requireMaterial("C45"), ss = requireMaterial("304"), ti = requireMaterial("Ti6Al4V"), inco = requireMaterial("718")
    expect(al.vcCarbide.rough).toBeGreaterThan(c45.vcCarbide.rough)
    expect(c45.vcCarbide.rough).toBeGreaterThan(ss.vcCarbide.rough)
    expect(ss.vcCarbide.rough).toBeGreaterThan(ti.vcCarbide.rough)
    expect(ti.vcCarbide.rough).toBeGreaterThan(inco.vcCarbide.rough)
    expect(al.kc11).toBeLessThan(c45.kc11)
    expect(c45.kc11).toBeLessThan(ss.kc11)
  })
})

describe("identity", () => {
  test("SHA-256 matches the FIPS 180-4 test vectors", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    expect(sha256("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1")
    expect(sha256("a".repeat(1000))).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3")
  })

  test("canonical JSON sorts keys, drops undefined, normalises -0 and rejects non-finite numbers", () => {
    expect(canonicalJson({ b: 1, a: [-0, undefined, { d: undefined, c: "x" }] })).toBe('{"a":[0,null,{"c":"x"}],"b":1}')
    expect(canonicalJson(Float64Array.of(1, 2))).toBe("[1,2]")
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(/Non-finite/)
  })
})

// ---------------------------------------------------------------- cutting data

describe("cutting data", () => {
  test("n = 1000 Vc / (π D) and vf = n z fz", () => {
    const d = cuttingData({ material: requireMaterial("C45"), cutter: tool("flat-10"), cut: "rough-side", machine: VMC })
    expect(d.rpm).toBeCloseTo((1000 * d.vcRecommended) / (Math.PI * 10), -1)
    expect(d.feed).toBeCloseTo(d.rpm * 3 * d.fz, -1)
    expect(d.vc).toBeCloseTo((Math.PI * 10 * d.rpm) / 1000, 1)
    expect(d.coolant).toBe("flood")
    expect(d.exceeded).toEqual([])
  })

  test("the same cutter runs slower and lighter in harder materials", () => {
    const at = (m: string) => cuttingData({ material: requireMaterial(m), cutter: tool("flat-10"), cut: "rough-side", machine: { ...VMC, maxRpm: 40000, maxFeed: 40000 } })
    const al = at("6061"), steel = at("C45"), ss = at("304"), ti = at("Ti6Al4V")
    expect(al.rpm).toBeGreaterThan(steel.rpm)
    expect(steel.rpm).toBeGreaterThan(ss.rpm)
    expect(ss.rpm).toBeGreaterThan(ti.rpm)
    expect(al.feed).toBeGreaterThan(steel.feed)
    expect(steel.ae).toBeGreaterThan(ti.ae)
    expect(ti.coolant).toBe("flood")
    expect(at("GG25").coolant).toBe("off")
  })

  test("chip thinning raises the programmed feed of a light radial cut", () => {
    expect(chipThinning(5, 10)).toBe(1)
    expect(chipThinning(1, 10)).toBeCloseTo(1 / Math.sin(Math.acos(0.8)), 9)
    const mat = requireMaterial("C45")
    const full = cuttingData({ material: mat, cutter: tool("flat-10"), cut: "rough-side", machine: VMC, ae: 5 })
    const light = cuttingData({ material: mat, cutter: tool("flat-10"), cut: "rough-side", machine: VMC, ae: 1 })
    expect(light.fz).toBeGreaterThan(full.fz * 1.5)
    expect(light.chipThickness).toBeCloseTo(full.chipThickness, 3)
  })

  test("ball and bull nose cutters take their speed from the diameter that cuts", () => {
    expect(effectiveDiameter(tool("ball-10"), 0.5)).toBeCloseTo(2 * Math.sqrt(0.5 * 9.5), 9)
    expect(effectiveDiameter(tool("ball-10"), 6)).toBe(10)
    expect(effectiveDiameter(tool("bull-10-r1"), 0.5)).toBeCloseTo(8 + 2 * Math.sqrt(1 - 0.25), 9)
    const finish = cuttingData({ material: requireMaterial("P20"), cutter: tool("ball-6"), cut: "finish-3d", machine: { ...VMC, maxRpm: 30000 }, scallop: 0.005 })
    expect(finish.effectiveDiameter).toBeLessThan(6)
    expect(finish.rpm).toBeGreaterThan((1000 * finish.vcRecommended) / (Math.PI * 6))
  })

  test("a spindle limit lowers the cutting speed and says so; the chip load is kept", () => {
    const free = cuttingData({ material: requireMaterial("6061"), cutter: tool("flat-3-n"), cut: "rough-side", machine: { ...VMC, maxRpm: 60000, maxFeed: 30000 } })
    const capped = cuttingData({ material: requireMaterial("6061"), cutter: tool("flat-3-n"), cut: "rough-side", machine: { ...VMC, maxRpm: 10000 } })
    expect(capped.rpm).toBe(10000)
    expect(capped.limitedBy).toContain("machine spindle speed")
    expect(capped.fz).toBeCloseTo(free.fz, 3)
    expect(capped.warnings.some((w) => /Spindle limited/.test(w))).toBe(true)
  })

  test("deflection of a long cutter reduces the axial depth until the bend is within the limit", () => {
    const short = tool("flat-6")
    const long: Cutter = { ...short, id: "long-6", stickout: 60, fluteLength: 30 }
    expect(deflection(long, 100)).toBeGreaterThan(deflection(short, 100) * 5)
    const d = cuttingData({ material: requireMaterial("42CrMo4"), cutter: long, cut: "rough-side", machine: VMC })
    expect(d.limitedBy).toContain("tool deflection")
    expect(d.deflectionMm).toBeLessThanOrEqual(0.0501)
    expect(d.ap).toBeLessThan(requireMaterial("42CrMo4").sideAp * 6)
  })

  test("a weak spindle is respected: power limits the cut", () => {
    const d = cuttingData({ material: requireMaterial("C45"), cutter: tool("flat-16"), cut: "slot", machine: { maxRpm: 10000, maxFeed: 3000, powerKw: 0.75, torqueNm: 3 } })
    expect(d.powerKw).toBeLessThanOrEqual(0.75 + 1e-3)
    expect(d.limitedBy.some((l) => l === "spindle power" || l === "spindle torque")).toBe(true)
  })

  test("drilling: feed per revolution, deep stringy holes peck with chip breaking, very deep ones retract fully", () => {
    const shallow = cuttingData({ material: requireMaterial("6061"), cutter: tool("drill-5"), cut: "drill", machine: VMC, depth: 8 })
    expect(shallow.peck).toBeUndefined()
    expect(shallow.feedPerRev).toBeGreaterThan(0.1)
    const ss = cuttingData({ material: requireMaterial("304"), cutter: tool("drill-5"), cut: "drill", machine: VMC, depth: 20 })
    expect(ss.peck).toBeCloseTo(0.75 * 5, 6)
    expect(ss.chipBreak).toBe(true)
    const deep = cuttingData({ material: requireMaterial("304"), cutter: tool("drill-5"), cut: "drill", machine: VMC, depth: 30 })
    expect(deep.chipBreak).toBe(false)
    expect(ss.feedPerRev!).toBeLessThan(shallow.feedPerRev!)
  })

  test("a poor tool / material match is reported", () => {
    const hss: Cutter = { ...tool("flat-10"), material: "hss" }
    expect(cuttingData({ material: requireMaterial("718"), cutter: hss, cut: "rough-side", machine: VMC }).warnings.some((w) => /not suitable|wears/.test(w))).toBe(true)
    expect(cuttingData({ material: requireMaterial("6061"), cutter: tool("flat-10"), cut: "rough-side", machine: VMC }).warnings.some((w) => /built-up edge/.test(w))).toBe(true)
    expect(cuttingData({ material: requireMaterial("6061"), cutter: tool("flat-10-n"), cut: "rough-side", machine: VMC }).warnings.some((w) => /built-up edge/.test(w))).toBe(false)
  })

  test("chip load grows with the diameter", () => {
    const m = requireMaterial("C45")
    expect(baseChipLoad(m, 10)).toBeCloseTo(m.fz10, 12)
    expect(baseChipLoad(m, 3)).toBeLessThan(baseChipLoad(m, 6))
    expect(baseChipLoad(m, 16)).toBeGreaterThan(baseChipLoad(m, 10))
  })

  test("the legacy generator settings get material-correct parameters through the compatibility adapter", () => {
    const al = recommendForSettings({ ...DEFAULT_SETTINGS, material: "aluminum", operationType: "pocket", toolDiameter: 6, flutes: 3 }, { machine: { maxRpm: 24000 } })!
    const ti = recommendForSettings({ ...DEFAULT_SETTINGS, material: "titanium", operationType: "pocket", toolDiameter: 6, flutes: 3 }, { machine: { maxRpm: 24000 } })!
    expect(al.patch.rpm!).toBeGreaterThan(ti.patch.rpm!)
    expect(al.patch.feedrate!).toBeGreaterThan(ti.patch.feedrate!)
    expect(ti.patch.stepover!).toBeLessThan(al.patch.stepover!)
    const graded = recommendForSettings({ ...DEFAULT_SETTINGS, material: "steel", operationType: "pocket" }, { grade: "1.2379" })!
    expect(graded.material.id).toBe("steel-hardened-55hrc")
    expect(recommendForSettings({ ...DEFAULT_SETTINGS, machineType: "lathe" })).toBeUndefined()
  })
})

// ---------------------------------------------------------------- planning from the CAD

describe("planning from the CAD feature history", () => {
  test("the mounting plate becomes face, roughing, counterbores, spot, drill and wall finishing", () => {
    const r = planOnly(job("6061"))
    if (r.status !== "ok") throw new Error("plan failed")
    const ops = r.value.operations
    expect(ops[0]).toMatchObject({ strategy: "face", bottom: 12 })
    expect(ops.filter((o) => o.strategy === "bore").length).toBe(4)
    const drill = ops.find((o) => o.strategy === "drill" && o.cut === "drill")!
    expect(drill.tool).toBe("drill-5.5")
    expect(drill.strategy === "drill" && drill.points.length).toBe(4)
    expect(ops.some((o) => o.strategy === "drill" && o.cut === "spot")).toBe(true)
    expect(ops[ops.length - 1]).toMatchObject({ strategy: "profile", side: "outside" })
    // Aluminium gets the non-ferrous cutters, steel the AlTiN ones.
    expect(ops.find((o) => o.strategy === "profile")!.tool.endsWith("-n")).toBe(true)
    const steel = planOnly(job("C45"))
    if (steel.status !== "ok") throw new Error("plan failed")
    expect(steel.value.operations.find((o) => o.strategy === "profile")!.tool.endsWith("-n")).toBe(false)
    expect(r.value.unmachined).toEqual([])
  })

  test("a thread note on a hole adds thread milling with the matching pitch", () => {
    const history: History = {
      parameters: { ...plateRecipe.history.parameters, tap: 5 },
      features: [...plateRecipe.history.features, { id: "tapped", type: "hole", plane: "XY", offset: "thick", at: ["width / 2", "depth / 2"], diameter: "tap", depth: "thick", thread: { designation: "M6", depth: 10 } }]
    }
    const r = planOnly(job("C45", { part: { kind: "elements", elements: [{ ...plate, history }] } }))
    if (r.status !== "ok") throw new Error("plan failed")
    const thread = r.value.operations.find((o) => o.strategy === "thread")
    expect(thread).toMatchObject({ strategy: "thread", diameter: 6, pitch: 1, internal: true, length: 10, tool: "threadmill-p1" })
    expect(r.value.operations.some((o) => o.strategy === "drill" && o.tool === "drill-5")).toBe(true)
  })
})

// ---------------------------------------------------------------- the whole pipeline

describe("running a job: NC plus evidence about that NC", () => {
  test("the mounting plate in aluminium is a verified program", () => {
    const a = ok(runJob(job("6061")))
    expect(a.release).toBe("verified-program")
    for (const c of a.claims) if (c.id !== "machine-travel") expect(`${c.id}:${c.status}`).toBe(`${c.id}:passed`)
    // The replayed stock is the part: the volume removed is the stock minus the part (within the replay resolution).
    expect(Math.abs(a.stock.finalVolume - a.stock.partVolume) / a.stock.partVolume).toBeLessThan(0.01)
    expect(a.operations.every((o) => o.status === "ok" && o.removedVolume >= 0)).toBe(true)
    expect(a.operations.find((o) => o.id === "face")!.removedVolume).toBeGreaterThan(0.9 * 126 * 86)
    // The NC is real: an independent interpretation finds every tool and reaches the hole bottoms.
    const run = interpretGcode(a.nc)
    expect(run.errors).toEqual([])
    expect(new Set(run.tools).size).toBe(a.tools.length)
    expect(run.minZ).toBeLessThan(-13)
    expect(a.identity.nc).toBe(sha256(a.nc))
  })

  test("the material drives every operation's spindle speed and feed", () => {
    const al = ok(runJob(job("6061")))
    const steel = ok(runJob(job("C45")))
    const face = (a: CamArtifact) => a.operations.find((o) => o.id === "face")!.cutting!
    expect(face(al).rpm).toBeGreaterThan(face(steel).rpm * 2)
    expect(face(al).feed).toBeGreaterThan(face(steel).feed * 2)
    expect(steel.release).toBe("verified-program")
    expect(steel.cycleTimeSeconds).toBeGreaterThan(al.cycleTimeSeconds)
    expect(steel.identity.job).not.toBe(al.identity.job)
  })

  test("the same job gives byte-identical NC and the same evidence", () => {
    const a = ok(runJob(job("304"))), b = ok(runJob(job("304")))
    expect(a.nc).toBe(b.nc)
    expect(a.identity).toEqual(b.identity)
    expect(a.claims).toEqual(b.claims)
  })

  test("explicit operations keep their overrides and the rest comes from the cutting data", () => {
    const cube = { id: "block", type: "cube", x: 20, y: 20, z: 5, width: 40, height: 40, depth: 10 }
    const a = ok(runJob({
      schemaVersion: 1, id: "j", name: "Block", material: "POM", part: { kind: "elements", elements: [cube] },
      stock: { min: { x: -2, y: -2, z: 0 }, max: { x: 42, y: 42, z: 11 } },
      operations: [
        { id: "face", strategy: "face", tool: "flat-16-n", bottom: 10, rpm: 9000 },
        { id: "contour", strategy: "profile", tool: "flat-6-n", loop: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }], side: "outside", top: 10, bottom: 0 }
      ]
    }))
    const face = a.operations.find((o) => o.id === "face")!
    expect(face.parameters["spindleRpm"]).toBe(9000)
    expect(face.overridden).toEqual(["rpm"])
    expect(face.parameters["feed"]).toBe(face.cutting!.feed)
    expect(a.operations.find((o) => o.id === "contour")!.cutting!.coolant).toBe("off")
    expect(claim(a, "no-gouge")).toBe("passed")
  })

  test("an operation that cuts into the part is caught by the replay and blocks the release", () => {
    const cube = { id: "block", type: "cube", x: 20, y: 20, z: 5, width: 40, height: 40, depth: 10 }
    const a = ok(runJob({
      schemaVersion: 1, id: "j", name: "Block", material: "6061", part: { kind: "elements", elements: [cube] },
      stock: { min: { x: -2, y: -2, z: 0 }, max: { x: 42, y: 42, z: 10 } },
      operations: [{ id: "wrong", strategy: "profile", tool: "flat-6-n", loop: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }], side: "inside", top: 10, bottom: 5 }]
    }))
    expect(claim(a, "no-gouge")).toBe("failed")
    expect(a.issues.some((i) => i.tag === "Gouge" && i.operationId === "wrong")).toBe(true)
    expect(a.release).toBe("blocked")
  })

  test("a freeform body is roughed and finished with the 3D strategies", () => {
    const base = { id: "base", type: "cube", x: 0, y: 0, z: 4, width: 40, height: 40, depth: 8 }
    const dome = { id: "dome", type: "sphere", x: 0, y: 0, z: 8, radius: 8 }
    const a = ok(runJob({
      schemaVersion: 1, id: "j", name: "Dome", material: "6061", part: { kind: "elements", elements: [base, dome] },
      stock: { min: { x: -22, y: -22, z: 0 }, max: { x: 22, y: 22, z: 17 } }, quality: { resolution: 0.4, scallop: 0.02 }
    }))
    // Roughing, then one steep-and-shallow finish (waterline on the walls, raster on the dome) with a ball.
    expect(a.operations.map((o) => o.strategy)).toEqual(["face", "surface", "surface"])
    expect(a.operations[1]!.cut).toBe("adaptive")
    expect(a.operations[2]!.toolId.startsWith("ball-")).toBe(true)
    expect(a.operations[2]!.cut).toBe("finish-3d")
    expect(claim(a, "no-gouge")).toBe("passed")
    expect(claim(a, "no-rapid-in-stock")).toBe("passed")
    // Most of the stock above the part is gone; a ball cannot reach the base's sharp inner corner, which the evidence reports.
    expect(a.stock.finalVolume).toBeLessThan(a.stock.partVolume * 1.05)
  })

  test("invalid jobs fail with typed issues instead of producing a program", () => {
    const unknown = runJob(job("unobtainium"))
    expect(unknown.status).toBe("failed")
    expect(unknown.status === "failed" && unknown.issues[0]!.tag).toBe("UnknownMaterial")
    const small = runJob(job("6061", { stock: { min: { x: 0, y: 0, z: 0 }, max: { x: 50, y: 50, z: 12 } } }))
    expect(small.status === "failed" && small.issues[0]!.message).toMatch(/does not fit/)
    const missingTool = runJob(job("6061", { operations: [{ id: "x", strategy: "face", tool: "nope", bottom: 12 }] }))
    expect(missingTool.status === "failed" && missingTool.issues[0]!.tag).toBe("UnknownTool")
  })
})

describe("machine clearance on the release gate", () => {
  test("the claim is computed on the real program, not skipped: every move checked and clear", () => {
    const a = ok(runJob(job("6061")))
    const c = a.claims.find((x) => x.id === "machine-clearance")!
    expect(c.status).toBe("passed")
    expect(c.detail).toMatch(/moves checked/)
  })

  test("a table set higher than the stock's bottom is a holder collision, and the program is not verified", () => {
    // The table top at 40 mm above the stock bottom: the shank of every cut that goes deep reaches it.
    const high = ok(runJob(job("6061", { machine: { ...DEFAULT_MACHINE, table: { length: 1000, width: 500, gap: -40 } } })))
    expect(high.release).not.toBe("verified-program")
    expect(claim(high, "machine-clearance")).toBe("failed")
    expect(high.issues.some((i) => i.tag === "HolderCollision" && /table/.test(i.message))).toBe(true)
  })
})
