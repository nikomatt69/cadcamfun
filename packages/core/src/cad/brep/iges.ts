/**
 * IGES 5.3 B-rep exchange: fixed 80-column S/G/D/P/T records, analytic/rational geometry and explicit shared topology.
 * Transformation matrices (entity 124, chained through their own directory field) place geometry, vertex lists and whole
 * solids; one on the topology between them (edge list, loop, face, shell) is refused, because its edges are shared.
 * Unsupported entities and transformations are diagnosed instead of interpreting an unrelated format as IGES.
 * Entity layouts: STEP Tools IGES EXPRESS schemas and the IGES 5.3 specification (spec 33 exchange references).
 */
import { arcControl, curveDomain, surfaceDomain, type NurbsCurveData, type NurbsSurfaceData } from "./nurbs.ts"
import { curvePoint, transformCurve, transformSurface, type Curve3, type Surface } from "./geom.ts"
import { add3, applyDir, applyPoint, compose, frame, length3, scale3, sub3, normalize3, type Transform, type Vec3 } from "./math.ts"
import { compactBrep, transformBrep, type Brep, type Coedge, type Face, type Shell } from "./topology.ts"
import { validateBrep } from "./validate.ts"
import { nurbsSurfaceProblem } from "./surface-patch.ts"

export interface IgesPart { readonly name: string; readonly brep: Brep }
export interface IgesRead { readonly parts: ReadonlyArray<IgesPart>; readonly warnings: ReadonlyArray<string>; readonly lengthScale: number }
const TAU = Math.PI * 2
const xyz = (p: Vec3): number[] => [p.x, p.y, p.z]
const hollerith = (v: string): string => `${v.length}H${v}`
const field = (v: string | number) => String(v).padStart(8)
const record = (data: string, section: string, number: number) => data.padEnd(72) + section + String(number).padStart(7)
/** Numeric parameters cannot straddle a physical IGES record (several readers terminate them at the column boundary). */
const parameterLines = (values: ReadonlyArray<string | number>, width: number): string[] => {
  const lines: string[] = []
  let line = ""
  values.forEach((value, i) => {
    if (typeof value === "number" && !Number.isFinite(value)) throw new RangeError("non-finite IGES value")
    const token = String(value) + (i === values.length - 1 ? ";" : ",")
    if (token.length > width) throw new RangeError("IGES parameter exceeds a physical record")
    if (line.length + token.length > width) { lines.push(line); line = "" }
    line += token
  })
  if (line.length > 0) lines.push(line)
  return lines
}

export const writeIgesBreps = (parts: ReadonlyArray<IgesPart>): string => {
  if (parts.length === 0) throw new RangeError("IGES needs at least one body")
  const entities: Array<{ type: number; form: number; values: ReadonlyArray<number | string>; name: string }> = []
  const add = (type: number, values: ReadonlyArray<number | string>, form = 0, name = ""): number => { entities.push({ type, values, form, name }); return 2 * entities.length - 1 }
  const point = (p: Vec3) => add(116, [...xyz(p), 0])
  const direction = (p: Vec3) => add(123, xyz(p))
  const curve = (c: Curve3, t0: number, t1: number): number => {
    if (c.kind === "line") return add(110, [...xyz(curvePoint(c, t0)), ...xyz(curvePoint(c, t1))])
    let data: NurbsCurveData
    if (c.kind === "nurbs") data = c.data
    else {
      const arc = arcControl(1, t0, t1 - t0)
      data = { degree: 2, knots: arc.knots, weights: arc.weights, points: arc.points.map((p) => xyz(add3(c.frame.origin, add3(scale3(c.frame.x, p[0]! * (c.kind === "circle" ? c.radius : c.a)), scale3(c.frame.y, p[1]! * (c.kind === "circle" ? c.radius : c.b)))))) }
      t0 = 0; t1 = 1
    }
    return add(126, [data.points.length - 1, data.degree, 0, 0, data.weights === undefined ? 1 : 0, 0, ...data.knots, ...(data.weights ?? data.points.map(() => 1)), ...data.points.flat(), t0, t1, 0, 0, 0])
  }
  const surface = (s: Surface): number => {
    if (s.kind === "nurbs") {
      const d = s.data, n = d.points.length, m = d.points[0]!.length
      return add(128, [n - 1, m - 1, d.degreeU, d.degreeV, 0, 0, d.weights === undefined ? 1 : 0, 0, 0, ...d.knotsU, ...d.knotsV,
        ...Array.from({ length: m }, (_, j) => Array.from({ length: n }, (_, i) => d.weights?.[i]?.[j] ?? 1)).flat(),
        ...Array.from({ length: m }, (_, j) => Array.from({ length: n }, (_, i) => d.points[i]![j]!)).flat(2), ...surfaceDomain(d)])
    }
    if (s.kind === "revolution") return add(120, [add(110, [...xyz(s.origin), ...xyz(add3(s.origin, s.axis))]), curve(s.curve, ... (s.curve.kind === "nurbs" ? curveDomain(s.curve.data) : s.curve.kind === "line" ? [0, 1] as const : [0, TAU] as const)), 0, TAU])
    if (s.kind === "extrusion") {
      const range = s.curve.kind === "nurbs" ? curveDomain(s.curve.data) : s.curve.kind === "line" ? [0, 1] as const : [0, TAU] as const
      return add(122, [curve(s.curve, range[0], range[1]), ...xyz(add3(curvePoint(s.curve, range[0]), s.dir))])
    }
    const f = s.frame, p = point(f.origin), z = direction(s.kind === "cone" && s.semiAngle < 0 ? scale3(f.z, -1) : f.z), x = direction(f.x)
    if (s.kind === "plane") return add(190, [p, z, x], 1)
    if (s.kind === "cylinder") return add(192, [p, z, s.radius, x], 1)
    if (s.kind === "cone") return add(194, [p, z, s.radius, Math.abs(s.semiAngle) * 180 / Math.PI, x], 1)
    if (s.kind === "sphere") return add(196, [p, s.radius, z, x], 1)
    return add(198, [p, z, s.major, s.minor, x], 1)
  }
  for (const part of parts) {
    const b = part.brep, report = validateBrep(b)
    if (!report.valid || !report.manifoldSolid) throw new RangeError(`IGES solid '${part.name}' is not a valid closed B-rep`)
    const vertices = add(502, [b.vertices.length, ...b.vertices.flatMap((v) => xyz(v.point))], 1)
    const curves = b.edges.map((e) => curve(e.curve, e.t0, e.t1))
    const edges = add(504, [b.edges.length, ...b.edges.flatMap((e, i) => [curves[i]!, vertices, e.v0 + 1, vertices, e.v1 + 1])], 1)
    const faces = b.faces.map((f) => {
      const loops = f.loops.map((l) => add(508, [l.coedges.length, ...l.coedges.flatMap((c) => [0, edges, c.edge + 1, c.reversed ? 0 : 1, 0])], 1))
      return add(510, [surface(f.surface), loops.length, 1, ...loops], 1, f.name ?? "")
    })
    const shells = b.shells.map((s) => add(514, [s.faces.length, ...s.faces.flatMap((fi) => [faces[fi]!, b.faces[fi]!.reversed ? 0 : 1])], 1))
    add(186, [shells[0]!, 1, shells.length - 1, ...shells.slice(1).flatMap((id) => [id, 1])], 0, part.name)
  }
  const start = [record("CADCAMFUN IGES 5.3 exact B-rep", "S", 1)]
  const global = [hollerith(","), hollerith(";"), hollerith("CADCAMFUN"), hollerith("model.igs"), hollerith("CADCAMFUN"), hollerith("CADCAMFUN"), 32, 38, 6, 308, 15, hollerith("CADCAMFUN"), 1, 2, hollerith("MM"), 1, 0.01, hollerith("20261021.000000"), 1e-6, 1e6, hollerith(""), hollerith(""), 11, 0, hollerith("20261021.000000")]
  const g = parameterLines(global, 72).map((v, i) => record(v, "G", i + 1)), d: string[] = [], p: string[] = []
  entities.forEach((e, i) => {
    const id = i * 2 + 1
    const lines = parameterLines([e.type, ...e.values.map((v) => typeof v === "string" ? hollerith(v) : v)], 64)
    const status = e.type === 186 ? "00000000" : "00010000"
    d.push(record([e.type, p.length + 1, 0, 0, 0, 0, 0, 0, status].map(field).join(""), "D", id))
    const label = e.name.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 8)
    d.push(record([e.type, 0, 0, lines.length, e.form, 0, 0, label, 0].map(field).join(""), "D", id + 1))
    for (const line of lines) p.push(record(line.padEnd(64) + field(id), "P", p.length + 1))
  })
  return [...start, ...g, ...d, ...p, record(`S${String(start.length).padStart(7)}G${String(g.length).padStart(7)}D${String(d.length).padStart(7)}P${String(p.length).padStart(7)}`, "T", 1)].join("\n") + "\n"
}

/** Hollerith strings may contain commas and semicolons; splitting on punctuation corrupts otherwise valid IGES files. */
const tokens = (text: string, delimiter = ",", terminator = ";"): Array<string | number> => {
  const out: Array<string | number> = []
  let at = 0
  while (at < text.length) {
    while (text[at] === " ") at++
    const h = /^(\d+)H/i.exec(text.slice(at))
    if (h !== null) {
      const length = Number(h[1]); at += h[0].length
      if (length > text.length - at) throw new RangeError("truncated Hollerith string")
      out.push(text.slice(at, at + length)); at += length
    } else {
      let end = at
      while (end < text.length && text[end] !== delimiter && text[end] !== terminator) end++
      const value = text.slice(at, end).trim()
      if (value !== "" && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[DEde][+-]?\d+)?$/.test(value)) throw new RangeError(`invalid IGES parameter '${value.slice(0, 40)}'`)
      out.push(value === "" ? 0 : Number(value.replace(/[dD]/, "e"))); at = end
    }
    if (text[at] === terminator) return out
    if (text[at] !== delimiter) throw new RangeError("missing IGES parameter delimiter")
    at++
  }
  throw new RangeError("unterminated IGES parameter record")
}

export const readIgesBreps = (text: string): IgesRead => {
  if (text.length > 20_000_000) throw new RangeError("IGES exceeds the 20 MB exchange limit")
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "")
  if (lines.some((l) => l.length !== 80 || !"SGDPT".includes(l[72]!))) throw new RangeError("expected IGES 80-column S/G/D/P/T records")
  const globals = lines.filter((l) => l[72] === "G").map((l) => l.slice(0, 72)).join("")
  const delimiter = /^1H(.)/.exec(globals)?.[1] ?? ","
  const terminator = new RegExp(`^1H.[\\s\\S]1H(.)`).exec(globals)?.[1] ?? ";"
  const g = tokens(globals, delimiter, terminator)
  const units = Number(g[13]), scales: Record<number, number> = { 1: 25.4, 2: 1, 4: 304.8, 5: 1609344, 6: 1000, 7: 1e6, 8: 0.0254, 9: 0.001, 10: 10, 11: 0.0000254 }
  const lengthScale = scales[units]
  if (lengthScale === undefined || !(Number(g[12]) === 1)) throw new RangeError(`unsupported IGES units ${units} or model scale`)
  const directory = lines.filter((l) => l[72] === "D")
  if (directory.length % 2 !== 0) throw new RangeError("unpaired IGES directory record")
  const parameters = new Map<number, string>()
  for (const line of lines.filter((l) => l[72] === "P")) { const id = Number(line.slice(64, 72)); parameters.set(id, (parameters.get(id) ?? "") + line.slice(0, 64)) }
  const entities = new Map<number, { type: number; form: number; values: Array<string | number>; label: string; transform: number }>()
  for (let i = 0; i < directory.length; i += 2) {
    const a = directory[i]!, b = directory[i + 1]!, id = Number(a.slice(73)), type = Number(a.slice(0, 8)), transform = Number(a.slice(48, 56))
    const raw = parameters.get(id)
    if (raw === undefined) throw new RangeError(`missing IGES parameters for entity ${id}`)
    const values = tokens(raw, delimiter, terminator)
    if (values.shift() !== type) throw new RangeError(`IGES directory/parameter type mismatch at ${id}`)
    if (!Number.isInteger(transform) || transform < 0) throw new RangeError(`invalid IGES transformation pointer at ${id}`)
    entities.set(id, { type, form: Number(b.slice(32, 40)), values, label: b.slice(56, 64).trim(), transform })
  }
  const entity = (id: number, type?: number) => { const e = entities.get(id); if (e === undefined || (type !== undefined && e.type !== type)) throw new RangeError(`IGES reference ${id}: expected type ${type ?? "supported"}`); return e }
  const nums = (id: number, type?: number) => entity(id, type).values.map((v) => { if (typeof v !== "number" || !Number.isFinite(v)) throw new RangeError(`non-numeric IGES geometry at ${id}`); return v })
  const vec = (v: ReadonlyArray<number>, at = 0, scale = lengthScale): Vec3 => { if (v.length < at + 3) throw new RangeError("truncated IGES vector"); return { x: v[at]! * scale, y: v[at + 1]! * scale, z: v[at + 2]! * scale } }
  /**
   * The rigid motion a 124 entity applies (rotation R and translation T, in model units), followed by the one its own
   * directory entry points to: IGES chains transformations that way. A matrix that is not a rotation or reflection (a
   * scale or shear) is refused: the kernel's analytic surfaces could not carry it exactly.
   */
  const matrix = (id: number, depth = 0): Transform => {
    if (depth > 32) throw new RangeError(`IGES transformation chain at ${id} is circular or deeper than 32`)
    const e = entity(id, 124), v = nums(id, 124)
    if (v.length < 12) throw new RangeError(`truncated IGES transformation ${id}`)
    const m = [v[0]!, v[1]!, v[2]!, v[4]!, v[5]!, v[6]!, v[8]!, v[9]!, v[10]!] as const
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const dot = m[3 * i]! * m[3 * j]! + m[3 * i + 1]! * m[3 * j + 1]! + m[3 * i + 2]! * m[3 * j + 2]!
      if (Math.abs(dot - (i === j ? 1 : 0)) > 1e-6) throw new RangeError(`IGES transformation ${id} is not a rigid motion (its matrix scales or shears)`)
    }
    const own: Transform = { m, t: { x: v[3]! * lengthScale, y: v[7]! * lengthScale, z: v[11]! * lengthScale } }
    return e.transform === 0 ? own : compose(own, matrix(e.transform, depth + 1))
  }
  /** Where an entity's definition space goes: its own transformation, then the one of the entity that refers to it. */
  const placement = (id: number, outer: Transform | undefined): Transform | undefined => {
    const own = entity(id).transform === 0 ? undefined : matrix(entity(id).transform)
    return own === undefined ? outer : outer === undefined ? own : compose(own, outer)
  }
  const placed = (tr: Transform | undefined, p: Vec3): Vec3 => (tr === undefined ? p : applyPoint(tr, p))
  const point = (id: number, outer?: Transform) => placed(placement(id, outer), vec(nums(id, 116)))
  const direction = (id: number, outer?: Transform) => { const tr = placement(id, outer), d = normalize3(vec(nums(id, 123), 0, 1)); return tr === undefined ? d : normalize3(applyDir(tr, d)) }
  const curve = (id: number, outer?: Transform): { curve: Curve3; t0: number; t1: number } => {
    const tr = placement(id, outer), read = definedCurve(id)
    return tr === undefined ? read : { ...read, curve: transformCurve(read.curve, tr) }
  }
  const definedCurve = (id: number): { curve: Curve3; t0: number; t1: number } => {
    const e = entity(id), v = nums(id)
    if (e.type === 110) {
      // The kernel's lines run along a unit direction with the parameter in mm (what transformBrep and the offsets expect).
      const from = vec(v), span = sub3(vec(v, 3), from), length = length3(span)
      if (!(length > 0)) throw new RangeError(`IGES line ${id} has zero length`)
      return { curve: { kind: "line", origin: from, dir: scale3(span, 1 / length) }, t0: 0, t1: length }
    }
    if (e.type === 100) {
      const center = { x: v[1]! * lengthScale, y: v[2]! * lengthScale, z: v[0]! * lengthScale }
      const radius = Math.hypot(v[3]! - v[1]!, v[4]! - v[2]!) * lengthScale
      const start = Math.atan2(v[4]! - v[2]!, v[3]! - v[1]!), end = Math.atan2(v[6]! - v[2]!, v[5]! - v[1]!)
      let sweep = end - start
      if (sweep <= 1e-12) sweep += TAU
      if (!(radius > 0)) throw new RangeError("IGES circular arc needs a positive radius")
      return { curve: { kind: "circle", radius, frame: frame(center) }, t0: start, t1: start + sweep }
    }
    if (e.type !== 126) throw new RangeError(`unsupported IGES curve type ${e.type} at ${id}`)
    const count = v[0]! + 1, degree = v[1]!
    if (!Number.isInteger(count) || count <= degree || count > 4096 || !Number.isInteger(degree) || degree < 1 || degree > 8) throw new RangeError("invalid IGES rational curve dimensions")
    let at = 6
    const knots = v.slice(at, at += count + degree + 1), weights = v.slice(at, at += count)
    const points = Array.from({ length: count }, () => { const p = xyz(vec(v, at)); at += 3; return p })
    const t0 = v[at]!, t1 = v[at + 1]!
    if (!(t1 > t0) || weights.some((w) => w <= 0) || knots.some((k, i) => i > 0 && k < knots[i - 1]!)) throw new RangeError("invalid IGES rational curve parameters")
    return { curve: { kind: "nurbs", data: { degree, knots, weights, points } }, t0, t1 }
  }
  const surface = (id: number, outer?: Transform): Surface => {
    const e = entity(id), v = nums(id), tr = placement(id, outer)
    if ([190, 192, 194, 196, 198].includes(e.type)) {
      // The location and axes are entities of their own, placed by this surface's transformation as well as their own.
      const axis = (ref: number) => direction(ref, tr), unplaced = (d: Vec3) => (tr === undefined ? d : normalize3(applyDir(tr, d)))
      const f = e.type === 196 ? frame(point(v[0]!, tr), e.form === 1 ? axis(v[2]!) : unplaced({ x: 0, y: 0, z: 1 }), e.form === 1 ? axis(v[3]!) : undefined) : frame(point(v[0]!, tr), axis(v[1]!), e.form === 1 ? axis(v[e.type === 190 ? 2 : e.type === 192 ? 3 : 4]!) : undefined)
      if (e.type === 190) return { kind: "plane", frame: f }
      if (e.type === 192) return { kind: "cylinder", frame: f, radius: v[2]! * lengthScale }
      if (e.type === 194) return { kind: "cone", frame: f, radius: v[2]! * lengthScale, semiAngle: v[3]! * Math.PI / 180 }
      if (e.type === 196) return { kind: "sphere", frame: f, radius: v[1]! * lengthScale }
      return { kind: "torus", frame: f, major: v[2]! * lengthScale, minor: v[3]! * lengthScale }
    }
    if (e.type === 120) {
      const axis = curve(v[0]!, tr)
      if (axis.curve.kind !== "line") throw new RangeError(`IGES reference ${v[0]}: expected type 110`)
      return { kind: "revolution", origin: axis.curve.origin, axis: normalize3(axis.curve.dir), curve: curve(v[1]!, tr).curve }
    }
    if (e.type === 122) { const c = curve(v[0]!, tr); return { kind: "extrusion", curve: c.curve, dir: sub3(placed(tr, vec(v, 1)), curvePoint(c.curve, c.t0)) } }
    if (e.type !== 128) throw new RangeError(`unsupported IGES surface type ${e.type} at ${id}`)
    const n = v[0]! + 1, m = v[1]! + 1, degreeU = v[2]!, degreeV = v[3]!
    if (![n, m, degreeU, degreeV].every(Number.isInteger) || n < 2 || m < 2 || n > 64 || m > 64 || degreeU < 1 || degreeV < 1 || degreeU > 8 || degreeV > 8) throw new RangeError("invalid IGES rational surface dimensions")
    let at = 9
    const knotsU = v.slice(at, at += n + degreeU + 1), knotsV = v.slice(at, at += m + degreeV + 1)
    const weights = Array.from({ length: n }, () => new Array<number>(m))
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) weights[i]![j] = v[at++]!
    const points = Array.from({ length: n }, () => new Array<number[]>(m))
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) { points[i]![j] = xyz(vec(v, at)); at += 3 }
    const data: NurbsSurfaceData = { degreeU, degreeV, knotsU, knotsV, weights, points }
    const problem = nurbsSurfaceProblem(data)
    if (problem !== undefined) throw new RangeError(problem)
    return tr === undefined ? { kind: "nurbs", data } : transformSurface({ kind: "nurbs", data }, tr)
  }
  const count = (value: number | undefined, max: number, label: string): number => {
    if (value === undefined || !Number.isInteger(value) || value < 0 || value > max) throw new RangeError(`invalid IGES ${label} count`)
    return value
  }
  const warnings: string[] = [], parts: IgesPart[] = []
  for (const [id, e] of entities) {
    if (e.type !== 186) continue
    try {
      const v = nums(id), shellIds = [{ id: v[0]!, forward: v[1] === 1 }, ...Array.from({ length: count(v[2], entities.size, "void shell") }, (_, i) => ({ id: v[3 + i * 2]!, forward: v[4 + i * 2] === 1 }))]
      const placedTopology = (ref: number, type: number): number => {
        const t = entity(ref, type).transform
        if (t !== 0) throw new RangeError(`IGES transformation ${t} on topology entity ${ref} (type ${type}) is not supported: its edges are shared with other faces; place the solid (186) or the geometry instead`)
        return ref
      }
      const vertices: Array<{ point: Vec3; tol: number }> = [], edges: Brep["edges"][number][] = [], faces: Face[] = [], shells: Shell[] = []
      const vertexMap = new Map<string, number>(), edgeMap = new Map<string, number>()
      const vertex = (ref: number, index: number) => { const key = `${ref}:${index}`; let to = vertexMap.get(key); if (to !== undefined) return to; const list = nums(ref, 502); if (!Number.isInteger(index) || index < 1 || index > list[0]!) throw new RangeError("IGES vertex index outside list"); to = vertices.length; vertices.push({ point: placed(placement(ref, undefined), vec(list, 1 + (index - 1) * 3)), tol: 1e-7 }); vertexMap.set(key, to); return to }
      const edge = (ref: number, index: number) => { const key = `${ref}:${index}`; let to = edgeMap.get(key); if (to !== undefined) return to; const list = nums(placedTopology(ref, 504), 504); if (!Number.isInteger(index) || index < 1 || index > list[0]!) throw new RangeError("IGES edge index outside list"); const at = 1 + (index - 1) * 5; const c = curve(list[at]!); to = edges.length; edges.push({ ...c, v0: vertex(list[at + 1]!, list[at + 2]!), v1: vertex(list[at + 3]!, list[at + 4]!), tol: 1e-7 }); edgeMap.set(key, to); return to }
      for (const sh of shellIds) {
        const sv = nums(placedTopology(sh.id, 514), 514), faceIds: number[] = []
        for (let i = 0; i < count(sv[0], Math.floor((sv.length - 1) / 2), "face"); i++) {
          const ref = sv[1 + i * 2]!, fv = nums(placedTopology(ref, 510), 510), reversed = (sv[2 + i * 2] === 0) !== !sh.forward
          const loops = Array.from({ length: count(fv[1], fv.length - 3, "loop") }, (_, j) => {
            const lv = nums(placedTopology(fv[3 + j]!, 508), 508), coedges: Coedge[] = []; let at = 1
            for (let k = 0; k < count(lv[0], Math.floor((lv.length - 1) / 5), "coedge"); k++) {
              if (lv[at] !== 0) throw new RangeError("IGES vertex-only loops are not supported")
              coedges.push({ edge: edge(lv[at + 1]!, lv[at + 2]!), reversed: lv[at + 3] === 0 })
              const curves = count(lv[at + 4], Math.floor((lv.length - at - 5) / 2), "parameter curve"); at += 5 + 2 * curves
              if (at > lv.length) throw new RangeError("truncated IGES loop")
            }
            return { coedges }
          })
          faceIds.push(faces.length); faces.push({ surface: surface(fv[0]!), reversed, loops, name: entity(ref).label })
        }
        shells.push({ faces: faceIds, closed: true })
      }
      // The solid's own transformation moves all of it; a reflection turns its faces inside out, which transformBrep handles.
      const defined = compactBrep({ vertices, edges, faces, shells }), brep = e.transform === 0 ? defined : transformBrep(defined, matrix(e.transform)), report = validateBrep(brep)
      if (!report.valid || !report.manifoldSolid) throw new RangeError(report.issues[0]?.message ?? "not a solid")
      parts.push({ name: e.label || `IGES solid ${id}`, brep })
    } catch (cause) { warnings.push(`solid ${id} refused: ${cause instanceof Error ? cause.message : String(cause)}`) }
  }
  const supported = new Set([100, 110, 116, 120, 122, 123, 124, 126, 128, 186, 190, 192, 194, 196, 198, 502, 504, 508, 510, 514])
  for (const type of new Set([...entities.values()].map((e) => e.type))) if (!supported.has(type)) warnings.push(`unsupported IGES entity type ${type}`)
  if (parts.length === 0) warnings.push("no supported closed manifold IGES solid was found")
  return { parts, warnings, lengthScale }
}

export const parasolidDiagnostic = (): { readonly ok: false; readonly format: "parasolid"; readonly error: string } => ({ ok: false, format: "parasolid", error: "Parasolid x_t/x_b import is not supported by the native kernel. x_t is a text transmit format and x_b is binary; neither is STEP or IGES. Export an exact STEP or supported IGES B-rep from the source CAD system." })
