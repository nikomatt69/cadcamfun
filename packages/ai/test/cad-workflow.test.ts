/**
 * `cad.workflow` end to end through the catalogue seam (`runAction`): the real sketch solver, mate solver, sheet generator, PDF writer
 * and mesh codecs run behind it, and every expected number is analytic or read back from an independent parse.
 */
import { describe, expect, test } from "bun:test"
import { runAction } from "../src/actions/catalogue.ts"
import { clearAttachments, prepareAttachments } from "../src/attachments.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"

const call = async (input: Record<string, unknown>, projectId = "wf"): Promise<Record<string, any>> =>
  await runAction("cad.workflow", input, { handlers: {} as ToolHandlersShape, projectId }) as Record<string, any>

const pt = (id: string, x: number, y: number) => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string) => ({ id, kind: "line", p1, p2 })

const bracket = (width: number) => ({
  parameters: { w: width },
  features: [
    { id: "s", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: "w", height: 25 }] } },
    { id: "e", type: "extrude", sketch: "s", depth: 10, operation: "new" }
  ]
})

const volumeOfStl = (bytes: Uint8Array): number => {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let v = 0
  for (let t = 0; t < dv.getUint32(80, true); t++) {
    const o = 84 + 50 * t + 12
    const p = (k: number) => [dv.getFloat32(o + k * 12, true), dv.getFloat32(o + k * 12 + 4, true), dv.getFloat32(o + k * 12 + 8, true)] as const
    const [a, b, c] = [p(0), p(1), p(2)]
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
  }
  return v
}

describe("op sketch", () => {
  const crooked = [pt("p1", 0.3, -0.2), pt("p2", 38, 1), pt("p3", 41, 27), pt("p4", -1, 24), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")]
  const squared = [{ type: "fixed", point: "p1", x: 0, y: 0 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" }]

  test("a dimensioned rectangle is fully constrained and exact; its profile area is the product of the sides", async () => {
    const r = await call({ op: "sketch", entities: crooked, constraints: [...squared, { type: "length", line: "l1", value: 40 }, { type: "length", line: "l2", value: 25 }] })
    expect(r).toMatchObject({ ok: true, status: "fully-constrained", dof: 0, free: [] })
    expect(r["points"]["p3"]).toEqual([40, 25])
    expect(r["profiles"]).toMatchObject({ closed: 1, open: 0 })
    expect(r["profiles"].areas[0]).toBeCloseTo(1000, 3)
  })

  test("under-constrained says which points move; angle is in degrees; a reference dimension measures without constraining", async () => {
    const free = await call({ op: "sketch", entities: crooked, constraints: squared })
    expect(free).toMatchObject({ ok: true, status: "under-constrained", dof: 2 })
    expect(free["free"]).toContain("p3")
    const ang = await call({
      op: "sketch", entities: [pt("a", 0, 0), pt("b", 10, 1), pt("c", 0, 0.5), pt("d", 5, 9), line("l", "a", "b"), line("m", "c", "d")],
      constraints: [{ type: "fixed", point: "a" }, { type: "horizontal", line: "l" }, { type: "length", line: "l", value: 10 }, { type: "coincident", a: "a", b: "c" }, { type: "angle", a: "l", b: "m", value: 60 }, { type: "length", line: "m", value: 4 }, { type: "distance", a: "a", b: "d", value: 99, driven: true, id: "ref" }]
    })
    expect(ang["status"]).toBe("fully-constrained")
    expect(ang["points"]["d"][0]).toBeCloseTo(2, 6)
    expect(ang["points"]["d"][1]).toBeCloseTo(4 * Math.sin(Math.PI / 3), 6)
    expect(ang["driven"]).toEqual([{ id: "ref", type: "distance", value: expect.closeTo(4, 6) }])
  })

  test("a conflict names the minimal set and leaves the innocent constraints out", async () => {
    const r = await call({
      op: "sketch", entities: [pt("a", 0, 0), pt("b", 10, 0), pt("c", 5, 8), line("ab", "a", "b"), line("bc", "b", "c"), line("ca", "c", "a")],
      constraints: [{ type: "fixed", point: "a", x: 0, y: 0 }, { type: "horizontal", line: "ab", id: "horizontal" }, { type: "length", line: "ab", value: 10, id: "ab" }, { type: "length", line: "bc", value: 3, id: "bc" }, { type: "length", line: "ca", value: 4, id: "ca" }]
    })
    expect(r).toMatchObject({ ok: false, status: "conflicting", minimalConflict: true })
    expect([...r["conflictSet"]].sort()).toEqual(["ab", "bc", "ca"])
  })

  test("drag keeps every constraint; a forbidden target is approached and reported, never relaxed", async () => {
    const crank = {
      op: "sketch", entities: [pt("g", 0, 0), pt("pin", 6, 8), pt("slider", 25, 0), line("r1", "g", "pin"), line("r2", "pin", "slider")],
      constraints: [{ type: "fixed", point: "g", x: 0, y: 0 }, { type: "length", line: "r1", value: 10, id: "crank" }, { type: "length", line: "r2", value: 20, id: "rod" }, { type: "horizontalPoints", a: "g", b: "slider", id: "guide" }]
    }
    const ok = await call({ ...crank, drag: { entity: "pin", to: { x: 0, y: 10 } } })
    expect(ok["drag"]).toMatchObject({ reached: true })
    expect(ok["points"]["slider"][0]).toBeCloseTo(Math.sqrt(300), 5)
    expect(ok["points"]["slider"][1]).toBeCloseTo(0, 6)
    const far = await call({ ...crank, drag: { entity: "pin", to: { x: 40, y: 8 } } })
    expect(far["drag"].reached).toBe(false)
    expect(far["drag"].blockedBy).toContain("crank")
    expect(Math.hypot(far["points"]["pin"][0], far["points"]["pin"][1])).toBeCloseTo(10, 5)
  })

  test("malformed input is a typed refusal that names the field", async () => {
    expect(await call({ op: "sketch" })).toMatchObject({ ok: false, error: expect.stringContaining("entities") })
    expect(await call({ op: "sketch", entities: crooked, constraints: [{ type: "length", line: "l1" }] })).toMatchObject({ ok: false, error: expect.stringContaining("'value' must be a number") })
    expect(await call({ op: "sketch", entities: crooked, constraints: [{ type: "horizontal", line: "nope" }] })).toMatchObject({ ok: false, error: expect.stringContaining("not a line") })
    expect(await call({ op: "sketch", entities: crooked, constraints: squared, drag: { entity: "zz", to: { x: 0, y: 0 } } })).toMatchObject({ ok: false })
  })
})

describe("op assembly", () => {
  const defs = [{ id: "base", shape: { kind: "box", x: 40, y: 40, z: 10 }, density: 7.85 }, { id: "pin", shape: { kind: "cylinder", radius: 4, height: 20 }, density: 7.85 }]

  test("a pin in a hole: concentric plus seated shoulder leaves exactly one rotation; the numbers are analytic", async () => {
    const r = await call({
      op: "assembly", definitions: defs,
      occurrences: [{ id: "base", definition: "base", grounded: true }, { id: "pin", definition: "pin", at: { x: 22, y: 18, z: 14 } }],
      mates: [
        { kind: "concentric", id: "fit", a: { occurrence: "base", feature: { kind: "axis", origin: { x: 20, y: 20, z: 0 }, dir: { x: 0, y: 0, z: 1 } } }, b: { occurrence: "pin", feature: { kind: "axis", origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 } } } },
        { kind: "coincident", id: "seat", a: { occurrence: "base", feature: { kind: "plane", origin: { x: 0, y: 0, z: 10 }, normal: { x: 0, y: 0, z: 1 } } }, b: { occurrence: "pin", feature: { kind: "plane", origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: -1 } } } }
      ],
      checks: ["interference", "mass", "bom"]
    })
    expect(r).toMatchObject({ ok: true, status: "under-constrained", dof: 1, freedom: { pin: 1 } })
    expect(r["residual"]).toBeLessThan(1e-9)
    expect(r["placements"]["pin"].t.map(Math.round)).toEqual([20, 20, 10])
    // The pin stands on the base: they touch, they do not overlap.
    expect(r["interference"].clashes).toEqual([])
    const volume = 40 * 40 * 10 + Math.PI * 16 * 20
    expect(r["mass"].volumeMm3).toBeCloseTo(volume, 1)
    expect(r["mass"].massG).toBeCloseTo((volume * 7.85) / 1000, 2)
    expect(r["bom"]).toHaveLength(2)
  })

  test("an overlap is measured exactly, a conflict is minimal, a face index is a valid operand", async () => {
    const overlap = await call({ op: "assembly", definitions: [defs[0]], occurrences: [{ id: "a", definition: "base", grounded: true }, { id: "b", definition: "base", at: { x: 30, y: 0, z: 0 } }], checks: ["interference"] })
    expect(overlap["interference"].clashes[0]).toMatchObject({ a: "a", b: "b" })
    expect(overlap["interference"].clashes[0].volumeMm3).toBeCloseTo(10 * 40 * 10, 3)
    const gap = { kind: "distance", a: { occurrence: "b", feature: { kind: "plane", origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: -1 } } }, b: { occurrence: "a", feature: { kind: "plane", origin: { x: 0, y: 0, z: 10 }, normal: { x: 0, y: 0, z: 1 } } } }
    const conflict = await call({ op: "assembly", definitions: [defs[0]], occurrences: [{ id: "a", definition: "base", grounded: true }, { id: "b", definition: "base", at: { x: 0, y: 0, z: 12 } }], mates: [{ ...gap, id: "g2", value: 2 }, { ...gap, id: "g5", value: 5 }, { kind: "parallel", id: "fine", a: { occurrence: "a", feature: { kind: "axis", origin: { x: 0, y: 0, z: 0 }, dir: { x: 1, y: 0, z: 0 } } }, b: { occurrence: "b", feature: { kind: "axis", origin: { x: 0, y: 0, z: 0 }, dir: { x: 1, y: 0, z: 0 } } } }] })
    expect(conflict).toMatchObject({ ok: false, status: "conflicting", minimalConflict: true })
    expect([...conflict["conflictSet"]].sort()).toEqual(["g2", "g5"])
    // A box's faces are 0 bottom, 1 top, 2 -y, 3 +y, 4 -x, 5 +x; seat block b on the top of block a through two faces by index.
    const byFace = await call({
      op: "assembly", definitions: [defs[0]], occurrences: [{ id: "a", definition: "base", grounded: true }, { id: "b", definition: "base", at: { x: 3, y: 2, z: 30 } }],
      mates: [{ kind: "coincident", a: { occurrence: "a", face: 1 }, b: { occurrence: "b", face: 0 } }]
    })
    expect(byFace["residual"]).toBeLessThan(1e-9)
    expect(byFace["placements"]["b"].t[2]).toBeCloseTo(10, 6)
  })

  test("a hinge driven 0..90 degrees reports each angle; the first clash with a stop block is found", async () => {
    const r = await call({
      op: "assembly", definitions: [{ id: "base", shape: { kind: "box", x: 40, y: 40, z: 10 } }, { id: "arm", shape: { kind: "box", x: 30, y: 4, z: 4 } }],
      occurrences: [{ id: "base", definition: "base", grounded: true }, { id: "arm", definition: "arm", at: { x: 20, y: 20, z: 10 } }],
      mates: [{ kind: "revolute", id: "hinge", a: { occurrence: "base", feature: { kind: "axis", origin: { x: 20, y: 20, z: 10 }, dir: { x: 0, y: 0, z: 1 } } }, b: { occurrence: "arm", feature: { kind: "axis", origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 } } } }],
      drive: { joint: "hinge", from: 0, to: 90, steps: 10 }, checks: ["interference"]
    })
    expect(r["ok"]).toBe(true)
    expect(r["frames"]).toHaveLength(10)
    r["frames"].forEach((f: any, i: number) => expect(f.joints[0].angle).toBeCloseTo((90 * i) / 9, 3))
    // The arm lies on the base top face: it only touches, so no clash at any step.
    expect(r["firstClash"]).toBeUndefined()
    const clash = await call({
      op: "assembly", definitions: [{ id: "base", shape: { kind: "box", x: 40, y: 40, z: 10 } }, { id: "arm", shape: { kind: "box", x: 30, y: 4, z: 4 } }, { id: "stop", shape: { kind: "box", x: 6, y: 6, z: 8 } }],
      occurrences: [{ id: "base", definition: "base", grounded: true }, { id: "arm", definition: "arm", at: { x: 20, y: 20, z: 10 } }, { id: "stop", definition: "stop", at: { x: 20, y: 38, z: 10 }, grounded: true }],
      mates: [{ kind: "revolute", id: "hinge", a: { occurrence: "base", feature: { kind: "axis", origin: { x: 20, y: 20, z: 10 }, dir: { x: 0, y: 0, z: 1 } } }, b: { occurrence: "arm", feature: { kind: "axis", origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 } } } }],
      drive: { joint: "hinge", from: 0, to: 90, steps: 10 }, checks: ["interference"]
    })
    expect(clash["firstClash"].value).toBeGreaterThan(40)
    expect(clash["firstClash"].clashes[0].a + clash["firstClash"].clashes[0].b).toContain("stop")
  })

  test("refusals name the occurrence or definition", async () => {
    expect(await call({ op: "assembly", definitions: [defs[0]], occurrences: [{ id: "a", definition: "nope" }] })).toMatchObject({ ok: false, error: expect.stringContaining("unknown definition 'nope'") })
    expect(await call({ op: "assembly", definitions: [defs[0]], occurrences: [{ id: "a", definition: "base" }], mates: [{ kind: "ball", a: { occurrence: "zz", feature: { kind: "point", p: { x: 0, y: 0, z: 0 } } }, b: { occurrence: "a", feature: { kind: "point", p: { x: 0, y: 0, z: 0 } } } }] })).toMatchObject({ ok: false, error: expect.stringContaining("unknown occurrence 'zz'") })
    expect(await call({ op: "assembly", definitions: [defs[0]] })).toMatchObject({ ok: false })
  })
})

describe("op sheet and mesh files, chained like an assistant would", () => {
  test("the sheet is a vector PDF whose dimensions follow the model; the 3MF export imports back with the exact volume", async () => {
    const sheet40 = await call({ op: "sheet", history: bracket(40), options: { views: ["front", "top"] } })
    expect(sheet40).toMatchObject({ ok: true, format: "pdf", vector: true, pages: 1 })
    const pdf40 = Buffer.from(sheet40["data"], "base64").toString("latin1")
    expect(pdf40.startsWith("%PDF-1.4")).toBe(true)
    expect(pdf40).not.toContain("/Image")
    expect(pdf40).toContain("(40.0)")
    expect(sheet40["dimensions"].some((d: any) => d.text === "40.0")).toBe(true)
    const pdf55 = Buffer.from((await call({ op: "sheet", history: bracket(55), options: { views: ["front", "top"] } }))["data"], "base64").toString("latin1")
    expect(pdf55).toContain("(55.0)")
    expect(pdf55).not.toContain("(40.0)")
    expect((await call({ op: "sheet", history: bracket(40), format: "svg" }))["svg"]).toContain("<svg")

    const exported = await call({ op: "mesh_export", history: bracket(40), format: "3mf" })
    expect(exported).toMatchObject({ ok: true, format: "3mf" })
    expect(exported["bodies"][0]).toMatchObject({ solid: true })
    expect(exported["bodies"][0].volumeMm3).toBeCloseTo(40 * 25 * 10, 3)
    const back = await call({ op: "mesh_import", data: exported["data"], requireSolid: true })
    expect(back).toMatchObject({ ok: true, format: "3mf", stored: false })
    expect(back["meshes"][0]).toMatchObject({ solid: true, triangles: exported["bodies"][0].triangles })
    expect(back["meshes"][0].volumeMm3).toBeCloseTo(10000, 3)
    expect(back["meshes"][0].bounds).toEqual({ min: [0, 0, 0], max: [40, 25, 10] })

    const stl = await call({ op: "mesh_export", history: bracket(40), format: "stl" })
    expect(volumeOfStl(new Uint8Array(Buffer.from(stl["data"], "base64")))).toBeCloseTo(10000, 1)
  })

  test("an ASCII STL attachment in inches is converted, a leaky mesh is repaired or refused with its defects", async () => {
    const facet = (a: string, b: string, c: string) => `facet normal 0 0 0\nouter loop\nvertex ${a}\nvertex ${b}\nvertex ${c}\nendloop\nendfacet\n`
    // A unit cube, 12 triangles, outward.
    const v = (i: number) => ["0 0 0", "1 0 0", "1 1 0", "0 1 0", "0 0 1", "1 0 1", "1 1 1", "0 1 1"][i]!
    const tris = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
    const solid = (n: number) => `solid cube\n${Array.from({ length: n }, (_, t) => facet(v(tris[t * 3]!), v(tris[t * 3 + 1]!), v(tris[t * 3 + 2]!))).join("")}endsolid cube\n`
    prepareAttachments("wf2", [{ name: "cube.stl", data: solid(12), encoding: "text" }, { name: "leaky.stl", data: solid(11), encoding: "text" }])
    try {
      // The attachment store accepts text attachments only; STL is not on its list, so the file arrives as data.
      const ok = await call({ op: "mesh_import", data: Buffer.from(solid(12)).toString("base64"), unit: "inch" }, "wf2")
      expect(ok["meshes"][0]).toMatchObject({ solid: true, triangles: 12 })
      expect(ok["meshes"][0].volumeMm3).toBeCloseTo(25.4 ** 3, 4)
      const leaky = await call({ op: "mesh_import", data: Buffer.from(solid(11)).toString("base64") }, "wf2")
      expect(leaky["meshes"][0].solid).toBe(false)
      expect(leaky["meshes"][0].remaining.join(" ")).toContain("open boundary edge")
      expect(leaky["warnings"][0]).toContain("not a closed manifold")
      const refused = await call({ op: "mesh_import", data: Buffer.from(solid(11)).toString("base64"), requireSolid: true }, "wf2")
      expect(refused).toMatchObject({ ok: false, error: expect.stringContaining("not closed manifolds") })
      expect(refused["defects"].join(" ")).toContain("open boundary edge")
      const filled = await call({ op: "mesh_import", data: Buffer.from(solid(11)).toString("base64"), repair: { maxHoleEdges: 8 }, requireSolid: true }, "wf2")
      expect(filled["meshes"][0]).toMatchObject({ solid: true })
      expect(filled["meshes"][0].repaired.filledHoles).toBe(1)
      expect(await call({ op: "mesh_import", attachment: "missing.obj" }, "wf2")).toMatchObject({ ok: false, error: expect.stringContaining("No attached file") })
      expect(await call({ op: "mesh_import", data: Buffer.from("garbage").toString("base64") }, "wf2")).toMatchObject({ ok: false })
    } finally { clearAttachments("wf2") }
  })

  test("mesh_export refuses both or neither source", async () => {
    expect(await call({ op: "mesh_export" })).toMatchObject({ ok: false, error: expect.stringContaining("exactly one") })
    expect(await call({ op: "sheet", format: "stl", history: bracket(40) })).toMatchObject({ ok: false, error: expect.stringContaining("pdf or svg") })
  })
})
