/**
 * Reading a STEP file (ISO 10303-21, AP203/AP214/AP242 text) as a prismatic part.
 *
 * A full B-rep kernel is not here; what is: the planar bottom face(s) of a part that stands on the XY plane (Z up) are read as a
 * footprint (lines, circles and arcs of its outer loop and its holes), the part's height is its extent along Z, and
 * `extrudeDrawing` turns that into solids and holes. That covers plates, brackets, flanges, spacers and every other part
 * made by extruding a profile, which is most of what is machined on a mill. What a prism cannot say (steps, pockets with a
 * floor, slopes, fillets on the vertical edges between levels, free-form surfaces) is counted and reported, never invented.
 * `up` stands a part that was modelled with another axis up.
 */
import type { P, Shape } from "./import-drawing.ts"

export type Up = "x" | "y" | "z"

type Arg = number | string | null | { readonly ref: number } | { readonly type: string; readonly args: ReadonlyArray<Arg> } | ReadonlyArray<Arg>
interface Entity { readonly name: string; readonly args: ReadonlyArray<Arg> }

const isRef = (a: Arg | undefined): a is { readonly ref: number } => typeof a === "object" && a !== null && !Array.isArray(a) && "ref" in a

class Reader {
  private i = 0
  constructor(private readonly s: string) {}
  private ws(): void { while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++ }
  value(): Arg {
    this.ws()
    const c = this.s[this.i]
    if (c === "(") {
      this.i++
      const list: Arg[] = []
      for (;;) {
        this.ws()
        if (this.s[this.i] === ")") { this.i++; return list }
        if (this.i >= this.s.length) return list
        list.push(this.value())
        this.ws()
        if (this.s[this.i] === ",") this.i++
      }
    }
    if (c === "'") {
      let out = ""
      this.i++
      while (this.i < this.s.length) {
        if (this.s[this.i] === "'") {
          if (this.s[this.i + 1] === "'") { out += "'"; this.i += 2; continue }
          this.i++
          break
        }
        out += this.s[this.i++]
      }
      return out
    }
    if (c === "#") {
      const m = /^#(\d+)/.exec(this.s.slice(this.i, this.i + 24))
      this.i += m![0].length
      return { ref: Number(m![1]) }
    }
    if (c === "$" || c === "*") { this.i++; return null }
    if (c === ".") {
      const end = this.s.indexOf(".", this.i + 1)
      const word = this.s.slice(this.i + 1, end)
      this.i = end + 1
      return `.${word}.`
    }
    const num = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(this.s.slice(this.i, this.i + 40))
    if (num) { this.i += num[0].length; return Number(num[0]) }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.s.slice(this.i, this.i + 80))
    if (word) {
      this.i += word[0].length
      this.ws()
      if (this.s[this.i] === "(") return { type: word[0].toUpperCase(), args: this.value() as ReadonlyArray<Arg> }
      return word[0]
    }
    this.i++
    return null
  }
}

/** Statements `#id=NAME(args);` of the DATA section. */
const entitiesOf = (text: string): Map<number, Entity> => {
  const body = text.replace(/\/\*[\s\S]*?\*\//g, "")
  const start = body.search(/DATA\s*;/i)
  const data = start >= 0 ? body.slice(start) : body
  const out = new Map<number, Entity>()
  let i = 0
  while (i < data.length) {
    const hash = data.indexOf("#", i)
    if (hash < 0) break
    const eq = /^#(\d+)\s*=\s*/.exec(data.slice(hash, hash + 30))
    if (eq === null) { i = hash + 1; continue }
    // End of statement: the first ";" outside quotes.
    let j = hash + eq[0].length
    let quoted = false
    for (; j < data.length; j++) {
      const ch = data[j]
      if (ch === "'") quoted = !quoted
      else if (ch === ";" && !quoted) break
    }
    const raw = data.slice(hash + eq[0].length, j).trim()
    const name = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(raw)
    if (name !== null) {
      const reader = new Reader(raw.slice(name[0].length - 1))
      out.set(Number(eq[1]), { name: name[1]!.toUpperCase(), args: reader.value() as ReadonlyArray<Arg> })
    }
    i = j + 1
  }
  return out
}

export interface StepResult {
  readonly shapes: ReadonlyArray<Shape>
  readonly warnings: ReadonlyArray<string>
  /** Extent along Z, mm (0 when no footprint was found). */
  readonly height: number
  /** Z of the bottom face, mm. */
  readonly zMin: number
  readonly scale: number
}

type V3 = readonly [number, number, number]

const lengthScale = (text: string): number => {
  if (/CONVERSION_BASED_UNIT\s*\(\s*'(?:INCH|inch)'/.test(text)) return 25.4
  if (/CONVERSION_BASED_UNIT\s*\(\s*'(?:FOOT|foot)'/.test(text)) return 304.8
  const si = /LENGTH_UNIT\s*\(\s*\)\s*[\s\S]{0,80}?SI_UNIT\s*\(\s*(\.[A-Z]+\.|\$)\s*,\s*\.METRE\.\s*\)/.exec(text)
  if (si !== null) {
    const prefix = si[1]
    return prefix === ".MILLI." ? 1 : prefix === ".CENTI." ? 10 : prefix === ".MICRO." ? 0.001 : prefix === ".KILO." ? 1_000_000 : 1000
  }
  const simple = /SI_UNIT\s*\(\s*(\.[A-Z]+\.|\$)\s*,\s*\.METRE\.\s*\)/.exec(text)
  if (simple !== null) return simple[1] === ".MILLI." ? 1 : simple[1] === ".CENTI." ? 10 : simple[1] === "$" ? 1000 : 1
  return 1
}

const full = (a: number): number => {
  const t = a % (2 * Math.PI)
  return t < 0 ? t + 2 * Math.PI : t
}

export const readStepShapes = (text: string, options: { readonly tolerance?: number; readonly up?: Up } = {}): StepResult => {
  const tolerance = options.tolerance ?? 0.01
  const warnings: string[] = []
  const entities = entitiesOf(text)
  if (entities.size === 0) return { shapes: [], warnings: ["No STEP entities were found: is this a STEP (ISO 10303-21) text file?"], height: 0, zMin: 0, scale: 1 }
  const scale = lengthScale(text)
  const up = options.up ?? "z"
  const turn = (v: V3): V3 => (up === "z" ? v : up === "y" ? [v[2], v[0], v[1]] : [v[1], v[2], v[0]])
  const get = (a: Arg | undefined): Entity | undefined => (isRef(a) ? entities.get(a.ref) : undefined)
  const nums = (a: Arg | undefined): V3 => {
    const l = Array.isArray(a) ? a as ReadonlyArray<Arg> : []
    return [Number(l[0] ?? 0), Number(l[1] ?? 0), Number(l[2] ?? 0)]
  }
  const point = (a: Arg | undefined): V3 | undefined => {
    const e = get(a)
    if (e === undefined || e.name !== "CARTESIAN_POINT") return undefined
    const p = nums(e.args[1])
    return turn([p[0] * scale, p[1] * scale, p[2] * scale])
  }
  const direction = (a: Arg | undefined): V3 | undefined => {
    const e = get(a)
    return e !== undefined && e.name === "DIRECTION" ? turn(nums(e.args[1])) : undefined
  }
  const vertex = (a: Arg | undefined): V3 | undefined => {
    const e = get(a)
    return e !== undefined && e.name === "VERTEX_POINT" ? point(e.args[1]) : undefined
  }
  const placement = (a: Arg | undefined): { readonly o: V3; readonly z: V3 } | undefined => {
    const e = get(a)
    if (e === undefined || e.name !== "AXIS2_PLACEMENT_3D") return undefined
    const o = point(e.args[1])
    const z = direction(e.args[2]) ?? turn([0, 0, 1])
    return o === undefined ? undefined : { o, z }
  }

  // Heights: every vertex bounds the part.
  let zLow = Infinity
  let zHigh = -Infinity
  for (const e of entities.values()) {
    if (e.name !== "VERTEX_POINT") continue
    const p = point(e.args[1])
    if (p !== undefined) { zLow = Math.min(zLow, p[2]); zHigh = Math.max(zHigh, p[2]) }
  }
  if (!Number.isFinite(zLow)) return { shapes: [], warnings: ["The STEP file has no vertices: it holds no solid or shell geometry this reader can use."], height: 0, zMin: 0, scale }
  const flat = Math.max(1e-6, tolerance / 10)

  const shapes: Shape[] = []
  let bottoms = 0, levels = 0, curved = 0, other = 0
  for (const face of entities.values()) {
    if (face.name !== "ADVANCED_FACE" && face.name !== "FACE_SURFACE") continue
    const surface = get(face.args[2])
    const bounds = Array.isArray(face.args[1]) ? face.args[1] as ReadonlyArray<Arg> : []
    if (surface === undefined) continue
    if (surface.name !== "PLANE") { curved++; continue }
    const frame = placement(surface.args[1])
    if (frame === undefined) continue
    const sameSense = face.args[3] !== ".F."
    const nz = (sameSense ? 1 : -1) * frame.z[2]
    if (Math.abs(Math.abs(frame.z[2]) - 1) > 1e-6) { other++; continue }
    if (nz > 0) { if (Math.abs(frame.o[2] - zHigh) > flat * 1000) levels++; continue }
    // Outward normal -Z: a bottom face; only the lowest ones are the footprint.
    if (Math.abs(frame.o[2] - zLow) > flat * 1000) { levels++; continue }
    bottoms++
    for (const boundRef of bounds) {
      const bound = get(boundRef)
      const loop = bound === undefined ? undefined : get(bound.args[1])
      if (loop === undefined || loop.name !== "EDGE_LOOP") continue
      const pts: P[] = []
      let circleShape: Shape | undefined
      for (const oe of Array.isArray(loop.args[1]) ? loop.args[1] as ReadonlyArray<Arg> : []) {
        const oriented = get(oe)
        if (oriented === undefined || oriented.name !== "ORIENTED_EDGE") continue
        const forward = oriented.args[4] !== ".F."
        const edge = get(oriented.args[3])
        if (edge === undefined || edge.name !== "EDGE_CURVE") continue
        const a = vertex(edge.args[1]), b = vertex(edge.args[2])
        const curve = get(edge.args[3])
        if (a === undefined || b === undefined || curve === undefined) continue
        const from = forward ? a : b, to = forward ? b : a
        if (curve.name === "CIRCLE") {
          const cf = placement(curve.args[1])
          const r = Number(curve.args[2]) * scale
          if (cf === undefined || !(r > 0)) continue
          const closed = Math.hypot(a[0] - b[0], a[1] - b[1]) < flat * 10
          if (closed) { circleShape = { kind: "circle", center: { x: cf.o[0], y: cf.o[1] }, radius: r, layer: "step" }; continue }
          const edgeSame = edge.args[4] !== ".F."
          const ccwAboutAxis = edgeSame === forward
          const ccw = ccwAboutAxis === (cf.z[2] > 0)
          const a0 = Math.atan2(from[1] - cf.o[1], from[0] - cf.o[0])
          const a1 = Math.atan2(to[1] - cf.o[1], to[0] - cf.o[0])
          const sweep = ccw ? full(a1 - a0) : -full(a0 - a1)
          const n = Math.max(4, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * Math.min(2048, Math.max(8, Math.ceil(Math.PI / Math.acos(Math.max(0, 1 - tolerance / r)))))))
          for (let k = 0; k < n; k++) pts.push({ x: cf.o[0] + r * Math.cos(a0 + (sweep * k) / n), y: cf.o[1] + r * Math.sin(a0 + (sweep * k) / n) })
          continue
        }
        if (curve.name === "LINE" || curve.name === "POLYLINE") { pts.push({ x: from[0], y: from[1] }); continue }
        other++
        pts.push({ x: from[0], y: from[1] })
      }
      if (circleShape !== undefined && pts.length === 0) shapes.push(circleShape)
      else if (pts.length >= 3) shapes.push({ kind: "polyline", points: pts, closed: true, layer: "step" })
    }
  }
  if (bottoms === 0) {
    warnings.push(`No flat face looking down (−Z) at the lowest level was found${up === "z" ? "; if the part was modelled with another axis up, read it with up: \"y\" or \"x\"" : ""}.`)
  }
  if (levels > 0) warnings.push(`${levels} horizontal face${levels === 1 ? "" : "s"} at other heights (steps, pockets with a floor) ${levels === 1 ? "is" : "are"} not represented: the part is read as a prism of its full height.`)
  if (curved > 0) warnings.push(`${curved} curved or free-form face${curved === 1 ? "" : "s"} (cylinders, cones, spheres, B-spline surfaces) ${curved === 1 ? "is" : "are"} not read as such; round holes and rounded outlines come from the footprint edges.`)
  if (other > 0) warnings.push(`${other} sloped face${other === 1 ? "" : "s"} or edge curve${other === 1 ? "" : "s"} of another kind were approximated or skipped.`)
  return { shapes, warnings, height: zHigh - zLow, zMin: zLow, scale }
}
