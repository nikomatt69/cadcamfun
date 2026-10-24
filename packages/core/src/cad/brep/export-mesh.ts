/**
 * Mesh exchange formats from an exact body: STL (binary and ASCII), Wavefront OBJ, glTF 2.0 (one primitive per face, named after
 * the face) and 3MF (a stored ZIP with the model part). The mesh is the watertight tessellation of the exact surfaces at a chosen
 * tolerance (`chordTol`, mm; `angleTolDeg`), in millimetres, with outward normals; shared vertices are welded so the formats that
 * index them (OBJ, glTF, 3MF) get a closed manifold mesh. Every writer returns the text or bytes and the triangle count.
 */
import { bodyTessellation, type TessellateOptions } from "./tessellate.ts"
import type { Brep } from "./topology.ts"

export interface MeshExportOptions extends TessellateOptions {
  readonly name?: string
}

interface Mesh {
  /** xyz per vertex, welded. */
  readonly positions: Float64Array
  /** Triangles as vertex index triples. */
  readonly indices: Uint32Array
  /** Per face: its name and the triangle range [start, end) in `indices` / 3. */
  readonly faces: ReadonlyArray<{ readonly name: string; readonly start: number; readonly end: number }>
}

const meshOf = (b: Brep, o: MeshExportOptions): Mesh => {
  const t = bodyTessellation(b, { angleTolDeg: 15, ...o })
  const weld = new Map<string, number>()
  const pos: number[] = []
  const idx: number[] = []
  const faces: Array<{ name: string; start: number; end: number }> = []
  const key = (x: number, y: number, z: number) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)},${Math.round(z * 1e6)}`
  for (const fm of [...t.faces].sort((a, c) => a.face - c.face)) {
    const start = idx.length / 3
    const map = new Map<number, number>()
    const vid = (i: number): number => {
      let m = map.get(i)
      if (m === undefined) {
        const x = fm.positions[i * 3]!, y = fm.positions[i * 3 + 1]!, z = fm.positions[i * 3 + 2]!
        const k = key(x, y, z)
        let w = weld.get(k)
        if (w === undefined) { w = pos.length / 3; pos.push(x, y, z); weld.set(k, w) }
        m = w
        map.set(i, m)
      }
      return m
    }
    for (let k = 0; k + 2 < fm.indices.length; k += 3) {
      const a = vid(fm.indices[k]!), c = vid(fm.indices[k + 1]!), d = vid(fm.indices[k + 2]!)
      if (a !== c && c !== d && d !== a) idx.push(a, c, d)
    }
    faces.push({ name: b.faces[fm.face]?.name ?? `face${fm.face}`, start, end: idx.length / 3 })
  }
  return { positions: new Float64Array(pos), indices: new Uint32Array(idx), faces }
}

const normalOf = (m: Mesh, t: number): [number, number, number] => {
  const p = m.positions, i = m.indices
  const a = i[t * 3]! * 3, b = i[t * 3 + 1]! * 3, c = i[t * 3 + 2]! * 3
  const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!
  const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const l = Math.hypot(nx, ny, nz) || 1
  return [nx / l, ny / l, nz / l]
}

export interface MeshFile<T> { readonly data: T; readonly triangles: number; readonly vertices: number }

/** Binary STL: 80-byte header, triangle count, 50 bytes per triangle (normal, three vertices, attribute). */
export const brepToStl = (b: Brep, o: MeshExportOptions = {}): MeshFile<Uint8Array> => {
  const m = meshOf(b, o)
  const n = m.indices.length / 3
  const buf = new ArrayBuffer(84 + n * 50)
  const dv = new DataView(buf)
  const head = new TextEncoder().encode(`CADCAMFUN ${o.name ?? "solid"}`.slice(0, 79))
  new Uint8Array(buf, 0, 80).set(head)
  dv.setUint32(80, n, true)
  for (let t = 0; t < n; t++) {
    const at = 84 + t * 50
    const nn = normalOf(m, t)
    for (let k = 0; k < 3; k++) dv.setFloat32(at + k * 4, nn[k]!, true)
    for (let v = 0; v < 3; v++) {
      const i = m.indices[t * 3 + v]! * 3
      for (let k = 0; k < 3; k++) dv.setFloat32(at + 12 + v * 12 + k * 4, m.positions[i + k]!, true)
    }
  }
  return { data: new Uint8Array(buf), triangles: n, vertices: m.positions.length / 3 }
}

/** ASCII STL. */
export const brepToStlAscii = (b: Brep, o: MeshExportOptions = {}): MeshFile<string> => {
  const m = meshOf(b, o)
  const n = m.indices.length / 3
  const name = (o.name ?? "solid").replace(/\s+/g, "_")
  const out: string[] = [`solid ${name}`]
  const f = (x: number) => Number(x.toPrecision(9)).toString()
  for (let t = 0; t < n; t++) {
    const nn = normalOf(m, t)
    out.push(`  facet normal ${f(nn[0])} ${f(nn[1])} ${f(nn[2])}`, "    outer loop")
    for (let v = 0; v < 3; v++) { const i = m.indices[t * 3 + v]! * 3; out.push(`      vertex ${f(m.positions[i]!)} ${f(m.positions[i + 1]!)} ${f(m.positions[i + 2]!)}`) }
    out.push("    endloop", "  endfacet")
  }
  out.push(`endsolid ${name}`)
  return { data: out.join("\n") + "\n", triangles: n, vertices: m.positions.length / 3 }
}

/** Wavefront OBJ, one group per face. */
export const brepToObj = (b: Brep, o: MeshExportOptions = {}): MeshFile<string> => {
  const m = meshOf(b, o)
  const out: string[] = [`# CADCAMFUN ${o.name ?? "solid"} (mm)`, `o ${(o.name ?? "solid").replace(/\s+/g, "_")}`]
  for (let i = 0; i < m.positions.length; i += 3) out.push(`v ${m.positions[i]} ${m.positions[i + 1]} ${m.positions[i + 2]}`)
  for (const f of m.faces) {
    if (f.end <= f.start) continue
    out.push(`g ${f.name.replace(/\s+/g, "_")}`)
    for (let t = f.start; t < f.end; t++) out.push(`f ${m.indices[t * 3]! + 1} ${m.indices[t * 3 + 1]! + 1} ${m.indices[t * 3 + 2]! + 1}`)
  }
  return { data: out.join("\n") + "\n", triangles: m.indices.length / 3, vertices: m.positions.length / 3 }
}

const toBase64 = (bytes: Uint8Array): string => {
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** glTF 2.0 (JSON with an embedded buffer, metres: the unit glTF defines), one primitive per face with the face's name in `extras`. */
export const brepToGltf = (b: Brep, o: MeshExportOptions = {}): MeshFile<string> => {
  const m = meshOf(b, o)
  const nv = m.positions.length / 3, nt = m.indices.length / 3
  const pos = new Float32Array(nv * 3)
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < nv * 3; i++) { pos[i] = m.positions[i]! / 1000; const k = i % 3; lo[k] = Math.min(lo[k]!, pos[i]!); hi[k] = Math.max(hi[k]!, pos[i]!) }
  const idx = new Uint32Array(m.indices)
  const bytes = new Uint8Array(pos.byteLength + idx.byteLength)
  bytes.set(new Uint8Array(pos.buffer), 0)
  bytes.set(new Uint8Array(idx.buffer), pos.byteLength)
  const faces = m.faces.filter((f) => f.end > f.start)
  const gltf = {
    asset: { version: "2.0", generator: "CADCAMFUN" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: o.name ?? "solid", mesh: 0 }],
    meshes: [{ name: o.name ?? "solid", primitives: faces.map((f, k) => ({ attributes: { POSITION: 0 }, indices: 1 + k, mode: 4, extras: { face: f.name } })) }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: nv, type: "VEC3", min: lo, max: hi },
      ...faces.map((f, k) => ({ bufferView: 1 + k, componentType: 5125, count: (f.end - f.start) * 3, type: "SCALAR" }))
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.byteLength, target: 34962 },
      ...faces.map((f) => ({ buffer: 0, byteOffset: pos.byteLength + f.start * 12, byteLength: (f.end - f.start) * 12, target: 34963 }))
    ],
    buffers: [{ byteLength: bytes.byteLength, uri: `data:application/octet-stream;base64,${toBase64(bytes)}` }]
  }
  return { data: JSON.stringify(gltf), triangles: nt, vertices: nv }
}

// ---------------------------------------------------------------- 3MF (a stored ZIP)

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc32 = (bytes: Uint8Array): number => { let c = 0xffffffff; for (const x of bytes) c = CRC_TABLE[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

/** A ZIP with the given files stored uncompressed. */
export const zipStore = (files: ReadonlyArray<{ readonly name: string; readonly data: Uint8Array }>): Uint8Array => {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data)
    const local = new Uint8Array(30 + name.length)
    const dv = new DataView(local.buffer)
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, 0, true)
    dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true); dv.setUint32(14, crc, true); dv.setUint32(18, f.data.length, true); dv.setUint32(22, f.data.length, true)
    dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true)
    local.set(name, 30)
    chunks.push(local, f.data)
    const cd = new Uint8Array(46 + name.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true); cv.setUint32(20, f.data.length, true); cv.setUint32(24, f.data.length, true)
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true)
    cd.set(name, 46)
    central.push(cd)
    offset += local.length + f.data.length
  }
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

/** 3MF (core spec, millimetres): the closed mesh as one object. */
export const brepTo3mf = (b: Brep, o: MeshExportOptions = {}): MeshFile<Uint8Array> => {
  const m = meshOf(b, o)
  const enc = new TextEncoder()
  const name = (o.name ?? "solid").replace(/[<>&"]/g, "_")
  const verts: string[] = []
  for (let i = 0; i < m.positions.length; i += 3) verts.push(`<vertex x="${m.positions[i]}" y="${m.positions[i + 1]}" z="${m.positions[i + 2]}"/>`)
  const tris: string[] = []
  for (let t = 0; t < m.indices.length; t += 3) tris.push(`<triangle v1="${m.indices[t]}" v2="${m.indices[t + 1]}" v3="${m.indices[t + 2]}"/>`)
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model" name="${name}"><mesh><vertices>${verts.join("")}</vertices><triangles>${tris.join("")}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`
  const types = `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`
  const rels = `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`
  const zip = zipStore([
    { name: "[Content_Types].xml", data: enc.encode(types) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "3D/3dmodel.model", data: enc.encode(model) }
  ])
  return { data: zip, triangles: m.indices.length / 3, vertices: m.positions.length / 3 }
}
