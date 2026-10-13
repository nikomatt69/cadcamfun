import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { dimensionsOf, removeFeature, setDimension } from "./history-edit.ts"
import { historyVolume, rebuild, type History } from "./history.ts"
import { findPlanarFace } from "./face-edit.ts"
import { developedLength, faceOffsets, flatPatternDrawing, flatPatternDxf, roundCorners, sheetOutline, thickenPath, withHems } from "./sheet-metal.ts"
import { parseDxf } from "./dxf.ts"
import { model, runModelScript } from "./script.ts"
import { meshBounds, meshVolume } from "./solid.ts"
import { ridgeVolumePerTurn, threadProblem, threadSizes, threadTool } from "./thread.ts"
import { textSolid } from "./text-solid.ts"
import { signedArea } from "./shapes.ts"

// Booleans on real parts take seconds each on a loaded machine, not milliseconds.
setDefaultTimeout(60_000)

const rel = (got: number, want: number): number => Math.abs(got - want) / Math.abs(want)
const L = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }]
/** The area of a quarter-turn bend between radii `r` and `r + t`. */
const quarter = (r: number, t: number): number => (Math.PI / 4) * ((r + t) ** 2 - r ** 2)

describe("sheet metal outline", () => {
  test("a strip of a straight line is a rectangle of length x thickness, counter-clockwise", () => {
    const ring = thickenPath([{ x: 0, y: 0 }, { x: 40, y: 0 }], -1, 1)
    expect(Math.abs(signedArea(ring))).toBeCloseTo(80, 9)
    expect(signedArea(ring)).toBeGreaterThan(0)
  })

  test("offsets: centre is symmetric, right is 0..t, left is -t..0", () => {
    expect(faceOffsets(2, "centre")).toEqual([-1, 1])
    expect(faceOffsets(2, "right")).toEqual([0, 2])
    expect(faceOffsets(2, "left")).toEqual([-2, 0])
  })

  test("a sharp L is mitred: area = t x centre-line length", () => {
    const ring = sheetOutline(L, 2, "centre", 0)
    expect(ring).toHaveLength(6)
    expect(Math.abs(signedArea(ring))).toBeCloseTo(2 * 50, 6)
  })

  test("the INSIDE radius is the same whichever side the material is on: centre, outside of the bend and inside of the bend", () => {
    // Quarter bend of inside radius 3 and thickness 2: arc area (pi/4)(5^2 - 3^2); straight runs are what is left of 50 mm.
    expect(Math.abs(signedArea(sheetOutline(L, 2, "centre", 3)))).toBeCloseTo(2 * (50 - 2 * 4) + quarter(3, 2), 1)
    expect(Math.abs(signedArea(sheetOutline(L, 2, "right", 3)))).toBeCloseTo(2 * (50 - 2 * 3) + quarter(3, 2), 1)
    expect(Math.abs(signedArea(sheetOutline(L, 2, "left", 3)))).toBeCloseTo(2 * (50 - 2 * 5) + quarter(3, 2), 1)
  })

  test("a bend that needs more straight run than there is is refused with the run named", () => {
    expect(() => sheetOutline([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 20 }], 2, "centre", 10)).toThrow(/straight run 1/)
  })

  test("a thickness the bend cannot hold (the offset curve crosses itself) is refused, not silently wrong", () => {
    expect(() => sheetOutline([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }], 2, "left", 0.2)).not.toThrow()
    expect(() => roundCorners(L, () => -1)).toThrow(/positive/)
  })

  test("flat pattern: straight runs + bend allowance angle (r + k t)", () => {
    const d = developedLength(L, 2, 3, "centre", 0.44)
    expect(d.straight).toBeCloseTo(42, 9)
    expect(d.bends).toHaveLength(1)
    expect(d.length).toBeCloseTo(42 + (Math.PI / 2) * (3 + 0.88), 9)
  })

  test("flat pattern of a straight strip is its length; a sharp corner counts as a zero-radius bend", () => {
    expect(developedLength([{ x: 0, y: 0 }, { x: 25, y: 0 }], 1, 1).length).toBe(25)
    const sharp = developedLength(L, 2, 0, "centre", 0.33)
    expect(sharp.straight).toBeCloseTo(50 - 2 * 1, 9)
  })
})

describe("sheet feature", () => {
  const strip = (side: "centre" | "left" | "right", extra: Record<string, unknown> = {}) => {
    const m = model()
    const s = m.sketch("XY").path([[0, 0], [30, 0], [30, 20]])
    m.sheet(s, { thickness: 2, width: 25, bendRadius: 3, side, ...extra })
    return m.rebuild()
  }
  test("volume = flange width x cross-section area, for the three sides", () => {
    expect(rel(historyVolume(strip("centre")), 25 * (2 * 42 + quarter(3, 2)))).toBeLessThan(2e-3)
    expect(rel(historyVolume(strip("right")), 25 * (2 * 44 + quarter(3, 2)))).toBeLessThan(2e-3)
    expect(rel(historyVolume(strip("left")), 25 * (2 * 40 + quarter(3, 2)))).toBeLessThan(2e-3)
  })

  test("the flat pattern is reported next to the bodies", () => {
    const r = strip("centre")
    expect(r.issues).toEqual([])
    expect(r.flatPatterns["sheet1"]!.length).toBeCloseTo(42 + (Math.PI / 2) * 3.88, 6)
  })

  test("width is along the sketch normal", () => {
    const b = meshBounds(strip("centre").bodies[0]!.mesh)
    expect(b.maxZ - b.minZ).toBeCloseTo(25, 6)
  })

  test("more than one open line, or none, is an error that says so", () => {
    const m = model()
    m.sketch("XY").path([[0, 0], [10, 0]], { id: "a" }).path([[0, 5], [10, 5]], { id: "b" })
    m.sheet("sketch1", { thickness: 1, width: 5 })
    expect(m.rebuild().issues.map((i) => i.message).join(" ")).toMatch(/one open line.*has 2/)
  })

  test("a non-positive thickness is rejected", () => {
    expect(strip("centre", { thickness: 0 }).issues[0]!.message).toMatch(/positive thickness/)
  })
})

describe("rib", () => {
  const plate = () => {
    const m = model()
    m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10 })
    return m
  }
  test("a rib stands on the plate: volume = plate + length x thickness x height", () => {
    const m = plate()
    m.rib(m.sketch("XY", 10).path([[5, 15], [35, 15]]), { thickness: 3, depth: 8 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    expect(rel(historyVolume(r), 40 * 30 * 10 + 30 * 3 * 8)).toBeLessThan(1e-6)
    expect(r.bodies).toHaveLength(1)
  })

  test("a bent rib (an L of centre lines) has the volume of its mitred outline", () => {
    const m = plate()
    m.rib(m.sketch("XY", 10).path([[5, 5], [35, 5], [35, 25]]), { thickness: 2, depth: 4 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    expect(rel(historyVolume(r), 40 * 30 * 10 + 4 * 2 * 50)).toBeLessThan(1e-6)
  })

  test("symmetric direction straddles the sketch plane", () => {
    const m = model()
    m.rib(m.sketch("XY").path([[0, 0], [10, 0]]), { thickness: 2, depth: 6, direction: "symmetric", operation: "new" })
    const b = meshBounds(m.rebuild().bodies[0]!.mesh)
    expect(b.minZ).toBeCloseTo(-3, 9)
    expect(b.maxZ).toBeCloseTo(3, 9)
  })

  test("a sketch with only closed loops is not a rib", () => {
    const m = plate()
    m.rib(m.sketch("XY", 10).rectangle([5, 5], 10, 10), { thickness: 2, depth: 4 })
    expect(m.rebuild().issues.some((i) => /open line/.test(i.message))).toBe(true)
  })
})

describe("modelled thread", () => {
  test("ISO sizes: M10 x 1.5 has d3 = 8.160 and the root and crest widths of the 60 degree profile", () => {
    const s = threadSizes(10, 1.5, false)
    expect(s.minor).toBeCloseTo(10 - 1.22687 * 1.5, 4)
    expect(s.crestWidth).toBeCloseTo(1.5 / 8, 9)
    expect(s.rootWidth + 0).toBeLessThan(1.5)
    expect(threadSizes(10, 1.5, true).minor).toBeCloseTo(10 - 1.08253 * 1.5, 4)
  })

  test("an external M10 x 1.5 x 15 rod: bounds are the major diameter and the length, volume within 1.5 % of core + ridge", () => {
    const rod = threadTool({ diameter: 10, pitch: 1.5, length: 15, internal: false })
    const b = meshBounds(rod)
    expect(b.minZ).toBeCloseTo(0, 6)
    expect(b.maxZ).toBeCloseTo(15, 6)
    expect(b.maxX).toBeCloseTo(5, 2)
    expect(b.minY).toBeCloseTo(-5, 2)
    const s = threadSizes(10, 1.5, false)
    const expected = Math.PI * (s.minor / 2) ** 2 * 15 + ridgeVolumePerTurn(10, 1.5, false) * 10
    expect(rel(meshVolume(rod), expected)).toBeLessThan(0.015)
  })

  test("the ridge advances one pitch per turn: slicing the rod one pitch apart gives the same section area", () => {
    const rod = threadTool({ diameter: 10, pitch: 1.5, length: 30, internal: false })
    const slab = (z0: number) => meshVolume(cutZ(rod, z0, z0 + 1.5))
    expect(rel(slab(5), slab(6.5))).toBeLessThan(0.01)
    expect(rel(slab(5), slab(8))).toBeLessThan(0.01)
  }, 60_000)

  test("a left-handed thread has the volume of the right-handed one and is its mirror image", () => {
    const right = threadTool({ diameter: 8, pitch: 1.25, length: 10, internal: false })
    const left = threadTool({ diameter: 8, pitch: 1.25, length: 10, internal: false, left: true })
    expect(rel(meshVolume(left), meshVolume(right))).toBeLessThan(0.01)
    // A quarter of a pitch up, the crest of a right-handed thread has turned +90 degrees about Z, a left-handed one -90.
    const quarter = (m: typeof right) => {
      let d = ridgeAngleAt(m, 5 + 1.25 / 4) - ridgeAngleAt(m, 5)
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      return d
    }
    expect(Math.abs(quarter(right) - Math.PI / 2)).toBeLessThan(0.3)
    expect(Math.abs(quarter(left) + Math.PI / 2)).toBeLessThan(0.3)
  }, 60_000)

  test("an internal thread is a tool for a tapped hole: core at the tap drill diameter, cut into a plate", () => {
    const m = model()
    m.extrude(m.sketch("XY").rectangle([0, 0], 30, 30), { depth: 10 })
    const id = m.thread({ kind: "internal", diameter: 8, pitch: 1.25, length: 6, at: [15, 15], offset: 3 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    const tool = threadTool({ diameter: 8, pitch: 1.25, length: 6, internal: true, cx: 15, cy: 15, z0: 3 })
    expect(rel(historyVolume(r), 9000 - meshVolume(tool))).toBeLessThan(1e-4)
    expect(id).toBe("thread1")
    const sizes = threadSizes(8, 1.25, true)
    expect(rel(meshVolume(tool), Math.PI * (sizes.minor / 2) ** 2 * 6 + ridgeVolumePerTurn(8, 1.25, true) * (6 / 1.25))).toBeLessThan(0.02)
  })

  test("a pitch too coarse for the diameter, or too many turns, is an error", () => {
    expect(threadProblem({ diameter: 4, pitch: 3, length: 5, internal: false })).toMatch(/too coarse/)
    expect(threadProblem({ diameter: 10, pitch: 1, length: 100, internal: false })).toMatch(/at most/)
    expect(threadProblem({ diameter: 0, pitch: 1, length: 5, internal: false })).toMatch(/positive/)
    const m = model()
    m.thread({ kind: "external", diameter: 10, pitch: 8, length: 5 })
    expect(m.rebuild().issues[0]!.message).toMatch(/too coarse/)
  })
})

describe("text", () => {
  test("a text solid is as wide as the font says and the stroke is as thick as asked", () => {
    const t = textSolid({ text: "HI", height: 10, strokeWidth: 1, depth: 2 })
    const b = meshBounds(t.mesh!)
    expect(b.maxZ).toBeCloseTo(2, 9)
    expect(b.minZ).toBeCloseTo(0, 9)
    // The strokes' square ends reach half a stroke past the glyph box.
    expect(b.maxY - b.minY).toBeGreaterThan(10)
    expect(b.maxY - b.minY).toBeLessThan(11.1)
    expect(t.width).toBeGreaterThan(10)
    expect(meshVolume(t.mesh!)).toBeGreaterThan(0)
  })

  test("letters without a glyph are reported and not drawn; an all-blank text has no solid", () => {
    expect(textSolid({ text: "A~", height: 8, strokeWidth: 1, depth: 1 }).unsupported).toEqual(["~"])
    expect(textSolid({ text: "   ", height: 8, strokeWidth: 1, depth: 1 }).mesh).toBeUndefined()
  })

  test("embossed on a face the volume grows by the text's own volume; engraved it shrinks by it", () => {
    const spec = { text: "CAD 12", height: 8, strokeWidth: 1, depth: 1 }
    const own = meshVolume(textSolid(spec).mesh!)
    const plate = () => { const m = model(); m.extrude(m.sketch("XY").rectangle([0, 0], 60, 30), { depth: 10 }); return m }
    const up = plate()
    up.text({ ...spec, plane: "XY", offset: 10, at: [30, 15], align: "centre" })
    const grown = up.rebuild()
    expect(grown.issues).toEqual([])
    expect(rel(historyVolume(grown), 60 * 30 * 10 + own)).toBeLessThan(1e-4)
    const down = plate()
    down.text({ ...spec, plane: "XY", offset: 10, at: [30, 15], align: "centre", direction: "down", operation: "subtract" })
    expect(rel(historyVolume(down.rebuild()), 60 * 30 * 10 - own)).toBeLessThan(1e-4)
  })

  test("text can stand on any plane: on YZ it grows along X", () => {
    const m = model()
    m.text({ text: "A", height: 6, depth: 2, plane: "YZ", offset: 5, operation: "new" })
    const b = meshBounds(m.rebuild().bodies[0]!.mesh)
    expect(b.minX).toBeCloseTo(5, 9)
    expect(b.maxX).toBeCloseTo(7, 9)
  })

  test("bad measures and empty text are reported as issues", () => {
    const m = model()
    m.text({ text: "", height: 5, depth: 1, plane: "XY", operation: "new", id: "empty" })
    m.text({ text: "X", height: 0, depth: 1, plane: "XY", operation: "new", id: "flat" })
    const messages = m.rebuild().issues.map((i) => `${i.feature}: ${i.message}`)
    expect(messages).toContain("empty: The text is empty")
    expect(messages.some((x) => x.startsWith("flat:") && /positive/.test(x))).toBe(true)
  })
})

describe("planar faces and press/pull", () => {
  const box = () => { const m = model(); m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10 }); return m }
  const withHole = () => {
    const m = model()
    m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30).circle([20, 15], 10), { depth: 10 })
    return m
  }

  test("the top face of a box: normal +z, one outline of 4 corners, area 1200", () => {
    const r = box().rebuild()
    const found = findPlanarFace(r.bodies[0]!.mesh, { near: { x: 5, y: 5, z: 10 }, normal: { x: 0, y: 0, z: 1 } })
    if ("error" in found) throw new Error(found.error)
    expect(found.face.normal.z).toBeCloseTo(1, 9)
    expect(found.face.loops).toHaveLength(1)
    expect(found.face.loops[0]).toHaveLength(4)
    expect(found.face.area).toBeCloseTo(1200, 6)
  })

  test("a face with a hole has two outlines and the area without the hole", () => {
    const r = withHole().rebuild()
    const found = findPlanarFace(r.bodies[0]!.mesh, { near: { x: 2, y: 2, z: 10 }, normal: { x: 0, y: 0, z: 1 } })
    if ("error" in found) throw new Error(found.error)
    expect(found.face.loops).toHaveLength(2)
    const hole = Math.PI * 25
    expect(rel(found.face.area, 1200 - hole)).toBeLessThan(0.01)
  })

  test("the normal chooses between the top and the bottom face at the same point", () => {
    const r = box().rebuild()
    const down = findPlanarFace(r.bodies[0]!.mesh, { near: { x: 20, y: 15, z: 5 }, normal: { x: 0, y: 0, z: -1 } })
    if ("error" in down) throw new Error(down.error)
    expect(down.face.normal.z).toBeCloseTo(-1, 9)
    expect(down.face.origin.z).toBeCloseTo(0, 9)
  })

  test("pull the top face up 5: the box becomes 15 high", () => {
    const m = box()
    m.pushPull({ near: [20, 15, 10], normal: [0, 0, 1], distance: 5 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    expect(rel(historyVolume(r), 40 * 30 * 15)).toBeLessThan(1e-6)
    expect(meshBounds(r.bodies[0]!.mesh).maxZ).toBeCloseTo(15, 6)
  })

  test("push a side face in 5: the box is 35 long", () => {
    const m = box()
    m.pushPull({ near: [40, 15, 5], normal: [1, 0, 0], distance: -5 })
    const r = m.rebuild()
    expect(rel(historyVolume(r), 35 * 30 * 10)).toBeLessThan(1e-6)
    expect(meshBounds(r.bodies[0]!.mesh).maxX).toBeCloseTo(35, 6)
  })

  test("pulling a face with a hole keeps the hole: volume grows by the face area x distance", () => {
    const m = withHole()
    const base = historyVolume(m.rebuild())
    const found = findPlanarFace(m.rebuild().bodies[0]!.mesh, { near: { x: 2, y: 2, z: 10 }, normal: { x: 0, y: 0, z: 1 } })
    if ("error" in found) throw new Error(found.error)
    m.pushPull({ near: [2, 2, 10], normal: [0, 0, 1], distance: 3 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    expect(rel(historyVolume(r), base + 3 * found.face.area)).toBeLessThan(1e-4)
  })

  test("a face that is not there, or a push of 0, is reported", () => {
    const m = box()
    m.pushPull({ near: [20, 15, 10], distance: 1, body: "nope", id: "a" })
    m.pushPull({ near: [20, 15, 10], distance: 0, id: "b" })
    const msgs = m.rebuild().issues.map((i) => `${i.feature}: ${i.message}`)
    expect(msgs.some((x) => x.startsWith("a:") && /does not exist/.test(x))).toBe(true)
    expect(msgs.some((x) => x.startsWith("b:") && /changes nothing/.test(x))).toBe(true)
  })

  test("a box pushed twice and then widened by editing the dimension rebuilds", () => {
    const m = box()
    m.pushPull({ near: [20, 15, 10], normal: [0, 0, 1], distance: "grow" })
    m.param("grow", 4)
    const h = m.build()
    expect(rel(historyVolume(rebuild(h)), 40 * 30 * 14)).toBeLessThan(1e-6)
    const edited = setDimension(h, "pushpull1", "distance", 10)
    expect(rel(historyVolume(rebuild(edited)), 40 * 30 * 20)).toBeLessThan(1e-6)
  })
})

describe("scripting API", () => {
  test("the builder writes the same history a person would, with generated ids and the first solid new, the rest unions", () => {
    const m = model()
    m.param("width", 60).param("half", "width / 2")
    const s = m.sketch("XY").rectangle([0, 0], "width", 40)
    const base = m.extrude(s, { depth: 12 })
    const boss = m.extrude(m.sketch("XY", 12).circle(["half", 20], 20), { depth: 8 })
    const h = m.build()
    expect([base, boss]).toEqual(["extrude1", "extrude2"])
    expect(h.features.map((f) => f.id)).toEqual(["sketch1", "extrude1", "sketch2", "extrude2"])
    expect(h.features.filter((f) => f.type === "extrude").map((f) => (f as { operation: string }).operation)).toEqual(["new", "union"])
    const r = rebuild(h)
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    expect(rel(historyVolume(r), 60 * 40 * 12 + Math.PI * 100 * 8)).toBeLessThan(0.01)
  })

  test("changing a parameter replays the part", () => {
    const m = model()
    m.param("w", 20)
    m.extrude(m.sketch("XY").rectangle([0, 0], "w", 10), { depth: 5 })
    expect(historyVolume(m.rebuild())).toBeCloseTo(1000, 6)
    m.param("w", 30)
    expect(historyVolume(m.rebuild())).toBeCloseTo(1500, 6)
  })

  test("a shape added after the sketch was created still lands in the sketch", () => {
    const m = model()
    const s = m.sketch("XY")
    s.rectangle([0, 0], 10, 10)
    s.circle([20, 5], 6)
    const f = m.build().features[0]!
    expect(f.type === "sketch" && f.sketch.shapes?.map((x) => x.kind)).toEqual(["rectangle", "circle"])
  })

  test("a duplicate id is refused", () => {
    const m = model()
    m.sketch("XY", undefined, { id: "s" })
    expect(() => m.sketch("XY", undefined, { id: "s" })).toThrow(/already a feature 's'/)
  })

  test("fillet, chamfer, hole, pattern and mirror compose", () => {
    const m = model()
    m.extrude(m.sketch("XY").rectangle([0, 0], 60, 40), { depth: 10 })
    const hole = m.hole({ plane: "XY", offset: 10, at: [10, 10], diameter: 6, depth: 10 })
    m.pattern({ feature: hole, kind: "linear", count: 3, step: [20, 0, 0] })
    m.chamfer({ size: 1, edges: { parallel: "z" } })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    expect(m.build().features.map((f) => f.id)).toEqual(["sketch1", "extrude1", "hole1", "pattern1", "chamfer1"])
    const holes = 3 * Math.PI * 9 * 10
    expect(rel(historyVolume(r), 60 * 40 * 10 - holes - 4 * 0.5 * 10)).toBeLessThan(0.02)
  })

  test("runModelScript runs source text and returns the history; a script error propagates", () => {
    const h = runModelScript(`
      m.param("d", 12)
      const s = m.sketch("XY").circle([0, 0], "d")
      m.extrude(s, { depth: 20 })
      m.thread({ kind: "external", diameter: 8, pitch: 1.25, length: 10, offset: 20 })
    `)
    expect(h.features.map((f) => f.type)).toEqual(["sketch", "extrude", "thread"])
    expect(rebuild(h).issues).toEqual([])
    expect(() => runModelScript(`throw new Error("boom")`)).toThrow("boom")
    expect(runModelScript(`return { parameters: {}, features: [] }`).features).toEqual([])
  })

  test("a scripted part is editable like any other: dimensions are listed and dependants are removed with their sketch", () => {
    const m = model()
    const s = m.sketch("XY").path([[0, 0], [20, 0]])
    m.rib(s, { thickness: 2, depth: 5, operation: "new" })
    const h = m.build()
    const rib = h.features.find((f) => f.type === "rib")!
    expect(dimensionsOf(rib).map((d) => d.path)).toEqual(["thickness", "depth"])
    expect(removeFeature(h, "sketch1").features).toEqual([])
  })
})

/** The volume of the part of a mesh between two heights (the mesh intersected with a slab). */
import { booleanMesh } from "./csg.ts"
import { meshOf, type Mesh } from "./solid.ts"

function cutZ(mesh: Mesh, z0: number, z1: number): Mesh {
  const slab = meshOf({ _tag: "Extrude", profile: [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }], height: z1 - z0, origin: { x: 0, y: 0, z: z0 } } as never, 0.01)
  return booleanMesh(mesh, slab, "intersect")
}
/** The angle about Z at which the mesh reaches its largest radius within the slab around `z`. */
function ridgeAngleAt(mesh: Mesh, z: number): number {
  const part = cutZ(mesh, z - 0.01, z + 0.01)
  let best = -1, angle = 0
  for (let i = 0; i < part.positions.length; i += 3) {
    const x = part.positions[i]!, y = part.positions[i + 1]!, rr = Math.hypot(x, y)
    if (rr > best) { best = rr; angle = Math.atan2(y, x) }
  }
  return angle
}

describe("draft on a face of any body", () => {
  const wall = () => { const m = model(); m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10 }); return m }
  const tan5 = Math.tan((5 * Math.PI) / 180)

  test("a wall drafted about the foot leans back: it loses the wedge ½ h (h tan a) w", () => {
    const m = wall()
    m.draft({ near: [40, 15, 5], normal: [1, 0, 0], angle: 5 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    expect(rel(historyVolume(r), 12000 - 0.5 * 10 * (10 * tan5) * 30)).toBeLessThan(2e-4)
    const b = meshBounds(r.bodies[0]!.mesh)
    expect(b.maxX).toBeCloseTo(40, 6)
    // At the top the wall has moved in by h tan a.
    expect(rel(meshVolume(cutZ(r.bodies[0]!.mesh, 9.99, 10)) / 0.01, 30 * (40 - 10 * tan5))).toBeLessThan(0.01)
  })

  test("a neutral plane half way: what is taken off above is put on below, so the volume is unchanged and the foot grows", () => {
    const m = wall()
    m.draft({ near: [40, 15, 5], normal: [1, 0, 0], angle: 5, neutral: 5 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    expect(rel(historyVolume(r), 12000)).toBeLessThan(2e-4)
    expect(meshBounds(r.bodies[0]!.mesh).maxX).toBeCloseTo(40 + 5 * tan5, 3)
  })

  test("a negative angle leans the other way; the same volume change with the opposite sign", () => {
    const m = wall()
    m.draft({ near: [40, 15, 5], normal: [1, 0, 0], angle: -5 })
    expect(rel(historyVolume(m.rebuild()), 12000 + 0.5 * 10 * (10 * tan5) * 30)).toBeLessThan(2e-4)
  })

  test("a pull along X drafts the top face's neighbour: the side wall at y=30 with the pull along Y is square to it and refused", () => {
    const m = wall()
    m.draft({ near: [20, 30, 5], normal: [0, 1, 0], angle: 3, pull: [0, 1, 0] })
    expect(m.rebuild().issues[0]!.message).toMatch(/square to the pull direction/)
  })

  test("drafting every wall of a pocket/box one after the other narrows it evenly (a tapered box has the frustum volume)", () => {
    const m = wall()
    for (const [near, normal] of [[[40, 15, 5], [1, 0, 0]], [[0, 15, 5], [-1, 0, 0]], [[20, 30, 5], [0, 1, 0]], [[20, 0, 5], [0, -1, 0]]] as const) m.draft({ near, normal, angle: 4 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    const t = Math.tan((4 * Math.PI) / 180) * 10
    // Frustum of the rectangle 40 x 30 shrinking by t on every side over the height 10.
    const a0 = 40 * 30, a1 = (40 - 2 * t) * (30 - 2 * t)
    expect(rel(historyVolume(r), (10 / 3) * (a0 + a1 + Math.sqrt(a0 * a1)))).toBeLessThan(0.01)
  })

  test("the angle is limited and bad bodies are reported", () => {
    const m = wall()
    m.draft({ near: [40, 15, 5], angle: 60, id: "big" })
    m.draft({ near: [40, 15, 5], angle: 3, body: "ghost", id: "ghost" })
    const msgs = m.rebuild().issues.map((i) => `${i.feature}: ${i.message}`)
    expect(msgs.some((x) => x.startsWith("big:") && /between -45 and 45/.test(x))).toBe(true)
    expect(msgs.some((x) => x.startsWith("ghost:") && /does not exist/.test(x))).toBe(true)
  })
})

describe("mate (rigid joint) between bodies", () => {
  const two = () => {
    const m = model()
    const a = m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10 })
    const b = m.extrude(m.sketch("XY").rectangle([100, 100], 20, 20), { depth: 10, operation: "new" })
    return { m, a, b }
  }
  test("the bottom face of B lands on the top face of A, centres together", () => {
    const { m, a, b } = two()
    m.mate({ body: b, face: { near: [110, 110, 0], normal: [0, 0, -1] }, to: { body: a, near: [20, 15, 10], normal: [0, 0, 1] } })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    const box = meshBounds(r.bodies.find((x) => x.id === b)!.mesh)
    expect([box.minX, box.maxX, box.minY, box.maxY, box.minZ, box.maxZ].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([10, 30, 5, 25, 10, 20])
    expect(meshBounds(r.bodies.find((x) => x.id === a)!.mesh).maxZ).toBeCloseTo(10, 9)
    expect(historyVolume(r)).toBeCloseTo(12000 + 4000, 3)
  })

  test("a gap and a spin: B is lifted by the offset and turned about the common normal", () => {
    const { m, a, b } = two()
    m.mate({ body: b, face: { near: [110, 110, 0], normal: [0, 0, -1] }, to: { body: a, near: [20, 15, 10], normal: [0, 0, 1] }, offset: 2, spin: 90 })
    const box = meshBounds(m.rebuild().bodies.find((x) => x.id === b)!.mesh)
    expect(box.minZ).toBeCloseTo(12, 6)
    // A 20 x 20 square turned a quarter turn about its centre is the same square.
    expect(box.minX).toBeCloseTo(10, 5)
    expect(box.maxY).toBeCloseTo(25, 5)
  })

  test("a side face mates to a side face: the normals oppose after the turn, volume is kept", () => {
    const { m, a, b } = two()
    // B's top face (normal +z) is brought against A's +x wall: B turns a quarter turn about Y.
    m.mate({ body: b, face: { near: [110, 110, 10], normal: [0, 0, 1] }, to: { body: a, near: [40, 15, 5], normal: [1, 0, 0] } })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    const box = meshBounds(r.bodies.find((x) => x.id === b)!.mesh)
    expect(box.minX).toBeCloseTo(40, 5)
    expect((box.minY + box.maxY) / 2).toBeCloseTo(15, 5)
    expect((box.minZ + box.maxZ) / 2).toBeCloseTo(5, 5)
    expect(meshVolume(r.bodies.find((x) => x.id === b)!.mesh)).toBeCloseTo(4000, 3)
  })

  test("mating a body to itself, or to a body that does not exist, is an error", () => {
    const { m, a } = two()
    m.mate({ body: a, face: { near: [20, 15, 10] }, to: { body: a, near: [20, 15, 0] }, id: "self" })
    m.mate({ body: "ghost", face: { near: [0, 0, 0] }, to: { body: a, near: [20, 15, 0] }, id: "ghost" })
    const msgs = m.rebuild().issues.map((i) => `${i.feature}: ${i.message}`)
    expect(msgs.some((x) => x.startsWith("self:") && /itself/.test(x))).toBe(true)
    expect(msgs.some((x) => x.startsWith("ghost:") && /does not exist/.test(x))).toBe(true)
  })

  test("a joint follows the parameters: widening A moves where B lands", () => {
    const m = model()
    m.param("w", 40)
    const a = m.extrude(m.sketch("XY").rectangle([0, 0], "w", 30), { depth: 10 })
    const b = m.extrude(m.sketch("XY").rectangle([100, 100], 20, 20), { depth: 10, operation: "new" })
    m.mate({ body: b, face: { near: [110, 110, 0], normal: [0, 0, -1] }, to: { body: a, near: [20, 15, 10], normal: [0, 0, 1] } })
    const centre = (h: ReturnType<typeof m.build>) => { const bb = meshBounds(rebuild(h).bodies.find((x) => x.id === b)!.mesh); return (bb.minX + bb.maxX) / 2 }
    expect(centre(m.build())).toBeCloseTo(20, 5)
    m.param("w", 80)
    expect(centre(m.build())).toBeCloseTo(40, 5)
  })
})

describe("work planes", () => {
  const box = (depth: number | string = 10) => { const m = model(); m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth }); return m }

  test("an offset plane is a sketch plane lifted along its normal", () => {
    const m = box()
    const top = m.plane({ kind: "offset", base: "XY", distance: 10 })
    m.extrude(m.sketch(top).circle([20, 15], 10), { depth: 5 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    expect(rel(historyVolume(r), 12000 + Math.PI * 25 * 5)).toBeLessThan(0.01)
    expect(meshBounds(r.bodies[0]!.mesh).maxZ).toBeCloseTo(15, 6)
  })

  test("a plane on a face is read like XY for a top face, centred on the face, and follows it when the part changes", () => {
    const m = model()
    m.param("h", 10)
    m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: "h" })
    const face = m.plane({ kind: "face", near: [5, 5, "h"], normal: [0, 0, 1] })
    m.extrude(m.sketch(face).rectangle([-5, -5], 10, 10), { depth: 4 })
    const boss = (h: ReturnType<typeof m.build>) => {
      const r = rebuild(h)
      expect(r.issues).toEqual([])
      return meshBounds(r.bodies[0]!.mesh)
    }
    const a = boss(m.build())
    expect(a.maxZ).toBeCloseTo(14, 6)
    expect(historyVolume(rebuild(m.build()))).toBeCloseTo(12000 + 10 * 10 * 4, 3)
    m.param("h", 25)
    expect(boss(m.build()).maxZ).toBeCloseTo(29, 6)
    // The boss stayed in the middle of the face: the face centre is (20, 15).
    const sk = rebuild(m.build()).sketches
    const frame = Object.values(sk).find((s) => s.plane !== "XY")!.frame
    expect(frame.origin.x).toBeCloseTo(20, 6)
    expect(frame.origin.y).toBeCloseTo(15, 6)
    expect(frame.origin.z).toBeCloseTo(25, 6)
  })

  test("a hole on a face plane drills into the part from that face", () => {
    const m = box()
    const face = m.plane({ kind: "face", near: [20, 15, 10], normal: [0, 0, 1] })
    m.hole({ plane: face, at: [5, 5], diameter: 6, depth: 10 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    expect(rel(historyVolume(r), 12000 - Math.PI * 9 * 10)).toBeLessThan(0.01)
  })

  test("a side face gives a vertical sketch plane: text on the +x wall grows out of it", () => {
    const m = box()
    const wall = m.plane({ kind: "face", near: [40, 15, 5], normal: [1, 0, 0] })
    m.text({ text: "A", height: 6, depth: 1, plane: wall, at: [0, 0], align: "centre" })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    const b = meshBounds(r.bodies[0]!.mesh)
    expect(b.maxX).toBeCloseTo(41, 6)
    expect(b.maxZ).toBeLessThanOrEqual(10.6)
  })

  test("a plane at an angle: a square on a 45 degree plane about X, extruded along its tilted normal", () => {
    const m = model()
    const tilted = m.plane({ kind: "angle", base: "XY", angle: 45, about: "u" })
    m.extrude(m.sketch(tilted).rectangle([0, 0], 10, 10), { depth: 10 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    expect(historyVolume(r)).toBeCloseTo(1000, 3)
    const b = meshBounds(r.bodies[0]!.mesh)
    expect(b.maxZ).toBeCloseTo(10 * Math.SQRT1_2 * 2, 4)
    expect(b.minY).toBeCloseTo(-10 * Math.SQRT1_2, 4)
  })

  test("the angle plane about v with a hinge position turns around the line x = at", () => {
    const m = model()
    const tilted = m.plane({ kind: "angle", base: "XY", angle: 90, about: "v", at: 20 })
    m.extrude(m.sketch(tilted).rectangle([0, 0], 10, 10), { depth: 5 })
    const b = meshBounds(m.rebuild().bodies[0]!.mesh)
    // Turned to vertical about the line x = 20: the normal is now +x, so the 5 mm extrusion runs from x = 20 to 25.
    expect(b.minX).toBeCloseTo(20, 5)
    expect(b.maxX).toBeCloseTo(25, 5)
    expect(b.maxY - b.minY).toBeCloseTo(10, 5)
    expect(Math.abs(b.maxZ - b.minZ)).toBeCloseTo(10, 5)
  })

  test("a plane through three points", () => {
    const m = model()
    const p = m.plane({ kind: "points", points: [[0, 0, 0], [10, 0, 0], [0, 0, 10]] })
    m.extrude(m.sketch(p).rectangle([0, 0], 10, 10), { depth: 5 })
    const b = meshBounds(m.rebuild().bodies[0]!.mesh)
    // u = +x, normal = x cross (0,0,10) = -y, v = n cross u = +z.
    expect([b.minX, b.maxX, b.minZ, b.maxZ].map((x) => Math.round(x * 1e6) / 1e6 + 0)).toEqual([0, 10, 0, 10])
    expect(b.minY).toBeCloseTo(-5, 6)
    expect(b.maxY).toBeCloseTo(0, 6)
  })

  test("planes are checked: an unknown plane, three points on a line, a face that is not there", () => {
    const m = box()
    m.sketch("nowhere", undefined, { id: "lost" }).rectangle([0, 0], 5, 5)
    m.plane({ kind: "points", points: [[0, 0, 0], [1, 0, 0], [2, 0, 0]] }, { id: "line" })
    m.plane({ kind: "face", near: [0, 0, 0], body: "ghost" }, { id: "none" })
    const msgs = m.rebuild().issues.map((i) => `${i.feature}: ${i.message}`)
    expect(msgs.some((x) => x.startsWith("lost:") && /not XY, YZ, ZX/.test(x))).toBe(true)
    expect(msgs.some((x) => x.startsWith("line:") && /one line/.test(x))).toBe(true)
    expect(msgs.some((x) => x.startsWith("none:") && /does not exist/.test(x))).toBe(true)
  })

  test("the plane's own dimensions are editable, and removing a plane removes what is drawn on it", () => {
    const m = box()
    const top = m.plane({ kind: "offset", base: "XY", distance: 10 })
    m.extrude(m.sketch(top).circle([20, 15], 10), { depth: 5 })
    const h = m.build()
    const plane = h.features.find((f) => f.type === "plane")!
    expect(dimensionsOf(plane).map((d) => d.path)).toEqual(["from.distance"])
    expect(meshBounds(rebuild(setDimension(h, top, "from.distance", 20)).bodies.at(-1)!.mesh).maxZ).toBeCloseTo(25, 5)
    expect(removeFeature(h, top).features.map((f) => f.id)).toEqual(["sketch1", "extrude1"])
  })
})

describe("sheet-metal hems and flat pattern drawing", () => {
  test("a hem adds a U-turn: out by thickness + gap, back by the hem length", () => {
    const path = withHems([{ x: 0, y: 0 }, { x: 30, y: 0 }], 2, [{ end: "end", length: 8, gap: 0.5, fold: "left" }])
    expect(path).toEqual([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 2.5 }, { x: 22, y: 2.5 }])
    const start = withHems([{ x: 0, y: 0 }, { x: 30, y: 0 }], 2, [{ end: "start", length: 8, gap: 0, fold: "right" }])
    expect(start[0]).toEqual({ x: 8, y: 2 })
    expect(start[1]).toEqual({ x: 0, y: 2 })
    expect(start.at(-1)).toEqual({ x: 30, y: 0 })
  })

  test("a sharp hemmed strip is two layers: its volume is thickness x width x (centre line length)", () => {
    const m = model()
    m.sheet(m.sketch("XY").path([[0, 0], [30, 0]]), { thickness: 2, width: 10, hems: [{ end: "end", length: 8, gap: 1 }] })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    // Centre line 30 + (2 + 1) + 8 = 41 mm, mitred corners keep the wall thickness.
    expect(rel(historyVolume(r), 2 * 10 * 41)).toBeLessThan(2e-3)
    const d = r.flatPatterns["sheet1"]!
    expect(d.bends).toHaveLength(2)
  })

  test("with a bend radius the hem gap must be at least twice the inside radius", () => {
    const build = (gap: number) => {
      const m = model()
      m.sheet(m.sketch("XY").path([[0, 0], [30, 0]]), { thickness: 2, width: 10, bendRadius: 1, hems: [{ end: "end", length: 10, gap }] })
      return m.rebuild()
    }
    expect(build(2).issues).toEqual([])
    expect(build(0).issues[0]!.message).toMatch(/bends need/)
  })

  test("a hem needs a positive length and only one hem per end", () => {
    const m = model()
    m.sheet(m.sketch("XY").path([[0, 0], [30, 0]]), { thickness: 2, width: 10, hems: [{ end: "end", length: 0 }], id: "a" })
    m.sheet(m.sketch("XY", 0, { id: "k2" }).path([[0, 0], [30, 0]]), { thickness: 2, width: 10, operation: "new", hems: [{ end: "end", length: 5 }, { end: "end", length: 5 }], id: "b" })
    const msgs = m.rebuild().issues.map((i) => `${i.feature}: ${i.message}`)
    expect(msgs.some((x) => x.startsWith("a:") && /positive length/.test(x))).toBe(true)
    expect(msgs.some((x) => x.startsWith("b:") && /at most one hem/.test(x))).toBe(true)
  })

  test("the developed segments tile the strip: flat, bend, flat, with the bend allowance in the middle", () => {
    const d = developedLength(L, 2, 3, "centre", 0.44)
    expect(d.segments.map((s) => s.kind)).toEqual(["flat", "bend", "flat"])
    expect(d.segments[0]!.from).toBe(0)
    expect(d.segments.at(-1)!.to).toBeCloseTo(d.length, 9)
    expect(d.segments[1]!.to - d.segments[1]!.from).toBeCloseTo((Math.PI / 2) * 3.88, 9)
    for (let i = 1; i < d.segments.length; i++) expect(d.segments[i]!.from).toBeCloseTo(d.segments[i - 1]!.to, 9)
  })

  test("the flat pattern drawing has the blank outline on CUT and one bend line per bend on BEND, and survives a DXF round trip", () => {
    const d = developedLength(L, 2, 3, "centre", 0.44)
    const drawing = flatPatternDrawing(d, 25)
    expect(drawing.entities.filter((e) => e.layerId === "cut")).toHaveLength(4)
    const bend = drawing.entities.filter((e) => e.layerId === "bend")
    expect(bend).toHaveLength(1)
    const line = bend[0] as { start: { x: number }; end: { x: number; y: number } }
    expect(line.start.x).toBeCloseTo((d.segments[1]!.from + d.segments[1]!.to) / 2, 9)
    expect(line.end.y).toBe(25)
    const parsed = parseDxf(flatPatternDxf(d, 25))
    const xs = parsed.drawing.entities.flatMap((e) => (e._tag === "Line" ? [e.start.x, e.end.x] : []))
    expect(Math.max(...xs)).toBeCloseTo(d.length, 4)
    expect(parsed.drawing.entities).toHaveLength(5)
  })

  test("a hemmed strip's flat pattern has a bend line at each of its three bends", () => {
    const m = model()
    m.sheet(m.sketch("XY").path([[0, 0], [30, 0], [30, 20]]), { thickness: 2, width: 10, bendRadius: 3, hems: [{ end: "end", length: 10, gap: 6 }] })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    const drawing = flatPatternDrawing(r.flatPatterns["sheet1"]!, 10)
    expect(drawing.entities.filter((e) => e.layerId === "bend")).toHaveLength(3)
  })

  test("a non-positive width is refused", () => {
    expect(() => flatPatternDrawing(developedLength(L, 2, 3), 0)).toThrow(/positive/)
  })
})

describe("slot sketch shape", () => {
  const slot = (angle: number, plane: "XY" | "ZX" = "XY") => {
    const m = model()
    m.extrude(m.sketch(plane).slot([50, 0], 30, 8, { angle }), { depth: 5 })
    return m.rebuild()
  }
  test.each([0, 30, 45, 90, 135, 180, 270, -90])("a fully dimensioned slot at %d degrees has DOF 0, no redundant constraint and no warning", (angle) => {
    const r = slot(angle, "ZX")
    const solve = r.sketches["sketch1"]!.solve
    expect(solve.status).toBe("fully-constrained")
    expect(solve.dof).toBe(0)
    expect(solve.redundant).toBe(0)
    expect(r.issues).toEqual([])
  })

  test("its area is the rectangle plus the two half-round ends, at any angle", () => {
    const area = (30 - 8) * 8 + Math.PI * 16
    for (const angle of [0, 37, 90]) expect(rel(historyVolume(slot(angle)), area * 5)).toBeLessThan(0.01)
  })
})

describe("loops of one sketch: overlapping, nested", () => {
  const extrudeCircles = (circles: Array<[number, number, number]>, depth = 10) => {
    const m = model()
    const s = m.sketch("XY")
    for (const [x, y, d] of circles) s.circle([x, y], d)
    m.extrude(s, { depth })
    return m.rebuild()
  }
  test("two circles that overlap are one figure-eight solid: the union, not a circle with a bite out of it", () => {
    const r = extrudeCircles([[36, 35, 44], [77, 35, 44]])
    expect(r.issues).toEqual([])
    const b = meshBounds(r.bodies[0]!.mesh)
    expect(b.minX).toBeCloseTo(14, 1)
    expect(b.maxX).toBeCloseTo(99, 1)
    // Union area of two circles of radius 22 whose centres are 41 apart.
    const R = 22, d = 41
    const lens = 2 * R * R * Math.acos(d / (2 * R)) - (d / 2) * Math.sqrt(4 * R * R - d * d)
    expect(rel(historyVolume(r), (2 * Math.PI * R * R - lens) * 10)).toBeLessThan(0.01)
  })
  test("a circle inside a bigger one is still a hole, and a circle inside that hole is a solid again", () => {
    const r = extrudeCircles([[0, 0, 40], [0, 0, 20], [0, 0, 8]])
    expect(rel(historyVolume(r), (Math.PI * 400 - Math.PI * 100 + Math.PI * 16) * 10)).toBeLessThan(0.01)
  })
  test("two separate circles stay two solids in one body", () => {
    const r = extrudeCircles([[0, 0, 10], [30, 0, 10]])
    expect(rel(historyVolume(r), 2 * Math.PI * 25 * 10)).toBeLessThan(0.01)
  })
})

describe("a thread cut into an existing shaft", () => {
  const shaft = () => {
    const m = model()
    m.extrude(m.sketch("XY").circle([0, 0], 10), { depth: 20, id: "shaft" })
    return m
  }
  test("cutting M10 x 1.5 over 15 mm of a Ø10 x 20 shaft leaves the threaded rod plus the plain 5 mm", () => {
    const m = shaft()
    m.thread({ kind: "external", diameter: 10, pitch: 1.5, length: 15, offset: 5, cut: true })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    const rod = meshVolume(threadTool({ diameter: 10, pitch: 1.5, length: 15, internal: false, z0: 5 }))
    const plain = Math.PI * 25 * 5
    expect(rel(historyVolume(r), plain + rod)).toBeLessThan(0.01)
    // Less material than the plain shaft, more than the core of the thread.
    expect(historyVolume(r)).toBeLessThan(Math.PI * 25 * 20)
    expect(historyVolume(r)).toBeGreaterThan(plain + Math.PI * (threadSizes(10, 1.5, false).minor / 2) ** 2 * 15)
  })

  test("a wider shaft is turned down to the major diameter over the thread length", () => {
    const m = model()
    m.extrude(m.sketch("XY").circle([0, 0], 14), { depth: 20 })
    m.thread({ kind: "external", diameter: 10, pitch: 1.5, length: 10, offset: 10, cut: true })
    const b = meshBounds(cutZ(m.rebuild().bodies[0]!.mesh, 12, 18))
    expect(b.maxX).toBeLessThan(5.01)
  })

  test("cut needs a shaft, an external thread and no other operation", () => {
    const empty = model()
    empty.extrude(empty.sketch("XY").rectangle([50, 50], 5, 5), { depth: 5 })
    empty.thread({ kind: "external", diameter: 10, pitch: 1.5, length: 10, cut: true, id: "nowhere" })
    expect(empty.rebuild().issues.map((i) => i.message).join(" ")).toMatch(/no shaft/)
    const m = shaft()
    m.thread({ kind: "internal", diameter: 10, pitch: 1.5, length: 10, cut: true, id: "inner" })
    m.thread({ kind: "external", diameter: 10, pitch: 1.5, length: 10, cut: true, operation: "union", id: "union" })
    const msgs = m.rebuild().issues.map((i) => `${i.feature}: ${i.message}`)
    expect(msgs.some((x) => x.startsWith("inner:") && /external thread on a shaft/.test(x))).toBe(true)
    expect(msgs.some((x) => x.startsWith("union:") && /subtraction/.test(x))).toBe(true)
  })
})

describe("joints: slider, limits, interference", () => {
  const two = () => {
    const m = model()
    const a = m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10 })
    const b = m.extrude(m.sketch("XY").rectangle([100, 100], 20, 20), { depth: 10, operation: "new" })
    return { m, a, b }
  }
  const mate = { face: { near: [110, 110, 0] as const, normal: [0, 0, -1] as const }, to: { near: [20, 15, 10] as const, normal: [0, 0, 1] as const } }

  test("a slider joint moves the body along the target face: slide [8, -3] shifts it by 8 in x and -3 in y on a top face", () => {
    const { m, a, b } = two()
    m.mate({ body: b, face: mate.face, to: { body: a, ...mate.to }, slide: [8, -3] })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    const box = meshBounds(r.bodies.find((x) => x.id === b)!.mesh)
    expect((box.minX + box.maxX) / 2).toBeCloseTo(28, 5)
    expect((box.minY + box.maxY) / 2).toBeCloseTo(12, 5)
    expect(box.minZ).toBeCloseTo(10, 6)
  })

  test("limits: a pose inside them builds, one outside is an error naming the value and the range", () => {
    const inside = two()
    inside.m.mate({ body: inside.b, face: mate.face, to: { body: inside.a, ...mate.to }, spin: 30, limits: { spin: [0, 45] } })
    expect(inside.m.rebuild().issues).toEqual([])
    const out = two()
    out.m.mate({ body: out.b, face: mate.face, to: { body: out.a, ...mate.to }, spin: 60, slide: [25, 0], limits: { spin: [0, 45], slide: [[-10, 10], [-5, 5]] } })
    const msg = out.m.rebuild().issues.map((i) => i.message).join(" ")
    expect(msg).toMatch(/spin 60 is outside its limits 0 to 45/)
    expect(msg).toMatch(/slide u 25 is outside its limits -10 to 10/)
  })

  test("a negative gap pushes one body into the other: the overlap is reported with its volume", () => {
    const { m, a, b } = two()
    m.mate({ body: b, face: mate.face, to: { body: a, ...mate.to }, offset: -2 })
    const warning = m.rebuild().issues.find((i) => i.severity === "warning")
    expect(warning?.message).toMatch(/interfere/)
    expect(Number(/([\d.]+) mm3/.exec(warning!.message)![1])).toBeCloseTo(20 * 20 * 2, 0)
  })

  test("flush faces touch but do not interfere; the check can be switched off", () => {
    const { m, a, b } = two()
    m.mate({ body: b, face: mate.face, to: { body: a, ...mate.to } })
    expect(m.rebuild().issues).toEqual([])
    const off = two()
    off.m.mate({ body: off.b, face: mate.face, to: { body: off.a, ...mate.to }, offset: -2, interference: false })
    expect(off.m.rebuild().issues).toEqual([])
  })
})

describe("threads along X and Y", () => {
  test("an external thread along X cut into a horizontal shaft has the volume of the Z one, and lies along X", () => {
    const along = (axis: "x" | "z") => {
      const m = model()
      if (axis === "z") m.extrude(m.sketch("XY").circle([0, 0], 10), { depth: 20 })
      else m.extrude(m.sketch("YZ").circle([0, 0], 10), { depth: 20 })
      m.thread({ kind: "external", diameter: 10, pitch: 1.5, length: 12, offset: 4, cut: true, axis })
      return m.rebuild()
    }
    const x = along("x"), z = along("z")
    expect(x.issues).toEqual([])
    expect(rel(historyVolume(x), historyVolume(z))).toBeLessThan(1e-3)
    const b = meshBounds(x.bodies[0]!.mesh)
    expect(b.maxX - b.minX).toBeCloseTo(20, 5)
    expect(b.maxY - b.minY).toBeLessThan(10.05)
  })

  test("an internal thread along Y taps a hole into the +y side of a block at [z, x]", () => {
    const m = model()
    m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 20 })
    m.thread({ kind: "internal", diameter: 8, pitch: 1.25, length: 10, axis: "y", at: [10, 20], offset: 20 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    const tool = threadTool({ diameter: 8, pitch: 1.25, length: 10, internal: true })
    expect(rel(historyVolume(r), 40 * 30 * 20 - meshVolume(tool))).toBeLessThan(1e-3)
  })
})

describe("press/pull on curved faces", () => {
  const bossOnPlate = () => {
    const m = model()
    m.extrude(m.sketch("XY").rectangle([0, 0], 60, 60), { depth: 10 })
    m.extrude(m.sketch("XY", 10).circle([30, 30], 20), { depth: 10 })
    return m
  }
  const plateWithHole = () => {
    const m = model()
    m.extrude(m.sketch("XY").rectangle([0, 0], 40, 40).circle([20, 20], 10), { depth: 10 })
    return m
  }

  test("pulling the side of a Ø20 boss by 2 makes it Ø24: the volume grows by pi (12^2 - 10^2) x 10", () => {
    const m = bossOnPlate()
    const before = historyVolume(m.rebuild())
    m.pushPull({ near: [40, 30, 15], normal: [1, 0, 0], distance: 2 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    expect(rel(historyVolume(r) - before, Math.PI * (144 - 100) * 10)).toBeLessThan(0.02)
    const b = meshBounds(cutZ(r.bodies[0]!.mesh, 12, 18))
    expect(b.maxX).toBeCloseTo(42, 1)
    expect(b.minX).toBeCloseTo(18, 1)
  })

  test("pushing the wall of a Ø10 hole into the material by 1 makes it Ø12", () => {
    const m = plateWithHole()
    const before = historyVolume(m.rebuild())
    // The wall's outward normal points into the hole: at (25, 20) it is -x.
    m.pushPull({ near: [25, 20, 5], normal: [-1, 0, 0], distance: -1 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    expect(rel(before - historyVolume(r), Math.PI * (36 - 25) * 10)).toBeLessThan(0.02)
  })

  test("pulling the wall of a hole further than its radius would fold it shut: an error, the part unchanged", () => {
    const m = plateWithHole()
    const before = historyVolume(m.rebuild())
    m.pushPull({ near: [25, 20, 5], normal: [-1, 0, 0], distance: 6 })
    const r = m.rebuild()
    expect(r.issues[0]!.message).toMatch(/folds onto itself/)
    expect(historyVolume(r)).toBeCloseTo(before, 6)
  })

  test("a flat face still moves with its outline", () => {
    const m = bossOnPlate()
    const before = historyVolume(m.rebuild())
    m.pushPull({ near: [30, 30, 20], normal: [0, 0, 1], distance: 3 })
    expect(rel(historyVolume(m.rebuild()) - before, Math.PI * 100 * 3)).toBeLessThan(0.01)
  })
})

describe("draft on curved faces", () => {
  const bossOnPlate = () => {
    const m = model()
    m.extrude(m.sketch("XY").rectangle([0, 0], 60, 60), { depth: 10 })
    m.extrude(m.sketch("XY", 10).circle([30, 30], 20), { depth: 10 })
    return m
  }
  const frustum = (R: number, r: number, h: number) => (Math.PI * h * (R * R + R * r + r * r)) / 3
  const t5 = Math.tan((5 * Math.PI) / 180)

  test("a 5 degree draft from the base turns a Ø20 x 10 boss into a cone: top radius 10 - 10 tan 5", () => {
    const m = bossOnPlate()
    const before = historyVolume(m.rebuild())
    m.draft({ near: [40, 30, 15], normal: [1, 0, 0], angle: 5, neutral: 10 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    expect(rel(before - historyVolume(r), Math.PI * 100 * 10 - frustum(10, 10 - 10 * t5, 10))).toBeLessThan(0.03)
    const top = meshBounds(cutZ(r.bodies[0]!.mesh, 19.5, 20))
    expect(top.maxX - 30).toBeCloseTo(10 - 10 * t5, 1)
  })

  test("a negative angle widens it towards the top", () => {
    const m = bossOnPlate()
    const before = historyVolume(m.rebuild())
    m.draft({ near: [40, 30, 15], normal: [1, 0, 0], angle: -5, neutral: 10 })
    const r = m.rebuild()
    expect(r.issues).toEqual([])
    expect(rel(historyVolume(r) - before, frustum(10, 10 + 10 * t5, 10) - Math.PI * 100 * 10)).toBeLessThan(0.03)
  })

  test("a neutral plane across the curved face is refused with the reason", () => {
    const m = bossOnPlate()
    m.draft({ near: [40, 30, 15], normal: [1, 0, 0], angle: 5, neutral: 15 })
    expect(m.rebuild().issues[0]!.message).toMatch(/neutral plane crosses this curved face/)
  })
})
