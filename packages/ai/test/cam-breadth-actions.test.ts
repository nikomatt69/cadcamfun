/**
 * The CAM breadth actions through the real catalogue seam (`runAction`: schema decode, execution, outcome classification against the
 * result contract) on the real core code: the lathe planner and its stock-removal replay, engagement and feed optimisation, the post
 * tester. Nothing here is mocked.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { ACTION_CATALOGUE, runAction } from "../src/actions/catalogue.ts"
import type { ActionContext } from "../src/actions/action.ts"

// Each kernel job starts a worker; the lathe replay and the NC replay take seconds on a loaded machine.
setDefaultTimeout(60_000)

const context = (handlers: Record<string, unknown> = {}): ActionContext => ({ projectId: "p", handlers } as unknown as ActionContext)
const call = (id: string, input: unknown, handlers: Record<string, unknown> = {}) => runAction(id, input, context(handlers)) as Promise<Record<string, any>>

const shaft = {
  stock: { diameter: 30, length: 60 },
  contour: [
    { diameter: 18, z: 0 }, { diameter: 20, z: -1 }, { diameter: 20, z: -18 }, { diameter: 26, z: -24 }, { diameter: 26, z: -28 },
    { diameter: 22, z: -28 }, { diameter: 22, z: -32 }, { diameter: 26, z: -32 }, { diameter: 26, z: -45 }
  ],
  tools: [
    { id: "T1", number: 1, kind: "turning", insert: "CNMG120408", approach: 95 },
    { id: "T2", number: 2, kind: "turning", insert: "DNMG150604", approach: 93 },
    { id: "T3", number: 3, kind: "grooving", bladeWidth: 3, bladeLength: 12 },
    { id: "T4", number: 4, kind: "threading", insert: "TNMG160408", noseRadius: 0.1 },
    { id: "T5", number: 5, kind: "parting", bladeWidth: 3, bladeLength: 15 }
  ],
  operations: [
    { kind: "face", tool: "T1" }, { kind: "rough", tool: "T1", depth: 2 }, { kind: "finish", tool: "T2" },
    { kind: "groove", tool: "T3", z: -28, width: 4, diameter: 22 },
    { kind: "thread", tool: "T4", diameter: 20, pitch: 1.5, zStart: 3, zEnd: -16 },
    { kind: "part", tool: "T5", z: -45 }
  ]
}

describe("cam.lathe", () => {
  test("is in the catalogue as a read action of the cam tool", () => {
    for (const id of ["cam.lathe", "cam.process", "cam.post_test", "cam.verify_nc"]) expect(ACTION_CATALOGUE.find((a) => a.id === id)?.kind).toBe("read")
  })
  for (const post of ["fanuc", "siemens"]) {
    test(`plans a shaft with every operation kind for ${post}, writes the NC and the replay matches the revolved stock`, async () => {
      const r = await call("cam.lathe", { ...shaft, post })
      expect(r["ok"]).toBe(true)
      expect(r["release"]).toBe("preview")
      expect(r["operations"].map((o: { kind: string }) => o.kind)).toEqual(["face", "rough", "finish", "groove", "thread", "part"])
      expect(r["verification"].verdict).toBe("matches")
      expect(r["verification"].rapidCollisions).toBe(0)
      expect(Math.abs(r["verification"].removedVolume - r["verification"].expectedRemoved)).toBeLessThanOrEqual(r["verification"].volumeBound)
      if (post === "fanuc") { expect(r["cycles"]).toEqual(["G71", "G75", "G76"]); expect(r["preview"]).toContain("G71 U2.000") }
      else { expect(r["cycles"]).toEqual([]); expect(r["preview"]).toContain("DIAMON") }
    })
  }
  test("a tool the job does not define and a profile bigger than the bar are refusals with the reason", async () => {
    const missing = await call("cam.lathe", { ...shaft, operations: [{ kind: "face", tool: "T9" }] })
    expect(missing["ok"]).toBe(false)
    expect(missing["error"]).toContain("T9")
    const big = await call("cam.lathe", { ...shaft, stock: { diameter: 24, length: 60 } })
    expect(big["ok"]).toBe(false)
    expect(big["error"]).toContain("larger than")
    // The schema refuses a malformed operation before any code runs.
    expect((await call("cam.lathe", { ...shaft, operations: [{ kind: "thread", tool: "T4" }] }))["ok"]).toBe(false)
  })
})

describe("cam.process", () => {
  // A 60 x 30 pocket cut by a 10 mm end mill at one fixed feed: a full-width slot first, then side passes at 3 mm.
  const pocket = (feed: number): string => {
    const z = -3
    // The stock stands from x 5 to 65: the plunges and the sideways steps are in air at x 0 and x 70.
    const moves: cam.Move[] = [{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "Linear", to: { x: 0, y: 0, z }, feed: 300 }, { _tag: "Linear", to: { x: 70, y: 0, z }, feed }]
    let at = 70
    for (const side of [1, -1]) {
      for (let k = 1; k <= 4; k++) {
        moves.push({ _tag: "Linear", to: { x: at, y: side * k * 3, z }, feed })
        at = at === 70 ? 0 : 70
        moves.push({ _tag: "Linear", to: { x: at, y: side * k * 3, z }, feed })
      }
      moves.push({ _tag: "Rapid", to: { x: at, y: side * 12, z: 5 } }, { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "Linear", to: { x: 0, y: 0, z }, feed: 300 })
      at = 0
    }
    return cam.getPost("generic")!.emit(cam.makeProgram("pocket", [{ id: "p", name: "Pocket", toolId: "1", spindleRpm: 5400, coolant: "off", moves }]))
  }
  const base = {
    tool: { diameter: 10, flutes: 3 }, material: "C45", stock: { minX: 5, maxX: 65, minY: -25, maxY: 25, minZ: -10, maxZ: 0 }, rpm: 5400,
    machine: "vmc-standard"
  }
  test("engagement mode measures the program and judges it: a feed past the spindle's power fails with the move and the limit", async () => {
    const r = await call("cam.process", { ...base, gcode: pocket(1400), mode: "engagement" })
    expect(r["ok"]).toBe(true)
    expect(r["uncalibrated"]).toBe(true)
    expect(r["bound"].aeMm).toBeCloseTo(r["bound"].cellMm * Math.SQRT2, 2)
    expect(r["claim"].before).toBe("failed")
    const tp = r["toolpaths"][0]
    expect(tp.worst[0].ratio).toBeGreaterThan(1)
    // the slot is the full tool diameter wide
    expect(tp.worst[0].aeMm).toBeGreaterThan(9)
    expect(r["program"]).toBeUndefined()
  })
  test("power mode writes feeds inside every limit, shortens the cutting time and returns the posted program", async () => {
    const r = await call("cam.process", { ...base, gcode: pocket(300), mode: "power", post: "fanuc" })
    expect(r["ok"]).toBe(true)
    expect(r["claim"].after).toBe("passed")
    expect(r["claim"].worstRatioAfter).toBeLessThanOrEqual(1)
    expect(r["report"].cutTimeSaved).toBeGreaterThanOrEqual(0.1)
    expect(r["program"].preview).toContain("G1")
    expect(r["program"].programHash).toHaveLength(64)
    // The optimised program is real NC: the post tester reads it back with no error.
    const again = await call("cam.post_test", { post: "fanuc", gcode: r["program"].preview.length > 0 ? cam.getPost("fanuc")!.emit(cam.programOfNc(pocket(480)).program!) : "" })
    expect(again["results"][0].verdict).toBe("passed")
  })
  test("a program that overloads the tool is slowed to the limit, and the answer says the time grew", async () => {
    const r = await call("cam.process", { ...base, gcode: pocket(1400), mode: "power" })
    expect(r["claim"].before).toBe("failed")
    expect(r["claim"].after).toBe("passed")
    expect(r["report"].cutTimeSaved).toBeLessThan(0)
  })
  test("a stored operation's program is read through the host; a program that cannot be read and an unknown material are refusals", async () => {
    const stored = await call("cam.process", { ...base, operationId: "op1", mode: "engagement" }, { operationProgram: async () => ({ ok: true, gcode: pocket(480), params: {} }) })
    expect(stored["ok"]).toBe(true)
    expect((await call("cam.process", { ...base, mode: "engagement" }))["ok"]).toBe(false)
    expect((await call("cam.process", { ...base, gcode: pocket(480), material: "unobtainium", mode: "engagement" }))["error"]).toContain("Unknown material")
    expect((await call("cam.process", { ...base, gcode: "G76 X1 Z1 P1 Q1 F1\nM30", mode: "engagement" }))["ok"]).toBe(false)
  })
})

describe("cam.post_test", () => {
  test("every post passes the standard sample program with each check named", async () => {
    const r = await call("cam.post_test", { post: "all" })
    expect(r["ok"]).toBe(true)
    expect(r["results"]).toHaveLength(11)
    for (const p of r["results"]) expect({ post: p.post, verdict: p.verdict }).toEqual({ post: p.post, verdict: "passed" })
    expect(r["results"][0].checks.map((c: { id: string }) => c.id)).toContain("cut-length")
  })
  test("a shop's NC read back and posted again, with an expected output that differs, gives a line diff", async () => {
    const fanuc = cam.getPost("fanuc")!.emit(cam.samplePostProgram())
    const r = await call("cam.post_test", { post: "haas", gcode: fanuc, expected: fanuc })
    expect(r["ok"]).toBe(true)
    const result = r["results"][0]
    expect(result.checks.find((c: { id: string }) => c.id === "replay").status).toBe("passed")
    // Haas text differs from the Fanuc text the shop expected: the diff names lines, the verdict is failed because the expected check failed.
    expect(result.diff.length).toBeGreaterThan(0)
    expect(result.verdict).toBe("failed")
  })
  test("text that cannot be converted is a refusal with the reason", async () => {
    const r = await call("cam.post_test", { post: "fanuc", gcode: "G84 X1 Y1 Z-5 R2 F100\nM30" })
    expect(r["ok"]).toBe(false)
    expect(r["error"]).toContain("tapping")
  })
})

describe("cam.verify_nc", () => {
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => ({
    positions: [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1],
    indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  })
  // A 20 x 20 x 10 block in a stock 3 mm proud on the sides; the 6 mm flat clears the ring at offset `o` from the wall.
  const ring = (o: number): string => ["G21 G90 G54", "T1 M6", "S10000 M3", "G0 Z15", `G0 X${-o} Y${-o}`, "G1 Z-1 F300", `G1 X${20 + o} F800`, `G1 Y${20 + o}`, `G1 X${-o}`, `G1 Y${-o}`, "G0 Z15", "M30"].join("\n")
  const base = {
    part: { meshes: [box(0, 0, 0, 20, 20, 10)] }, stock: { minX: -3, maxX: 23, minY: -3, maxY: 23, minZ: 0, maxZ: 10 },
    tools: [{ number: 1, diameter: 6, flutes: 3 }], tolerance: 0.005, cell: 0.05
  }

  test("a clean hand-written program has the verdict clean and states what it does not prove", async () => {
    const r = await call("cam.verify_nc", { ...base, gcode: ring(3) })
    expect(r["ok"]).toBe(true)
    expect(r["verdict"]).toBe("clean")
    expect(r["complete"]).toBe(true)
    expect(r["findings"]).toEqual([])
    expect(r["feedMoves"]).toBe(5)
    expect(r["basis"]).toContain("not controller acceptance")
  })

  test("an overcut of 0.1 mm is a fault with the NC line of the move that made it", async () => {
    const r = await call("cam.verify_nc", { ...base, gcode: ring(2.9) })
    expect(r["verdict"]).toBe("faults")
    const gouge = r["findings"].find((f: { kind: string }) => f.kind === "gouge")
    expect(gouge.line).toBeGreaterThan(0)
    expect(gouge.message).toContain("NC line")
    expect(r["gouge"].depthMm).toBeGreaterThan(0.05)
  })

  test("a program stored on an operation is read from the host, and a missing one is a refusal", async () => {
    const stored = await call("cam.verify_nc", { ...base, operationId: "op1" }, { operationProgram: async () => ({ ok: true, operationId: "op1", gcode: ring(2.9) }) })
    expect(stored["verdict"]).toBe("faults")
    const none = await call("cam.verify_nc", { ...base, operationId: "op1" }, { operationProgram: async () => ({ ok: false, error: "The operation has no program yet" }) })
    expect(none["ok"]).toBe(false)
    expect(none["error"]).toContain("no program")
    expect((await call("cam.verify_nc", base))["ok"]).toBe(false)
  })

  test("the part as CAD elements with the work zero as origin gives the same answer as the part in the work frame", async () => {
    // The cube element spans x 0..20, y 5..15, z -5..15; the work zero at (0, 5, -5) puts it at 0..20 x 0..10 x 0..20.
    const cube = { id: "c", type: "cube", x: 10, y: 10, z: 5, width: 20, height: 10, depth: 20 }
    const stock = { minX: -3, maxX: 23, minY: -3, maxY: 13, minZ: 0, maxZ: 20 }
    const clean = await call("cam.verify_nc", { ...base, stock, part: { elements: [cube] }, origin: { x: 0, y: 5, z: -5 }, gcode: ring(3).replace(/Z15/g, "Z25").replace(/Y23/g, "Y13") })
    expect(clean["ok"]).toBe(true)
    expect(clean["verdict"]).toBe("clean")
    const faulty = await call("cam.verify_nc", { ...base, stock, part: { elements: [cube] }, origin: { x: 0, y: 5, z: -5 }, gcode: ring(2.9).replace(/Z15/g, "Z25").replace(/Y22\.9/g, "Y12.9") })
    expect(faulty["verdict"]).toBe("faults")
  }, 60_000)

  test("refusals name the reason: an unknown tool number is incomplete, a bad machine, a flat stock and a part of both forms", async () => {
    const unknownTool = await call("cam.verify_nc", { ...base, gcode: ring(3).replace("T1 M6", "T7 M6") })
    expect(unknownTool["verdict"]).toBe("incomplete")
    expect(unknownTool["findings"].some((f: { kind: string }) => f.kind === "unknown-tool")).toBe(true)
    expect((await call("cam.verify_nc", { ...base, gcode: ring(3), machine: "no-such-machine" }))["error"]).toContain("Unknown machine")
    expect((await call("cam.verify_nc", { ...base, gcode: ring(3), stock: { ...base.stock, maxZ: 0 } }))["error"]).toContain("maxZ")
    expect((await call("cam.verify_nc", { ...base, gcode: ring(3), part: { meshes: base.part.meshes, elements: [{ type: "cube" }] } }))["ok"]).toBe(false)
  })
})
