/**
 * Spec 32 §4.2: the tool drawn for an operation can do that operation. Before this, the preview drew whatever the tool type
 * field held: a lathe threading, grooving, parting or boring operation drew a turning insert (the probe of spec 32 §2.2, V1).
 */
import { describe, expect, test } from "bun:test"
import { cam } from "../../src/index.ts"

const g = cam.generator
const settings = (patch: Partial<cam.generator.ToolpathSettings> = {}): cam.generator.ToolpathSettings => g.withMachineDefaults({ ...g.DEFAULT_SETTINGS, ...patch })
/** What the generator panel does when the operation is picked: the tool switches when it cannot do the operation. */
const picked = (s: cam.generator.ToolpathSettings): cam.generator.ToolpathSettings => {
  const toolType = cam.toolTypeForOperation(s)
  return toolType === undefined ? s : { ...s, toolType }
}
const kindOf = (s: cam.generator.ToolpathSettings) => cam.toolKindOf(cam.toolForOperation(s))

describe("every operation draws a tool that can do it", () => {
  test("each generator operation, picked from the defaults of its machine, gets an allowed tool", () => {
    for (const machineType of ["mill", "lathe", "3dprinter"] as const) {
      for (const operationType of g.operationsFor(machineType)) {
        const variants: Array<Partial<cam.generator.ToolpathSettings>> = operationType === "3d_surface"
          ? [{ surfaceStrategy: "roughing" }, { surfaceStrategy: "parallel" }, { surfaceStrategy: "waterline" }, { surfaceStrategy: "steep-shallow" }]
          : operationType === "turning" ? [{ turningOperation: "external" }, { turningOperation: "internal" }] : [{}]
        for (const variant of variants) {
          const s = picked(settings({ machineType, operationType, ...variant }))
          const tools = cam.operationTools(cam.operationKey(s))
          expect(tools, `${machineType}/${operationType}`).toBeDefined()
          expect(tools!.allowed, `${machineType}/${operationType} ${JSON.stringify(variant)}`).toContain(kindOf(s))
          expect(cam.settingsToolIssues(s).filter((i) => i.code === "TOOL_CANNOT_DO_OPERATION"), `${machineType}/${operationType}`).toEqual([])
        }
      }
    }
  })

  test("a lathe operation whose tool type is not an insert draws that operation's insert (the spec 32 probe)", () => {
    const expected: Record<string, cam.LatheInsert> = { facing: "facing", turning: "turning", boring: "boring", threading: "threading", grooving: "grooving", parting: "parting", knurling: "knurling" }
    for (const [operationType, insert] of Object.entries(expected)) {
      // `endmill` is the mill default left in the settings when the operation is set directly (the assistant, a saved config).
      const s = { ...g.DEFAULT_SETTINGS, machineType: "lathe" as const, operationType: operationType as never, toolType: "endmill" as const }
      const model = cam.toolForOperation(s)
      expect(model, operationType).toMatchObject({ family: "lathe", insert })
      if (operationType !== "knurling" && operationType !== "turning") expect(model.assumed, operationType).toContain("type")
    }
    expect(cam.toolForOperation({ ...g.DEFAULT_SETTINGS, machineType: "lathe", operationType: "turning", turningOperation: "internal", toolType: "endmill" })).toMatchObject({ insert: "boring" })
    // The lathe preview set-up and the phone's preview take the same tool.
    expect(cam.viewer.latheSetupOf({ ...g.DEFAULT_SETTINGS, machineType: "lathe", operationType: "parting" }).tool.insert).toBe("parting")
    expect(cam.previewToolModel("lathe", { ...g.DEFAULT_SETTINGS, machineType: "lathe", operationType: "threading" })).toMatchObject({ insert: "threading" })
  })

  test("a chosen tool of the machine is kept even when it cannot do the operation, and reported", () => {
    const s = settings({ machineType: "lathe", operationType: "parting", toolType: "turning" })
    expect(cam.toolForOperation(s)).toMatchObject({ insert: "turning" })
    const issues = cam.settingsToolIssues(s)
    expect(issues.map((i) => i.code)).toEqual(["TOOL_CANNOT_DO_OPERATION"])
    expect(issues[0]!.message).toContain("parting")
    expect(cam.settingsToolIssues(settings({ operationType: "threading", toolType: "endmill" })).map((i) => i.code)).toContain("TOOL_CANNOT_DO_OPERATION")
    expect(cam.settingsToolIssues(settings({ operationType: "drill", toolType: "ballnose" })).map((i) => i.code)).toContain("TOOL_CANNOT_DO_OPERATION")
  })

  test("picking an operation switches only a tool that cannot do it", () => {
    expect(cam.toolTypeForOperation(settings({ operationType: "drill", toolType: "endmill" }))).toBe("drill")
    expect(cam.toolTypeForOperation(settings({ operationType: "threading", toolType: "endmill" }))).toBe("threadmill")
    expect(cam.toolTypeForOperation(settings({ operationType: "engrave", toolType: "drill" }))).toBe("vbit")
    expect(cam.toolTypeForOperation(settings({ operationType: "probing", toolType: "endmill" }))).toBeUndefined() // the probing operation already draws a probe
    expect(cam.toolTypeForOperation(settings({ operationType: "contour", toolType: "endmill" }))).toBeUndefined()
    expect(cam.toolTypeForOperation(settings({ operationType: "3d_surface", surfaceStrategy: "parallel", toolType: "ballnose" }))).toBeUndefined()
    expect(cam.toolTypeForOperation(settings({ operationType: "3d_surface", surfaceStrategy: "roughing", toolType: "ballnose" }))).toBe("endmill")
    expect(cam.toolTypeForOperation(settings({ machineType: "lathe", operationType: "parting", toolType: "turning" }))).toBe("parting")
    expect(cam.toolTypeForOperation(settings({ machineType: "lathe", operationType: "grooving", toolType: "parting" }))).toBeUndefined()
    expect(cam.toolTypeForOperation(settings({ machineType: "lathe", operationType: "turning", turningOperation: "internal", toolType: "turning" }))).toBe("boring")
    expect(cam.toolTypeForOperation(settings({ machineType: "3dprinter", operationType: "vase", toolType: "ruby" }))).toBeUndefined()
  })

  test("every kernel strategy has its row", () => {
    for (const strategy of ["face", "adaptive", "pocket", "profile", "bore", "drill", "thread", "engrave", "chamfer", "surface", "multiaxis"] as const) {
      expect(cam.operationTools(cam.strategyKey(strategy)), strategy).toBeDefined()
    }
    expect(cam.strategyKey("surface", "waterline")).toBe("mill/3d_surface/finish")
    expect(cam.strategyKey("surface", "roughing")).toBe("mill/3d_surface")
    // Every kernel cutter can do at least one kernel strategy in the table.
    for (const c of cam.kernel.DEFAULT_CUTTERS) {
      const kind = cam.toolKindOf(cam.toolModelFromCutter(c))
      expect(Object.values(cam.OPERATION_TOOLS).some((row) => row.allowed.includes(kind)), c.id).toBe(true)
    }
  })
})

describe("reach, pitch and size", () => {
  const mill = (type: string, extra: Partial<cam.ToolResource> = {}) => cam.toolModelOf({ type, diameter: 10, ...extra }, "mill")

  test("a stickout shorter than the cut is an error, a short cutting length a warning", () => {
    expect(cam.toolOperationIssues("mill/pocket", mill("endmill", { stickout: 20, cuttingLength: 15 }), { depth: 25 }).map((i) => [i.code, i.severity])).toEqual([["TOOL_REACH", "error"]])
    expect(cam.toolOperationIssues("mill/pocket", mill("endmill", { stickout: 40, cuttingLength: 15 }), { depth: 25 }).map((i) => [i.code, i.severity])).toEqual([["TOOL_FLUTE_LENGTH", "warning"]])
    expect(cam.toolOperationIssues("mill/pocket", mill("endmill", { stickout: 40, cuttingLength: 30 }), { depth: 25 })).toEqual([])
    // A cone cuts at its tip: no reach rule.
    expect(cam.toolOperationIssues("mill/engrave", mill("vbit", { stickout: 5 }), { depth: 25 })).toEqual([])
    // The assumed length is said.
    expect(cam.toolOperationIssues("mill/pocket", mill("endmill"), { depth: 200 })[0]!.message).toContain("assumed")
  })

  test("thread pitch of a thread mill or a tap against the thread", () => {
    expect(cam.toolOperationIssues("mill/threading", mill("tap", { threadPitch: 1.25 }), { pitch: 1.5 }).map((i) => [i.code, i.severity])).toEqual([["THREAD_PITCH_MISMATCH", "error"]])
    expect(cam.toolOperationIssues("mill/threading", mill("threadmill", { threadPitch: 1 }), { pitch: 1.5 }).map((i) => [i.code, i.severity])).toEqual([["THREAD_PITCH_MISMATCH", "warning"]])
    expect(cam.toolOperationIssues("mill/threading", mill("threadmill", { threadPitch: 1.5 }), { pitch: 1.5 })).toEqual([])
    // The generator's own thread mill takes the thread's pitch: no mismatch.
    expect(cam.settingsToolIssues(settings({ operationType: "threading", toolType: "threadmill", threadPitch: 2 })).map((i) => i.code)).not.toContain("THREAD_PITCH_MISMATCH")
  })

  test("a tool larger than the hole or groove it works in", () => {
    expect(cam.toolOperationIssues("mill/threading", mill("threadmill"), { feature: { diameter: 8 } }).map((i) => i.code)).toEqual(["TOOL_TOO_LARGE_FOR_FEATURE"])
    expect(cam.toolOperationIssues("mill/drill", mill("drillbit"), { feature: { diameter: 10 } })).toEqual([])
    const blade = cam.toolModelOf({ type: "grooving", diameter: 4 }, "lathe")
    expect(cam.toolOperationIssues("lathe/grooving", blade, { feature: { width: 3 } }).map((i) => i.code)).toEqual(["TOOL_TOO_LARGE_FOR_FEATURE"])
    expect(cam.toolOperationIssues("lathe/grooving", blade, { feature: { width: 4 } })).toEqual([])
  })
})

describe("new tool shapes", () => {
  const model = (type: string, extra: Partial<cam.ToolResource> = {}) => cam.toolModelOf({ type, diameter: 10, ...extra }, "mill") as cam.MillModel
  const points = (m: cam.MillModel) => cam.toolProfile(m).points
  const cutting = (m: cam.MillModel) => points(m).filter((p) => p.z <= m.fluteLength + 1e-9)

  test("types map to their shapes and machine", () => {
    for (const [type, shape] of [["tap", "tap"], ["spiral tap", "tap"], ["lollipop", "lollipop"], ["undercut mill", "lollipop"], ["barrel", "barrel"], ["circle segment cutter", "barrel"], ["back chamfer", "backChamfer"], ["counterbore", "counterbore"]] as const) {
      expect(model(type).shape, type).toBe(shape)
      expect(cam.toolMachineOf(type), type).toBe("mill")
    }
    for (const type of ["tap", "lollipop", "barrel", "backchamfer", "counterbore"]) expect(cam.TOOL_TYPES.mill).toContain(type)
  })

  test("tap: ISO coarse pitch when not given, a chamfer lead, then full crests at the pitch", () => {
    expect(cam.isoCoarsePitch(10)).toBe(1.5)
    expect(cam.isoCoarsePitch(6)).toBe(1)
    expect(cam.isoCoarsePitch(8.2)).toBe(1.25)
    const tap = model("tap")
    expect(tap.pitch).toBe(1.5)
    expect(tap.assumed).toContain("threadPitch")
    const crests = cutting(tap).filter((_, i, all) => i > 1 && i % 2 === 0 && i < all.length)
    expect(crests[0]!.r).toBeLessThan(5)
    expect(crests[crests.length - 1]!.r).toBeCloseTo(5, 9)
    expect(cam.cutterOf(tap)).toMatchObject({ kind: "drill" })
  })

  test("lollipop: a full ball whose upper half narrows to the neck (it reaches under an overhang)", () => {
    const m = model("lollipop")
    const pts = cutting(m)
    const widest = pts.reduce((a, b) => (b.r > a.r ? b : a))
    expect(widest.r).toBeCloseTo(5, 6)
    expect(widest.z).toBeCloseTo(5, 6)
    const above = pts.filter((p) => p.z > widest.z + 1e-6)
    expect(above.length).toBeGreaterThan(2)
    for (let i = 1; i < above.length; i++) expect(above[i]!.r).toBeLessThanOrEqual(above[i - 1]!.r + 1e-9)
    expect(above[above.length - 1]!.r).toBeCloseTo(m.neckDiameter! / 2, 6)
    expect(cam.cutterOf(m)).toMatchObject({ kind: "ball" })
  })

  test("barrel: widest at mid-length, the side follows the form radius, a corner radius at the tip", () => {
    const m = model("barrel", { cuttingLength: 20, cornerRadius: 1, formRadius: 100 })
    expect(m).toMatchObject({ formRadius: 100, cornerRadius: 1 })
    const side = cutting(m).filter((p) => p.z > 1 + 1e-6)
    const widest = side.reduce((a, b) => (b.r > a.r ? b : a))
    expect(widest.r).toBeCloseTo(5, 6)
    expect(widest.z).toBeCloseTo(10, 6)
    // r(z) = R - Rf + sqrt(Rf² - (z - zc)²) at the top of the cutting length.
    const top = side[side.length - 1]!
    expect(top.r).toBeCloseTo(5 - 100 + Math.sqrt(100 * 100 - 10 * 10), 9)
    expect(model("barrel").assumed).toEqual(expect.arrayContaining(["formRadius", "cornerRadius"]))
    expect(cam.describeTool(m)).toContain("form R100")
  })

  test("back chamfer opens downwards; counterbore has its pilot below the cutter", () => {
    const backModel = model("backchamfer", { cuttingLength: 6 })
    const back = cutting(backModel)
    expect(back[1]).toEqual({ r: 5, z: 0 })
    // Up the 90° cone from the land at the full radius to the neck.
    const neck = back.find((p) => Math.abs(p.r - backModel.neckDiameter! / 2) < 1e-9)!
    expect(neck.z).toBeCloseTo(0.5 + (5 - backModel.neckDiameter! / 2), 9)
    const cb = model("counterbore")
    expect(cb.assumed).toContain("pilotDiameter")
    const pts = cutting(cb)
    expect(pts[1]!.r).toBeCloseTo(5 * 0.55, 9)
    expect(pts.some((p) => Math.abs(p.r - 5) < 1e-9)).toBe(true)
  })

  test("every mill shape revolves into meshes and has an envelope", () => {
    for (const type of cam.TOOL_TYPES.mill) {
      const m = cam.toolModelOf({ type, diameter: 8 }, "mill")
      if (m.family !== "mill") continue
      const meshes = cam.toolMeshes(m, { assumeHolder: true })
      expect(meshes.length, type).toBeGreaterThan(0)
      for (const p of cam.toolProfile(m).points) { expect(Number.isFinite(p.r) && Number.isFinite(p.z), type).toBe(true); expect(p.r, type).toBeGreaterThanOrEqual(0) }
      expect(cam.toolEnvelope(m).radius, type).toBeGreaterThan(0)
    }
  })
})

describe("tool holders as their outline (spec 32 P8)", () => {
  test("every kind runs from its nose to its length, clears the shank, and ends in the flange", () => {
    for (const kind of cam.HOLDER_KINDS) {
      const outline = cam.holderOutline({ diameter: 32, length: 60, kind }, 5)
      expect(outline[0]!.z, kind).toBe(0)
      expect(outline[outline.length - 1]!.z, kind).toBe(60)
      for (let i = 1; i < outline.length; i++) expect(outline[i]!.z, kind).toBeGreaterThanOrEqual(outline[i - 1]!.z - 1e-9)
      for (const p of outline) expect(p.r, kind).toBeGreaterThanOrEqual(5)
      expect(Math.max(...outline.map((p) => p.r)), kind).toBe(20)
    }
    // A shrink-fit nose is slim: a 3 mm wall round the shank.
    expect(cam.holderOutline({ diameter: 32, length: 60, kind: "shrink" }, 5)[0]!.r).toBe(8)
  })

  test("the kind from words; the assumed holder suits the tool; the drawn tool includes it", () => {
    expect(["ER32 collet chuck", "Shrink fit", "hydraulic chuck", "Weldon", "shell mill arbor", "tapping chuck", "pinza ER"].map(cam.holderKindOf)).toEqual(["er", "shrink", "hydraulic", "weldon", "arbor", "tapping", "er"])
    expect(cam.holderKindOf("")).toBeUndefined()
    const m = (type: string) => cam.toolModelOf({ type, diameter: 10 }, "mill") as cam.MillModel
    expect(cam.assumedHolderOf(m("tap")).kind).toBe("tapping")
    expect(cam.assumedHolderOf(m("facemill")).kind).toBe("arbor")
    expect(cam.assumedHolderOf(m("endmill")).kind).toBe("er")
    const held = cam.toolModelOf({ type: "endmill", diameter: 10, holderDiameter: 32, holderLength: 60, holderType: "shrink fit" }, "mill") as cam.MillModel
    expect(held.holder).toEqual({ diameter: 32, length: 60, kind: "shrink" })
    expect(cam.toolProfile(held).length).toBeCloseTo(held.stickout + 60, 9)
  })
})

describe("ISO lathe inserts (spec 32 P8)", () => {
  test("the code gives the shape and the nose radius", () => {
    expect(cam.isoInsertOf("CNMG 120408")).toEqual({ shape: "C", noseRadius: 0.8, code: "CNMG 120408" })
    expect(cam.isoInsertOf("VBMT160404 finishing")).toEqual({ shape: "V", noseRadius: 0.4, code: "VBMT160404" })
    expect(cam.isoInsertOf("DNMG")).toEqual({ shape: "D", code: "DNMG" })
    expect(cam.isoInsertOf("turning")).toBeUndefined()
    const fine = cam.toolModelOf({ type: "turning", diameter: 3, insertCode: "VBMT 160404" }, "lathe") as cam.LatheModel
    expect(fine).toMatchObject({ shape: "V", noseRadius: 0.4, code: "VBMT 160404" })
    expect(fine.assumed).not.toContain("insertShape")
    expect(cam.describeTool(fine)).toContain("VBMT 160404")
    const plain = cam.toolModelOf({ type: "turning", diameter: 3 }, "lathe") as cam.LatheModel
    expect(plain.shape).toBe("C")
    expect(plain.assumed).toContain("insertShape")
    expect((cam.toolModelOf({ type: "boring", diameter: 16 }, "lathe") as cam.LatheModel).shape).toBe("D")
    expect((cam.toolModelOf({ type: "threading", diameter: 3 }, "lathe") as cam.LatheModel).shape).toBeUndefined()
  })

  test("the drawn insert has the shape's tip angle", () => {
    const tipAngle = (shape: cam.IsoInsertShape) => {
      const pts = cam.viewer.latheToolOutlines("turning", 0, 0, shape)[0]!.points
      const a = pts[1]!, b = pts[pts.length - 1]!
      return (Math.acos((a.x * b.x + a.z * b.z) / (Math.hypot(a.x, a.z) * Math.hypot(b.x, b.z))) * 180) / Math.PI
    }
    for (const shape of ["C", "D", "V", "S", "T", "W"] as const) expect(tipAngle(shape), shape).toBeCloseTo(cam.ISO_INSERT_ANGLE[shape], 6)
    // A round insert touches the part at the programmed point.
    const round = cam.viewer.latheToolOutlines("turning", 0, 0, "R")[0]!.points
    expect(Math.min(...round.map((p) => Math.hypot(p.x, p.z)))).toBeCloseTo(0, 6)
  })
})
