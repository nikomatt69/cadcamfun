import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, brepTo3mf, brepToGltf, brepToObj, brepToStl, brepToStlAscii, frame, makeBox, makeCylinder, massProperties, meshEdgeDefects, zipStore, type Brep } from "./index.ts"

setDefaultTimeout(60_000)
const body: Brep = booleanBrep(makeBox(20, 10, 8), makeCylinder(3, 8, frame({ x: 10, y: 5, z: 0 }, { x: 0, y: 0, z: 1 })), "subtract").brep
const exact = massProperties(body).volume

const volumeOfStl = (bytes: Uint8Array): number => {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const n = dv.getUint32(80, true)
  let v = 0
  for (let t = 0; t < n; t++) {
    const at = 84 + t * 50 + 12
    const p = (k: number) => [dv.getFloat32(at + k * 12, true), dv.getFloat32(at + k * 12 + 4, true), dv.getFloat32(at + k * 12 + 8, true)] as const
    const a = p(0), b = p(1), c = p(2)
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
  }
  return v
}

describe("mesh exchange formats of an exact body", () => {
  test("binary STL: a 50-byte record per triangle, its volume the body's within the chord", () => {
    const s = brepToStl(body, { chordTol: 0.002 })
    expect(s.data.length).toBe(84 + s.triangles * 50)
    expect(Math.abs(volumeOfStl(s.data) - exact) / exact).toBeLessThan(5e-4)
    expect(new TextDecoder().decode(s.data.subarray(0, 9))).toBe("CADCAMFUN")
  })
  test("a tighter chord gives more triangles and a closer volume", () => {
    const coarse = brepToStl(body, { chordTol: 0.2, angleTolDeg: 30 }), fine = brepToStl(body, { chordTol: 0.002 })
    expect(fine.triangles).toBeGreaterThan(coarse.triangles)
    expect(Math.abs(volumeOfStl(fine.data) - exact)).toBeLessThan(Math.abs(volumeOfStl(coarse.data) - exact))
  })
  test("ASCII STL has one facet per triangle and closes", () => {
    const s = brepToStlAscii(body, { name: "my part" })
    expect(s.data.startsWith("solid my_part\n")).toBe(true)
    expect(s.data.trimEnd().endsWith("endsolid my_part")).toBe(true)
    expect(s.data.split("facet normal").length - 1).toBe(s.triangles)
  })
  test("OBJ: welded vertices, a group per face, a closed manifold mesh", () => {
    const s = brepToObj(body, { chordTol: 0.01 })
    const lines = s.data.split("\n")
    const v = lines.filter((l) => l.startsWith("v ")).length, f = lines.filter((l) => l.startsWith("f "))
    expect(v).toBe(s.vertices)
    expect(f.length).toBe(s.triangles)
    expect(lines.filter((l) => l.startsWith("g ")).length).toBe(body.faces.length)
    const idx = new Uint32Array(f.flatMap((l) => l.slice(2).split(" ").map((x) => Number(x) - 1)))
    expect(meshEdgeDefects(idx)).toEqual({ open: 0, nonManifold: 0, misoriented: 0 })
  })
  test("glTF: a primitive per face named after it, accessors that agree with the buffer, metres", () => {
    const s = brepToGltf(body, { chordTol: 0.01 })
    const g = JSON.parse(s.data)
    expect(g.asset.version).toBe("2.0")
    expect(g.meshes[0].primitives.length).toBe(body.faces.length)
    expect(g.meshes[0].primitives.map((p: { extras: { face: string } }) => p.extras.face)).toEqual(body.faces.map((f, i) => f.name ?? `face${i}`))
    const bytes = Uint8Array.from(atob(g.buffers[0].uri.split(",")[1]), (c) => c.charCodeAt(0))
    expect(bytes.length).toBe(g.buffers[0].byteLength)
    expect(g.accessors[0].count).toBe(s.vertices)
    expect(g.accessors[0].max[0]).toBeCloseTo(0.02, 6)
    const triangles = g.accessors.slice(1).reduce((n: number, a: { count: number }) => n + a.count / 3, 0)
    expect(triangles).toBe(s.triangles)
  })
  test("3MF is a ZIP with the content types, the relationship and a model whose counts agree", () => {
    const s = brepTo3mf(body, { chordTol: 0.01, name: "bracket" })
    const text = new TextDecoder().decode(s.data)
    expect(s.data[0]).toBe(0x50); expect(s.data[1]).toBe(0x4b)
    for (const name of ["[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model"]) expect(text).toContain(name)
    expect(text).toContain('unit="millimeter"')
    expect(text.split("<vertex ").length - 1).toBe(s.vertices)
    expect(text.split("<triangle ").length - 1).toBe(s.triangles)
    // End of central directory: three entries.
    const dv = new DataView(s.data.buffer, s.data.byteOffset, s.data.byteLength)
    expect(dv.getUint32(s.data.length - 22, true)).toBe(0x06054b50)
    expect(dv.getUint16(s.data.length - 22 + 10, true)).toBe(3)
  })
  test("the ZIP writer stores files with the right CRC", () => {
    const z = zipStore([{ name: "a.txt", data: new TextEncoder().encode("123456789") }])
    const dv = new DataView(z.buffer)
    expect(dv.getUint32(14, true)).toBe(0xcbf43926) // the standard CRC-32 check value
    expect(dv.getUint32(18, true)).toBe(9)
  })
})
