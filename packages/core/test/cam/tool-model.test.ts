/**
 * Spec 31: one 3D model per tool, from a user's tool resource, the generator's settings or a kernel cutter — the shape the
 * Resources page and the CAM preview both draw.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "../../src/index.ts"

const g = cam.generator
const rmax = (m: cam.MillModel, zTo: number) => Math.max(...cam.toolProfile(m).points.filter((p) => p.z <= zTo + 1e-9).map((p) => p.r))
const mill = (type: string, extra: Partial<cam.ToolResource> = {}) => cam.toolModelOf({ type, diameter: 10, ...extra }) as cam.MillModel

describe("every library tool type has its shape", () => {
  test("each mill type of the Resources maps to a mill shape; unknown types are flagged and drawn as an end mill", () => {
    const expected: Record<string, cam.MillShape> = {
      endmill: "flat", roughingendmill: "roughing", ballendmill: "ball", bullnose: "bull", cornerroundingmill: "cornerRounding", chamfermill: "chamfer",
      vbit: "engraver", engraver: "engraver", spotdrill: "spot", drillbit: "drill", reamer: "reamer", taperedendmill: "tapered", facemill: "facemill",
      threadmill: "threadmill", tslotcutter: "disc", woodruffcutter: "disc", keywaycutter: "disc", dovetailcutter: "dovetail", boringbar: "boringBar"
    }
    for (const [type, shape] of Object.entries(expected)) {
      const m = mill(type)
      expect(m.family, type).toBe("mill")
      expect(m.shape, type).toBe(shape)
      expect(cam.toolMachineOf(type), type).toBe("mill")
    }
    expect(mill("End Mill").shape).toBe("flat")
    const unknown = mill("sprocket cutter")
    expect(unknown.shape).toBe("flat")
    expect(unknown.assumed).toContain("type")
    expect(cam.toolMachineOf("sprocket cutter")).toBeUndefined()
    for (const type of cam.TOOL_TYPES.mill) expect(cam.toolModelOf({ type, diameter: 6 }).family, type).not.toBe("lathe")
  })

  test("the resource's lengths are used; what it lacks is assumed and said", () => {
    const m = mill("endmill", { numberOfFlutes: 4, cuttingLength: 22, totalLength: 75, shankDiameter: 10 })
    expect(m).toMatchObject({ diameter: 10, flutes: 4, fluteLength: 22, shankDiameter: 10 })
    expect(m.stickout).toBeCloseTo(75 * 0.66, 6)
    expect(m.assumed).toEqual(["stickout"])
    const bare = mill("endmill")
    expect(bare.assumed).toEqual(expect.arrayContaining(["cuttingLength", "shankDiameter", "stickout", "numberOfFlutes"]))
    expect(mill("endmill", { stickout: 33 }).stickout).toBe(33)
    expect(mill("endmill", { holderDiameter: 32 }).holder).toEqual({ diameter: 32, length: 45 })
  })

  test("profiles: ball tip, bull corner, cone angles, drill point, reamer lead, taper, serrations, thread teeth", () => {
    const ball = cam.toolProfile(mill("ballendmill"))
    expect(ball.points[0]).toEqual({ r: 0, z: 0 })
    expect(ball.points.some((p) => Math.abs(p.r - 5) < 1e-9 && Math.abs(p.z - 5) < 1e-9)).toBe(true)
    const bull = mill("bullnose", { cornerRadius: 2 })
    expect(cam.toolProfile(bull).points.some((p) => Math.abs(p.r - 3) < 1e-9 && Math.abs(p.z) < 1e-9)).toBe(true)
    // Cone height = R / tan(angle / 2).
    const vbit = cam.toolProfile(mill("vbit", { tipAngle: 90 }))
    expect(vbit.points.find((p) => Math.abs(p.r - 5) < 1e-9)!.z).toBeCloseTo((5 - 0.1) / Math.tan(Math.PI / 4), 6)
    const drill = cam.toolProfile(mill("drillbit"))
    expect(drill.points[1]!.z).toBeCloseTo(5 / Math.tan((59 * Math.PI) / 180), 6)
    const reamer = cam.toolProfile(mill("reamer")).points
    expect(reamer[1]).toEqual({ r: 4.5, z: 0 })
    const tapered = mill("taperedendmill", { tipAngle: 5, cuttingLength: 20 })
    expect(rmax(tapered, 20)).toBeCloseTo(5 + 20 * Math.tan((5 * Math.PI) / 180), 6)
    const rough = cam.toolProfile(mill("roughingendmill")).points.filter((p) => p.z > 0 && p.z < 30)
    expect(new Set(rough.map((p) => p.r.toFixed(3))).size).toBeGreaterThan(1)
    const thread = mill("threadmill", { threadPitch: 2, cuttingLength: 10 })
    const crests = cam.toolProfile(thread).points.filter((p) => Math.abs(p.r - 5) < 1e-9 && p.z <= 10)
    expect(crests.length).toBe(5)
    expect(crests[1]!.z - crests[0]!.z).toBeCloseTo(2, 9)
  })

  test("disc and dovetail cutters stand on a neck narrower than the head; corner rounding is concave", () => {
    const disc = mill("tslotcutter", { diameter: 32, cuttingLength: 6, shankDiameter: 12 })
    const pts = cam.toolProfile(disc).points
    expect(pts.slice(0, 4).map((p) => p.r)).toEqual([0, 16, 16, 6])
    const dove = cam.toolProfile(mill("dovetailcutter", { diameter: 20, cuttingLength: 6 })).points
    expect(dove[1]!.r).toBe(10)
    expect(dove[2]!.r).toBeLessThan(10)
    const round = cam.toolProfile(mill("cornerroundingmill", { cornerRadius: 3 })).points
    // Below the chord from the pilot to the full radius: concave.
    const mid = round.find((p) => p.z > 1 && p.z < 2)!
    expect(mid.r).toBeLessThan(2 + (mid.z / 3) * 3)
  })

  test("probe, tool setter, lathe inserts and nozzles", () => {
    expect(cam.toolModelOf({ type: "probe", diameter: 4 })).toMatchObject({ family: "probe", ballDiameter: 4 })
    const probe = cam.toolProfile(cam.toolModelOf({ type: "probe", diameter: 4 }) as cam.ProbeModel)
    expect(probe.parts[0]).toBe("cutting")
    expect(probe.parts.at(-1)).toBe("holder")
    expect(cam.toolModelOf({ type: "toolsetter", diameter: 30 })).toMatchObject({ family: "setter", padDiameter: 30 })
    expect(cam.toolModelOf({ type: "turning", diameter: 3 })).toMatchObject({ family: "lathe", insert: "turning", noseRadius: 0.4 })
    expect(cam.toolModelOf({ type: "turning", diameter: 3, cornerRadius: 0 })).toMatchObject({ noseRadius: 0 })
    expect(cam.toolModelOf({ type: "parting", diameter: 3 })).toMatchObject({ insert: "parting", noseRadius: 0, width: 3 })
    // "boring": a lathe insert on a lathe, a boring head on a mill.
    expect(cam.toolModelOf({ type: "boring", diameter: 16 }, "lathe")).toMatchObject({ family: "lathe", insert: "boring" })
    expect(cam.toolModelOf({ type: "boringbar", diameter: 16 }, "mill")).toMatchObject({ family: "mill", shape: "boringBar" })
    expect(cam.toolModelOf({ type: "hardened", diameter: 0.6 })).toMatchObject({ family: "nozzle", nozzle: "hardened", diameter: 0.6 })
    for (const type of cam.TOOL_TYPES.lathe) expect(cam.toolModelOf({ type, diameter: 3 }, "lathe").family).toBe("lathe")
    for (const type of cam.TOOL_TYPES["3dprinter"]) expect(cam.toolModelOf({ type, diameter: 0.4 }).family).toBe("nozzle")
  })
})

describe("one model for the generator, the kernel and the preview", () => {
  test("generator settings: mill cutter, probing, lathe insert (knurling), nozzle", () => {
    const s = (p: Record<string, unknown>) => g.decodeSettings(p)
    expect(cam.toolModelFromSettings(s({ toolType: "ballnose", toolDiameter: 8, flutes: 2 }))).toMatchObject({ family: "mill", shape: "ball", diameter: 8, flutes: 2 })
    expect(cam.toolModelFromSettings(s({ operationType: "probing", toolType: "probe", probeStylus: 3 }))).toMatchObject({ family: "probe", ballDiameter: 3 })
    expect(cam.toolModelFromSettings(s({ operationType: "probing", toolType: "toolsetter" }))).toMatchObject({ family: "setter" })
    expect(cam.toolModelFromSettings(s({ machineType: "lathe", toolType: "grooving", toolDiameter: 4 }))).toMatchObject({ family: "lathe", insert: "grooving", width: 4 })
    expect(cam.toolModelFromSettings(s({ machineType: "lathe", operationType: "knurling" }))).toMatchObject({ insert: "knurling" })
    expect(cam.toolModelFromSettings(s({ machineType: "lathe", toolType: "turning", noseRadius: 0.8 }))).toMatchObject({ noseRadius: 0.8 })
    expect(cam.toolModelFromSettings(s({ machineType: "3dprinter", toolType: "ruby", nozzleDiameter: 0.6 }))).toMatchObject({ family: "nozzle", nozzle: "ruby", diameter: 0.6 })
  })

  test("a kernel cutter becomes the same shape; the model gives back a cutter for cutting data", () => {
    const c = cam.kernel.settingsCutter(g.decodeSettings({ toolType: "chamfer", toolDiameter: 10 }))
    const m = cam.toolModelFromCutter(c)
    expect(m).toMatchObject({ shape: "chamfer", diameter: 10, angle: 90 })
    expect(cam.cutterOf(m)).toMatchObject({ kind: "chamfer", diameter: 10 })
    expect(cam.cutterOf(cam.toolModelOf({ type: "cornerroundingmill", diameter: 12, cornerRadius: 3 }))).toMatchObject({ kind: "bull", cornerRadius: 3 })
    expect(cam.cutterOf(cam.toolModelOf({ type: "probe", diameter: 4 }))).toBeUndefined()
  })

  test("meshes: one per part, an assumed holder flagged, closed volume grows with the diameter", () => {
    const m = mill("endmill", { cuttingLength: 20, shankDiameter: 10 })
    const parts = cam.toolMeshes(m, { assumeHolder: true })
    expect(parts.map((p) => [p.part, p.assumed])).toEqual([["cutting", false], ["shank", false], ["holder", true]])
    expect(cam.toolMeshes(m).map((p) => p.part)).toEqual(["cutting", "shank"])
    const small = cam.kernel.assemblyVolume(cam.toolProfile(mill("endmill", { diameter: 6 })), "cutting")
    const big = cam.kernel.assemblyVolume(cam.toolProfile(mill("endmill", { diameter: 12 })), "cutting")
    expect(big).toBeGreaterThan(small)
    expect(cam.toolEnvelope(m)).toEqual({ radius: 5, length: m.stickout })
    expect(cam.describeTool(m)).toContain("flat Ø10")
  })
})

describe("rotary programs and where the machine starts (spec 31 §5.5, §9)", () => {
  const program = (moves: cam.Move[]) => cam.makeProgram("p", [{ id: "t", name: "t", toolId: "t", spindleRpm: 1000, coolant: "off", moves }])
  test("the table layout and the frame are read from the program", () => {
    const tcp = cam.viewer.rotaryOfProgram(program([{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 }, rotary: { a: 30, c: 90 } }]), "(KINEMATICS: TABLE-AC, CONTROL TCP)\nG234 H1")
    expect(tcp).toMatchObject({ layout: "table-AC", coordinates: "part", assumed: false })
    const machine = cam.viewer.rotaryOfProgram(program([{ _tag: "Orient", b: 45, c: 0 }, { _tag: "Linear", to: { x: 1, y: 0, z: 0 }, feed: 100 }]))
    expect(machine).toMatchObject({ layout: "table-BC", coordinates: "machine" })
    const guessed = cam.viewer.rotaryOfProgram(program([{ _tag: "Linear", to: { x: 1, y: 0, z: 0 }, feed: 100, rotary: { b: 20 } }]))
    expect(guessed).toMatchObject({ layout: "table-BC", coordinates: "part", assumed: true })
    expect(cam.viewer.rotaryOfProgram(program([{ _tag: "Linear", to: { x: 1, y: 0, z: 0 }, feed: 100 }]))).toBeUndefined()
  })

  test("the tool axis in the part, and part <-> machine points, agree with the indexing maths", () => {
    const rotary: cam.viewer.RotarySetup = { layout: "table-AC", pivot: { x: 0, y: 0, z: -50 }, coordinates: "part", assumed: false, reasons: [] }
    const angles = { a: 90, c: 0 }
    const axis = cam.viewer.toolAxisInPart(angles, rotary)
    // Tilting the table 90 degrees about X brings the part's -Y face up: the tool comes in along part -Y... the axis is R^T Z.
    expect(axis.x).toBeCloseTo(0, 9)
    expect(Math.abs(axis.y)).toBeCloseTo(1, 9)
    const p = { x: 10, y: 5, z: -20 }
    const m = cam.viewer.machinePointOf(p, angles, rotary)
    expect(m).toEqual(cam.partToMachine(p, { a: 90, c: 0 }, "table-AC", rotary.pivot))
    expect(cam.viewer.partPointOf(m, angles, { ...rotary, coordinates: "machine" }).y).toBeCloseTo(p.y, 9)
    expect(cam.viewer.lerpAngles({ a: 0, c: 0 }, { a: 30, c: 90 }, 0.5)).toEqual({ a: 15, c: 45 })
  })

  test("the timeline carries the angles of each move; the pose interpolates them", () => {
    const tl = cam.viewer.buildTimeline(program([
      { _tag: "Rapid", to: { x: 0, y: 0, z: 10 } },
      { _tag: "Orient", a: 30, c: 0 },
      { _tag: "Linear", to: { x: 10, y: 0, z: 10 }, feed: 60 },
      { _tag: "Linear", to: { x: 20, y: 0, z: 10 }, feed: 60, rotary: { a: 60 } }
    ]))
    expect(tl.moves.map((m) => m.angles.a ?? 0)).toEqual([0, 30, 60])
    const second = tl.moves[2]!
    expect(cam.viewer.poseAt(tl, second.start + second.duration / 2).angles.a).toBeCloseTo(45, 9)
  })

  test("a believable start: down onto the first position (mill), from the turret's far corner (lathe), home (printer)", () => {
    const p = program([{ _tag: "Rapid", to: { x: 40, y: -20, z: 5 } }, { _tag: "Linear", to: { x: 40, y: -20, z: -3 }, feed: 100 }, { _tag: "Rapid", to: { x: 0, y: 0, z: 25 } }])
    expect(cam.viewer.programStart("mill", p)).toEqual({ x: 40, y: -20, z: 25 })
    const lathe = program([{ _tag: "Rapid", to: { x: 52, y: 0, z: 2 } }, { _tag: "Linear", to: { x: 44, y: 0, z: -30 }, feed: 100 }, { _tag: "Rapid", to: { x: 60, y: 0, z: 10 } }])
    expect(cam.viewer.programStart("lathe", lathe)).toEqual({ x: 60, y: 0, z: 10 })
    expect(cam.viewer.programStart("3dprinter", p)).toEqual({ x: 0, y: 0, z: 0 })
    const tl = cam.viewer.buildTimeline(p, undefined, 5000, cam.viewer.programStart("mill", p))
    expect(tl.moves[0]!.from).toEqual({ x: 40, y: -20, z: 25 })
  })

  test("the lathe nose radius rounds the insert outline's tip", () => {
    const sharp = cam.viewer.latheToolOutlines("turning", 0, 0)[0]!.points
    const round = cam.viewer.latheToolOutlines("turning", 0, 0.8)[0]!.points
    expect(round.length).toBe(sharp.length + 8)
    expect(round.some((p) => Math.hypot(p.x, p.z) < 1e-9)).toBe(false)
    expect(cam.viewer.latheToolOutlines("knurling", 0).filter((o) => o.part === "insert")).toHaveLength(2)
    expect(cam.viewer.latheToolOutlines("facing", 0)[0]!.points).not.toEqual(sharp)
  })
})
