/**
 * STL (binary and ASCII) and Wavefront OBJ, read and written as plain triangle meshes in millimetres (spec 50 X8).
 *
 * These formats carry no unit: the reader takes `unit` (default millimetre) and scales to mm. STL stores triangle soup, so the
 * reader indexes vertices by exact coordinates (no tolerance; `repairMesh` welds with a tolerance). A malformed file is a
 * `MeshFormatError` naming what is wrong, never a silently shortened mesh.
 */
import type { MeshData } from "./mesh-repair.ts"

export class MeshFormatError extends Error {
  constructor(message: string) { super(message); this.name = "MeshFormatError" }
}

export type LengthUnit = "micron" | "millimeter" | "centimeter" | "meter" | "inch" | "foot"
/** Millimetres per unit. */
export const UNIT_MM: Readonly<Record<LengthUnit, number>> = { micron: 0.001, millimeter: 1, centimeter: 10, meter: 1000, inch: 25.4, foot: 304.8 }

export const unitScale = (unit: string | undefined): number => {
  if (unit === undefined) return 1
  const f = UNIT_MM[unit as LengthUnit]
  if (f === undefined) throw new MeshFormatError(`Unknown length unit '${unit}' (expected ${Object.keys(UNIT_MM).join(", ")})`)
  return f
}

export interface NamedMesh { readonly name: string; readonly mesh: MeshData }

class Indexer {
  readonly positions: number[] = []
  readonly indices: number[] = []
  private readonly map = new Map<string, number>()
  vertex(x: number, y: number, z: number): number {
    const key = `${x},${y},${z}`
    let i = this.map.get(key)
    if (i === undefined) { i = this.positions.length / 3; this.positions.push(x, y, z); this.map.set(key, i) }
    return i
  }
  data(): MeshData { return { positions: Float64Array.from(this.positions), indices: Uint32Array.from(this.indices) } }
}

const looksBinaryStl = (b: Uint8Array): boolean => {
  if (b.length < 84) return false
  const n = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(80, true)
  return 84 + 50 * n === b.length
}

/** STL, binary or ASCII (detected by the size rule: a binary file is exactly 84 + 50 n bytes). Several `solid` blocks become several meshes. */
export const parseStl = (bytes: Uint8Array, unit?: string): NamedMesh[] => {
  const k = unitScale(unit)
  if (looksBinaryStl(bytes)) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const n = dv.getUint32(80, true)
    const ix = new Indexer()
    for (let t = 0; t < n; t++) {
      const o = 84 + 50 * t + 12
      const v = [0, 1, 2].map((c) => ix.vertex(dv.getFloat32(o + c * 12, true) * k, dv.getFloat32(o + c * 12 + 4, true) * k, dv.getFloat32(o + c * 12 + 8, true) * k))
      ix.indices.push(v[0]!, v[1]!, v[2]!)
    }
    const header = new TextDecoder().decode(bytes.subarray(0, 80)).replace(/\0+$/, "").trim()
    return [{ name: header.startsWith("solid ") ? header.slice(6).trim() || "stl" : "stl", mesh: ix.data() }]
  }
  const text = new TextDecoder().decode(bytes)
  if (!/^\s*solid\b/i.test(text)) throw new MeshFormatError("Not an STL file: it is not a binary STL of the declared size and does not start with 'solid'")
  const out: NamedMesh[] = []
  let ix = new Indexer(), name = "stl", pending: number[] = [], open = false
  const re = /\b(solid|endsolid|vertex)\b([^\n\r]*)/gi
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const word = m[1]!.toLowerCase()
    if (word === "solid") { ix = new Indexer(); name = m[2]!.trim() || "stl"; pending = []; open = true } else if (word === "endsolid") {
      if (pending.length !== 0) throw new MeshFormatError(`ASCII STL solid '${name}' ends inside a facet (${pending.length / 3} of 3 vertices)`)
      out.push({ name, mesh: ix.data() }); open = false
    } else {
      const c = m[2]!.trim().split(/\s+/).map(Number)
      if (c.length < 3 || c.slice(0, 3).some((v) => !Number.isFinite(v))) throw new MeshFormatError(`ASCII STL vertex line is not three numbers: '${m[0]}'`)
      pending.push(ix.vertex(c[0]! * k, c[1]! * k, c[2]! * k))
      if (pending.length === 3) { ix.indices.push(pending[0]!, pending[1]!, pending[2]!); pending = [] }
    }
  }
  if (open) throw new MeshFormatError(`ASCII STL solid '${name}' has no endsolid`)
  if (out.length === 0) throw new MeshFormatError("ASCII STL contains no solid")
  return out
}

/** Wavefront OBJ: `v`, `f` (polygons are triangulated as fans, negative indices supported), objects/groups (`o`/`g`) as separate meshes. */
export const parseObj = (text: string, unit?: string): NamedMesh[] => {
  const k = unitScale(unit)
  const verts: number[] = []
  const groups: Array<{ name: string; faces: number[][] }> = [{ name: "obj", faces: [] }]
  let lineNo = 0
  for (const raw of text.split(/\r?\n/)) {
    lineNo++
    const line = raw.trim()
    if (line === "" || line[0] === "#") continue
    const [cmd, ...rest] = line.split(/\s+/)
    if (cmd === "v") {
      const c = rest.slice(0, 3).map(Number)
      if (c.length < 3 || c.some((v) => !Number.isFinite(v))) throw new MeshFormatError(`OBJ line ${lineNo}: vertex is not three numbers`)
      verts.push(c[0]! * k, c[1]! * k, c[2]! * k)
    } else if (cmd === "o" || cmd === "g") {
      const name = rest.join(" ") || "obj"
      const current = groups[groups.length - 1]!
      if (current.faces.length === 0) current.name = name; else groups.push({ name, faces: [] })
    } else if (cmd === "f") {
      const count = verts.length / 3
      const face = rest.map((tok) => {
        const raw = Number(tok.split("/")[0])
        const i = raw < 0 ? count + raw : raw - 1
        if (!Number.isInteger(raw) || raw === 0 || i < 0 || i >= count) throw new MeshFormatError(`OBJ line ${lineNo}: face refers to vertex '${tok}' outside 1..${count}`)
        return i
      })
      if (face.length < 3) throw new MeshFormatError(`OBJ line ${lineNo}: a face needs at least 3 vertices`)
      groups[groups.length - 1]!.faces.push(face)
    }
  }
  const out: NamedMesh[] = []
  for (const g of groups) {
    if (g.faces.length === 0) continue
    const remap = new Map<number, number>()
    const positions: number[] = []
    const indices: number[] = []
    const at = (i: number): number => {
      let m = remap.get(i)
      if (m === undefined) { m = positions.length / 3; positions.push(verts[i * 3]!, verts[i * 3 + 1]!, verts[i * 3 + 2]!); remap.set(i, m) }
      return m
    }
    for (const f of g.faces) for (let j = 1; j + 1 < f.length; j++) indices.push(at(f[0]!), at(f[j]!), at(f[j + 1]!))
    out.push({ name: g.name, mesh: { positions: Float64Array.from(positions), indices: Uint32Array.from(indices) } })
  }
  if (out.length === 0) throw new MeshFormatError("OBJ contains no faces")
  return out
}

const normalOf = (m: MeshData, t: number): [number, number, number] => {
  const p = m.positions, i = m.indices
  const a = i[t * 3]! * 3, b = i[t * 3 + 1]! * 3, c = i[t * 3 + 2]! * 3
  const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!, vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const l = Math.hypot(nx, ny, nz) || 1
  return [nx / l, ny / l, nz / l]
}

/** Binary STL of one mesh (millimetres). */
export const writeStl = (m: MeshData, name = "cadcamfun"): Uint8Array => {
  const n = m.indices.length / 3
  const out = new Uint8Array(84 + 50 * n)
  const dv = new DataView(out.buffer)
  out.set(new TextEncoder().encode(`solid ${name}`.slice(0, 80)), 0)
  dv.setUint32(80, n, true)
  for (let t = 0; t < n; t++) {
    const o = 84 + 50 * t
    const nrm = normalOf(m, t)
    for (let c = 0; c < 3; c++) dv.setFloat32(o + c * 4, nrm[c]!, true)
    for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) dv.setFloat32(o + 12 + v * 12 + c * 4, m.positions[m.indices[t * 3 + v]! * 3 + c]!, true)
  }
  return out
}

/** OBJ with one object per mesh (indices are global across objects, as the format requires). */
export const writeObj = (meshes: ReadonlyArray<NamedMesh>): string => {
  const lines: string[] = ["# cadcamfun, millimetres"]
  let base = 0
  for (const { name, mesh } of meshes) {
    lines.push(`o ${name.replace(/\s+/g, "_")}`)
    for (let i = 0; i < mesh.positions.length; i += 3) lines.push(`v ${mesh.positions[i]} ${mesh.positions[i + 1]} ${mesh.positions[i + 2]}`)
    for (let t = 0; t < mesh.indices.length; t += 3) lines.push(`f ${base + mesh.indices[t]! + 1} ${base + mesh.indices[t + 1]! + 1} ${base + mesh.indices[t + 2]! + 1}`)
    base += mesh.positions.length / 3
  }
  return `${lines.join("\n")}\n`
}
