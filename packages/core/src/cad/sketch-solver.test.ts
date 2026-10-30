import { describe, expect, test } from "bun:test"
import { compileSketch } from "./sketch-equations.ts"
import { createSketchSession, dragSketch, solveSketch, type Constraint, type Sketch, type SketchEntity } from "./sketch.ts"

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })
const at = (s: Sketch, id: string) => s.entities.find((e) => e.id === id) as { x: number; y: number; radius?: number }

/** Deterministic pseudo-random numbers (mulberry32). */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

describe("analytic gradients", () => {
  // One scattered sketch with every entity kind; each constraint kind is compiled on it and its gradient compared to central differences.
  const entities: SketchEntity[] = [
    pt("a", 1.3, 0.4), pt("b", 7.9, 2.2), pt("c", 3.1, 6.8), pt("d", 9.4, 8.1), pt("e", 4.4, 3.3), pt("f", -2.2, 5.1), pt("g", 6.2, -3.4),
    pt("o", 2.5, 2.5), pt("s", 5.5, 2.9), pt("t", 2.1, 5.9),
    line("l1", "a", "b"), line("l2", "c", "d"), line("l3", "b", "d"),
    { id: "c1", kind: "circle", center: "e", radius: 2.7 }, { id: "c2", kind: "circle", center: "f", radius: 1.9 },
    { id: "arc", kind: "arc", center: "o", start: "s", end: "t" }, { id: "el", kind: "ellipse", center: "g", radiusX: 4.1, radiusY: 2.3, rotation: 0.4 }
  ]
  const all: Constraint[] = [
    { type: "fixed", point: "a" }, { type: "fixed", point: "a", x: 3 }, { type: "coincident", a: "a", b: "b" },
    { type: "horizontal", line: "l1" }, { type: "vertical", line: "l1" }, { type: "horizontalPoints", a: "a", b: "c" }, { type: "verticalPoints", a: "a", b: "c" },
    { type: "distance", a: "a", b: "d", value: 5 }, { type: "distanceX", a: "a", b: "d", value: 5 }, { type: "distanceY", a: "a", b: "d", value: 5 },
    { type: "length", line: "l1", value: 4 }, { type: "parallel", a: "l1", b: "l2" }, { type: "perpendicular", a: "l1", b: "l2" },
    { type: "equalLength", a: "l1", b: "l2" }, { type: "equalRadius", a: "c1", b: "c2" }, { type: "equalRadius", a: "c1", b: "arc" }, { type: "equalRadius", a: "arc", b: "arc" },
    { type: "radius", circle: "c1", value: 3 }, { type: "radius", circle: "arc", value: 3 }, { type: "diameter", circle: "c2", value: 3 },
    { type: "angle", a: "l1", b: "l2", value: 0.7 }, { type: "pointOnLine", point: "e", line: "l1" }, { type: "pointOnCircle", point: "a", circle: "c1" },
    { type: "pointOnCircle", point: "a", circle: "arc" }, { type: "midpoint", point: "e", line: "l1" }, { type: "symmetric", a: "e", b: "f", line: "l1" },
    { type: "tangentLineCircle", line: "l1", circle: "c1" }, { type: "tangentLineCircle", line: "l3", circle: "arc" },
    { type: "tangentCircles", a: "c1", b: "c2" }, { type: "tangentCircles", a: "c1", b: "c2", internal: true }, { type: "tangentCircles", a: "c2", b: "arc", internal: true },
    { type: "concentric", a: "c1", b: "arc" }, { type: "ellipseSize", ellipse: "el", radiusX: 3, radiusY: 2 }, { type: "pointOnEllipse", point: "a", ellipse: "el" },
    { type: "collinear", a: "l1", b: "l2" }
  ]
  test("every constraint kind: the analytic gradient equals central differences", () => {
    for (const constraint of all) {
      const compiled = compileSketch({ entities, constraints: [constraint] })
      const x = compiled.layout.x
      for (const eq of compiled.eqs) {
        const g = new Float64Array(16)
        const value = eq.f(x, eq.vars, g)
        expect(Number.isFinite(value)).toBe(true)
        // Fold duplicated unknowns, then compare per unknown.
        const folded = new Map<number, number>()
        eq.vars.forEach((v, k) => folded.set(v, (folded.get(v) ?? 0) + g[k]!))
        for (const [variable, analytic] of folded) {
          const h = 1e-6
          const xp = Float64Array.from(x), xm = Float64Array.from(x)
          xp[variable] = x[variable]! + h; xm[variable] = x[variable]! - h
          const numeric = (eq.f(xp, eq.vars, null) - eq.f(xm, eq.vars, null)) / (2 * h)
          expect({ type: constraint.type, variable, ok: Math.abs(analytic - numeric) < 1e-5 * (1 + Math.abs(numeric)) }).toEqual({ type: constraint.type, variable, ok: true })
        }
      }
    }
  })
})

/** A grid of n x n points joined by horizontal and vertical lines, fully dimensioned: a fully constrained sketch of 2 n^2 unknowns. */
const grid = (n: number, jitter = 0.3, seed = 7): Sketch => {
  const rand = rng(seed)
  const entities: SketchEntity[] = []
  const constraints: Constraint[] = []
  const id = (i: number, j: number) => `p${i}_${j}`
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) entities.push(pt(id(i, j), i * 10 + (rand() - 0.5) * jitter, j * 10 + (rand() - 0.5) * jitter))
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i + 1 < n) { entities.push(line(`h${i}_${j}`, id(i, j), id(i + 1, j))); constraints.push({ type: "horizontal", line: `h${i}_${j}` }, { type: "length", line: `h${i}_${j}`, value: 10 }) }
    if (j + 1 < n) { entities.push(line(`v${i}_${j}`, id(i, j), id(i, j + 1))); constraints.push({ type: "vertical", line: `v${i}_${j}` }, { type: "length", line: `v${i}_${j}`, value: 10 }) }
  }
  constraints.push({ type: "fixed", point: id(0, 0), x: 0, y: 0 })
  return { entities, constraints }
}

describe("sparse solver", () => {
  test("a 10 x 10 grid with 380 equations solves to 1e-9 and is exactly constrained (the length constraints are redundant)", () => {
    const sketch = grid(10)
    const r = solveSketch(sketch)
    expect(r.residual).toBeLessThan(1e-9)
    expect(r.dof).toBe(0)
    expect(r.status).toBe("over-constrained") // 2 per line (H/V + length): the lengths of a rectangular grid are implied by H/V + fixed + others
    expect(at(r.sketch, "p9_9").x).toBeCloseTo(90, 7)
    expect(at(r.sketch, "p9_9").y).toBeCloseTo(90, 7)
  })

  test("components are independent: the second does not move when the first is solved", () => {
    const r = solveSketch({
      entities: [pt("a", 0, 0), pt("b", 3, 1), line("l1", "a", "b"), pt("c", 50, 50), pt("d", 53, 50.5), line("l2", "c", "d")],
      constraints: [{ type: "fixed", point: "a" }, { type: "length", line: "l1", value: 5 }, { type: "horizontal", line: "l1" }]
    })
    expect(at(r.sketch, "c")).toMatchObject({ x: 50, y: 50 })
    expect(r.dof).toBe(4) // c and d are free; a is fixed and b is pinned
    expect(r.free).toEqual(["c", "d"])
  })

  test("tangent line to a circle, circles and arcs: solved values are analytic", () => {
    const r = solveSketch({
      entities: [pt("a", 0, 0), pt("b", 10, 0.4), line("l", "a", "b"), pt("o", 5, 3), { id: "c", kind: "circle", center: "o", radius: 2 }],
      constraints: [{ type: "fixed", point: "a", x: 0, y: 0 }, { type: "horizontal", line: "l" }, { type: "length", line: "l", value: 10 }, { type: "tangentLineCircle", line: "l", circle: "c" }, { type: "radius", circle: "c", value: 2 }, { type: "distanceX", a: "a", b: "o", value: 5 }]
    })
    expect(r.status).toBe("fully-constrained")
    expect(Math.abs(at(r.sketch, "o").y)).toBeCloseTo(2, 8)
  })

  test("reference dimensions measure and never constrain", () => {
    const r = solveSketch({
      entities: [pt("a", 0, 0), pt("b", 3, 4), line("l", "a", "b")],
      constraints: [{ type: "fixed", point: "a" }, { type: "horizontal", line: "l" }, { type: "length", line: "l", value: 7, id: "driving" }, { type: "distance", a: "a", b: "b", value: 99, driven: true, id: "ref" }]
    })
    expect(r.status).toBe("fully-constrained")
    expect(r.driven).toEqual([{ id: "ref", type: "distance", value: expect.closeTo(7, 8) }])
  })

  test("per-point freedom: a free point reports 2, a swinging end 1", () => {
    const r = solveSketch({ entities: [pt("a", 0, 0), pt("b", 3, 4), line("l", "a", "b"), pt("z", 9, 9)], constraints: [{ type: "fixed", point: "a" }, { type: "length", line: "l", value: 5 }] })
    expect(r.diagnostics?.freedom).toEqual({ b: 1, z: 2 })
  })

  test("cancellation: a pre-aborted signal stops before iterating", () => {
    const c = new AbortController()
    c.abort()
    const r = solveSketch(grid(6, 2), { signal: c.signal })
    expect(r.iterations).toBe(0)
  })
})

describe("diagnostics (K6)", () => {
  test("redundant constraints are named and removing them keeps the sketch solved", () => {
    const r = solveSketch({
      entities: [pt("a", 0, 0), pt("b", 10, 0.5), line("l", "a", "b")],
      constraints: [{ type: "fixed", point: "a" }, { type: "horizontal", line: "l", id: "h1" }, { type: "horizontalPoints", a: "a", b: "b", id: "h2" }, { type: "length", line: "l", value: 10 }]
    })
    expect(r.status).toBe("over-constrained")
    expect(r.diagnostics?.redundant).toEqual(["h2"])
  })

  test("a conflict is reduced to its minimal set among innocent constraints", () => {
    const r = solveSketch({
      entities: [pt("a", 0, 0), pt("b", 10, 0), pt("c", 5, 8), line("ab", "a", "b"), line("bc", "b", "c"), line("ca", "c", "a")],
      constraints: [
        { type: "fixed", point: "a", x: 0, y: 0 }, { type: "horizontal", line: "ab", id: "horizontal" },
        { type: "length", line: "ab", value: 10, id: "ab" }, { type: "length", line: "bc", value: 3, id: "bc" }, { type: "length", line: "ca", value: 4, id: "ca" }
      ]
    })
    expect(r.status).toBe("conflicting")
    // 3 + 4 < 10: the triangle cannot close. horizontal and fixed are innocent.
    expect([...r.diagnostics!.conflictSet].sort()).toEqual(["ab", "bc", "ca"])
    expect(r.diagnostics!.minimal).toBe(true)
    expect(r.message).toContain("minimal conflicting set")
  })

  test("seeded conflicts of 2 to 5 constraints: the set is minimal in at least 95 % of 200 cases and always contains a culprit", () => {
    let minimalCount = 0, containsCulprit = 0
    const total = 200
    for (let seed = 1; seed <= total; seed++) {
      const rand = rng(seed * 7919)
      const k = 2 + Math.floor(rand() * 4) // polygon with k sides, one side longer than the sum of the others
      const entities: SketchEntity[] = []
      const constraints: Constraint[] = []
      const culprit = new Set<string>()
      // The k-gon: points p0..p(k-1) (k = 2 degenerates into two distances between the same two points).
      const n = Math.max(k, 2)
      for (let i = 0; i < n; i++) entities.push(pt(`p${i}`, Math.cos((2 * Math.PI * i) / n) * 10 + rand() * 0.2, Math.sin((2 * Math.PI * i) / n) * 10 + rand() * 0.2))
      const lengths = Array.from({ length: k }, () => 3 + rand() * 4)
      const long = Math.floor(rand() * k)
      lengths[long] = lengths.reduce((s, v, i) => (i === long ? s : s + v), 0) + 2 + rand() * 5
      for (let i = 0; i < k; i++) {
        const a = `p${i}`, b = `p${(i + 1) % n}`
        const name = `side${i}`
        constraints.push({ type: "distance", a, b: k === 2 ? "p1" : b, value: lengths[i]!, id: name })
        culprit.add(name)
      }
      if (k === 2) { constraints.length = 0; constraints.push({ type: "distance", a: "p0", b: "p1", value: lengths[0]!, id: "side0" }, { type: "distance", a: "p0", b: "p1", value: lengths[1]! + 5, id: "side1" }) }
      // Innocent, satisfiable decoration around the polygon: pins and a free-standing dimensioned line.
      entities.push(pt("q0", 40, 40), pt("q1", 45, 41), line("q", "q0", "q1"))
      constraints.push({ type: "fixed", point: "q0" }, { type: "length", line: "q", value: 5 + rand() * 3, id: "qlen" }, { type: "horizontal", line: "q", id: "qh" })
      if (rand() < 0.5) constraints.push({ type: "horizontalPoints", a: "p0", b: "p1", id: "extra" }) // innocent only for k >= 3: still lets the sides conflict
      const r = solveSketch({ entities, constraints })
      if (r.status !== "conflicting") continue
      const set = new Set(r.diagnostics!.conflictSet)
      if ([...set].some((c) => culprit.has(c))) containsCulprit++
      // The reported set alone reproduces the conflict, and each member is necessary (dropping any one makes the rest solvable).
      const only = constraints.filter((c) => set.has(c.id ?? ""))
      const reproduces = solveSketch({ entities, constraints: only }, { analyze: false }).residual > 1e-6
      const necessary = [...set].every((member) => solveSketch({ entities, constraints: only.filter((c) => c.id !== member) }, { analyze: false }).residual <= 1e-6)
      if (reproduces && necessary) minimalCount++
    }
    expect(containsCulprit).toBe(total)
    expect(minimalCount / total).toBeGreaterThanOrEqual(0.95)
  })
})

describe("interactive drag (K7)", () => {
  /** A fully dimensioned crank: ground (fixed), a rod of 10 from ground to the crank pin, a rod of 20 from the pin to a slider on the x axis. */
  const crank = (): Sketch => ({
    entities: [pt("g", 0, 0), pt("pin", 6, 8), pt("slider", 25, 0), line("r1", "g", "pin"), line("r2", "pin", "slider")],
    constraints: [
      { type: "fixed", point: "g", x: 0, y: 0 }, { type: "length", line: "r1", value: 10, id: "crank" }, { type: "length", line: "r2", value: 20, id: "rod" },
      { type: "horizontalPoints", a: "g", b: "slider", id: "guide" }
    ]
  })

  test("dragging the crank pin moves the slider along the guide, every constraint still holds", () => {
    const session = createSketchSession(crank())
    const moved = session.drag("pin", { x: 0, y: 10 })
    expect(moved.reached).toBe(true)
    const s = session.sketch()
    expect(at(s, "pin").x).toBeCloseTo(0, 8)
    expect(at(s, "pin").y).toBeCloseTo(10, 8)
    expect(at(s, "slider").y).toBeCloseTo(0, 8)
    expect(at(s, "slider").x).toBeCloseTo(Math.sqrt(400 - 100), 7)
    expect(Object.keys(moved.moved).sort()).toEqual(["pin", "slider"])
  })

  test("the result of a warm drag equals a cold solve with the same pin to 1e-9", () => {
    const session = createSketchSession(crank())
    session.drag("pin", { x: 8, y: 6 }) // on the crank circle
    const warm = session.sketch()
    const cold = solveSketch({ ...crank(), constraints: [...crank().constraints, { type: "fixed", point: "pin", x: 8, y: 6 }] })
    expect(cold.dof).toBe(0)
    for (const id of ["pin", "slider", "g"]) {
      expect(at(warm, id).x).toBeCloseTo(at(cold.sketch, id).x, 9)
      expect(at(warm, id).y).toBeCloseTo(at(cold.sketch, id).y, 9)
    }
  })

  test("a target the constraints forbid is approached to the boundary, reported and no constraint is relaxed", () => {
    const session = createSketchSession(crank())
    const result = session.drag("pin", { x: 40, y: 8 }) // farther than the crank allows (10 from the origin)
    expect(result.reached).toBe(false)
    expect(result.fraction).toBeGreaterThan(0)
    expect(result.blockedBy).toContain("crank")
    const s = session.sketch()
    // The nearest feasible pose is the point of the crank circle closest to the target.
    const norm = Math.hypot(40, 8)
    expect(at(s, "pin").x).toBeCloseTo((10 * 40) / norm, 5)
    expect(at(s, "pin").y).toBeCloseTo((10 * 8) / norm, 5)
    const check = solveSketch(s)
    expect(check.residual).toBeLessThan(1e-8)
  })

  test("a fixed point cannot be dragged at all", () => {
    const result = dragSketch(crank(), "g", { x: 5, y: 5 })
    expect(result.reached).toBe(false)
    expect(result.fraction).toBe(0)
    expect(result.blockedBy.length).toBeGreaterThan(0)
  })

  test("the same drag path gives the same pose (deterministic)", () => {
    const path = [{ x: 7, y: 7 }, { x: 4, y: 9 }, { x: -2, y: 9.7 }]
    const run = () => { const s = createSketchSession(crank()); for (const p of path) s.drag("pin", p); return JSON.stringify(s.sketch()) }
    expect(run()).toBe(run())
  })

  test("a long move beyond Newton's basin is followed along the path and reaches the target", () => {
    const entities: SketchEntity[] = []
    const constraints: Constraint[] = []
    for (let i = 0; i < 100; i++) entities.push(pt(`p${i}`, i * 5, Math.sin(i / 7) * 3))
    for (let i = 0; i < 99; i++) { entities.push(line(`l${i}`, `p${i}`, `p${i + 1}`)); constraints.push({ type: "length", line: `l${i}`, value: 5 }) }
    constraints.push({ type: "fixed", point: "p0", x: 0, y: 0 })
    const session = createSketchSession({ entities, constraints })
    session.solve({ analyze: false })
    const r = session.drag("p99", { x: 400, y: 100 })
    expect(r.reached).toBe(true)
    const s = session.sketch()
    expect(at(s, "p99").x).toBeCloseTo(400, 8)
    for (let i = 0; i < 99; i++) {
      const a = at(s, `p${i}`), b = at(s, `p${i + 1}`)
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(5, 8)
    }
  })

  test("a 199-entity sketch: a drag step is solved in a few milliseconds (median of 15 steps after the first)", () => {
    const entities: SketchEntity[] = []
    const constraints: Constraint[] = []
    for (let i = 0; i < 100; i++) entities.push(pt(`p${i}`, i * 5, Math.sin(i / 7) * 3))
    for (let i = 0; i < 99; i++) { entities.push(line(`l${i}`, `p${i}`, `p${i + 1}`)); constraints.push({ type: "length", line: `l${i}`, value: 5 }) }
    constraints.push({ type: "fixed", point: "p0", x: 0, y: 0 })
    const session = createSketchSession({ entities, constraints })
    session.solve({ analyze: false })
    session.drag("p99", { x: 400, y: 100 })
    const times: number[] = []
    for (let k = 0; k < 15; k++) {
      const t0 = performance.now()
      session.drag("p99", { x: 400 + 0.5 * (k + 1), y: 100 })
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    // The measured median is about 0.2 ms (bench case `sketch.drag-200`, budget 8 ms); the ceiling here only catches a broken warm start.
    expect(times[7]!).toBeLessThan(50)
  })
})
