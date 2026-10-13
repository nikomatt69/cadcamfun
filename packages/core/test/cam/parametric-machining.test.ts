import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "../../src/cad/recipes.ts"
import type { History } from "../../src/cad/history.ts"
import { DEFAULT_GEOMETRY, DEFAULT_PRINTER_EXTRAS, DEFAULT_SETTINGS, generateToolpath } from "../../src/cam/generator/index.ts"
import { historyFeatures } from "../../src/cam/generator/history-features.ts"
import { verifyRequestFor, verifyToolpath } from "../../src/cam/verify/index.ts"

setDefaultTimeout(90_000)

/**
 * A parametric part is machined from its feature history: the holes, outlines, pockets and turned profile the kernel built, not
 * a bounding box. Every number below follows from the model and the stock: a 120 x 80 x 12 plate with four M5 counterbored
 * holes 11 mm from the edges and an M5 tapped hole in the middle, the stock centred on the plate (the machine origin is the
 * stock centre), its top at the plate's top.
 */
const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
const plateHistory: History = {
  parameters: { ...recipe.history.parameters, tap: 4.2 },
  features: [...recipe.history.features, { id: "tapped", type: "hole", plane: "XY", offset: "thick", at: ["width / 2", "depth / 2"], diameter: "tap", depth: "thick" }]
}
const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, history: plateHistory }
const plateStock = { width: 126, height: 86, depth: 14, radius: 0, x: 60, y: 40, topZ: 0, allowance: 1 }

const shaftRecipe = buildRecipe("stepped_shaft", { sections: [{ diameter: 30, length: 40 }, { diameter: 25, length: 60 }, { diameter: 20, length: 30 }], keywaySection: 1 })
const shaft = { id: "shaft", type: "parametric", name: "Shaft", x: 0, y: 0, z: 0, history: shaftRecipe.history }

const run = (element: Record<string, unknown>, over: Record<string, unknown>, stock: Record<string, unknown> | undefined = plateStock) =>
  generateToolpath({
    settings: { ...DEFAULT_SETTINGS, toolType: "endmill", toolDiameter: 6, depth: 12, stepdown: 2, ...over } as never,
    geometry: { ...DEFAULT_GEOMETRY, geometryType: "selected", selectedElements: [element] as never, ...(stock ? { stock } : {}) } as never,
    printer: DEFAULT_PRINTER_EXTRAS
  })

/** Positions the program reaches (absolute X Y Z, modal), with the motion word that got there. */
const positions = (gcode: string) => {
  const at = { x: 0, y: 0, z: 0 }
  const out: Array<{ g: number; x: number; y: number; z: number }> = []
  let g = 0
  for (const raw of gcode.split("\n")) {
    const line = raw.replace(/;.*$/, "").trim()
    if (line === "") continue
    const word = (l: string) => { const m = line.match(new RegExp(`${l}(-?\\d+(?:\\.\\d+)?)`)); return m ? Number(m[1]) : undefined }
    const gw = line.match(/^G0*([0-3])\b/)
    if (gw) g = Number(gw[1])
    if (/^G(8[0-9])/.test(line)) continue
    const x = word("X"), y = word("Y"), z = word("Z")
    if (x === undefined && y === undefined && z === undefined) continue
    if (x !== undefined) at.x = x
    if (y !== undefined) at.y = y
    if (z !== undefined) at.z = z
    out.push({ g, ...at })
  }
  return out
}
const cycles = (gcode: string) => [...gcode.matchAll(/^G8[13] X(-?[\d.]+) Y(-?[\d.]+) Z(-?[\d.]+) R(-?[\d.]+)/gm)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), z: Number(m[3]), r: Number(m[4]) }))
const cuts = (gcode: string) => positions(gcode).filter((p) => p.g !== 0)

describe("the machining features of a parametric part come from its history", () => {
  test("holes (patterns and kinds), outline and turned profile in world coordinates", () => {
    const f = historyFeatures(plate)!
    expect(f.holes).toHaveLength(5)
    expect(f.holes.filter((h) => h.kind === "counterbore").map((h) => [h.entry.x, h.entry.y]).sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!)).toEqual([[11, 11], [11, 69], [109, 11], [109, 69]])
    for (const h of f.holes) expect(h.direction).toEqual({ x: 0, y: 0, z: -1 })
    expect(f.holes.find((h) => h.source === "tapped")).toMatchObject({ entry: { x: 60, y: 40, z: 12 }, diameter: 4.2, depth: 12 })
    expect(f.outlines).toHaveLength(1)
    expect(f.outlines[0]).toMatchObject({ top: 12, bottom: 0 })
    const moved = historyFeatures({ ...plate, x: 5, y: -3, z: 2 })!
    expect(moved.holes.find((h) => h.source === "tapped")!.entry).toEqual({ x: 65, y: 37, z: 14 })
    const s = historyFeatures(shaft)!
    expect(s.turned).toHaveLength(1)
    expect(s.turned[0]!.end - s.turned[0]!.start).toBeCloseTo(130, 6)
    expect(s.turned[0]!.maxDiameter).toBeCloseTo(30, 6)
    expect(s.pockets.map((p) => p.feature)).toEqual(["keyway"])
  })

  test("a rotated part has no feature derivation (its world geometry is not the history moved)", () => {
    expect(historyFeatures({ ...plate, rotation: { x: 0, y: 0, z: 30 } })).toBeUndefined()
  })

  test("a revolution on a custom work plane reports the unsupported turning setup", () => {
    const history: History = {
      parameters: {},
      features: [
        { id: "tilted", type: "plane", from: { kind: "angle", base: "ZX", angle: 30, about: "u" } },
        { id: "profile", type: "sketch", plane: "tilted", sketch: { entities: [], constraints: [], shapes: [
          { id: "section", kind: "rectangle", at: [3, 0], width: 2, height: 4 }
        ] } },
        { id: "body", type: "revolve", sketch: "profile", axis: "y", operation: "new" }
      ]
    }
    const features = historyFeatures({ id: "tilted-part", type: "parametric", history })
    expect(features).toBeDefined()
    expect(features!.bounds).toBeDefined()
    expect(features!.turned).toEqual([])
    expect(features!.notes).toContain("body: turning on a custom work plane requires the surface path or an indexed setup")
  })
})

describe("drilling a parametric part drills its holes", () => {
  test("one cycle per hole feature, at the hole, to the hole's bottom", () => {
    const out = run(plate, { operationType: "drill", toolType: "drill", toolDiameter: 4.2, stepdown: 3 })
    expect(out.error).toBeUndefined()
    const found = cycles(out.response.gcode)
    expect(found).toHaveLength(5)
    const xy = found.map((c) => [c.x, c.y]).sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!)
    expect(xy).toEqual([[-49, -29], [-49, 29], [0, 0], [49, -29], [49, 29]])
    for (const c of found) { expect(c.z).toBeCloseTo(-12, 6); expect(c.r).toBeCloseTo(2, 6) }
  })

  test("with the stock top above Z0 the R plane and the bottom follow the part, never inside it", () => {
    const out = run(plate, { operationType: "drill", toolType: "drill", toolDiameter: 4.2, stepdown: 3 }, { ...plateStock, topZ: 12 })
    for (const c of cycles(out.response.gcode)) { expect(c.z).toBeCloseTo(0, 6); expect(c.r).toBeCloseTo(14, 6) }
  })
})

describe("contour and pocket follow the model", () => {
  test("the contour goes round the 120 x 80 outline, one tool radius outside, to the requested depth", () => {
    const out = run(plate, { operationType: "contour", depth: 12 })
    expect(out.response.gcode).not.toMatch(/Generic rectangular contour/)
    const c = cuts(out.response.gcode)
    const xs = c.map((p) => p.x), ys = c.map((p) => p.y)
    // One tool radius (3) outside the outline; the tangent lead-in arc (radius 3) may reach one diameter further.
    expect(Math.min(...xs)).toBeLessThanOrEqual(-63 + 0.05)
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(63 - 0.05)
    expect(Math.min(...ys)).toBeLessThanOrEqual(-43 + 0.05)
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(43 - 0.05)
    for (const v of xs) expect(Math.abs(v)).toBeLessThanOrEqual(63 + 6 + 0.05)
    for (const v of ys) expect(Math.abs(v)).toBeLessThanOrEqual(43 + 6 + 0.05)
    expect(Math.min(...c.map((p) => p.z))).toBeCloseTo(-12, 6)
    // Nothing inside the plate outline at cutting depth.
    expect(c.filter((p) => p.z < -0.01 && Math.abs(p.x) < 60 - 1e-6 && Math.abs(p.y) < 40 - 1e-6)).toEqual([])
  })

  test("the pocket clears the four counterbores to their 5.7 mm floor and stays inside them", () => {
    const out = run(plate, { operationType: "pocket", toolDiameter: 6, depth: 12, stepdown: 2 })
    expect(out.response.gcode).not.toMatch(/Generic rectangular contour|not available/)
    const c = cuts(out.response.gcode).filter((p) => p.z < -0.01)
    expect(c.length).toBeGreaterThan(20)
    expect(Math.min(...c.map((p) => p.z))).toBeCloseTo(-5.7, 3)
    const centres = [[-49, -29], [-49, 29], [49, -29], [49, 29]]
    for (const p of c) {
      const nearest = Math.min(...centres.map(([x, y]) => Math.hypot(p.x - x!, p.y - y!)))
      expect(nearest).toBeLessThanOrEqual(5 - 3 + 1e-3)
    }
  })

  test("a requested depth shallower than the model's floor stops there", () => {
    const out = run(plate, { operationType: "pocket", toolDiameter: 6, depth: 3, stepdown: 1 })
    expect(Math.min(...cuts(out.response.gcode).map((p) => p.z))).toBeCloseTo(-3, 6)
  })

  test("the keyway of a shaft lying along X is pocketed to its DIN 6885 floor", () => {
    // The shaft's top (Z15, the 30 mm section) is the stock top; the keyway floor is 12.5 - 4 = 8.5 above the axis.
    const out = run(shaft, { operationType: "pocket", toolDiameter: 6, depth: 20, stepdown: 1 }, { width: 140, height: 40, depth: 32, radius: 0, x: 65, y: 0, topZ: 15, allowance: 1 })
    const c = cuts(out.response.gcode).filter((p) => p.z < 15 - 0.01)
    expect(c.length).toBeGreaterThan(10)
    expect(Math.abs(Math.min(...c.map((p) => p.z)) - 8.5)).toBeLessThan(0.005)
    // Inside the 8 mm wide, 48 mm long slot (tool centre at most 4 - 3 = 1 mm off the slot's centre line).
    for (const p of c) expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-3)
  })
})

describe("thread milling a parametric part mills its tapped holes", () => {
  test("the 4.2 mm hole is an M5 x 0.8 thread at the centre; the clearance holes are left alone", () => {
    const out = run(plate, { operationType: "threading", toolType: "threadmill", toolDiameter: 3, threadType: "internal", threadPitch: 0.8 })
    expect(out.response.gcode).toMatch(/Thread M5x0\.8 in hole tapped/)
    const c = cuts(out.response.gcode).filter((p) => p.z < -0.01)
    expect(c.length).toBeGreaterThan(4)
    for (const p of c) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(2.5 + 1e-3)
  })
})

describe("turning a parametric shaft turns its profile", () => {
  const out = run(shaft, { machineType: "lathe", operationType: "turning", toolType: "endmill", depth: 10, stepdown: 1, stockDiameter: 50, stockLength: 100 }, undefined)
  const gcode = out.response.gcode

  test("the stock holds the part and the tool is a turning tool", () => {
    const stock = gcode.match(/; Stock: Ø([\d.]+)mm x ([\d.]+)mm/)!
    expect(Number(stock[1])).toBeGreaterThanOrEqual(30)
    expect(Number(stock[2])).toBeGreaterThanOrEqual(130)
    expect(gcode).toMatch(/; Tool: turning/)
  })

  test("the finishing pass follows 20, 25 and 30 mm and reaches the end of the part", () => {
    const finish = gcode.slice(gcode.indexOf("; Finishing pass"))
    expect(finish.length).toBeGreaterThan(20)
    const xs = [...finish.matchAll(/G1 X(-?[\d.]+)/g)].map((m) => Number(m[1]))
    for (const d of [20, 25, 30]) expect(xs.some((x) => Math.abs(x - d) < 0.01), `diameter ${d}`).toBe(true)
    const zs = [...gcode.matchAll(/Z(-?[\d.]+)/g)].map((m) => Number(m[1]))
    expect(Math.min(...zs)).toBeLessThanOrEqual(-130 + 1e-6)
    // Never below the finished diameter the profile has at that point (no gouge): the smallest X cut is the 20 mm end, less the chamfer.
    const cutXs = [...gcode.matchAll(/G1 X(-?[\d.]+)/g)].map((m) => Number(m[1]))
    expect(Math.min(...cutXs)).toBeGreaterThanOrEqual(20 - 2 * 1 - 1e-6)
  })
})

describe("3D surface roughing of a parametric plate", () => {
  const stock = { ...plateStock, depth: 14, topZ: 13 }
  const request = {
    settings: { ...DEFAULT_SETTINGS, operationType: "3d_surface", toolType: "endmill", toolDiameter: 6, depth: 13, stepdown: 2, surfaceStrategy: "roughing", finishingPass: false } as never,
    geometry: { ...DEFAULT_GEOMETRY, geometryType: "selected", selectedElements: [plate] as never, stock } as never,
    printer: DEFAULT_PRINTER_EXTRAS
  }
  const out = generateToolpath(request)

  test("every rapid stays above the stock until the tool is in a cleared region: verify finds no rapid in material", () => {
    const built = verifyRequestFor(request as never, out.response.gcode, {})
    expect(built.ok).toBe(true)
    if (!built.ok) return
    const report = verifyToolpath(built.request)
    expect(report.issues.filter((i) => i.code === "RapidInMaterial")).toEqual([])
    // A safe starting pose must not hide an unsafe first commanded clearance.
    const unsafe = verifyToolpath({ ...built.request, gcode: out.response.gcode.replace("G0 Z23.000 ; Move to safe height", "G0 Z10 ; Move to safe height") })
    expect(unsafe.issues.some((i) => i.code === "RapidInMaterial")).toBe(true)
    const actualStart = verifyToolpath({ ...built.request, start: { x: 0, y: 0, z: 0 } })
    expect(actualStart.issues.some((i) => i.code === "RapidInMaterial")).toBe(true)
  })

  test("a sane program for a 120 x 80 x 12 plate: under 20 000 lines", () => {
    expect(out.response.gcode.split("\n").length).toBeLessThan(20_000)
  })
})
