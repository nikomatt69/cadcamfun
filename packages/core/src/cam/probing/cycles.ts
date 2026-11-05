/**
 * Probe cycles as IR (spec 73 §5.6): every cycle is protected positioning, touches and the assignments that compute its results on the
 * control, so the same moves run on a machine, in the IR executor (`simulate.ts`) and, written by a post, in the NC replay.
 *
 * A touch: protected move to the start (a contact there is a crash avoided), then (double touch) a fast touch, a back-off and the slow
 * measuring touch; the tip at contact goes into variables; then back to the start. The stylus is a ball: its centre is the tip plus the
 * ball radius along the tool axis, and a side contact is the centre plus the effective (calibrated) radius along the touch, so every
 * side result adds that radius; a Z touch reads the tip itself. Results are exact on exact geometry: a bore is re-centred before its
 * second pair (the chord through the true centre), a rotated face is measured as the line through the ball centres moved by the radius
 * along its own normal, a circle from three or more angles is the exact algebraic (Kasa) fit, a sphere is closed form.
 */
import type { Vec2, Vec3 } from "../../cad/vec.ts"
import { binary, call, named, num, type Expr, type VarRef } from "../macro.ts"
import type { Move } from "../ir.ts"
import { effectiveRadius } from "./device.ts"
import type { ProbeContact, ProbeContext, ProbeCycle, ProbeRoutine, ProbeRoutineResult } from "./types.ts"

const add = (a: Expr, b: Expr): Expr => (b === 0 ? a : a === 0 ? b : binary("+", a, b))
const subE = (a: Expr, b: Expr): Expr => (b === 0 ? a : binary("-", a, b))
const mul = (a: Expr, b: Expr): Expr => (a === 1 ? b : b === 1 ? a : a === 0 || b === 0 ? 0 : binary("*", a, b))
const div = (a: Expr, b: Expr): Expr => (b === 1 ? a : binary("/", a, b))
const neg = (a: Expr): Expr => (typeof a === "number" ? -a : binary("-", 0, a))
const sq = (a: Expr): Expr => mul(a, a)
const half = (a: Expr): Expr => mul(a, 0.5)
const max2 = (a: Expr, b: Expr): Expr => half(add(add(a, b), call("abs", subE(a, b))))
const min2 = (a: Expr, b: Expr): Expr => half(subE(add(a, b), call("abs", subE(a, b))))
const unit2 = (v: Vec2): Vec2 => { const l = Math.hypot(v.x, v.y); return { x: v.x / l, y: v.y / l } }

type Axis = "x" | "y" | "z"

/** Writes the moves of one cycle; keeps the computed position of the tip so a move that only changes Z does not move X / Y. */
class Builder {
  readonly moves: Move[] = []
  readonly contacts: ProbeContact[] = []
  readonly results: Record<string, Expr> = {}
  readonly nominal: Record<string, number> = {}
  readonly units: Record<string, "mm" | "deg"> = {}
  readonly notes: string[] = []
  hostFit: ProbeRoutine["hostFit"]
  /** The writer's position (program coordinates). */
  at: Vec3 | undefined
  /** The control's value of an axis where it is computed (a re-centred probe). */
  private computed: Partial<Record<Axis, Expr>> = {}
  private scratch = 0
  private touches = 0

  constructor(readonly ctx: ProbeContext) {}

  v(name: string): VarRef { return { name: `${this.ctx.prefix}${name}` } }
  e(name: string): Expr { return { var: this.v(name) } }

  /** A scratch value computed on the control: assigned once, read by name. */
  let(value: Expr, name?: string): Expr {
    if (typeof value === "number" || "var" in value) return value
    const n = name ?? `k${++this.scratch}`
    this.moves.push({ _tag: "Assign", variable: this.v(n), value })
    return this.e(n)
  }

  result(name: string, value: Expr, nominal: number, unit: "mm" | "deg" = "mm"): void {
    this.moves.push({ _tag: "Assign", variable: this.v(name), value })
    this.results[name] = this.e(name)
    this.nominal[name] = nominal
    this.units[name] = unit
  }

  private exprOf(to: Vec3, set: Partial<Record<Axis, Expr>>): { readonly x?: Expr; readonly y?: Expr; readonly z?: Expr } | undefined {
    const out: Partial<Record<Axis, Expr>> = {}
    for (const a of ["x", "y", "z"] as const) {
      const given = set[a]
      if (given !== undefined) out[a] = given
      else if (this.computed[a] !== undefined && this.at !== undefined && Math.abs(to[a] - this.at[a]) < 1e-12) out[a] = this.computed[a]
    }
    return Object.keys(out).length === 0 ? undefined : out
  }

  /** A protected positioning move (the probe is armed: a contact on the way is an alarm). Computed axes stay where they are unless set. */
  go(to: Vec3, set: Partial<Record<Axis, Expr>> = {}): void {
    const expr = this.exprOf(to, set)
    const from = this.at ?? to
    const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }
    const l = Math.hypot(d.x, d.y, d.z)
    const direction = l > 1e-12 ? { x: d.x / l, y: d.y / l, z: d.z / l } : { x: 0, y: 0, z: -1 }
    this.moves.push({ _tag: "Probe", to, direction, overtravel: 0, feed: this.ctx.probe.feeds.positioning, kind: "protected", onMiss: "alarm", ...(expr !== undefined ? { expr } : {}) })
    const next: Partial<Record<Axis, Expr>> = {}
    for (const a of ["x", "y", "z"] as const) if (expr?.[a] !== undefined) next[a] = expr[a]
    this.computed = next
    this.at = to
  }

  /**
   * Off a contact, the way the probe came: a plain feed move. The stylus is still deflected, and a control refuses or ends at once an armed
   * move that starts with the probe triggered (Fanuc skips at the first servo cycle, LinuxCNC errors, Siemens alarms).
   */
  leave(to: Vec3, set: Partial<Record<Axis, Expr>>): void {
    const expr = this.exprOf(to, set)
    this.moves.push({ _tag: "Linear", to, feed: this.ctx.probe.feeds.positioning, ...(expr !== undefined ? { expr } : {}) })
    const next: Partial<Record<Axis, Expr>> = {}
    for (const a of ["x", "y", "z"] as const) if (expr?.[a] !== undefined) next[a] = expr[a]
    this.computed = next
    this.at = to
  }

  /** Up to the safe height, staying over the point the probe is at. */
  up(): void {
    if (this.at === undefined) return
    if (this.at.z < this.ctx.safeZ - 1e-12) this.go({ ...this.at, z: this.ctx.safeZ })
  }

  /**
   * A touch from where the probe stands along `dir` (unit) expecting the tip at `expected`; the tip's coordinates at contact go into
   * `<name>x` / `y` / `z` (the axes in `store`). The probe returns to where it started.
   */
  touch(name: string, dir: Vec3, expected: Vec3, store: ReadonlyArray<Axis>): { readonly x: Expr; readonly y: Expr; readonly z: Expr } {
    const start = this.at!
    const startComputed = { ...this.computed }
    const p = this.ctx.probe
    const overtravel = this.ctx.search
    const into = (start.x - expected.x) * -dir.x + (start.y - expected.y) * -dir.y + (start.z - expected.z) * -dir.z
    if (!(into > 0)) throw new RangeError(`touch ${name}: the probe starts past the surface it is to find`)
    const storeOf = (prefix: string, axes: ReadonlyArray<Axis>): { x?: VarRef; y?: VarRef; z?: VarRef } => Object.fromEntries(axes.map((a) => [a, this.v(`${prefix}${a}`)]))
    // A control that reports in the work offset's frame under a tilted plane (`skipFrame: "work"`): all three go through the plane's axes.
    const frame = this.ctx.skipFrame === "work" ? this.ctx.frame : undefined
    const touchMove = (prefix: string, axes: ReadonlyArray<Axis>, feed: number): void => {
      if (frame === undefined) { this.moves.push({ _tag: "Probe", to: expected, direction: dir, overtravel, feed, kind: "touch", onMiss: "alarm", store: storeOf(prefix, axes) }); return }
      this.moves.push({ _tag: "Probe", to: expected, direction: dir, overtravel, feed, kind: "touch", onMiss: "alarm", store: storeOf(`${prefix}w`, ["x", "y", "z"]) })
      const w = (a: Axis): Expr => subE(this.e(`${prefix}w${a}`), frame.origin[a])
      for (const a of axes) {
        const u = a === "x" ? frame.xAxis : a === "y" ? frame.yAxis : frame.zAxis
        this.moves.push({ _tag: "Assign", variable: this.v(`${prefix}${a}`), value: add(add(mul(w("x"), u.x), mul(w("y"), u.y)), mul(w("z"), u.z)) })
      }
    }
    if (p.doubleTouch) {
      const moving = (["x", "y", "z"] as const).filter((a) => Math.abs(dir[a]) > 1e-12)
      touchMove(`${name}f`, moving, p.feeds.fast)
      const back = { x: expected.x - dir.x * p.backoff, y: expected.y - dir.y * p.backoff, z: expected.z - dir.z * p.backoff }
      const set: Partial<Record<Axis, Expr>> = {}
      for (const a of moving) set[a] = subE(this.e(`${name}f${a}`), dir[a] * p.backoff)
      // From the contact the back-off moves only the touch's axes; the others stay where the touch started.
      for (const a of ["x", "y", "z"] as const) if (!moving.includes(a) && startComputed[a] !== undefined) set[a] = startComputed[a]!
      this.at = expected
      this.computed = {}
      this.leave(back, set)
      touchMove(name, store, p.feeds.touch)
    } else {
      touchMove(name, store, p.feeds.touch)
    }
    this.touches++
    this.contacts.push({ name, expected, direction: dir })
    // Back to the start along the touch (the way the probe came is free).
    this.at = expected
    this.computed = {}
    this.leave(start, startComputed)
    const read = (a: Axis): Expr => (store.includes(a) ? this.e(`${name}${a}`) : startComputed[a] ?? start[a])
    return { x: read("x"), y: read("y"), z: read("z") }
  }

  /** The stylus' effective radius for a touch along `dir`, as a number or the control's calibration variable. */
  r(dir: Vec2): Expr {
    return this.ctx.calibrationVars?.radius ?? effectiveRadius(this.ctx.probe, dir)
  }

  zTrigger(): Expr {
    return this.ctx.calibrationVars?.zTrigger ?? this.ctx.probe.calibration?.zTrigger ?? 0
  }

  finish(cycle: ProbeCycle): ProbeRoutine {
    this.up()
    if (this.touches === 0) throw new RangeError("a cycle without a touch")
    return { cycle, moves: this.moves, contacts: this.contacts, results: this.results, nominal: this.nominal, units: this.units, notes: this.notes, ...(this.hostFit !== undefined ? { hostFit: this.hostFit } : {}) }
  }
}

const ballOf = (ctx: ProbeContext): number => ctx.probe.stylus.ballDiameter / 2

/** The tip height that puts the ball's equator at `depth` below `top`. */
const tipZ = (ctx: ProbeContext, top: number | undefined, depth: number): number => (top ?? 0) - depth - ballOf(ctx)

/** A side touch toward the surface point `at` (z = the touch height of the equator) with outward normal `n`; returns the surface point. */
const sideTouch = (b: Builder, name: string, at: Vec2, n: Vec2, zTip: number): { readonly x: Expr; readonly y: Expr } => {
  const d = { x: -n.x, y: -n.y }
  const r = effectiveRadius(b.ctx.probe, d)
  const expected = { x: at.x + n.x * r, y: at.y + n.y * r, z: zTip }
  const t = b.touch(name, { x: d.x, y: d.y, z: 0 }, expected, ["x", "y"])
  const re = b.r(d)
  return { x: add(t.x, mul(re, d.x)), y: add(t.y, mul(re, d.y)) }
}

/** Over the point at the safe height, then down to `z`. */
const approach = (b: Builder, p: Vec2, z: number, set: Partial<Record<Axis, Expr>> = {}): void => {
  b.up()
  b.go({ x: p.x, y: p.y, z: b.ctx.safeZ }, set)
  b.go({ x: p.x, y: p.y, z })
}

const standOff = (b: Builder): number => ballOf(b.ctx) + b.ctx.clearance

/**
 * The line through two ball centres `c1`, `c2` (variables) moved by the radius toward the face (its normal has the sign `sense` on
 * `axis`), as a point and a unit direction.
 */
const faceLine = (b: Builder, c1: { x: Expr; y: Expr }, c2: { x: Expr; y: Expr }, axis: "x" | "y", sense: 1 | -1, alongSign: 1 | -1, r: Expr, tag: string) => {
  const dx = b.let(subE(c2.x, c1.x), `${tag}dx`), dy = b.let(subE(c2.y, c1.y), `${tag}dy`)
  const l = b.let(call("sqrt", add(sq(dx), sq(dy))), `${tag}l`)
  const ux = b.let(div(dx, l), `${tag}ux`), uy = b.let(div(dy, l), `${tag}uy`)
  // Normal of the line toward the face: for a face facing X it is (uy, -ux) times the sign that makes its X component `sense`.
  const k = axis === "x" ? alongSign * sense : alongSign * sense
  const nx = axis === "x" ? mul(uy, k) : mul(neg(uy), k)
  const ny = axis === "x" ? mul(neg(ux), k) : mul(ux, k)
  const px = b.let(add(c1.x, mul(r, nx)), `${tag}px`), py = b.let(add(c1.y, mul(r, ny)), `${tag}py`)
  return { px, py, ux, uy }
}

/** Kasa circle through the ball centres (relative to `o` for conditioning): centre and radius as variables. Exact for exact points. */
const kasa = (b: Builder, pts: ReadonlyArray<{ x: Expr; y: Expr }>, o: Vec2): { cx: Expr; cy: Expr; rho: Expr } => {
  const q = pts.map((p, i) => ({ x: b.let(subE(p.x, o.x), `q${i}x`), y: b.let(subE(p.y, o.y), `q${i}y`) }))
  const z = q.map((p, i) => b.let(add(sq(p.x), sq(p.y)), `q${i}z`))
  const sum = (f: (i: number) => Expr, name: string): Expr => b.let(q.map((_, i) => f(i)).reduce((s, v) => add(s, v)), name)
  const sxx = sum((i) => sq(q[i]!.x), "sxx"), sxy = sum((i) => mul(q[i]!.x, q[i]!.y), "sxy"), syy = sum((i) => sq(q[i]!.y), "syy")
  const sx = sum((i) => q[i]!.x, "sx"), sy = sum((i) => q[i]!.y, "sy")
  const sxz = sum((i) => mul(q[i]!.x, z[i]!), "sxz"), syz = sum((i) => mul(q[i]!.y, z[i]!), "syz"), sz = sum((i) => z[i]!, "sz")
  const n = pts.length
  // [sxx sxy sx; sxy syy sy; sx sy n] [D E F]^T = -[sxz syz sz]^T, Cramer.
  const det3 = (a: Expr[]): Expr => subE(add(mul(a[0]!, subE(mul(a[4]!, a[8]!), mul(a[5]!, a[7]!))), mul(a[2]!, subE(mul(a[3]!, a[7]!), mul(a[4]!, a[6]!)))), mul(a[1]!, subE(mul(a[3]!, a[8]!), mul(a[5]!, a[6]!))))
  const M = [sxx, sxy, sx, sxy, syy, sy, sx, sy, n]
  const rhs = [neg(sxz), neg(syz), neg(sz)]
  const det = b.let(det3(M), "det")
  const col = (c: number): Expr[] => M.map((v, k) => (k % 3 === c ? rhs[Math.floor(k / 3)]! : v))
  const D = b.let(div(det3(col(0)), det), "kd"), E = b.let(div(det3(col(1)), det), "ke"), F = b.let(div(det3(col(2)), det), "kf")
  const ux = b.let(mul(D, -0.5), "kux"), uy = b.let(mul(E, -0.5), "kuy")
  const rho = b.let(call("sqrt", subE(add(sq(ux), sq(uy)), F)), "rho")
  return { cx: b.let(add(ux, o.x), "kcx"), cy: b.let(add(uy, o.y), "kcy"), rho }
}

const refuse = (reason: string): { readonly refused: string } => ({ refused: reason })

/**
 * Plans one cycle. Refused (with the reason) when the stylus does not fit, a plane's points are on a line, a cycle needs hardware the
 * context does not have, or the cycle is not built here.
 */
export const planProbeCycle = (cycle: ProbeCycle, ctx: ProbeContext): ProbeRoutineResult => {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(ctx.prefix)) return refuse(`the variable prefix '${ctx.prefix}' must be letters, digits and _`)
  if (!(ctx.clearance > 0) || !(ctx.search > 0)) return refuse("the clearance and the search must be positive")
  const r = ballOf(ctx)
  const b = new Builder(ctx)
  const notUnit = (name: string, v: Vec2): string | undefined => (Math.abs(Math.hypot(v.x, v.y) - 1) <= 1e-6 ? undefined : `the ${cycle.kind} cycle's ${name} must be a unit vector, it has length ${Math.hypot(v.x, v.y).toFixed(6)}`)
  const unitProblem = cycle.kind === "edge" ? notUnit("normal", cycle.normal) : cycle.kind === "edge-angle" ? notUnit("normal", cycle.normal) ?? notUnit("along", cycle.along) : undefined
  if (unitProblem !== undefined) return refuse(unitProblem)
  try {
    switch (cycle.kind) {
      case "z-surface": {
        approach(b, cycle.at, cycle.expectedZ + ctx.clearance)
        const t = b.touch("t1", { x: 0, y: 0, z: -1 }, { x: cycle.at.x, y: cycle.at.y, z: cycle.expectedZ }, ["z"])
        b.result("z", add(t.z, b.zTrigger()), cycle.expectedZ)
        return b.finish(cycle)
      }
      case "edge": {
        const n = unit2(cycle.normal)
        const zt = cycle.at.z - r
        approach(b, { x: cycle.at.x + n.x * standOff(b), y: cycle.at.y + n.y * standOff(b) }, zt)
        const s = sideTouch(b, "t1", cycle.at, n, zt)
        b.result("x", s.x, cycle.at.x)
        b.result("y", s.y, cycle.at.y)
        b.result("s", add(mul(b.e("x"), n.x), mul(b.e("y"), n.y)), cycle.at.x * n.x + cycle.at.y * n.y)
        return b.finish(cycle)
      }
      case "corner": {
        const inset = cycle.inset ?? 5 + r
        const two = (cycle.touchesPerEdge ?? 2) === 2
        const zt = tipZ(ctx, cycle.top, cycle.depth)
        const { corner: c, xSense: sx, ySense: sy } = cycle
        const alongY: 1 | -1 = cycle.inside ? (-sy as 1 | -1) : sy // where the X-facing face lies along Y from the corner
        const alongX: 1 | -1 = cycle.inside ? (-sx as 1 | -1) : sx
        const nX = { x: -sx, y: 0 }, nY = { x: 0, y: -sy }
        const xFace = (k: number) => ({ x: c.x, y: c.y + alongY * inset * k })
        const yFace = (k: number) => ({ x: c.x + alongX * inset * k, y: c.y })
        const startX = (k: number) => ({ x: xFace(k).x + nX.x * standOff(b), y: xFace(k).y })
        const startY = (k: number) => ({ x: yFace(k).x, y: yFace(k).y + nY.y * standOff(b) })
        const moveAtDepth = (p: Vec2): void => { if (cycle.inside) b.go({ x: p.x, y: p.y, z: zt }); else approach(b, p, zt) }
        approach(b, startX(1), zt)
        const ax = b.touch("a1", { x: sx, y: 0, z: 0 }, { x: c.x - sx * effectiveRadius(ctx.probe, { x: sx, y: 0 }), y: xFace(1).y, z: zt }, ["x", "y"])
        let ax2 = ax
        if (two) { moveAtDepth(startX(2)); ax2 = b.touch("a2", { x: sx, y: 0, z: 0 }, { x: c.x - sx * effectiveRadius(ctx.probe, { x: sx, y: 0 }), y: xFace(2).y, z: zt }, ["x", "y"]) }
        moveAtDepth(startY(1))
        const ay = b.touch("b1", { x: 0, y: sy, z: 0 }, { x: yFace(1).x, y: c.y - sy * effectiveRadius(ctx.probe, { x: 0, y: sy }), z: zt }, ["x", "y"])
        let ay2 = ay
        if (two) { moveAtDepth(startY(2)); ay2 = b.touch("b2", { x: 0, y: sy, z: 0 }, { x: yFace(2).x, y: c.y - sy * effectiveRadius(ctx.probe, { x: 0, y: sy }), z: zt }, ["x", "y"]) }
        const rx = b.r({ x: sx, y: 0 }), ry = b.r({ x: 0, y: sy })
        if (!two) {
          b.result("x", add(ax.x, mul(rx, sx)), c.x)
          b.result("y", add(ay.y, mul(ry, sy)), c.y)
          b.notes.push("one touch per face: the corner is where the two faces cross the touch lines; the rotation is not measured")
          return b.finish(cycle)
        }
        const L1 = faceLine(b, ax, ax2, "x", sx, alongY, rx, "f")
        const L2 = faceLine(b, ay, ay2, "y", sy, alongX, ry, "g")
        // P1 + a u1 = P2 + b u2  ->  a = cross(P2 - P1, u2) / cross(u1, u2)
        const cr = b.let(subE(mul(L1.ux, L2.uy), mul(L1.uy, L2.ux)), "cr")
        const a = b.let(div(subE(mul(subE(L2.px, L1.px), L2.uy), mul(subE(L2.py, L1.py), L2.ux)), cr), "ca")
        b.result("x", add(L1.px, mul(a, L1.ux)), c.x)
        b.result("y", add(L1.py, mul(a, L1.uy)), c.y)
        // The face along X turned by the part's rotation; the face along Y gives the same angle on a square part.
        b.result("rotation", call("atan2", mul(L2.uy, alongX), mul(L2.ux, alongX)), 0, "deg")
        b.result("rotationY", call("atan2", neg(mul(L1.ux, alongY)), mul(L1.uy, alongY)), 0, "deg")
        return b.finish(cycle)
      }
      case "web": case "pocket": {
        const u = { x: Math.cos(cycle.angle), y: Math.sin(cycle.angle) }
        const zt = tipZ(ctx, cycle.top, cycle.depth)
        const w2 = cycle.width / 2
        const c = cycle.centre
        if (cycle.kind === "pocket") {
          if (w2 - r <= ctx.clearance / 2) return refuse(`a stylus of ${2 * r} mm does not fit a slot of ${cycle.width} mm`)
          approach(b, c, zt)
          const s1 = sideTouch(b, "t1", { x: c.x + u.x * w2, y: c.y + u.y * w2 }, { x: -u.x, y: -u.y }, zt)
          const s2 = sideTouch(b, "t2", { x: c.x - u.x * w2, y: c.y - u.y * w2 }, u, zt)
          b.result("x", half(add(s1.x, s2.x)), c.x)
          b.result("y", half(add(s1.y, s2.y)), c.y)
          b.result("width", add(mul(subE(s1.x, s2.x), u.x), mul(subE(s1.y, s2.y), u.y)), cycle.width)
        } else {
          const off = w2 + standOff(b)
          approach(b, { x: c.x + u.x * off, y: c.y + u.y * off }, zt)
          const s1 = sideTouch(b, "t1", { x: c.x + u.x * w2, y: c.y + u.y * w2 }, u, zt)
          approach(b, { x: c.x - u.x * off, y: c.y - u.y * off }, zt)
          const s2 = sideTouch(b, "t2", { x: c.x - u.x * w2, y: c.y - u.y * w2 }, { x: -u.x, y: -u.y }, zt)
          b.result("x", half(add(s1.x, s2.x)), c.x)
          b.result("y", half(add(s1.y, s2.y)), c.y)
          b.result("width", add(mul(subE(s1.x, s2.x), u.x), mul(subE(s1.y, s2.y), u.y)), cycle.width)
        }
        return b.finish(cycle)
      }
      case "rectangle": {
        const zt = tipZ(ctx, cycle.top, cycle.depth)
        const c = cycle.centre
        const hx = cycle.size.x / 2, hy = cycle.size.y / 2
        if (cycle.inside) {
          if (Math.min(hx, hy) - r <= ctx.clearance / 2) return refuse(`a stylus of ${2 * r} mm does not fit a pocket of ${cycle.size.x} x ${cycle.size.y} mm`)
          approach(b, c, zt)
          const x1 = sideTouch(b, "t1", { x: c.x + hx, y: c.y }, { x: -1, y: 0 }, zt)
          const x2 = sideTouch(b, "t2", { x: c.x - hx, y: c.y }, { x: 1, y: 0 }, zt)
          const y1 = sideTouch(b, "t3", { x: c.x, y: c.y + hy }, { x: 0, y: -1 }, zt)
          const y2 = sideTouch(b, "t4", { x: c.x, y: c.y - hy }, { x: 0, y: 1 }, zt)
          b.result("x", half(add(x1.x, x2.x)), c.x)
          b.result("y", half(add(y1.y, y2.y)), c.y)
          b.result("sizeX", subE(x1.x, x2.x), cycle.size.x)
          b.result("sizeY", subE(y1.y, y2.y), cycle.size.y)
        } else {
          const so = standOff(b)
          approach(b, { x: c.x + hx + so, y: c.y }, zt)
          const x1 = sideTouch(b, "t1", { x: c.x + hx, y: c.y }, { x: 1, y: 0 }, zt)
          approach(b, { x: c.x - hx - so, y: c.y }, zt)
          const x2 = sideTouch(b, "t2", { x: c.x - hx, y: c.y }, { x: -1, y: 0 }, zt)
          approach(b, { x: c.x, y: c.y + hy + so }, zt)
          const y1 = sideTouch(b, "t3", { x: c.x, y: c.y + hy }, { x: 0, y: 1 }, zt)
          approach(b, { x: c.x, y: c.y - hy - so }, zt)
          const y2 = sideTouch(b, "t4", { x: c.x, y: c.y - hy }, { x: 0, y: -1 }, zt)
          b.result("x", half(add(x1.x, x2.x)), c.x)
          b.result("y", half(add(y1.y, y2.y)), c.y)
          b.result("sizeX", subE(x1.x, x2.x), cycle.size.x)
          b.result("sizeY", subE(y1.y, y2.y), cycle.size.y)
        }
        return b.finish(cycle)
      }
      case "bore": case "boss": {
        const inside = cycle.kind === "bore"
        const R = cycle.diameter / 2
        if (inside && R - r <= ctx.clearance / 2) return refuse(`a stylus of ${2 * r} mm does not fit a bore of ${cycle.diameter} mm`)
        const zt = tipZ(ctx, cycle.top, cycle.depth)
        const c = cycle.centre
        if (cycle.angles !== undefined) {
          if (cycle.angles.length < 3) return refuse("a circle from angles needs three or more")
          const centres: Array<{ x: Expr; y: Expr }> = []
          if (inside) approach(b, c, zt)
          cycle.angles.forEach((a, i) => {
            const u = { x: Math.cos(a), y: Math.sin(a) }
            const n = inside ? { x: -u.x, y: -u.y } : u
            const re = effectiveRadius(ctx.probe, { x: -n.x, y: -n.y })
            if (!inside) approach(b, { x: c.x + u.x * (R + standOff(b)), y: c.y + u.y * (R + standOff(b)) }, zt)
            const t = b.touch(`t${i + 1}`, { x: -n.x, y: -n.y, z: 0 }, { x: c.x + u.x * R + n.x * re, y: c.y + u.y * R + n.y * re, z: zt }, ["x", "y"])
            centres.push({ x: t.x, y: t.y })
          })
          const k = kasa(b, centres, c)
          const re = b.r({ x: 1, y: 0 })
          b.result("x", k.cx, c.x)
          b.result("y", k.cy, c.y)
          b.result("diameter", mul(2, inside ? add(k.rho, re) : subE(k.rho, re)), cycle.diameter)
          b.notes.push(`${cycle.angles.length} touches at the given angles; the centre is the circle through the ball centres`)
          return b.finish(cycle)
        }
        // Four touches, re-centre on X, two on Y, re-centre on Y, two on X again: both pairs then lie on lines through the true centre.
        const pair = (axis: "x" | "y", tag: string, other: Expr | undefined): { lo: Expr; hi: Expr } => {
          const u = axis === "x" ? { x: 1, y: 0 } : { x: 0, y: 1 }
          const run = (sign: 1 | -1, name: string): Expr => {
            const dir = { x: u.x * sign, y: u.y * sign }
            const n = inside ? { x: -dir.x, y: -dir.y } : dir
            const at = { x: c.x + dir.x * R, y: c.y + dir.y * R }
            const re = effectiveRadius(ctx.probe, inside ? dir : { x: -dir.x, y: -dir.y })
            const set: Partial<Record<Axis, Expr>> = other === undefined ? {} : axis === "x" ? { y: other } : { x: other }
            if (!inside) approach(b, { x: at.x + n.x * standOff(b), y: at.y + n.y * standOff(b) }, zt, set)
            const t = b.touch(name, { x: -n.x, y: -n.y, z: 0 }, { x: at.x + n.x * re, y: at.y + n.y * re, z: zt }, [axis])
            return t[axis]
          }
          return { hi: run(1, `${tag}p`), lo: run(-1, `${tag}m`) }
        }
        if (inside) approach(b, c, zt)
        const x1 = pair("x", "a", undefined)
        const mx = b.let(half(add(x1.hi, x1.lo)), "mx")
        if (inside) b.go({ x: c.x, y: c.y, z: zt }, { x: mx })
        const y1 = pair("y", "b", mx)
        const my = b.let(half(add(y1.hi, y1.lo)), "my")
        if (inside) b.go({ x: c.x, y: c.y, z: zt }, { x: mx, y: my })
        const x2 = pair("x", "c", my)
        const rx = b.r({ x: 1, y: 0 })
        const sign = inside ? 1 : -1
        b.result("x", half(add(x2.hi, x2.lo)), c.x)
        b.result("y", my, c.y)
        b.result("diameterX", add(subE(x2.hi, x2.lo), mul(2 * sign, rx)), cycle.diameter)
        b.result("diameterY", add(subE(y1.hi, y1.lo), mul(2 * sign, b.r({ x: 0, y: 1 }))), cycle.diameter)
        b.result("diameter", half(add(b.e("diameterX"), b.e("diameterY"))), cycle.diameter)
        b.notes.push("the centre is the midpoint of opposite touches through the re-centred probe; the stylus radius cancels in it")
        return b.finish(cycle)
      }
      case "edge-angle": {
        const n = unit2(cycle.normal), u = unit2(cycle.along)
        if (Math.abs(n.x * u.x + n.y * u.y) > 1e-6) return refuse("an edge-angle's normal must be perpendicular to the direction along the face")
        const zt = tipZ(ctx, cycle.top, cycle.depth)
        const p1 = cycle.start, p2 = { x: cycle.start.x + u.x * cycle.pitch, y: cycle.start.y + u.y * cycle.pitch }
        approach(b, { x: p1.x + n.x * standOff(b), y: p1.y + n.y * standOff(b) }, zt)
        const s1 = sideTouch(b, "t1", p1, n, zt)
        b.go({ x: p2.x + n.x * standOff(b), y: p2.y + n.y * standOff(b), z: zt })
        const s2 = sideTouch(b, "t2", p2, n, zt)
        const dx = b.let(subE(s2.x, s1.x), "dx"), dy = b.let(subE(s2.y, s1.y), "dy")
        b.result("angle", call("atan2", subE(mul(dy, u.x), mul(dx, u.y)), add(mul(dx, u.x), mul(dy, u.y))), 0, "deg")
        b.result("s", add(mul(s1.x, n.x), mul(s1.y, n.y)), p1.x * n.x + p1.y * n.y)
        return b.finish(cycle)
      }
      case "plane": {
        const pts = cycle.points
        if (pts.length < 3) return refuse("a plane needs three or more points")
        const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length, my = pts.reduce((s, p) => s + p.y, 0) / pts.length
        let sxx = 0, sxy = 0, syy = 0
        for (const p of pts) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) ** 2 }
        const span = Math.max(sxx, syy)
        if (sxx * syy - sxy * sxy <= 1e-9 * span * span) return refuse("the plane's points are on a line: no plane is defined")
        const z: Expr[] = []
        pts.forEach((p, i) => {
          approach(b, p, cycle.expectedZ + ctx.clearance)
          z.push(add(b.touch(`t${i + 1}`, { x: 0, y: 0, z: -1 }, { x: p.x, y: p.y, z: cycle.expectedZ }, ["z"]).z, b.zTrigger()))
        })
        // z = a (x - mx) + b (y - my) + c on the centred points: the normal equations are known numbers except the right-hand side.
        const dX = pts.map((p) => p.x - mx), dY = pts.map((p) => p.y - my)
        const det = sxx * syy - sxy * sxy
        const sz = b.let(z.reduce((s, v) => add(s, v)), "sz")
        const sxz = b.let(z.map((v, i) => mul(v, dX[i]!)).reduce((s, v) => add(s, v)), "sxz")
        const syz = b.let(z.map((v, i) => mul(v, dY[i]!)).reduce((s, v) => add(s, v)), "syz")
        const A = b.let(div(subE(mul(sxz, syy), mul(syz, sxy)), det), "pa")
        const B = b.let(div(subE(mul(syz, sxx), mul(sxz, sxy)), det), "pb")
        const C = b.let(div(sz, pts.length), "pc")
        const norm = b.let(call("sqrt", add(add(sq(A), sq(B)), 1)), "pn")
        const res = z.map((v, i) => b.let(div(subE(subE(v, C), add(mul(A, dX[i]!), mul(B, dY[i]!))), norm), `pr${i + 1}`))
        const hi = res.slice(1).reduce((m, v, i) => b.let(max2(m, v), `ph${i}`), res[0]!)
        const lo = res.slice(1).reduce((m, v, i) => b.let(min2(m, v), `pl${i}`), res[0]!)
        b.result("z", C, cycle.expectedZ)
        b.result("tiltA", call("atan", B), 0, "deg")
        b.result("tiltB", neg(call("atan", A)), 0, "deg")
        b.result("flatness", subE(hi, lo), 0)
        b.notes.push(`the plane through the touches by least squares; z is its height at the points' centroid (${mx.toFixed(3)}, ${my.toFixed(3)})`)
        return b.finish(cycle)
      }
      case "sphere": {
        const R = cycle.diameter / 2
        const c = cycle.centre
        if (ctx.safeZ <= c.z + R + ctx.clearance) return refuse("the safe height must be above the top of the sphere")
        const zt = c.z - r
        const so = R + standOff(b)
        const eq = (dir: Vec2, name: string): { x: Expr; y: Expr } => {
          approach(b, { x: c.x - dir.x * so, y: c.y - dir.y * so }, zt)
          const re = effectiveRadius(ctx.probe, dir)
          const t = b.touch(name, { x: dir.x, y: dir.y, z: 0 }, { x: c.x - dir.x * (R + re), y: c.y - dir.y * (R + re), z: zt }, ["x", "y"])
          return { x: t.x, y: t.y }
        }
        const xp = eq({ x: 1, y: 0 }, "t1"), xm = eq({ x: -1, y: 0 }, "t2"), yp = eq({ x: 0, y: 1 }, "t3"), ym = eq({ x: 0, y: -1 }, "t4")
        const a = b.let(half(add(xp.x, xm.x)), "sa"), bb = b.let(half(add(yp.y, ym.y)), "sb")
        // The X chord is at the touches' Y, which is the nominal centre's: its half length and its offset from the true centre give the circle.
        const hx = b.let(half(subE(xm.x, xp.x)), "shx")
        const rz2 = b.let(add(sq(hx), sq(subE(xp.y, bb))), "srz")
        b.up()
        b.go({ x: c.x, y: c.y, z: ctx.safeZ }, { x: a, y: bb })
        b.go({ x: c.x, y: c.y, z: c.z + R + ctx.clearance })
        const top = b.touch("t5", { x: 0, y: 0, z: -1 }, { x: c.x, y: c.y, z: c.z + R }, ["z"])
        const re = b.r({ x: 1, y: 0 })
        const tz = b.let(add(top.z, b.zTrigger()), "stz")
        const k = b.let(subE(zt + r, tz), "sk")
        const Rm = b.let(div(add(subE(rz2, sq(re)), sq(k)), mul(2, subE(re, k))), "sr")
        b.result("x", a, c.x)
        b.result("y", bb, c.y)
        b.result("z", subE(tz, Rm), c.z)
        b.result("diameter", mul(2, Rm), cycle.diameter)
        if (cycle.touches === 9) {
          // The control's result stays the closed form of the first five; four touches 45 degrees up the ball go out for the host's fit.
          const q = Math.SQRT1_2
          const centres: Array<{ x: Expr; y: Expr; z: Expr }> = [{ ...xp, z: zt + r }, { ...xm, z: zt + r }, { ...yp, z: zt + r }, { ...ym, z: zt + r }, { x: a, y: bb, z: add(top.z, r) }]
          for (const [i, az] of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].entries()) {
            const out = { x: Math.cos(az) * q, y: Math.sin(az) * q, z: q }
            const dir = { x: -out.x, y: -out.y, z: -out.z }
            const rho = R + effectiveRadius(ctx.probe, dir)
            const point = (l: number): Vec3 => ({ x: c.x + out.x * l, y: c.y + out.y * l, z: c.z + out.z * l - r })
            const from = point(rho + ctx.clearance)
            b.up()
            b.go({ x: from.x, y: from.y, z: ctx.safeZ })
            b.go(from)
            const t = b.touch(`t${6 + i}`, dir, point(rho), ["x", "y", "z"])
            centres.push({ x: t.x, y: t.y, z: add(t.z, r) })
          }
          centres.forEach((p, i) => {
            b.result(`bx${i}`, p.x, NaN); b.result(`by${i}`, p.y, NaN); b.result(`bz${i}`, p.z, NaN)
          })
          b.moves.push({ _tag: "Report", label: "SPHERE", values: centres.flatMap((_, i) => [`bx${i}`, `by${i}`, `bz${i}`].map((n) => ({ name: n, value: b.e(n) }))) })
          for (const k of Object.keys(b.nominal)) if (Number.isNaN(b.nominal[k])) { delete b.nominal[k]; delete b.units[k] }
          b.notes.push("nine touches: the control holds the closed form of the first five; the host's least-squares fit of all nine replaces it in the report (withHostFit)")
          b.hostFit = "sphere"
        }
        return b.finish(cycle)
      }
      case "stylus-calibrate": {
        const art = cycle.artefact
        if (art.kind === "height") {
          approach(b, art.at, art.z + ctx.clearance)
          const t = b.touch("t1", { x: 0, y: 0, z: -1 }, { x: art.at.x, y: art.at.y, z: art.z }, ["z"])
          b.result("zTrigger", subE(art.z, t.z), 0)
          return b.finish(cycle)
        }
        if (art.kind === "sphere") {
          // Find the ball (X and Y chords, the top with the known radius), then touch its equator in each direction through the centre found.
          const R = art.diameter / 2
          const c = art.centre
          if (ctx.safeZ <= c.z + R + ctx.clearance) return refuse("the safe height must be above the top of the sphere")
          const zt = c.z - r
          const so = R + standOff(b)
          const eq = (dir: Vec2, name: string): { x: Expr; y: Expr } => {
            approach(b, { x: c.x - dir.x * so, y: c.y - dir.y * so }, zt)
            const re = effectiveRadius(ctx.probe, dir)
            return b.touch(name, { x: dir.x, y: dir.y, z: 0 }, { x: c.x - dir.x * (R + re), y: c.y - dir.y * (R + re), z: zt }, ["x", "y"])
          }
          const xp = eq({ x: 1, y: 0 }, "ca"), xm = eq({ x: -1, y: 0 }, "cb"), yp = eq({ x: 0, y: 1 }, "cc"), ym = eq({ x: 0, y: -1 }, "cd")
          const a = b.let(half(add(xp.x, xm.x)), "sa"), bb = b.let(half(add(yp.y, ym.y)), "sb")
          b.up()
          b.go({ x: c.x, y: c.y, z: ctx.safeZ }, { x: a, y: bb })
          b.go({ x: c.x, y: c.y, z: c.z + R + ctx.clearance })
          const cz = b.let(subE(add(b.touch("ce", { x: 0, y: 0, z: -1 }, { x: c.x, y: c.y, z: c.z + R }, ["z"]).z, b.zTrigger()), R), "sz")
          const equator = b.let(subE(cz, r), "se")
          b.result("x", a, c.x)
          b.result("y", bb, c.y)
          b.result("z", cz, c.z)
          const n = cycle.directions ?? 4
          const radii: Expr[] = []
          for (let k = 0; k < n; k++) {
            const t = (2 * Math.PI * k) / n
            const u = { x: Math.cos(t), y: Math.sin(t) }
            const re = effectiveRadius(ctx.probe, u)
            const start = { x: c.x - u.x * so, y: c.y - u.y * so }
            b.up()
            b.go({ ...start, z: ctx.safeZ }, { x: subE(a, u.x * so), y: subE(bb, u.y * so) })
            b.go({ ...start, z: zt }, { z: equator })
            const p = b.touch(`d${k}`, { x: u.x, y: u.y, z: 0 }, { x: c.x - u.x * (R + re), y: c.y - u.y * (R + re), z: zt }, ["x", "y"])
            b.result(`r${k}`, subE(call("sqrt", add(sq(subE(p.x, a)), sq(subE(p.y, bb)))), R), r)
            radii.push(b.e(`r${k}`))
          }
          b.result("radius", div(radii.reduce((s, v) => add(s, v)), n), r)
          b.notes.push(`effective radius in ${n} directions: the distance of the ball centre from the sphere's centre less the sphere's radius, at its equator`)
          return b.finish(cycle)
        }
        const R = art.diameter / 2
        if (R - r <= ctx.clearance / 2) return refuse(`a stylus of ${2 * r} mm does not fit a ring of ${art.diameter} mm`)
        const zt = tipZ(ctx, art.top, art.depth)
        const c = art.centre
        const n = cycle.directions ?? 4
        approach(b, c, zt)
        // Centre on the ring first (four touches, re-centred), then touch each direction from the found centre.
        const touchAlong = (u: Vec2, name: string): Expr[] => {
          const re = effectiveRadius(ctx.probe, u)
          const t = b.touch(name, { x: u.x, y: u.y, z: 0 }, { x: c.x + u.x * (R - re), y: c.y + u.y * (R - re), z: zt }, ["x", "y"])
          return [t.x, t.y]
        }
        const xp = touchAlong({ x: 1, y: 0 }, "ca"), xm = touchAlong({ x: -1, y: 0 }, "cb")
        const mx = b.let(half(add(xp[0]!, xm[0]!)), "mx")
        b.go({ x: c.x, y: c.y, z: zt }, { x: mx })
        const yp = touchAlong({ x: 0, y: 1 }, "cc"), ym = touchAlong({ x: 0, y: -1 }, "cd")
        const my = b.let(half(add(yp[1]!, ym[1]!)), "my")
        b.go({ x: c.x, y: c.y, z: zt }, { x: mx, y: my })
        b.result("x", mx, c.x)
        b.result("y", my, c.y)
        const radii: Expr[] = []
        for (let k = 0; k < n; k++) {
          const a = (2 * Math.PI * k) / n
          const u = { x: Math.cos(a), y: Math.sin(a) }
          const [tx, ty] = touchAlong(u, `d${k}`)
          const rk = subE(R, call("sqrt", add(sq(subE(tx!, mx)), sq(subE(ty!, my)))))
          b.result(`r${k}`, rk, r)
          radii.push(b.e(`r${k}`))
        }
        b.result("radius", div(radii.reduce((s, v) => add(s, v)), n), r)
        b.notes.push(`effective radius in ${n} directions: the ring radius less the distance of the ball centre from the found centre`)
        return b.finish(cycle)
      }
      case "tool-length": case "broken-tool": case "tool-radius": {
        const setter = ctx.setter, origin = ctx.workOrigin
        if (setter === undefined) return refuse(`the ${cycle.kind} cycle needs a tool setter on the machine`)
        if (origin === undefined) return refuse(`the ${cycle.kind} cycle needs the machine position of the work zero (workOrigin): the setter is placed in machine coordinates`)
        // The setter is in machine coordinates; the program runs in the work offset: subtract the zero's machine position.
        const sx = setter.position.x - origin.x, sy = setter.position.y - origin.y
        const zTrig = setter.triggerZ - origin.z
        const sb = new Builder({ ...ctx, probe: { ...ctx.probe, feeds: { ...ctx.probe.feeds, fast: setter.feeds.fast, touch: setter.feeds.touch } } })
        if (cycle.kind !== "tool-radius") {
          // The length the control believes (`nominalLength`, the offset in force; 0 = no length offset): the tip reaches the trigger height when
          // the true length is that plus how much higher than expected the program's tip stands at contact.
          const believed = cycle.nominalLength ?? 0
          if (cycle.kind === "broken-tool" && cycle.nominalLength === undefined) return refuse("a broken-tool check needs the tool's nominal length")
          // The approach starts at the setter's own height (`position.z`, machine Z): the longest tool's tip must clear it, and the touch searches down from there.
          const start = setter.position.z - origin.z
          if (!(start > zTrig + ctx.search)) return refuse("the setter's approach height (position.z) is not above its trigger plane")
          if (ctx.safeZ < start) return refuse(`the safe height ${ctx.safeZ} must not be below the setter's approach height ${start.toFixed(3)} (work coordinates)`)
          sb.go({ x: sx, y: sy, z: ctx.safeZ })
          sb.go({ x: sx, y: sy, z: start })
          const t = sb.touch("t1", { x: 0, y: 0, z: -1 }, { x: sx, y: sy, z: zTrig }, ["z"])
          sb.result("length", add(believed, subE(t.z, zTrig)), believed)
          if (cycle.kind === "broken-tool") {
            sb.result("deviation", subE(sb.e("length"), believed), 0)
            sb.moves.push({ _tag: "If", condition: { cmp: "gt", a: call("abs", sb.e("deviation")), b: num(setter.brokenTolerance) } }, { _tag: "Alarm", code: 840, text: "TOOL BROKEN OR WORN BEYOND THE LIMIT" }, { _tag: "EndIf" })
          }
          sb.notes.push(`the tool's length is the length in force (${believed}) plus the height the tip stood above the setter's trigger plane (${zTrig.toFixed(3)} in this work offset)`)
          return sb.finish(cycle)
        }
        const disc = setter.discDiameter
        if (disc === undefined || !(disc > 0)) return refuse("a tool-radius cycle needs the setter's disc diameter")
        const rn = cycle.nominalRadius
        if (rn === undefined || !(rn > 0)) return refuse("a tool-radius cycle needs the tool's nominal radius")
        if (2 * rn > setter.maxToolDiameter) return refuse(`the tool (diameter ${2 * rn}) is larger than the setter takes (${setter.maxToolDiameter})`)
        const zt = zTrig - 2
        const half0 = disc / 2 + rn
        const side = (dir: 1 | -1, name: string): Expr => {
          const startX = sx - dir * (half0 + ctx.clearance)
          approach(sb, { x: startX, y: sy }, zt)
          return sb.touch(name, { x: dir, y: 0, z: 0 }, { x: sx - dir * half0, y: sy, z: zt }, ["x"]).x
        }
        const x1 = side(1, "t1"), x2 = side(-1, "t2")
        sb.result("radius", half(subE(subE(x2, x1), disc)), rn)
        sb.result("x", half(add(x1, x2)), sx)
        sb.notes.push("the tool's radius is half the gap between the two touches on the disc less the disc's diameter; its length offset must already be right")
        return sb.finish(cycle)
      }
      case "rotary-axis":
        return refuse("a rotary-axis calibration is planned by rotaryRoutine (rotary-cal.ts), not as one cycle")
    }
  } catch (error) {
    return refuse(error instanceof Error ? error.message : String(error))
  }
}

/** The number of touches a routine makes (contacts), the figure the setup sheet and the summary show. */
export const touchCount = (routine: ProbeRoutine): number => routine.contacts.length

/** Scratch helpers the actions reuse. */
export const exprOps = { add, sub: subE, mul, div, neg, sq, half, max2, min2, named, num }
