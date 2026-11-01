import { describe, expect, test } from "bun:test"
import { deflateRawSync } from "node:zlib"
import { frame, makeBox, makeCylinder } from "../brep/index.ts"
import { meshTopology } from "../mesh-topology.ts"
import {
  bodiesTo3mf, brepMesh, crc32, flatten3mf, importMesh, inflateRaw, parseObj, parseStl, read3mf, readZip, repairMesh, write3mf, writeObj, writeStl, zipStore,
  type MeshData
} from "./index.ts"

/** An indexed box [0,a] x [0,b] x [0,c], outward faces. */
const boxMesh = (a: number, b: number, c: number): MeshData => {
  const p = [0, 0, 0, a, 0, 0, a, b, 0, 0, b, 0, 0, 0, c, a, 0, c, a, b, c, 0, b, c]
  const f = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  return { positions: Float64Array.from(p), indices: Uint32Array.from(f) }
}
const volumeOf = (m: MeshData): number => meshTopology(m).volume

/** A deflate-compressed ZIP of the given files (what slicers write). */
const zipDeflate = (files: Array<{ name: string; data: Uint8Array }>): Uint8Array => {
  const stored = zipStore(files)
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = [], central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const comp = new Uint8Array(deflateRawSync(f.data))
    const name = enc.encode(f.name), crc = crc32(f.data)
    const local = new Uint8Array(30 + name.length)
    const dv = new DataView(local.buffer)
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(8, 8, true); dv.setUint32(14, crc, true)
    dv.setUint32(18, comp.length, true); dv.setUint32(22, f.data.length, true); dv.setUint16(26, name.length, true)
    local.set(name, 30)
    chunks.push(local, comp)
    const cd = new Uint8Array(46 + name.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(10, 8, true); cv.setUint32(16, crc, true)
    cv.setUint32(20, comp.length, true); cv.setUint32(24, f.data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true)
    cd.set(name, 46)
    central.push(cd)
    offset += local.length + comp.length
  }
  void stored
  const cdSize = central.reduce((s, c) => s + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true)
  const all = [...chunks, ...central, end]
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0))
  let at = 0
  for (const c of all) { out.set(c, at); at += c.length }
  return out
}

describe("zip", () => {
  test("inflate equals the platform deflate over random and repetitive data (fixed and dynamic blocks)", () => {
    let seed = 3
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    const cases = [
      new Uint8Array(0).fill(0), new TextEncoder().encode("abcabcabcabcabcabcabc"), Uint8Array.from({ length: 5000 }, () => Math.floor(rand() * 256)),
      Uint8Array.from({ length: 70000 }, (_, i) => (i % 97 < 50 ? 65 + (i % 7) : Math.floor(rand() * 4)))
    ]
    for (const data of cases) expect(Array.from(inflateRaw(new Uint8Array(deflateRawSync(data)), data.length))).toEqual(Array.from(data))
  })

  test("a corrupt entry is refused by its CRC", () => {
    const zip = zipStore([{ name: "a.txt", data: new TextEncoder().encode("hello world") }])
    expect(readZip(zip)[0]!.name).toBe("a.txt")
    const bad = zip.slice()
    bad[40] = bad[40]! ^ 0xff
    expect(() => readZip(bad)).toThrow(/CRC/)
    expect(() => readZip(new Uint8Array(10))).toThrow(/ZIP/)
  })
})

describe("STL and OBJ", () => {
  test("binary STL round-trips an indexed box exactly (volume, vertex count after weld)", () => {
    const m = boxMesh(10, 20, 30)
    const [back] = parseStl(writeStl(m, "block"))
    expect(back!.name).toBe("block")
    expect(back!.mesh.indices.length).toBe(36)
    expect(back!.mesh.positions.length / 3).toBe(8)
    expect(volumeOf(back!.mesh)).toBeCloseTo(6000, 4)
  })

  test("ASCII STL with two solids gives two meshes; units scale to millimetres", () => {
    const facet = (a: string, b: string, c: string) => `facet normal 0 0 1\nouter loop\nvertex ${a}\nvertex ${b}\nvertex ${c}\nendloop\nendfacet\n`
    const text = `solid one\n${facet("0 0 0", "1 0 0", "0 1 0")}endsolid one\nsolid two\n${facet("0 0 0", "2 0 0", "0 2 0")}endsolid two\n`
    const parsed = parseStl(new TextEncoder().encode(text), "inch")
    expect(parsed.map((p) => p.name)).toEqual(["one", "two"])
    expect(parsed[0]!.mesh.positions[3]).toBeCloseTo(25.4, 12)
    expect(() => parseStl(new TextEncoder().encode("solid x\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\n"))).toThrow(/ends inside a facet|no endsolid/)
    expect(() => parseStl(new TextEncoder().encode("garbage"))).toThrow(/Not an STL/)
  })

  test("OBJ: quads and negative indices, objects, out-of-range index refused", () => {
    const cube = "o cube\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\nf 1 4 3 2\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n"
    const [o] = parseObj(cube, "centimeter")
    expect(o!.name).toBe("cube")
    expect(o!.mesh.indices.length).toBe(36)
    expect(volumeOf(o!.mesh)).toBeCloseTo(1000, 6) // 1 cm cube = 1000 mm^3
    expect(parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n")[0]!.mesh.indices.length).toBe(3)
    expect(() => parseObj("v 0 0 0\nf 1 2 3\n")).toThrow(/outside 1\.\.1/)
    const text = writeObj([{ name: "a b", mesh: boxMesh(1, 1, 1) }, { name: "c", mesh: boxMesh(2, 2, 2) }])
    const back = parseObj(text)
    expect(back.map((b) => b.name)).toEqual(["a_b", "c"])
    expect(volumeOf(back[1]!.mesh)).toBeCloseTo(8, 9)
  })
})

describe("3MF", () => {
  test("write then read: objects, names, transforms and millimetre volumes round-trip; a cylinder body keeps its analytic volume", () => {
    const cyl = brepMesh(makeCylinder(5, 12), { chordTol: 0.001 })
    const bytes = write3mf([
      { name: "block", mesh: boxMesh(10, 10, 10) },
      { name: "moved", mesh: boxMesh(10, 10, 10), transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, 100, 0, 0], partNumber: "P-7" },
      { name: "cylinder", mesh: cyl }
    ], { metadata: { Title: "demo & <test>" } })
    const model = read3mf(bytes)
    expect(model.unit).toBe("millimeter")
    expect(model.metadata["Title"]).toBe("demo & <test>")
    const flat = flatten3mf(model)
    expect(flat.map((f) => f.name)).toEqual(["block", "moved", "cylinder"])
    expect(volumeOf(flat[0]!.mesh)).toBeCloseTo(1000, 6)
    expect(flat[1]!.mesh.positions[0]).toBeCloseTo(100, 9)
    expect(flat[1]!.partNumber).toBe("P-7")
    const exact = Math.PI * 25 * 12
    expect(volumeOf(flat[2]!.mesh)).toBeGreaterThan(exact * 0.999)
    expect(volumeOf(flat[2]!.mesh)).toBeLessThan(exact * 1.0001)
  })

  test("inch and micron files are converted to millimetres, transforms translate in file units", () => {
    for (const [unit, per] of [["inch", 25.4], ["micron", 0.001], ["centimeter", 10], ["meter", 1000], ["foot", 304.8]] as const) {
      const bytes = write3mf([{ name: "u", mesh: boxMesh(10, 10, 10), transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, 20, 0, 0] }], { unit })
      const flat = flatten3mf(read3mf(bytes))
      expect(volumeOf(flat[0]!.mesh)).toBeCloseTo(1000, 5)
      expect(flat[0]!.mesh.positions[0]).toBeCloseTo(20, 6)
      void per
    }
    // A file written in inches that holds a 1 x 1 x 1 inch cube is 25.4 mm on a side.
    const xml = `<?xml version="1.0"?><model unit="inch" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="3" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="1" y="1" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/><vertex x="1" y="0" z="1"/><vertex x="1" y="1" z="1"/><vertex x="0" y="1" z="1"/></vertices><triangles>${[0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7].reduce<string[]>((s, v, i, a) => (i % 3 === 0 ? [...s, `<triangle v1="${v}" v2="${a[i + 1]}" v3="${a[i + 2]}"/>`] : s), []).join("")}</triangles></mesh></object></resources><build><item objectid="3"/></build></model>`
    const pkg = zipDeflate([{ name: "[Content_Types].xml", data: new TextEncoder().encode("<Types/>") }, { name: "3D/3dmodel.model", data: new TextEncoder().encode(xml) }])
    const flat = flatten3mf(read3mf(pkg))
    expect(volumeOf(flat[0]!.mesh)).toBeCloseTo(25.4 ** 3, 6)
  })

  test("a deflate-compressed slicer-style package with components, a build transform and a mirror reads to outward meshes", () => {
    const cube = (id: number) => `<object id="${id}" type="model" name="cube${id}"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="1" y="1" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/><vertex x="1" y="0" z="1"/><vertex x="1" y="1" z="1"/><vertex x="0" y="1" z="1"/></vertices><triangles>${"0 2 1 0 3 2 4 5 6 4 6 7 0 1 5 0 5 4 1 2 6 1 6 5 2 3 7 2 7 6 3 0 4 3 4 7".split(" ").map(Number).reduce<string[]>((s, v, i, a) => (i % 3 === 0 ? [...s, `<triangle v1="${v}" v2="${a[i + 1]}" v3="${a[i + 2]}"/>`] : s), []).join("")}</triangles></mesh></object>`
    const xml = `<model unit="millimeter"><resources>${cube(1)}<object id="2" type="model" name="pair"><components><component objectid="1" transform="2 0 0 0 2 0 0 0 2 0 0 0"/><component objectid="1" transform="-1 0 0 0 1 0 0 0 1 10 0 0"/></components></object></resources><build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 0 5 0"/></build></model>`
    const pkg = zipDeflate([{ name: "3D/3dmodel.model", data: new TextEncoder().encode(xml) }])
    const flat = flatten3mf(read3mf(pkg))
    expect(flat).toHaveLength(2)
    expect(volumeOf(flat[0]!.mesh)).toBeCloseTo(8, 9)
    // The mirrored component is still a positive solid and sits at x in [9, 10], y shifted by the build transform.
    expect(volumeOf(flat[1]!.mesh)).toBeCloseTo(1, 9)
    const xs = Array.from(flat[1]!.mesh.positions).filter((_, i) => i % 3 === 0)
    expect(Math.min(...xs)).toBeCloseTo(9, 9)
    expect(Math.max(...xs)).toBeCloseTo(10, 9)
    expect(flat[1]!.mesh.positions[1]).toBeCloseTo(5, 9)
  })

  test("defects are named: bad triangle index, missing object, cycle, not a zip", () => {
    const pkg = (xml: string) => zipStore([{ name: "3D/3dmodel.model", data: new TextEncoder().encode(xml) }])
    expect(() => read3mf(pkg(`<model><resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources></model>`))).toThrow(/outside its 1 vertices/)
    expect(() => flatten3mf(read3mf(pkg(`<model><resources></resources><build><item objectid="9"/></build></model>`)))).toThrow(/missing object '9'/)
    expect(() => flatten3mf(read3mf(pkg(`<model><resources><object id="1"><components><component objectid="1"/></components></object></resources><build><item objectid="1"/></build></model>`)))).toThrow(/cycle/)
    expect(() => read3mf(new Uint8Array([1, 2, 3]))).toThrow(/Not a valid 3MF/)
    expect(() => write3mf([])).toThrow(/at least one object/)
  })

  test("bodies export: two exact bodies become two objects whose volumes match the B-rep", () => {
    const bytes = bodiesTo3mf([{ name: "box", brep: makeBox(10, 20, 30) }, { name: "cyl", brep: makeCylinder(4, 10, frame({ x: 50, y: 0, z: 0 })) }], { chordTol: 0.001 })
    const flat = flatten3mf(read3mf(bytes))
    expect(volumeOf(flat[0]!.mesh)).toBeCloseTo(6000, 6)
    expect(volumeOf(flat[1]!.mesh)).toBeGreaterThan(Math.PI * 16 * 10 * 0.999)
  })
})

describe("repair (X8)", () => {
  test("a triangle soup box with duplicated vertices welds to a closed manifold of the exact volume", () => {
    const m = boxMesh(10, 10, 10)
    const soupPos: number[] = []
    for (const i of m.indices) soupPos.push(m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!)
    const soup: MeshData = { positions: Float64Array.from(soupPos), indices: Uint32Array.from({ length: 36 }, (_, i) => i) }
    expect(meshTopology(soup).closed).toBe(false)
    const { mesh, report } = repairMesh(soup)
    expect(report.defects.weldedVertices).toBe(28)
    expect(report.after.solid).toBe(true)
    expect(report.remaining).toEqual([])
    expect(volumeOf(mesh)).toBeCloseTo(1000, 9)
  })

  test("flipped triangles, an inside-out shell, a duplicated triangle and a degenerate one are repaired", () => {
    const m = boxMesh(10, 10, 10)
    const idx = Array.from(m.indices)
    for (const t of [2, 7]) { const s = idx[t * 3 + 1]!; idx[t * 3 + 1] = idx[t * 3 + 2]!; idx[t * 3 + 2] = s }
    idx.push(idx[0]!, idx[1]!, idx[2]!) // duplicate
    idx.push(0, 0, 1) // degenerate
    const broken: MeshData = { positions: m.positions, indices: Uint32Array.from(idx) }
    const r = repairMesh(broken)
    expect(r.report.defects).toMatchObject({ duplicateTriangles: 1, degenerateTriangles: 1, flippedTriangles: 2 })
    expect(r.report.after.solid).toBe(true)
    expect(volumeOf(r.mesh)).toBeCloseTo(1000, 9)
    // The whole shell inside out: turned back to outward.
    const inside: MeshData = { positions: m.positions, indices: Uint32Array.from(Array.from(m.indices), (v, i) => (i % 3 === 1 ? m.indices[i + 1]! : i % 3 === 2 ? m.indices[i - 1]! : v)) }
    expect(volumeOf(inside)).toBeCloseTo(-1000, 9)
    const fixed = repairMesh(inside)
    expect(fixed.report.defects.invertedShells).toBe(1)
    expect(volumeOf(fixed.mesh)).toBeCloseTo(1000, 9)
  })

  test("a missing face is a hole: filled when allowed, reported when not", () => {
    const m = boxMesh(10, 10, 10)
    const without: MeshData = { positions: m.positions, indices: m.indices.slice(0, 30) } // drop the last two triangles (the x = 0 face)
    const open = repairMesh(without)
    expect(open.report.after.boundaryEdges).toBe(4)
    expect(open.report.remaining[0]).toMatch(/4 open boundary edge/)
    const filled = repairMesh(without, { maxHoleEdges: 8 })
    expect(filled.report.defects.filledHoles).toBe(1)
    expect(filled.report.after.solid).toBe(true)
    expect(volumeOf(filled.mesh)).toBeCloseTo(1000, 9)
    // Too wide a hole is left alone.
    expect(repairMesh(without, { maxHoleEdges: 8, maxHoleDiameter: 5 }).report.defects.filledHoles).toBe(0)
  })

  test("two shells are oriented independently; a non-manifold edge is reported, not hidden", () => {
    const a = boxMesh(10, 10, 10), b = boxMesh(5, 5, 5)
    const pos = [...a.positions, ...Array.from(b.positions, (v, i) => (i % 3 === 0 ? v + 50 : v))]
    const idx = [...a.indices, ...Array.from(b.indices, (v) => v + 8)]
    const two = repairMesh({ positions: Float64Array.from(pos), indices: Uint32Array.from(idx) })
    expect(two.report.after.shells).toBe(2)
    expect(volumeOf(two.mesh)).toBeCloseTo(1125, 9)
    // A third triangle on one edge of a box.
    const fin: MeshData = { positions: Float64Array.from([...a.positions, 5, 5, 40]), indices: Uint32Array.from([...a.indices, 0, 1, 8]) }
    const nm = repairMesh(fin)
    expect(nm.report.after.nonManifoldEdges).toBeGreaterThan(0)
    expect(nm.report.remaining.join(" ")).toMatch(/non-manifold/)
  })
})

describe("importMesh", () => {
  test("detects the format, converts, repairs and reports; requireSolid refuses a leaky mesh with the defect list", () => {
    const stl = writeStl(boxMesh(10, 10, 10))
    const ok = importMesh(stl)
    expect(ok.ok && ok.format === "stl" && ok.meshes[0]!.solid).toBe(true)
    const leaky = writeStl({ positions: boxMesh(10, 10, 10).positions, indices: boxMesh(10, 10, 10).indices.slice(0, 33) })
    const refused = importMesh(leaky, { requireSolid: true })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.defects.join(" ")).toMatch(/open boundary edge/)
    expect(importMesh(leaky).ok).toBe(true)
    const obj = importMesh(new TextEncoder().encode(writeObj([{ name: "p", mesh: boxMesh(1, 2, 3) }])))
    expect(obj.ok && obj.format === "obj" && obj.meshes[0]!.solid).toBe(true)
    const three = importMesh(write3mf([{ name: "p", mesh: boxMesh(1, 2, 3) }]))
    expect(three.ok && three.format === "3mf" && three.meshes[0]!.name === "p").toBe(true)
    expect(importMesh(new Uint8Array([1, 2, 3]))).toMatchObject({ ok: false })
    expect(importMesh(new TextEncoder().encode("solid x\nvertex a b c\nendsolid x"), { format: "stl" })).toMatchObject({ ok: false })
  })
})
