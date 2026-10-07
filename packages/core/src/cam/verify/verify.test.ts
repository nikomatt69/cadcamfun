import { describe, expect, test } from "bun:test"
import { generator, makeProgram } from "../index.ts"
import { verifyRequestFor, verifyToolpath, type VerifyRequest } from "./index.ts"

const stock = { minX: -20, maxX: 20, minY: -20, maxY: 20, minZ: -10, maxZ: 0 }
const tool = { kind: "endmill" as const, diameter: 4 }
const base = { stock, tool, fixtures: [], tolerance: 0.05, resolution: 0.25 }
const run = (gcode: string, extra: Partial<VerifyRequest> = {}) => verifyToolpath({ ...base, gcode, ...extra })
const codes = (r: ReturnType<typeof run>) => r.issues.map((i) => i.code)

describe("verifyToolpath: removal", () => {
  test("a straight slot removes width x length x depth", () => {
    const r = run("G21\nG90\nG0 X-10 Y0 Z5\nG0 Z0\nG1 Z-3 F200\nG1 X10 F400\nG0 Z5\nM30")
    expect(r.ok).toBe(true)
    // 4 wide, 20 long (+ end caps of the round footprint), 3 deep.
    expect(r.stats.removedVolume).toBeGreaterThan(4 * 20 * 3 * 0.97)
    expect(r.stats.removedVolume).toBeLessThan((4 * 20 + Math.PI * 4) * 3 * 1.03)
    expect(r.stats.removedVolume + r.stats.remainingVolume).toBeCloseTo(r.stats.stockVolume, 3)
  })

  test("a ball nose leaves a rounded floor", () => {
    const r = run("G0 X0 Y0 Z5\nG1 Z-2 F100\nG0 Z5", { tool: { kind: "ballnose", diameter: 4 } })
    // Half a sphere of radius 2 below the surface plus the cylinder above the tip: well under a flat 4 mm hole.
    const flat = Math.PI * 4 * 2
    expect(r.stats.removedVolume).toBeLessThan(flat)
    expect(r.stats.removedVolume).toBeGreaterThan(flat * 0.5)
  })

  test("feed in the air is counted as air", () => {
    const r = run("G0 X0 Y0 Z5\nG1 X10 F400\nG1 Z-1 F100\nG1 X15 F400")
    expect(r.stats.airCutLength).toBeCloseTo(10, 1)
    expect(r.stats.engagedLength).toBeGreaterThan(5)
  })

  test("arcs and helices cut along the circle", () => {
    const r = run("G0 X5 Y0 Z5\nG1 Z-2 F100\nG3 X5 Y0 I-5 J0 F300\nG0 Z5")
    expect(r.ok).toBe(true)
    // Ring of radius 5, width 4, depth 2.
    expect(r.stats.removedVolume).toBeGreaterThan(2 * Math.PI * 5 * 4 * 2 * 0.95)
  })

  test("a canned drill cycle drills the hole", () => {
    const r = run("G0 X0 Y0 Z5\nG81 X0 Y0 Z-4 R2 F100\nG80")
    expect(r.stats.removedVolume).toBeGreaterThan(Math.PI * 4 * 4 * 0.9)
  })
})

describe("verifyToolpath: collisions", () => {
  test("a rapid into the stock is an error with line and point", () => {
    const r = run("G0 X0 Y0 Z5\nG0 Z-2")
    expect(r.ok).toBe(false)
    const issue = r.issues.find((i) => i.code === "RapidInMaterial")!
    expect(issue.severity).toBe("error")
    expect(issue.line).toBe(2)
    expect(issue.point!.z).toBeLessThan(0)
    expect(issue.point!.z).toBeGreaterThanOrEqual(-2)
  })

  test("rapids above the surface and on it are fine", () => {
    expect(run("G0 X0 Y0 Z5\nG0 X10\nG0 Z0").ok).toBe(true)
  })

  test("a rapid through a wall that a previous cut did not open is caught", () => {
    const r = run("G0 X-10 Y0 Z-2\nG0 X10")
    expect(codes(r)).toContain("RapidInMaterial")
  })

  test("a rapid through an already cut slot is fine", () => {
    const r = run("G0 X-12 Y0 Z5\nG1 Z-3 F100\nG1 X12 F300\nG0 X-12")
    expect(codes(r)).not.toContain("RapidInMaterial")
  })

  test("cutting below the stock bottom is an error", () => {
    const r = run("G0 X0 Y0 Z5\nG1 Z-12 F100")
    expect(codes(r)).toContain("BelowStock")
  })

  test("moving sideways at depth with short flutes drags the shank through the wall", () => {
    const short = { kind: "endmill" as const, diameter: 4, cuttingLength: 3 }
    const r = run("G0 X0 Y0 Z5\nG1 Z-6 F100\nG1 X8 F300", { tool: short })
    expect(codes(r)).toContain("ShankCollision")
    // Within the flute length it is fine, and so is a straight plunge (the hole the flutes cut clears the shank).
    expect(codes(run("G0 X0 Y0 Z5\nG1 Z-3 F100\nG1 X8 F300", { tool: short }))).not.toContain("ShankCollision")
    expect(codes(run("G0 X0 Y0 Z5\nG1 Z-6 F100", { tool: short }))).not.toContain("ShankCollision")
  })

  test("a shank wider than the cutter rubs the rim of a plunge", () => {
    const r = run("G0 X0 Y0 Z5\nG1 Z-6 F100", { tool: { kind: "endmill", diameter: 4, cuttingLength: 3, shankDiameter: 8 } })
    expect(codes(r)).toContain("ShankCollision")
  })

  test("the holder is only checked when it is modelled", () => {
    const deep = "G0 X0 Y0 Z5\nG1 Z-6 F100"
    expect(codes(run(deep))).not.toContain("HolderCollision")
    const withHolder = run(deep, { tool: { kind: "endmill", diameter: 4, stickout: 4, holderDiameter: 20, holderLength: 30 } })
    expect(codes(withHolder)).toContain("HolderCollision")
  })

  test("a fixture beside the stock is hit by the cutter, and by nothing else", () => {
    const fixtures = [{ id: "clamp", bounds: { minX: 22, maxX: 30, minY: -5, maxY: 5, minZ: -10, maxZ: 15 } }]
    const hit = run("G0 X0 Y0 Z5\nG0 X21 Y0", { fixtures })
    expect(hit.issues.find((i) => i.code === "FixtureCollision")?.fixtureId).toBe("clamp")
    const clear = run("G0 X0 Y0 Z5\nG0 X15 Y0", { fixtures })
    expect(codes(clear)).not.toContain("FixtureCollision")
    const over = run("G0 X0 Y0 Z20\nG0 X25 Y0", { fixtures })
    expect(codes(over)).not.toContain("FixtureCollision")
  })
})

describe("verifyToolpath: target", () => {
  // Finished part: a 20 x 20 box whose top is 2 mm below the stock top, centred in the stock.
  const part = { _tag: "Box" as const, origin: { x: -10, y: -10, z: -10 }, size: { x: 20, y: 20, z: 8 } }
  const facing = (z: number) =>
    ["G0 X-26 Y-15 Z5", `G1 Z${z} F200`, ...[-15, -9, -3, 3, 9, 15].flatMap((y, i) => [`G1 Y${y} F400`, `G1 X${i % 2 === 0 ? 26 : -26}`])].join("\n")

  test("cutting to the model leaves no gouge", () => {
    const r = run(facing(-2), { tool: { kind: "endmill", diameter: 8 }, target: { solids: [part] } })
    expect(codes(r)).not.toContain("Gouge")
    expect(r.stats.maxGouge).toBe(0)
  })

  test("cutting 0.5 mm too deep over the part is a gouge, with its depth", () => {
    const r = run(facing(-2.5), { tool: { kind: "endmill", diameter: 8 }, target: { solids: [part] } })
    const gouge = r.issues.find((i) => i.code === "Gouge")!
    expect(gouge.severity).toBe("error")
    expect(r.stats.maxGouge).toBeCloseTo(0.5, 2)
    expect(r.preview.gouge.some((f) => f === 1)).toBe(true)
    expect(r.ok).toBe(false)
  })

  test("not cutting at all leaves uncut stock, as information only", () => {
    const r = run("G0 X0 Y0 Z5", { target: { solids: [part] } })
    expect(r.ok).toBe(true)
    expect(codes(r)).toContain("UncutStock")
  })
})

describe("verifyToolpath: IR program", () => {
  const program = (moves: ReadonlyArray<import("../ir.ts").Move>) =>
    makeProgram("p", [{ id: "t1", name: "slot", toolId: "1", spindleRpm: 8000, coolant: "off", moves }])

  test("replays the same removal as the equivalent G-code", () => {
    const fromIr = verifyToolpath({ ...base, program: program([
      { _tag: "Rapid", to: { x: -10, y: 0, z: 5 } },
      { _tag: "Linear", to: { x: -10, y: 0, z: -3 }, feed: 200 },
      { _tag: "Linear", to: { x: 10, y: 0, z: -3 }, feed: 400 },
      { _tag: "Rapid", to: { x: 10, y: 0, z: 5 } }
    ]) })
    const fromText = run("G0 X-10 Y0 Z5\nG1 Z-3 F200\nG1 X10 F400\nG0 Z5")
    expect(fromIr.stats.removedVolume).toBeCloseTo(fromText.stats.removedVolume, 3)
  })

  test("expands drilling cycles and flags a rapid into material", () => {
    const ok = verifyToolpath({ ...base, program: program([
      { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } },
      { _tag: "Cycle", cycle: "peck", to: { x: 0, y: 0, z: -5 }, feed: 100, peckDepth: 2, dwellSeconds: 0, retractHeight: 2 }
    ]) })
    expect(ok.ok).toBe(true)
    expect(ok.stats.removedVolume).toBeGreaterThan(Math.PI * 4 * 5 * 0.9)
    const bad = verifyToolpath({ ...base, program: program([
      { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } },
      { _tag: "Rapid", to: { x: 0, y: 0, z: -2 } }
    ]) })
    expect(codes(bad)).toContain("RapidInMaterial")
  })
})

describe("verifyToolpath: input and budget", () => {
  test("exactly one of gcode / program", () => {
    expect(verifyToolpath({ ...base }).issues[0]?.code).toBe("InvalidInput")
    expect(verifyToolpath({ ...base, gcode: "", program: { name: "p", units: "mm", workOffset: "G54", toolpaths: [] } }).ok).toBe(false)
  })

  test("a degenerate stock is rejected, not simulated", () => {
    const r = verifyToolpath({ ...base, gcode: "G0 X0", stock: { ...stock, minX: 5, maxX: 5 } })
    expect(r.issues[0]?.code).toBe("InvalidInput")
  })

  test("a huge program coarsens the grid instead of running forever", () => {
    const lines = Array.from({ length: 4000 }, (_, i) => `G1 X${(i % 2) * 30 - 15} Y${(i % 37) - 18} Z-0.5 F300`)
    const started = performance.now()
    const r = verifyToolpath({ ...base, resolution: 0.01, gcode: ["G0 X0 Y0 Z5", ...lines].join("\n") })
    expect(performance.now() - started).toBeLessThan(20000)
    expect(codes(r)).toContain("ResolutionCoarsened")
    expect(r.stats.cellSize).toBeGreaterThan(0.01)
  }, 30000)

  test("the preview is bounded and covers the stock", () => {
    const r = run("G0 X0 Y0 Z5")
    expect(r.preview.nx).toBeLessThanOrEqual(64)
    expect(r.preview.ny).toBeLessThanOrEqual(64)
    expect(r.preview.heights.length).toBe(r.preview.nx * r.preview.ny)
    expect(r.preview.maxZ).toBeCloseTo(0, 6)
  })

  test("the same request gives the same report", () => {
    const gcode = "G0 X-10 Y0 Z5\nG1 Z-3 F200\nG1 X10 F400"
    expect(run(gcode)).toEqual(run(gcode))
  })
})

describe("verifyToolpath: from a generator request", () => {
  test("a generated profile verifies against its own stock", () => {
    const generate = {
      settings: generator.decodeSettings({ operationType: "contour", toolDiameter: 6, depth: 3, stepdown: 1, offset: "outside" }),
      geometry: {
        geometryType: "selected" as const,
        selectedElements: [{ type: "rectangle", x: 0, y: 0, width: 30, height: 20, depth: 3 }],
        stock: { width: 50, height: 40, depth: 10, x: 0, y: 0, topZ: 0, allowance: 1 }
      },
      printer: generator.DEFAULT_PRINTER_EXTRAS
    } as never
    const out = generator.generateToolpath(generate)
    const built = verifyRequestFor(generate, out.response.gcode)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.request.stock).toEqual({ minX: -25, maxX: 25, minY: -20, maxY: 20, minZ: -10, maxZ: 0 })
    const r = verifyToolpath(built.request)
    expect(r.stats.removedVolume).toBeGreaterThan(0)
    expect(codes(r)).not.toContain("RapidInMaterial")
    expect(codes(r)).not.toContain("BelowStock")
  })

  test("lathe and printer settings are refused", () => {
    const settings = generator.decodeSettings({ machineType: "lathe", operationType: "turning" })
    const built = verifyRequestFor({ settings, geometry: generator.DEFAULT_GEOMETRY, printer: generator.DEFAULT_PRINTER_EXTRAS } as never, "")
    expect(built.ok).toBe(false)
  })
})
