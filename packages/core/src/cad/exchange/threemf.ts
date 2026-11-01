/**
 * 3MF codec (3D Manufacturing Format core spec + the production extension's multi-file component references), shared by the CAD
 * exchange and the 3D-printing side. Reading handles stored and deflate-compressed packages (slicer output), units (micron,
 * millimeter, centimeter, meter, inch, foot -> millimetres), build items with 3x4 transforms, component trees (also across model
 * files through `p:path`) and metadata. Writing produces a package of one object per mesh with its build item, in millimetres.
 *
 * 3MF matrices are row-vector style: `p' = p M` with the 12 numbers `m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32`, the last
 * three being the translation, in model units. `flatten3mf` applies component and build transforms and converts to millimetres.
 */
import { bodyTessellation, type TessellateOptions } from "../brep/tessellate.ts"
import { zipStore } from "../brep/export-mesh.ts"
import type { Brep } from "../brep/topology.ts"
import { MeshFormatError, unitScale, type NamedMesh } from "./mesh-formats.ts"
import type { MeshData } from "./mesh-repair.ts"
import { readZip, ZipError } from "./zip.ts"

export { zipStore }

/** `m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32` */
export type Matrix3mf = readonly number[]
export const IDENTITY_3MF: Matrix3mf = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]

export interface Component3mf { readonly objectId: string; readonly path?: string; readonly transform: Matrix3mf }

export interface Object3mf {
  readonly id: string
  /** The file (package path) the object was read from. */
  readonly part: string
  readonly name: string
  readonly type: string
  /** Mesh in model units. */
  readonly mesh?: MeshData
  readonly components?: ReadonlyArray<Component3mf>
}

export interface BuildItem3mf { readonly objectId: string; readonly transform: Matrix3mf; readonly partNumber?: string }

export interface Model3mf {
  readonly unit: string
  readonly unitToMm: number
  readonly metadata: Readonly<Record<string, string>>
  readonly objects: ReadonlyArray<Object3mf>
  readonly build: ReadonlyArray<BuildItem3mf>
}

const attrs = (s: string): Record<string, string> => {
  const out: Record<string, string> = {}
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  for (let m = re.exec(s); m !== null; m = re.exec(s)) out[m[1]!] = unescapeXml(m[2] ?? m[3] ?? "")
  return out
}
const unescapeXml = (s: string): string => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
const escapeXml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const matrixOf = (text: string | undefined, where: string): Matrix3mf => {
  if (text === undefined) return IDENTITY_3MF
  const v = text.trim().split(/\s+/).map(Number)
  if (v.length !== 12 || v.some((x) => !Number.isFinite(x))) throw new MeshFormatError(`3MF ${where}: transform needs 12 numbers, got '${text}'`)
  return v
}

/** `a` then `b` (row-vector convention). */
export const composeMatrix3mf = (a: Matrix3mf, b: Matrix3mf): Matrix3mf => {
  const m: number[] = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m.push(a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!)
  for (let c = 0; c < 3; c++) m.push(a[9]! * b[c]! + a[10]! * b[3 + c]! + a[11]! * b[6 + c]! + b[9 + c]!)
  return m
}

interface ParsedPart { unit?: string; metadata: Record<string, string>; objects: Object3mf[]; build: BuildItem3mf[] }

const parseModelPart = (xml: string, part: string): ParsedPart => {
  const out: ParsedPart = { metadata: {}, objects: [], build: [] }
  const tag = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g
  let current: { id: string; name: string; type: string; positions: number[]; indices: number[]; components: Component3mf[]; hasMesh: boolean } | undefined
  let metaName: string | undefined, metaStart = 0
  let inBuild = false
  for (let m = tag.exec(xml); m !== null; m = tag.exec(xml)) {
    const closing = m[1] === "/", name = m[2]!.replace(/^[\w.-]+:/, ""), selfClose = m[4] === "/"
    if (closing) {
      if (name === "metadata" && metaName !== undefined) { out.metadata[metaName] = unescapeXml(xml.slice(metaStart, m.index).trim()); metaName = undefined } else if (name === "object" && current !== undefined) {
        out.objects.push({
          id: current.id, part, name: current.name, type: current.type,
          ...(current.hasMesh ? { mesh: { positions: Float64Array.from(current.positions), indices: Uint32Array.from(current.indices) } } : {}),
          ...(current.components.length > 0 ? { components: current.components } : {})
        })
        current = undefined
      } else if (name === "build") inBuild = false
      continue
    }
    const a = attrs(m[3]!)
    switch (name) {
      case "model": if (a["unit"] !== undefined) out.unit = a["unit"]; break
      case "metadata": if (!selfClose && a["name"] !== undefined) { metaName = a["name"]; metaStart = tag.lastIndex } else if (a["name"] !== undefined) out.metadata[a["name"]] = a["value"] ?? ""; break
      case "object":
        if (a["id"] === undefined) throw new MeshFormatError(`3MF ${part}: an object has no id`)
        current = { id: a["id"], name: a["name"] ?? `object ${a["id"]}`, type: a["type"] ?? "model", positions: [], indices: [], components: [], hasMesh: false }
        if (selfClose) { out.objects.push({ id: current.id, part, name: current.name, type: current.type }); current = undefined }
        break
      case "mesh": if (current !== undefined) current.hasMesh = true; break
      case "vertex":
        if (current === undefined) break
        {
          const x = Number(a["x"]), y = Number(a["y"]), z = Number(a["z"])
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new MeshFormatError(`3MF ${part}: object ${current.id} has a vertex that is not three numbers`)
          current.positions.push(x, y, z)
        }
        break
      case "triangle":
        if (current === undefined) break
        {
          const v1 = Number(a["v1"]), v2 = Number(a["v2"]), v3 = Number(a["v3"])
          const n = current.positions.length / 3
          if (![v1, v2, v3].every((v) => Number.isInteger(v) && v >= 0 && v < n)) throw new MeshFormatError(`3MF ${part}: object ${current.id} has a triangle (${a["v1"]}, ${a["v2"]}, ${a["v3"]}) outside its ${n} vertices`)
          current.indices.push(v1, v2, v3)
        }
        break
      case "component":
        if (current !== undefined && a["objectid"] !== undefined) current.components.push({ objectId: a["objectid"], ...(a["path"] !== undefined ? { path: a["path"] } : {}), transform: matrixOf(a["transform"], `component of object ${current.id}`) })
        break
      case "build": inBuild = !selfClose; break
      case "item":
        if (inBuild && a["objectid"] !== undefined) out.build.push({ objectId: a["objectid"], transform: matrixOf(a["transform"], `build item ${a["objectid"]}`), ...(a["partnumber"] !== undefined ? { partNumber: a["partnumber"] } : {}) })
        break
    }
  }
  return out
}

/** Reads a 3MF package. Throws `MeshFormatError` / `ZipError` naming the defect. */
export const read3mf = (bytes: Uint8Array): Model3mf => {
  let entries
  try { entries = readZip(bytes) } catch (e) { throw e instanceof ZipError ? new MeshFormatError(`Not a valid 3MF package: ${e.message}`) : e }
  const files = new Map(entries.map((e) => [e.name.replace(/^\//, ""), e.data] as const))
  const dec = new TextDecoder()
  let root = "3D/3dmodel.model"
  const rels = files.get("_rels/.rels")
  if (rels !== undefined) {
    const re = /<Relationship\b([^>]*)>/g
    const text = dec.decode(rels)
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const a = attrs(m[1]!)
      if (a["Type"]?.endsWith("/3dmodel") === true && a["Target"] !== undefined) { root = a["Target"].replace(/^\//, ""); break }
    }
  }
  const rootData = files.get(root)
  if (rootData === undefined) throw new MeshFormatError(`3MF package has no model part '${root}'`)
  const main = parseModelPart(dec.decode(rootData), root)
  const objects = [...main.objects]
  const loaded = new Set([root])
  // Production extension: components may point into other model files.
  for (let again = true; again;) {
    again = false
    for (const o of [...objects]) for (const c of o.components ?? []) {
      const path = c.path?.replace(/^\//, "")
      if (path === undefined || loaded.has(path)) continue
      const data = files.get(path)
      if (data === undefined) throw new MeshFormatError(`3MF object ${o.id} refers to the missing part '${path}'`)
      loaded.add(path)
      objects.push(...parseModelPart(dec.decode(data), path).objects)
      again = true
    }
  }
  const unit = main.unit ?? "millimeter"
  return { unit, unitToMm: unitScale(unit), metadata: main.metadata, objects, build: main.build }
}

export interface FlatObject3mf { readonly name: string; readonly mesh: MeshData; readonly partNumber?: string }

/**
 * The meshes of the build in millimetres in the world: components expanded, component and build transforms applied. With no build
 * section every mesh object is taken as it is. A reference cycle or a missing object is a `MeshFormatError`.
 */
export const flatten3mf = (model: Model3mf): FlatObject3mf[] => {
  const byKey = new Map(model.objects.map((o) => [`${o.part}\u0000${o.id}`, o] as const))
  const mainPart = model.objects[0]?.part ?? "3D/3dmodel.model"
  const find = (id: string, part: string, path?: string): Object3mf => {
    const o = byKey.get(`${path?.replace(/^\//, "") ?? part}\u0000${id}`)
    if (o === undefined) throw new MeshFormatError(`3MF refers to the missing object '${id}'${path !== undefined ? ` in '${path}'` : ""}`)
    return o
  }
  const out: FlatObject3mf[] = []
  const k = model.unitToMm
  const emit = (o: Object3mf, t: Matrix3mf, stack: ReadonlyArray<string>, partNumber?: string): void => {
    const key = `${o.part}\u0000${o.id}`
    if (stack.includes(key)) throw new MeshFormatError(`3MF component cycle through object '${o.id}'`)
    if (o.mesh !== undefined && o.type !== "support" && o.type !== "solidsupport") {
      const p = o.mesh.positions, q = new Float64Array(p.length)
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!
        q[i] = (x * t[0]! + y * t[3]! + z * t[6]! + t[9]!) * k
        q[i + 1] = (x * t[1]! + y * t[4]! + z * t[7]! + t[10]!) * k
        q[i + 2] = (x * t[2]! + y * t[5]! + z * t[8]! + t[11]!) * k
      }
      // A mirroring transform reverses the winding; keep faces outward.
      const det = t[0]! * (t[4]! * t[8]! - t[5]! * t[7]!) - t[1]! * (t[3]! * t[8]! - t[5]! * t[6]!) + t[2]! * (t[3]! * t[7]! - t[4]! * t[6]!)
      const idx = Uint32Array.from(o.mesh.indices)
      if (det < 0) for (let i = 0; i + 2 < idx.length; i += 3) { const s = idx[i + 1]!; idx[i + 1] = idx[i + 2]!; idx[i + 2] = s }
      out.push({ name: o.name, mesh: { positions: q, indices: idx }, ...(partNumber !== undefined ? { partNumber } : {}) })
    }
    for (const c of o.components ?? []) emit(find(c.objectId, o.part, c.path), composeMatrix3mf(c.transform, t), [...stack, key], partNumber)
  }
  if (model.build.length === 0) { for (const o of model.objects) if (o.mesh !== undefined) emit(o, IDENTITY_3MF, []) } else {
    for (const item of model.build) emit(find(item.objectId, mainPart), item.transform, [], item.partNumber)
  }
  return out
}

/** Reads a package straight to named millimetre meshes. */
export const read3mfMeshes = (bytes: Uint8Array): NamedMesh[] => flatten3mf(read3mf(bytes)).map((o) => ({ name: o.name, mesh: o.mesh }))

// ---------------------------------------------------------------- writing

export interface Write3mfObject {
  readonly name: string
  readonly mesh: MeshData
  /** Placement of the build item (row-vector 3x4, millimetres). */
  readonly transform?: Matrix3mf
  readonly partNumber?: string
}

export interface Write3mfOptions {
  /** Unit written to the file and used to scale the coordinates (inputs are always millimetres). Default millimeter. */
  readonly unit?: "micron" | "millimeter" | "centimeter" | "meter" | "inch" | "foot"
  readonly metadata?: Readonly<Record<string, string>>
}

const num = (v: number): string => String(Math.round(v * 1e9) / 1e9)

/** A 3MF package, one object and one build item per mesh. Triangle indices are validated. */
export const write3mf = (objects: ReadonlyArray<Write3mfObject>, options: Write3mfOptions = {}): Uint8Array => {
  if (objects.length === 0) throw new MeshFormatError("A 3MF package needs at least one object")
  const unit = options.unit ?? "millimeter"
  const k = 1 / unitScale(unit)
  const enc = new TextEncoder()
  const meta = Object.entries(options.metadata ?? {}).map(([n, v]) => `<metadata name="${escapeXml(n)}">${escapeXml(v)}</metadata>`).join("")
  const res: string[] = []
  const items: string[] = []
  objects.forEach(({ name, mesh, transform, partNumber }, i) => {
    const id = i + 1
    const nv = mesh.positions.length / 3
    for (const index of mesh.indices) if (index >= nv) throw new MeshFormatError(`Object '${name}' has a triangle index ${index} beyond its ${nv} vertices`)
    const v: string[] = []
    for (let j = 0; j < mesh.positions.length; j += 3) v.push(`<vertex x="${num(mesh.positions[j]! * k)}" y="${num(mesh.positions[j + 1]! * k)}" z="${num(mesh.positions[j + 2]! * k)}"/>`)
    const t: string[] = []
    for (let j = 0; j + 2 < mesh.indices.length; j += 3) t.push(`<triangle v1="${mesh.indices[j]}" v2="${mesh.indices[j + 1]}" v3="${mesh.indices[j + 2]}"/>`)
    res.push(`<object id="${id}" type="model" name="${escapeXml(name)}"><mesh><vertices>${v.join("")}</vertices><triangles>${t.join("")}</triangles></mesh></object>`)
    const tm = transform === undefined ? "" : ` transform="${transform.map((x, c) => num(c >= 9 ? x * k : x)).join(" ")}"`
    items.push(`<item objectid="${id}"${tm}${partNumber !== undefined ? ` partnumber="${escapeXml(partNumber)}"` : ""}/>`)
  })
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="${unit}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">${meta}<resources>${res.join("")}</resources><build>${items.join("")}</build></model>`
  const types = `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`
  const relsXml = `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`
  return zipStore([
    { name: "[Content_Types].xml", data: enc.encode(types) },
    { name: "_rels/.rels", data: enc.encode(relsXml) },
    { name: "3D/3dmodel.model", data: enc.encode(model) }
  ])
}

/** The watertight welded mesh of an exact body at the given tessellation tolerance (millimetres, outward faces). */
export const brepMesh = (b: Brep, options: TessellateOptions = {}): MeshData => {
  const t = bodyTessellation(b, { angleTolDeg: 15, ...options })
  const weld = new Map<string, number>()
  const pos: number[] = []
  const idx: number[] = []
  for (const fm of [...t.faces].sort((a, c) => a.face - c.face)) {
    const map = new Map<number, number>()
    const vid = (i: number): number => {
      let m = map.get(i)
      if (m === undefined) {
        const x = fm.positions[i * 3]!, y = fm.positions[i * 3 + 1]!, z = fm.positions[i * 3 + 2]!
        const key = `${Math.round(x * 1e6)},${Math.round(y * 1e6)},${Math.round(z * 1e6)}`
        let w = weld.get(key)
        if (w === undefined) { w = pos.length / 3; pos.push(x, y, z); weld.set(key, w) }
        m = w; map.set(i, m)
      }
      return m
    }
    for (let k = 0; k + 2 < fm.indices.length; k += 3) {
      const a = vid(fm.indices[k]!), c = vid(fm.indices[k + 1]!), d = vid(fm.indices[k + 2]!)
      if (a !== c && c !== d && d !== a) idx.push(a, c, d)
    }
  }
  return { positions: Float64Array.from(pos), indices: Uint32Array.from(idx) }
}

/** A 3MF of several exact bodies (one object each). */
export const bodiesTo3mf = (bodies: ReadonlyArray<{ readonly name: string; readonly brep: Brep }>, options: Write3mfOptions & TessellateOptions = {}): Uint8Array =>
  write3mf(bodies.map((b) => ({ name: b.name, mesh: brepMesh(b.brep, options) })), options)
