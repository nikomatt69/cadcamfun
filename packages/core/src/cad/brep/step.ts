/**
 * STEP (ISO 10303-21) exchange of exact B-reps, AP203 / AP214 / AP242 geometry and topology:
 *
 *   read   MANIFOLD_SOLID_BREP, BREP_WITH_VOIDS, SHELL_BASED_SURFACE_MODEL (open and closed shells), ADVANCED_FACE /
 *          FACE_SURFACE, ORIENTED_FACE, FACE_(OUTER_)BOUND, EDGE_LOOP, ORIENTED_EDGE, EDGE_CURVE, VERTEX_POINT;
 *          LINE, CIRCLE, ELLIPSE, POLYLINE, B_SPLINE_CURVE_WITH_KNOTS (rational too), TRIMMED_CURVE, SURFACE_CURVE,
 *          SEAM_CURVE; PLANE, CYLINDRICAL / CONICAL / SPHERICAL / TOROIDAL_SURFACE, B_SPLINE_SURFACE_WITH_KNOTS
 *          (rational too), SURFACE_OF_REVOLUTION, SURFACE_OF_LINEAR_EXTRUSION; length and plane-angle units;
 *          assemblies (REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION + ITEM_DEFINED_TRANSFORMATION, MAPPED_ITEM)
 *          with the product names.
 *   write  AP214 (AUTOMOTIVE_DESIGN) file with the product structure, millimetres and radians, one
 *          ADVANCED_BREP_SHAPE_REPRESENTATION per part.
 *
 * Nothing unsupported is guessed: unknown entities are reported in `warnings` and their faces skipped.
 */
import { compose, cross3, dot3, frame, IDENTITY, length3, neg3, normalize3, sub3, type Frame, type Transform, type Vec3 } from "./math.ts"
import { curvePeriod, curvePoint, curveProject, curveRange, type Curve3, type Surface } from "./geom.ts"
import type { NurbsCurveData, NurbsSurfaceData } from "./nurbs.ts"
import { looseReason } from "./tolerance.ts"
import { BrepBuilder, transformBrep, type Brep, type Coedge, type Shell } from "./topology.ts"

// ================================================================ parser

export type StepValue =
  | number
  | string
  | null
  | { readonly ref: number }
  | { readonly enum: string }
  | { readonly type: string; readonly args: ReadonlyArray<StepValue> }
  | ReadonlyArray<StepValue>

/** One instance: a simple entity has one part, a complex one (`#1=(A(..)B(..))`) several. */
export interface StepRecord {
  readonly id: number
  readonly parts: ReadonlyArray<{ readonly name: string; readonly args: ReadonlyArray<StepValue> }>
}

export interface StepFile {
  readonly header: ReadonlyArray<{ readonly name: string; readonly args: ReadonlyArray<StepValue> }>
  readonly records: ReadonlyMap<number, StepRecord>
}

class Lexer {
  i = 0
  constructor(readonly s: string) {}
  ws(): void {
    for (;;) {
      while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++
      if (this.s.startsWith("/*", this.i)) {
        const end = this.s.indexOf("*/", this.i + 2)
        this.i = end < 0 ? this.s.length : end + 2
        continue
      }
      return
    }
  }
  peek(): string {
    this.ws()
    return this.s[this.i] ?? ""
  }
  expect(ch: string): void {
    this.ws()
    if (this.s[this.i] !== ch) throw new SyntaxError(`STEP: expected '${ch}' at ${this.i}, found '${this.s.slice(this.i, this.i + 20)}'`)
    this.i++
  }
  keyword(): string {
    this.ws()
    const m = /^[A-Za-z_][A-Za-z0-9_\-]*/.exec(this.s.slice(this.i, this.i + 128))
    if (m === null) throw new SyntaxError(`STEP: keyword expected at ${this.i}`)
    this.i += m[0].length
    return m[0].toUpperCase()
  }
  value(): StepValue {
    this.ws()
    const c = this.s[this.i]
    if (c === "(") {
      this.i++
      const list: StepValue[] = []
      if (this.peek() === ")") { this.i++; return list }
      for (;;) {
        list.push(this.value())
        const n = this.peek()
        if (n === ",") { this.i++; continue }
        if (n === ")") { this.i++; return list }
        throw new SyntaxError(`STEP: ',' or ')' expected at ${this.i}`)
      }
    }
    if (c === "'") {
      let out = ""
      this.i++
      while (this.i < this.s.length) {
        const ch = this.s[this.i]!
        if (ch === "'") {
          if (this.s[this.i + 1] === "'") { out += "'"; this.i += 2; continue }
          this.i++
          break
        }
        out += ch
        this.i++
      }
      return decodeStepString(out)
    }
    if (c === "#") {
      const m = /^#(\d+)/.exec(this.s.slice(this.i, this.i + 24))!
      this.i += m[0].length
      return { ref: Number(m[1]) }
    }
    if (c === "$" || c === "*") { this.i++; return null }
    if (c === ".") {
      const end = this.s.indexOf(".", this.i + 1)
      const word = this.s.slice(this.i + 1, end)
      this.i = end + 1
      return { enum: word.toUpperCase() }
    }
    if (c === '"') {
      const end = this.s.indexOf('"', this.i + 1)
      const hex = this.s.slice(this.i + 1, end)
      this.i = end + 1
      return hex
    }
    const num = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(this.s.slice(this.i, this.i + 48))
    if (num !== null) { this.i += num[0].length; return Number(num[0]) }
    const word = this.keyword()
    this.expect("(")
    this.i--
    return { type: word, args: this.value() as ReadonlyArray<StepValue> }
  }
}

/** \X2\…\X0\ (UTF-16 hex) and \X\hh escapes of STEP strings. */
const decodeStepString = (s: string): string =>
  s
    .replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex: string) => {
      let out = ""
      for (let k = 0; k + 4 <= hex.length; k += 4) out += String.fromCharCode(parseInt(hex.slice(k, k + 4), 16))
      return out
    })
    .replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\S\\(.)/g, (_, ch: string) => String.fromCharCode(ch.charCodeAt(0) + 128))

/** Parses the HEADER and DATA sections. Throws `SyntaxError` on malformed text. */
export const parseStep = (text: string): StepFile => {
  const header: Array<{ name: string; args: ReadonlyArray<StepValue> }> = []
  const records = new Map<number, StepRecord>()
  const hStart = text.search(/HEADER\s*;/i)
  const dStart = text.search(/DATA\s*;/i)
  if (dStart < 0) throw new SyntaxError("STEP: no DATA section")
  if (hStart >= 0 && hStart < dStart) {
    const hText = text.slice(text.indexOf(";", hStart) + 1, dStart)
    const lx = new Lexer(hText)
    while (lx.peek() !== "" && !/^ENDSEC/i.test(hText.slice(lx.i, lx.i + 6))) {
      const name = lx.keyword()
      const args = lx.value() as ReadonlyArray<StepValue>
      lx.expect(";")
      header.push({ name, args })
    }
  }
  const body = text.slice(text.indexOf(";", dStart) + 1)
  const lx = new Lexer(body)
  for (;;) {
    const c = lx.peek()
    if (c === "" || /^ENDSEC/i.test(body.slice(lx.i, lx.i + 6))) break
    if (c !== "#") throw new SyntaxError(`STEP: instance expected at ${lx.i}: '${body.slice(lx.i, lx.i + 30)}'`)
    const m = /^#(\d+)\s*=\s*/.exec(body.slice(lx.i, lx.i + 40))
    if (m === null) throw new SyntaxError(`STEP: malformed instance at ${lx.i}`)
    lx.i += m[0].length
    const id = Number(m[1])
    const parts: Array<{ name: string; args: ReadonlyArray<StepValue> }> = []
    if (lx.peek() === "(") {
      lx.i++
      while (lx.peek() !== ")") {
        const name = lx.keyword()
        parts.push({ name, args: lx.value() as ReadonlyArray<StepValue> })
      }
      lx.i++
    } else {
      const name = lx.keyword()
      parts.push({ name, args: lx.value() as ReadonlyArray<StepValue> })
    }
    lx.expect(";")
    records.set(id, { id, parts })
  }
  return { header, records }
}

// ================================================================ reader

export interface StepPart {
  /** Product (or representation item) name. */
  readonly name: string
  readonly brep: Brep
  /** Placement of this instance in the file's root coordinates (already applied to `brep`). */
  readonly transform: Transform
}

export interface StepReadResult {
  readonly parts: ReadonlyArray<StepPart>
  readonly warnings: ReadonlyArray<string>
  /** Millimetres per file length unit. */
  readonly lengthScale: number
  readonly schema: string | undefined
}

const isRef = (v: StepValue | undefined): v is { readonly ref: number } => typeof v === "object" && v !== null && !Array.isArray(v) && "ref" in v
const isEnum = (v: StepValue | undefined): v is { readonly enum: string } => typeof v === "object" && v !== null && !Array.isArray(v) && "enum" in v
const asList = (v: StepValue | undefined): ReadonlyArray<StepValue> => (Array.isArray(v) ? v : [])
const asNum = (v: StepValue | undefined): number => {
  if (typeof v === "number") return v
  if (typeof v === "object" && v !== null && !Array.isArray(v) && "type" in v) return asNum(v.args[0])
  throw new TypeError(`STEP: number expected, got ${JSON.stringify(v)}`)
}
const asBool = (v: StepValue | undefined): boolean => isEnum(v) && (v.enum === "T" || v.enum === "TRUE")

class StepReader {
  readonly warnings: string[] = []
  lengthScale = 1
  angleScale = 1
  private readonly curveCache = new Map<number, Curve3 | undefined>()
  private readonly surfCache = new Map<number, Surface | undefined>()

  constructor(readonly file: StepFile) {
    this.units()
  }

  rec(id: number): StepRecord {
    const r = this.file.records.get(id)
    if (r === undefined) throw new RangeError(`STEP: #${id} is not defined`)
    return r
  }
  /** Simple entity name, or the part list of a complex one. */
  name(id: number): string {
    const r = this.rec(id)
    return r.parts.length === 1 ? r.parts[0]!.name : r.parts.map((p) => p.name).join("+")
  }
  part(id: number, name: string): ReadonlyArray<StepValue> | undefined {
    return this.rec(id).parts.find((p) => p.name === name)?.args
  }
  args(id: number): ReadonlyArray<StepValue> {
    return this.rec(id).parts[0]!.args
  }
  has(id: number, name: string): boolean {
    return this.rec(id).parts.some((p) => p.name === name)
  }

  /**
   * Units of the geometric context: the ones GLOBAL_UNIT_ASSIGNED_CONTEXT names (an inch is defined through a
   * millimetre unit elsewhere in the file, so "the first LENGTH_UNIT" is not the answer).
   */
  private units(): void {
    let candidates: StepRecord[] = []
    for (const r of this.file.records.values()) {
      const g = r.parts.find((p) => p.name === "GLOBAL_UNIT_ASSIGNED_CONTEXT")
      if (g !== undefined) {
        candidates = asList(g.args[0]).filter(isRef).map((x) => this.rec(x.ref))
        break
      }
    }
    if (candidates.length === 0) candidates = [...this.file.records.values()]
    const length = candidates.find((r) => r.parts.some((p) => p.name === "LENGTH_UNIT"))
    if (length !== undefined) {
      const si = length.parts.find((p) => p.name === "SI_UNIT")
      const conv = length.parts.find((p) => p.name === "CONVERSION_BASED_UNIT")
      if (conv !== undefined) {
        const f = this.conversion(conv.args[1])
        if (f !== undefined) this.lengthScale = f.factor * f.base
        else {
          const label = String(conv.args[0] ?? "").toUpperCase()
          this.lengthScale = label.startsWith("INCH") ? 25.4 : label.startsWith("FOOT") ? 304.8 : 1
        }
      } else if (si !== undefined) {
        const prefix = isEnum(si.args[0]) ? si.args[0].enum : ""
        this.lengthScale = { MILLI: 1, CENTI: 10, DECI: 100, KILO: 1e6, MICRO: 1e-3, NANO: 1e-6 }[prefix] ?? 1000
      }
    }
    const angle = candidates.find((r) => r.parts.some((p) => p.name === "PLANE_ANGLE_UNIT"))
    if (angle !== undefined) {
      const conv = angle.parts.find((p) => p.name === "CONVERSION_BASED_UNIT")
      if (conv !== undefined) {
        const f = this.conversion(conv.args[1])
        this.angleScale = f !== undefined ? f.factor : Math.PI / 180
      }
    }
  }

  /** `*_MEASURE_WITH_UNIT(value, unit)`: value × the unit's own SI scale (mm for lengths). */
  private conversion(v: StepValue | undefined): { readonly factor: number; readonly base: number } | undefined {
    if (!isRef(v)) return undefined
    const a = this.args(v.ref)
    const factor = asNum(a[0])
    let base = 1
    if (isRef(a[1])) {
      const u = this.rec(a[1].ref)
      const si = u.parts.find((p) => p.name === "SI_UNIT")
      if (si !== undefined && u.parts.some((p) => p.name === "LENGTH_UNIT")) {
        const prefix = isEnum(si.args[0]) ? si.args[0].enum : ""
        base = { MILLI: 1, CENTI: 10, DECI: 100, KILO: 1e6, MICRO: 1e-3 }[prefix] ?? 1000
      }
    }
    return { factor, base }
  }

  point(id: number): Vec3 {
    const a = this.args(id)
    const c = asList(a[1]).map(asNum)
    return { x: (c[0] ?? 0) * this.lengthScale, y: (c[1] ?? 0) * this.lengthScale, z: (c[2] ?? 0) * this.lengthScale }
  }
  direction(id: number): Vec3 {
    const c = asList(this.args(id)[1]).map(asNum)
    return normalize3({ x: c[0] ?? 0, y: c[1] ?? 0, z: c[2] ?? 0 })
  }
  placement(id: number): Frame {
    const a = this.args(id)
    const o = this.point((a[1] as { ref: number }).ref)
    const z = isRef(a[2]) ? this.direction(a[2].ref) : { x: 0, y: 0, z: 1 }
    const x = isRef(a[3]) ? this.direction(a[3].ref) : undefined
    return frame(o, z, x)
  }

  curve(id: number): Curve3 | undefined {
    if (this.curveCache.has(id)) return this.curveCache.get(id)
    let c: Curve3 | undefined
    try {
      c = this.curveUncached(id)
    } catch (e) {
      this.warnings.push(`curve #${id}: ${(e as Error).message}`)
    }
    this.curveCache.set(id, c)
    return c
  }

  private curveUncached(id: number): Curve3 | undefined {
    const r = this.rec(id)
    const kind = r.parts.length === 1 ? r.parts[0]!.name : "COMPLEX"
    const a = r.parts[0]!.args
    switch (kind) {
      case "LINE": {
        const p = this.point((a[1] as { ref: number }).ref)
        const v = this.args((a[2] as { ref: number }).ref)
        const d = this.direction((v[1] as { ref: number }).ref)
        return { kind: "line", origin: p, dir: d }
      }
      case "CIRCLE":
        return { kind: "circle", frame: this.placement((a[1] as { ref: number }).ref), radius: asNum(a[2]) * this.lengthScale }
      case "ELLIPSE":
        return { kind: "ellipse", frame: this.placement((a[1] as { ref: number }).ref), a: asNum(a[2]) * this.lengthScale, b: asNum(a[3]) * this.lengthScale }
      case "SURFACE_CURVE":
      case "SEAM_CURVE":
      case "INTERSECTION_CURVE":
        return isRef(a[1]) ? this.curve(a[1].ref) : undefined
      case "TRIMMED_CURVE":
        return isRef(a[1]) ? this.curve(a[1].ref) : undefined
      case "POLYLINE": {
        const pts = asList(a[1]).map((p) => this.point((p as { ref: number }).ref))
        const knots = [0, 0, ...pts.slice(1, -1).map((_, i) => i + 1), pts.length - 1, pts.length - 1]
        return { kind: "nurbs", data: { degree: 1, knots, points: pts.map((p) => [p.x, p.y, p.z]) } }
      }
      case "B_SPLINE_CURVE_WITH_KNOTS": {
        const degree = asNum(a[1])
        const points = asList(a[2]).map((p) => { const q = this.point((p as { ref: number }).ref); return [q.x, q.y, q.z] })
        const knots = expandKnots(asList(a[6]).map(asNum), asList(a[7]).map(asNum))
        return { kind: "nurbs", data: { degree, knots, points } }
      }
      case "COMPLEX": {
        const bs = this.part(id, "B_SPLINE_CURVE")
        const wk = this.part(id, "B_SPLINE_CURVE_WITH_KNOTS")
        if (bs === undefined || wk === undefined) throw new Error(`unsupported complex curve ${this.name(id)}`)
        const degree = asNum(bs[0])
        const points = asList(bs[1]).map((p) => { const q = this.point((p as { ref: number }).ref); return [q.x, q.y, q.z] })
        const knots = expandKnots(asList(wk[0]).map(asNum), asList(wk[1]).map(asNum))
        const rat = this.part(id, "RATIONAL_B_SPLINE_CURVE")
        const data: NurbsCurveData = rat === undefined ? { degree, knots, points } : { degree, knots, points, weights: asList(rat[0]).map(asNum) }
        return { kind: "nurbs", data }
      }
      default:
        throw new Error(`unsupported curve ${kind}`)
    }
  }

  surface(id: number): Surface | undefined {
    if (this.surfCache.has(id)) return this.surfCache.get(id)
    let s: Surface | undefined
    try {
      s = this.surfaceUncached(id)
    } catch (e) {
      this.warnings.push(`surface #${id}: ${(e as Error).message}`)
    }
    this.surfCache.set(id, s)
    return s
  }

  private surfaceUncached(id: number): Surface | undefined {
    const r = this.rec(id)
    const kind = r.parts.length === 1 ? r.parts[0]!.name : "COMPLEX"
    const a = r.parts[0]!.args
    const L = this.lengthScale
    switch (kind) {
      case "PLANE":
        return { kind: "plane", frame: this.placement((a[1] as { ref: number }).ref) }
      case "CYLINDRICAL_SURFACE":
        return { kind: "cylinder", frame: this.placement((a[1] as { ref: number }).ref), radius: asNum(a[2]) * L }
      case "CONICAL_SURFACE":
        return { kind: "cone", frame: this.placement((a[1] as { ref: number }).ref), radius: asNum(a[2]) * L, semiAngle: asNum(a[3]) * this.angleScale }
      case "SPHERICAL_SURFACE":
        return { kind: "sphere", frame: this.placement((a[1] as { ref: number }).ref), radius: asNum(a[2]) * L }
      case "TOROIDAL_SURFACE":
      case "DEGENERATE_TOROIDAL_SURFACE":
        return { kind: "torus", frame: this.placement((a[1] as { ref: number }).ref), major: asNum(a[2]) * L, minor: asNum(a[3]) * L }
      case "SURFACE_OF_REVOLUTION": {
        const c = this.curve((a[1] as { ref: number }).ref)
        if (c === undefined) return undefined
        const ax = this.args((a[2] as { ref: number }).ref)
        return { kind: "revolution", curve: c, origin: this.point((ax[1] as { ref: number }).ref), axis: isRef(ax[2]) ? this.direction(ax[2].ref) : { x: 0, y: 0, z: 1 } }
      }
      case "SURFACE_OF_LINEAR_EXTRUSION": {
        const c = this.curve((a[1] as { ref: number }).ref)
        if (c === undefined) return undefined
        const v = this.args((a[2] as { ref: number }).ref)
        return { kind: "extrusion", curve: c, dir: this.direction((v[1] as { ref: number }).ref) }
      }
      case "B_SPLINE_SURFACE_WITH_KNOTS": {
        const grid = asList(a[3]).map((row) => asList(row).map((p) => { const q = this.point((p as { ref: number }).ref); return [q.x, q.y, q.z] }))
        const knotsU = expandKnots(asList(a[8]).map(asNum), asList(a[10]).map(asNum))
        const knotsV = expandKnots(asList(a[9]).map(asNum), asList(a[11]).map(asNum))
        return { kind: "nurbs", data: { degreeU: asNum(a[1]), degreeV: asNum(a[2]), knotsU, knotsV, points: grid } }
      }
      case "COMPLEX": {
        const bs = this.part(id, "B_SPLINE_SURFACE")
        const wk = this.part(id, "B_SPLINE_SURFACE_WITH_KNOTS")
        if (bs === undefined || wk === undefined) throw new Error(`unsupported complex surface ${this.name(id)}`)
        const grid = asList(bs[2]).map((row) => asList(row).map((p) => { const q = this.point((p as { ref: number }).ref); return [q.x, q.y, q.z] }))
        const knotsU = expandKnots(asList(wk[0]).map(asNum), asList(wk[2]).map(asNum))
        const knotsV = expandKnots(asList(wk[1]).map(asNum), asList(wk[3]).map(asNum))
        const rat = this.part(id, "RATIONAL_B_SPLINE_SURFACE")
        const data: NurbsSurfaceData = { degreeU: asNum(bs[0]), degreeV: asNum(bs[1]), knotsU, knotsV, points: grid, ...(rat === undefined ? {} : { weights: asList(rat[0]).map((row) => asList(row).map(asNum)) }) }
        return { kind: "nurbs", data }
      }
      default:
        throw new Error(`unsupported surface ${kind}`)
    }
  }

  /** A solid, shell model or face set as one Brep. */
  solid(id: number): Brep | undefined {
    const kind = this.name(id)
    const shells: Array<{ readonly id: number; readonly closed: boolean; readonly flip: boolean }> = []
    const a = this.args(id)
    if (kind === "MANIFOLD_SOLID_BREP" || kind === "FACETED_BREP") shells.push({ id: (a[1] as { ref: number }).ref, closed: true, flip: false })
    else if (kind === "BREP_WITH_VOIDS") {
      shells.push({ id: (a[1] as { ref: number }).ref, closed: true, flip: false })
      // Voids are oriented closed shells pointing into the material.
      for (const v of asList(a[2])) if (isRef(v)) shells.push({ id: v.ref, closed: true, flip: false })
    } else if (kind === "SHELL_BASED_SURFACE_MODEL") {
      for (const v of asList(a[1])) if (isRef(v)) shells.push({ id: v.ref, closed: this.name(v.ref) === "CLOSED_SHELL", flip: false })
    } else return undefined
    const b = new BrepBuilder(1e-7)
    const vertexOf = new Map<number, number>()
    const edgeOf = new Map<number, { readonly edge: number; readonly swapped: boolean } | undefined>()
    const outShells: Shell[] = []
    for (const sh of shells) {
      const shellKind = this.name(sh.id)
      let faceRefs = asList(this.args(sh.id)[1])
      // ORIENTED_CLOSED_SHELL(name, *, closed_shell, orientation): .F. uses the shell turned inside out (voids).
      let flip = false
      if (shellKind === "ORIENTED_CLOSED_SHELL") {
        const a = this.args(sh.id)
        faceRefs = asList(this.args((a[2] as { ref: number }).ref)[1])
        flip = !asBool(a[3])
      }
      const faces: number[] = []
      for (const fr of faceRefs) {
        if (!isRef(fr)) continue
        const fi = this.face(fr.ref, b, vertexOf, edgeOf, flip)
        if (fi !== undefined) faces.push(fi)
      }
      outShells.push({ faces, closed: sh.closed })
    }
    const built = b.build()
    return { ...built, shells: outShells }
  }

  private vertex(id: number, b: BrepBuilder, map: Map<number, number>): number {
    let v = map.get(id)
    if (v === undefined) {
      const a = this.args(id)
      v = b.newVertex(this.point((a[1] as { ref: number }).ref))
      map.set(id, v)
    }
    return v
  }

  /** EDGE_CURVE → kernel edge (t0 < t1 along the curve); `swapped` when the STEP edge runs against the curve. */
  private edge(id: number, b: BrepBuilder, vmap: Map<number, number>, emap: Map<number, { readonly edge: number; readonly swapped: boolean } | undefined>): { readonly edge: number; readonly swapped: boolean } | undefined {
    if (emap.has(id)) return emap.get(id)
    const a = this.args(id)
    const vs = this.vertex((a[1] as { ref: number }).ref, b, vmap)
    const ve = this.vertex((a[2] as { ref: number }).ref, b, vmap)
    const curve = isRef(a[3]) ? this.curve(a[3].ref) : undefined
    if (curve === undefined) {
      this.warnings.push(`edge #${id}: no usable curve`)
      emap.set(id, undefined)
      return undefined
    }
    const sameSense = asBool(a[4])
    const ps = b.vertices[vs]!.point, pe = b.vertices[ve]!.point
    // Parameters of the end vertices along the curve.
    const [lo, hi] = curveRange(curve)
    const period = curvePeriod(curve)
    let ts = curveProject(curve, ps)
    let te = curveProject(curve, pe)
    if (curve.kind === "nurbs") {
      if (vs === ve) { ts = lo; te = hi }
    }
    // Walk along the curve's direction from start to end (STEP: same_sense = the edge runs with the curve).
    let [v0, v1, t0, t1, swapped] = sameSense ? [vs, ve, ts, te, false] : [ve, vs, te, ts, true]
    if (period !== undefined) {
      while (t1 <= t0 + 1e-12) t1 += period
      if (t1 - t0 > period + 1e-9) t1 -= period
      if (vs === ve && t1 - t0 < 1e-9) t1 = t0 + period
    } else if (t1 < t0) {
      // A non-periodic curve traversed against its parameterisation although same_sense says otherwise: trust the
      // geometry.
      ;[t0, t1] = [t1, t0]
      ;[v0, v1] = [v1, v0]
      swapped = !swapped
    }
    if (!(t1 > t0)) {
      this.warnings.push(`edge #${id}: degenerate parameter range`)
      emap.set(id, undefined)
      return undefined
    }
    const gap = Math.max(length3(sub3(curvePoint(curve, t0), b.vertices[v0]!.point)), length3(sub3(curvePoint(curve, t1), b.vertices[v1]!.point)))
    if (gap > 1e-2 * this.lengthScale) this.warnings.push(`edge #${id}: vertices ${gap.toExponential(2)} mm off the curve`)
    void lo
    void hi
    b.edges.push({ curve, t0, t1, v0, v1, tol: Math.max(1e-7, gap * 1.01) })
    const out = { edge: b.edges.length - 1, swapped }
    emap.set(id, out)
    return out
  }

  private face(
    id: number,
    b: BrepBuilder,
    vmap: Map<number, number>,
    emap: Map<number, { readonly edge: number; readonly swapped: boolean } | undefined>,
    flip = false
  ): number | undefined {
    const kind = this.name(id)
    if (kind === "ORIENTED_FACE") {
      const a = this.args(id)
      return this.face((a[2] as { ref: number }).ref, b, vmap, emap, !asBool(a[3]) !== flip)
    }
    if (kind !== "ADVANCED_FACE" && kind !== "FACE_SURFACE") {
      this.warnings.push(`face #${id}: unsupported ${kind}`)
      return undefined
    }
    const a = this.args(id)
    const surface = isRef(a[2]) ? this.surface(a[2].ref) : undefined
    if (surface === undefined) return undefined
    const loops: Coedge[][] = []
    for (const bref of asList(a[1])) {
      if (!isRef(bref)) continue
      const bound = this.args(bref.ref)
      const loopRef = bound[1] as { ref: number }
      const boundSense = asBool(bound[2])
      const lk = this.name(loopRef.ref)
      if (lk === "VERTEX_LOOP") continue
      if (lk !== "EDGE_LOOP") {
        this.warnings.push(`face #${id}: unsupported loop ${lk}`)
        continue
      }
      const coedges: Coedge[] = []
      for (const oe of asList(this.args(loopRef.ref)[1])) {
        if (!isRef(oe)) continue
        const o = this.args(oe.ref)
        const e = this.edge((o[3] as { ref: number }).ref, b, vmap, emap)
        if (e === undefined) { coedges.length = 0; break }
        const orientation = asBool(o[4])
        coedges.push({ edge: e.edge, reversed: orientation === e.swapped })
      }
      if (coedges.length === 0) continue
      loops.push(boundSense ? coedges : [...coedges].reverse().map((c) => ({ ...c, reversed: !c.reversed })))
    }
    if (loops.length === 0) {
      this.warnings.push(`face #${id}: no usable loop`)
      return undefined
    }
    const sameSense = asBool(a[3])
    const finalLoops = flip ? loops.map((l) => [...l].reverse().map((c) => ({ ...c, reversed: !c.reversed }))) : loops
    const name = typeof a[0] === "string" && a[0] !== "" && a[0] !== "NONE" ? a[0] : undefined
    return b.face(surface, flip ? sameSense : !sameSense, finalLoops, name)
  }

  /** Transform of ITEM_DEFINED_TRANSFORMATION: maps placement `from` (child) onto `to` (parent). */
  idt(id: number): Transform {
    const a = this.args(id)
    const from = this.placement((a[2] as { ref: number }).ref)
    const to = this.placement((a[3] as { ref: number }).ref)
    return compose(inverseFrame(from), frameTransform(to))
  }
}

const expandKnots = (mults: ReadonlyArray<number>, knots: ReadonlyArray<number>): number[] => {
  const out: number[] = []
  knots.forEach((k, i) => { for (let m = 0; m < (mults[i] ?? 1); m++) out.push(k) })
  return out
}

/** Local → world transform of a frame. */
export const frameTransform = (f: Frame): Transform => ({ m: [f.x.x, f.y.x, f.z.x, f.x.y, f.y.y, f.z.y, f.x.z, f.y.z, f.z.z], t: f.origin })
const inverseFrame = (f: Frame): Transform => {
  const m = [f.x.x, f.x.y, f.x.z, f.y.x, f.y.y, f.y.z, f.z.x, f.z.y, f.z.z] as const
  const t = { x: -(m[0] * f.origin.x + m[1] * f.origin.y + m[2] * f.origin.z), y: -(m[3] * f.origin.x + m[4] * f.origin.y + m[5] * f.origin.z), z: -(m[6] * f.origin.x + m[7] * f.origin.y + m[8] * f.origin.z) }
  return { m, t }
}

const SOLID_KINDS = new Set(["MANIFOLD_SOLID_BREP", "BREP_WITH_VOIDS", "SHELL_BASED_SURFACE_MODEL", "FACETED_BREP"])

/**
 * Reads every solid of a STEP file, placed by the assembly structure, in millimetres. Parts that appear several times
 * in an assembly come back once per instance.
 */
export const readStepBreps = (text: string): StepReadResult => {
  const file = parseStep(text)
  const R = new StepReader(file)
  const schemaArg = file.header.find((h) => h.name === "FILE_SCHEMA")?.args[0]
  const schema = Array.isArray(schemaArg) && typeof schemaArg[0] === "string" ? schemaArg[0] : undefined
  // Representation graph. Representations tied by SHAPE_REPRESENTATION_RELATIONSHIP (no transform) share their
  // coordinates and form one group, whichever way round the exporter wrote the pair; transformed relationships and
  // mapped items make the assembly tree between groups.
  const items = new Map<number, number[]>()
  const uf = new Map<number, number>()
  const find = (x: number): number => {
    let r = x
    while (uf.has(r) && uf.get(r) !== r) r = uf.get(r)!
    return r
  }
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) uf.set(rb, ra)
  }
  const transformLinks: Array<{ readonly parent: number; readonly child: number; readonly tr: Transform }> = []
  const repName = new Map<number, string>()
  const productNameOfRep = new Map<number, string>()
  const link = (p: number, child: number, tr: Transform) => {
    if (tr === IDENTITY) union(p, child)
    else transformLinks.push({ parent: p, child, tr })
  }
  for (const r of file.records.values()) {
    const names = r.parts.map((p) => p.name)
    const repPart = r.parts.find((p) => /SHAPE_REPRESENTATION$|^SHAPE_REPRESENTATION|BREP_SHAPE_REPRESENTATION$|SURFACE_SHAPE_REPRESENTATION$/.test(p.name) && !p.name.includes("RELATIONSHIP"))
    if (repPart !== undefined && r.parts.length <= 2) {
      items.set(r.id, asList(repPart.args[1]).filter(isRef).map((x) => x.ref))
      if (typeof repPart.args[0] === "string") repName.set(r.id, repPart.args[0])
    }
    if (names.includes("REPRESENTATION_RELATIONSHIP")) {
      const rr = r.parts.find((p) => p.name === "REPRESENTATION_RELATIONSHIP")!.args
      const wt = r.parts.find((p) => p.name === "REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION")
      const child = (rr[2] as { ref: number }).ref, parent = (rr[3] as { ref: number }).ref
      let tr: Transform = IDENTITY
      if (wt !== undefined && isRef(wt.args[0]) && R.name(wt.args[0].ref) === "ITEM_DEFINED_TRANSFORMATION") tr = R.idt(wt.args[0].ref)
      // An assembly link always counts as a tree edge, even when its transform is the identity.
      transformLinks.push({ parent, child, tr })
    } else if (names.length === 1 && names[0] === "SHAPE_REPRESENTATION_RELATIONSHIP") {
      const a = r.parts[0]!.args
      // Links a shape representation and the brep representation that carries its geometry (same coordinates).
      if (isRef(a[2]) && isRef(a[3])) link(a[2].ref, a[3].ref, IDENTITY)
    }
  }
  // Product names: SHAPE_DEFINITION_REPRESENTATION(PRODUCT_DEFINITION_SHAPE(→ PRODUCT_DEFINITION → … → PRODUCT), rep).
  for (const r of file.records.values()) {
    if (r.parts.length !== 1 || r.parts[0]!.name !== "SHAPE_DEFINITION_REPRESENTATION") continue
    const a = r.parts[0]!.args
    try {
      const pds = R.args((a[0] as { ref: number }).ref)
      const pd = R.args((pds[2] as { ref: number }).ref)
      const pdf = R.args((pd[2] as { ref: number }).ref)
      const product = R.args((pdf[2] as { ref: number }).ref)
      const nm = typeof product[1] === "string" && product[1] !== "" ? product[1] : typeof product[0] === "string" ? product[0] : undefined
      if (nm !== undefined && isRef(a[1])) productNameOfRep.set(a[1].ref, nm)
    } catch {
      // Unusual product structure: names fall back to representation names.
    }
  }
  const parts: StepPart[] = []
  const solidCache = new Map<number, Brep | undefined>()
  const solidOf = (id: number): Brep | undefined => {
    if (!solidCache.has(id)) solidCache.set(id, R.solid(id))
    return solidCache.get(id)
  }
  // Groups: members, names, child groups.
  const members = new Map<number, number[]>()
  for (const rep of items.keys()) {
    const g = find(rep)
    const l = members.get(g) ?? []
    l.push(rep)
    members.set(g, l)
  }
  const childGroups = new Map<number, Array<{ readonly group: number; readonly tr: Transform }>>()
  const isChildGroup = new Set<number>()
  for (const l of transformLinks) {
    const pg = find(l.parent), cg = find(l.child)
    const arr = childGroups.get(pg) ?? []
    arr.push({ group: cg, tr: l.tr })
    childGroups.set(pg, arr)
    isChildGroup.add(cg)
  }
  // Mapped items also make their target a child.
  for (const reps of members.values()) for (const rep of reps) for (const it of items.get(rep) ?? []) {
    if (R.name(it) !== "MAPPED_ITEM") continue
    const map = R.args((R.args(it)[1] as { ref: number }).ref)
    isChildGroup.add(find((map[1] as { ref: number }).ref))
  }
  const groupName = (g: number, fallback: string): string => {
    for (const rep of members.get(g) ?? [g]) { const n = productNameOfRep.get(rep); if (n !== undefined) return n }
    for (const rep of members.get(g) ?? [g]) { const n = repName.get(rep); if (n !== undefined && n !== "") return n }
    return fallback
  }
  const visit = (g: number, tr: Transform, name: string, depth: number, seen: ReadonlySet<number>): void => {
    if (depth > 64 || seen.has(g)) return
    const own = groupName(g, name)
    const nextSeen = new Set([...seen, g])
    for (const rep of members.get(g) ?? [g]) {
      for (const it of items.get(rep) ?? []) {
        const kind = R.name(it)
        if (SOLID_KINDS.has(kind)) {
          const b = solidOf(it)
          if (b !== undefined) parts.push({ name: own, brep: tr === IDENTITY ? b : transformBrep(b, tr), transform: tr })
        } else if (kind === "MAPPED_ITEM") {
          const a = R.args(it)
          const map = R.args((a[1] as { ref: number }).ref)
          const origin = R.placement((map[0] as { ref: number }).ref)
          const target = R.name((a[2] as { ref: number }).ref) === "AXIS2_PLACEMENT_3D" ? R.placement((a[2] as { ref: number }).ref) : origin
          const local = compose(inverseFrame(origin), frameTransform(target))
          visit(find((map[1] as { ref: number }).ref), compose(local, tr), own, depth + 1, nextSeen)
        }
      }
    }
    for (const c of childGroups.get(g) ?? []) visit(c.group, compose(c.tr, tr), own, depth + 1, nextSeen)
  }
  for (const g of members.keys()) if (!isChildGroup.has(g)) visit(g, IDENTITY, "part", 0, new Set())
  // Solids not reachable from any representation (bare files).
  if (parts.length === 0) {
    for (const r of file.records.values()) {
      if (r.parts.length === 1 && SOLID_KINDS.has(r.parts[0]!.name)) {
        const b = solidOf(r.id)
        const nm = r.parts[0]!.args[0]
        if (b !== undefined) parts.push({ name: typeof nm === "string" && nm !== "" ? nm : `solid ${r.id}`, brep: b, transform: IDENTITY })
      }
    }
  }
  return { parts, warnings: R.warnings, lengthScale: R.lengthScale, schema }
}

// ================================================================ writer

class StepWriter {
  private n = 0
  readonly lines: string[] = []
  add(body: string): number {
    const id = ++this.n
    this.lines.push(`#${id}=${body};`)
    return id
  }
}

const num = (x: number): string => {
  if (!Number.isFinite(x)) throw new RangeError("STEP: non-finite number")
  if (Object.is(x, -0) || x === 0) return "0."
  const s = x.toPrecision(17).replace(/(\.\d*?)0+(e|$)/, "$1$2").replace(/\.(e|$)/, ".$1")
  return s.includes(".") ? s.replace("e", "E") : `${s}.`.replace("e", "E")
}
const str = (s: string): string => `'${s.replace(/'/g, "''").replace(/[^\x20-\x7e]/g, (ch) => `\\X2\\${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}\\X0\\`)}'`
const refs = (ids: ReadonlyArray<number>): string => `(${ids.map((i) => `#${i}`).join(",")})`

const leftHanded = (f: Frame): boolean => dot3(cross3(f.x, f.y), f.z) < 0

export interface StepWriteOptions {
  readonly author?: string
  readonly organization?: string
  /** File timestamp (ISO 8601); default now. Fixed in tests. */
  readonly timestamp?: string
  /**
   * Write loose bodies anyway (spec 42 R6). A body is loose when a face is flagged `loose` or a vertex or edge tolerance passes
   * the limit. By default such a body is refused with a `StepExportError`; with this set it is written, the file's uncertainty is
   * the largest tolerance, and the file description says which parts are loose and by how much.
   */
  readonly allowLoose?: boolean
  /** The tolerance limit, mm (default `toleranceLimit` of each part: 10 x the model tolerance, or ten millionths of its size). */
  readonly maxTolerance?: number
}

/** A body that is too loose for exchange (spec 42 R6): the part, its largest tolerance, the limit and the faces flagged loose. */
export class StepExportError extends Error {
  constructor(message: string, readonly part: string, readonly maxTolerance: number, readonly limit: number, readonly looseFaces: ReadonlyArray<number>) {
    super(message)
    this.name = "StepExportError"
  }
}

/** Writes parts as an AP214 STEP file (millimetres, radians). Throws `StepExportError` for a loose body unless `allowLoose` is set. */
export const writeStepBreps = (parts: ReadonlyArray<{ readonly name: string; readonly brep: Brep }>, options: StepWriteOptions = {}): string => {
  const looseNotes: string[] = []
  let worstTolerance = 1e-6
  for (const part of parts) {
    const loose = looseReason(part.brep, options.maxTolerance)
    if (loose === undefined) continue
    if (options.allowLoose !== true) throw new StepExportError(`STEP export refused for "${part.name}": the body is loose (${loose.why}); heal it with a tighter fit, or export with allowLoose`, part.name, loose.maxTolerance, loose.limit, loose.looseFaces)
    looseNotes.push(`LOOSE ${part.name}: ${loose.why}`)
    worstTolerance = Math.max(worstTolerance, loose.maxTolerance)
  }
  const w = new StepWriter()
  const P = (p: Vec3) => w.add(`CARTESIAN_POINT('',(${num(p.x)},${num(p.y)},${num(p.z)}))`)
  const D = (d: Vec3) => { const u = normalize3(d); return w.add(`DIRECTION('',(${num(u.x)},${num(u.y)},${num(u.z)}))`) }
  const A2 = (f: Frame) => w.add(`AXIS2_PLACEMENT_3D('',#${P(f.origin)},#${D(f.z)},#${D(f.x)})`)
  // STEP placements are right-handed (y = z x x). A mirrored body carries left-handed frames: a circle or ellipse keeps its
  // parameterisation with the axis written as x x y (= -z); an analytic surface's natural normal S_u x S_v turns over in the
  // right-handed frame the reader builds, so its face is written with the opposite sense.
  const curveFrame = (f: Frame): Frame => (leftHanded(f) ? { ...f, z: neg3(f.z) } : f)
  const mirroredSurface = (s: Surface): boolean =>
    (s.kind === "plane" || s.kind === "cylinder" || s.kind === "cone" || s.kind === "sphere" || s.kind === "torus") && leftHanded(s.frame)
  const appCtx = w.add(`APPLICATION_CONTEXT('core data for automotive mechanical design processes')`)
  w.add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${appCtx})`)
  const prodCtx = w.add(`PRODUCT_CONTEXT('',#${appCtx},'mechanical')`)
  const pdCtx = w.add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${appCtx},'design')`)
  const mm = w.add(`(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))`)
  const rad = w.add(`(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))`)
  const sr = w.add(`(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())`)
  const unc = w.add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(${worstTolerance === 1e-6 ? "1.E-06" : num(worstTolerance)}),#${mm},'distance_accuracy_value','confusion accuracy')`)
  const ctx = w.add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${mm},#${rad},#${sr}))REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY'))`)
  for (const part of parts) {
    const b = part.brep
    const product = w.add(`PRODUCT(${str(part.name)},${str(part.name)},'',(#${prodCtx}))`)
    const pdf = w.add(`PRODUCT_DEFINITION_FORMATION('','',#${product})`)
    const pd = w.add(`PRODUCT_DEFINITION('design','',#${pdf},#${pdCtx})`)
    const pds = w.add(`PRODUCT_DEFINITION_SHAPE('','',#${pd})`)
    // Geometry and topology.
    const vIds = b.vertices.map((v) => w.add(`VERTEX_POINT('',#${P(v.point)})`))
    const curveId = (c: Curve3): number => {
      switch (c.kind) {
        case "line": {
          const vec = w.add(`VECTOR('',#${D(c.dir)},1.)`)
          return w.add(`LINE('',#${P(c.origin)},#${vec})`)
        }
        case "circle":
          return w.add(`CIRCLE('',#${A2(curveFrame(c.frame))},${num(c.radius)})`)
        case "ellipse":
          return c.a >= c.b
            ? w.add(`ELLIPSE('',#${A2(curveFrame(c.frame))},${num(c.a)},${num(c.b)})`)
            : w.add(`ELLIPSE('',#${A2(curveFrame({ ...c.frame, x: c.frame.y, y: neg3(c.frame.x) }))},${num(c.b)},${num(c.a)})`)
        case "nurbs": {
          const d = c.data
          const pts = d.points.map((q) => P({ x: q[0]!, y: q[1]!, z: q[2] ?? 0 }))
          const { mults, knots } = compressKnots(d.knots)
          const head = `${d.degree},${refs(pts)},.UNSPECIFIED.,.F.,.F.`
          const kn = `(${mults.join(",")}),(${knots.map(num).join(",")}),.UNSPECIFIED.`
          if (d.weights === undefined) return w.add(`B_SPLINE_CURVE_WITH_KNOTS('',${head},${kn})`)
          return w.add(`(BOUNDED_CURVE()B_SPLINE_CURVE(${head})B_SPLINE_CURVE_WITH_KNOTS(${kn})CURVE()GEOMETRIC_REPRESENTATION_ITEM()RATIONAL_B_SPLINE_CURVE((${d.weights.map(num).join(",")}))REPRESENTATION_ITEM(''))`)
        }
      }
    }
    const surfaceId = (s: Surface): number => {
      switch (s.kind) {
        case "plane":
          return w.add(`PLANE('',#${A2(s.frame)})`)
        case "cylinder":
          return w.add(`CYLINDRICAL_SURFACE('',#${A2(s.frame)},${num(s.radius)})`)
        case "cone": {
          // STEP wants 0 < semi-angle; a narrowing cone is the same surface with its axis flipped.
          if (s.semiAngle >= 0) return w.add(`CONICAL_SURFACE('',#${A2(s.frame)},${num(s.radius)},${num(s.semiAngle)})`)
          const f = s.frame
          return w.add(`CONICAL_SURFACE('',#${A2({ origin: f.origin, x: f.x, y: neg3(f.y), z: neg3(f.z) })},${num(s.radius)},${num(-s.semiAngle)})`)
        }
        case "sphere":
          return w.add(`SPHERICAL_SURFACE('',#${A2(s.frame)},${num(s.radius)})`)
        case "torus":
          return w.add(`TOROIDAL_SURFACE('',#${A2(s.frame)},${num(s.major)},${num(s.minor)})`)
        case "revolution": {
          const ax = w.add(`AXIS1_PLACEMENT('',#${P(s.origin)},#${D(s.axis)})`)
          return w.add(`SURFACE_OF_REVOLUTION('',#${curveId(s.curve)},#${ax})`)
        }
        case "extrusion": {
          const vec = w.add(`VECTOR('',#${D(s.dir)},1.)`)
          return w.add(`SURFACE_OF_LINEAR_EXTRUSION('',#${curveId(s.curve)},#${vec})`)
        }
        case "nurbs": {
          const d = s.data
          const grid = `(${d.points.map((row) => refs(row.map((q) => P({ x: q[0]!, y: q[1]!, z: q[2] ?? 0 })))).join(",")})`
          const ku = compressKnots(d.knotsU), kv = compressKnots(d.knotsV)
          const head = `${d.degreeU},${d.degreeV},${grid},.UNSPECIFIED.,.F.,.F.,.F.`
          const kn = `(${ku.mults.join(",")}),(${kv.mults.join(",")}),(${ku.knots.map(num).join(",")}),(${kv.knots.map(num).join(",")}),.UNSPECIFIED.`
          if (d.weights === undefined) return w.add(`B_SPLINE_SURFACE_WITH_KNOTS('',${head},${kn})`)
          return w.add(`(BOUNDED_SURFACE()B_SPLINE_SURFACE(${head})B_SPLINE_SURFACE_WITH_KNOTS(${kn})GEOMETRIC_REPRESENTATION_ITEM()RATIONAL_B_SPLINE_SURFACE((${d.weights.map((row) => `(${row.map(num).join(",")})`).join(",")}))REPRESENTATION_ITEM('')SURFACE())`)
        }
      }
    }
    const eIds = b.edges.map((e) => w.add(`EDGE_CURVE('',#${vIds[e.v0]},#${vIds[e.v1]},#${curveId(e.curve)},.T.)`))
    const allClosedShells = b.shells.length > 0 && b.shells.every((s) => s.closed)
    const faceIdsByShell = b.shells.map((sh, si) => {
      // Void shells are written turned outwards and used through ORIENTED_CLOSED_SHELL(.F.).
      const flipped = allClosedShells && si > 0
      return sh.faces.map((fi) => {
        const f = b.faces[fi]!
        const bounds = f.loops.map((l, li) => {
          const oes = l.coedges.map((c) => w.add(`ORIENTED_EDGE('',*,*,#${eIds[c.edge]},${c.reversed ? ".F." : ".T."})`))
          const loop = w.add(`EDGE_LOOP('',${refs(oes)})`)
          return w.add(`${li === 0 ? "FACE_OUTER_BOUND" : "FACE_BOUND"}('',#${loop},${flipped ? ".F." : ".T."})`)
        })
        const sense = (flipped ? f.reversed : !f.reversed) !== mirroredSurface(f.surface)
        return w.add(`ADVANCED_FACE(${str(f.name ?? "")},${refs(bounds)},#${surfaceId(f.surface)},${sense ? ".T." : ".F."})`)
      })
    })
    const shellIds = b.shells.map((sh, i) => w.add(`${sh.closed ? "CLOSED_SHELL" : "OPEN_SHELL"}('',${refs(faceIdsByShell[i]!)})`))
    const allClosed = b.shells.length > 0 && b.shells.every((s) => s.closed)
    const solidItem = allClosed
      ? shellIds.length === 1
        ? w.add(`MANIFOLD_SOLID_BREP(${str(part.name)},#${shellIds[0]})`)
        : w.add(`BREP_WITH_VOIDS(${str(part.name)},#${shellIds[0]},${refs(shellIds.slice(1).map((s) => w.add(`ORIENTED_CLOSED_SHELL('',*,#${s},.F.)`)))})`)
      : w.add(`SHELL_BASED_SURFACE_MODEL(${str(part.name)},${refs(shellIds)})`)
    const origin = A2({ origin: { x: 0, y: 0, z: 0 }, x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } })
    const rep = allClosed
      ? w.add(`ADVANCED_BREP_SHAPE_REPRESENTATION(${str(part.name)},(#${solidItem},#${origin}),#${ctx})`)
      : w.add(`MANIFOLD_SURFACE_SHAPE_REPRESENTATION(${str(part.name)},(#${solidItem},#${origin}),#${ctx})`)
    w.add(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${rep})`)
  }
  const ts = options.timestamp ?? new Date().toISOString().slice(0, 19)
  const name = parts.length === 1 ? parts[0]!.name : "assembly"
  return [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION((${["CADCAMFUN exact B-rep", ...looseNotes].map(str).join(",")}),'2;1');`,
    `FILE_NAME(${str(name)},${str(ts)},(${str(options.author ?? "")}),(${str(options.organization ?? "")}),'CADCAMFUN B-rep kernel','CADCAMFUN','');`,
    `FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));`,
    "ENDSEC;",
    "DATA;",
    ...w.lines,
    "ENDSEC;",
    "END-ISO-10303-21;",
    ""
  ].join("\n")
}

const compressKnots = (k: ReadonlyArray<number>): { readonly mults: number[]; readonly knots: number[] } => {
  const mults: number[] = [], knots: number[] = []
  for (const x of k) {
    if (knots.length > 0 && x === knots[knots.length - 1]) mults[mults.length - 1]!++
    else { knots.push(x); mults.push(1) }
  }
  return { mults, knots }
}

