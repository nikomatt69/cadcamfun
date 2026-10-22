import { describe, expect, setDefaultTimeout, test } from "bun:test"

// Kernel tests tessellate and integrate exact geometry; under a full-suite run the default 5 s is too short.
setDefaultTimeout(60_000)
import {
  arcControl,
  basisFuns,
  circleProfileLoop,
  curvePoint,
  curveProject,
  dersBasisFuns,
  extrudeProfile,
  findSpan,
  frame,
  insertKnot,
  interpolateCurve,
  makeBox,
  makeCone,
  makeCylinder,
  makeSphere,
  makeTorus,
  massProperties,
  meshEdgeDefects,
  nurbsCurveDerivs,
  nurbsCurvePoint,
  polygonProfileLoop,
  rectangleProfileLoop,
  revolveProfile,
  rotation,
  roundedRectangleLoop,
  setTessellationDebug,
  subCurve,
  surfaceDerivs,
  surfaceNormal,
  surfacePoint,
  surfaceProject,
  tessellateBrep,
  transformBrep,
  triangulateDomain,
  validateBrep,
  type Brep,
  type Surface
} from "./index.ts"
import { CdtCrossingError } from "./cdt.ts"

const PI = Math.PI
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b))

/** Valid closed manifold, watertight tessellation; returns the mass properties. */
const solid = (b: Brep, genus = 0) => {
  const rep = validateBrep(b)
  expect(rep.issues.map((i) => i.message)).toEqual([])
  expect(rep.manifoldSolid).toBe(true)
  expect(rep.genus).toBe(genus)
  const t = tessellateBrep(b)
  expect(t.warnings).toEqual([])
  expect(meshEdgeDefects(t.indices)).toEqual({ open: 0, nonManifold: 0, misoriented: 0 })
  return { mp: massProperties(b), t }
}

describe("nurbs", () => {
  const U = [0, 0, 0, 0, 0.25, 0.5, 0.5, 0.8, 1, 1, 1, 1]
  const p = 3
  const n = U.length - p - 2
  test("basis functions are a partition of unity and match their derivatives", () => {
    for (const u of [0, 0.1, 0.25, 0.37, 0.5, 0.79, 0.99, 1]) {
      const span = findSpan(n, p, u, U)
      const N = basisFuns(span, u, p, U)
      expect(Math.abs(N.reduce((s, x) => s + x, 0) - 1)).toBeLessThan(1e-14)
      const D = dersBasisFuns(span, u, p, 2, U)
      D[0]!.forEach((x, j) => expect(Math.abs(x - N[j]!)).toBeLessThan(1e-14))
      // Derivatives sum to zero.
      expect(Math.abs(D[1]!.reduce((s, x) => s + x, 0))).toBeLessThan(1e-10)
    }
  })
  test("rational quadratic arcs are exact circles", () => {
    const { points, weights, knots } = arcControl(7, 0.3, 4.2)
    const c = { degree: 2, knots, points, weights }
    for (let i = 0; i <= 50; i++) {
      const q = nurbsCurvePoint(c, i / 50)
      expect(Math.abs(Math.hypot(q[0]!, q[1]!) - 7)).toBeLessThan(1e-12)
    }
    const end = nurbsCurvePoint(c, 1)
    expect(Math.abs(Math.atan2(end[1]!, end[0]!) - (0.3 + 4.2 - 2 * PI))).toBeLessThan(1e-12)
  })
  test("curve derivatives match finite differences (rational)", () => {
    const c = { degree: 3, knots: U, points: Array.from({ length: n + 1 }, (_, i) => [i, Math.sin(i), Math.cos(2 * i)]), weights: Array.from({ length: n + 1 }, (_, i) => 1 + 0.3 * Math.sin(i * 1.7) ** 2) }
    for (const u of [0.1, 0.3, 0.6, 0.9]) {
      const d = nurbsCurveDerivs(c, u, 2)
      const h = 1e-5
      const fp = nurbsCurvePoint(c, u + h), fm = nurbsCurvePoint(c, u - h), f0 = nurbsCurvePoint(c, u)
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(d[1]![k]! - (fp[k]! - fm[k]!) / (2 * h))).toBeLessThan(1e-6)
        expect(Math.abs(d[2]![k]! - (fp[k]! - 2 * f0[k]! + fm[k]!) / (h * h))).toBeLessThan(1e-3)
      }
    }
  })
  test("global interpolation passes through the data; knot insertion and splitting keep the shape", () => {
    const pts = Array.from({ length: 9 }, (_, i) => [i * 2, Math.sin(i) * 3, i % 2])
    const { curve, params } = interpolateCurve(pts)
    params.forEach((t, i) => {
      const q = nurbsCurvePoint(curve, t)
      for (let k = 0; k < 3; k++) expect(Math.abs(q[k]! - pts[i]![k]!)).toBeLessThan(1e-9)
    })
    const ins = insertKnot(curve, 0.437, 2)
    expect(ins.points.length).toBe(curve.points.length + 2)
    const sub = subCurve(curve, 0.2, 0.7)
    for (const t of [0, 0.2, 0.437, 0.5, 0.7, 0.99]) {
      const a = nurbsCurvePoint(curve, t), b = nurbsCurvePoint(ins, t)
      for (let k = 0; k < 3; k++) expect(Math.abs(a[k]! - b[k]!)).toBeLessThan(1e-12)
    }
    for (const t of [0.2, 0.33, 0.5, 0.7]) {
      const a = nurbsCurvePoint(curve, t), b = nurbsCurvePoint(sub, t)
      for (let k = 0; k < 3; k++) expect(Math.abs(a[k]! - b[k]!)).toBeLessThan(1e-12)
    }
  })
})

test("projection of a slender rational ellipse leaves a coarse endpoint seed with negative distance curvature", () => {
  const curve = { kind: "nurbs" as const, data: { degree: 2, knots: [0, 0, 0, 1, 1, 1], points: [[80, 0, 0], [80, 2, 0], [0, 2, 0]], weights: [1, Math.SQRT1_2, 1] } }
  for (let i = 0; i <= 100; i++) {
    const t = i / 100, p = curvePoint(curve, t)
    const actual = curveProject(curve, p)
    expect(actual).toBeCloseTo(t, 10)
  }
})

describe("surfaces", () => {
  const f = frame({ x: 1, y: -2, z: 3 }, { x: 0.3, y: 0.4, z: 1 }, { x: 1, y: 0, z: 0 })
  const surfaces: ReadonlyArray<readonly [string, Surface, number, number]> = [
    ["plane", { kind: "plane", frame: f }, 3, -2],
    ["cylinder", { kind: "cylinder", frame: f, radius: 4 }, 1.1, 2.5],
    ["cone", { kind: "cone", frame: f, radius: 4, semiAngle: 0.4 }, 2.1, 1.5],
    ["sphere", { kind: "sphere", frame: f, radius: 5 }, 0.7, 0.4],
    ["torus", { kind: "torus", frame: f, major: 8, minor: 2 }, 4, 2.2],
    ["revolution", { kind: "revolution", curve: { kind: "circle", frame: frame({ x: 6, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }), radius: 2 }, origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 } }, 1.3, 0.5],
    ["extrusion", { kind: "extrusion", curve: { kind: "ellipse", frame: f, a: 5, b: 2 }, dir: f.z }, 0.8, 3],
    [
      "nurbs",
      {
        kind: "nurbs",
        data: {
          degreeU: 2,
          degreeV: 3,
          knotsU: [0, 0, 0, 0.5, 1, 1, 1],
          knotsV: [0, 0, 0, 0, 1, 1, 1, 1],
          points: Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => [i * 3, j * 2, Math.sin(i + j)])),
          weights: Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => 1 + 0.2 * ((i + j) % 2)))
        }
      },
      0.3,
      0.6
    ]
  ]
  for (const [name, s, u, v] of surfaces) {
    test(`${name}: derivatives match finite differences; projection inverts evaluation`, () => {
      const d = surfaceDerivs(s, u, v)
      const h = 1e-6
      const pu = surfacePoint(s, u + h, v), mu = surfacePoint(s, u - h, v), pv = surfacePoint(s, u, v + h), mv = surfacePoint(s, u, v - h)
      expect(Math.abs(d.su.x - (pu.x - mu.x) / (2 * h)) + Math.abs(d.su.y - (pu.y - mu.y) / (2 * h)) + Math.abs(d.su.z - (pu.z - mu.z) / (2 * h))).toBeLessThan(1e-6)
      expect(Math.abs(d.sv.x - (pv.x - mv.x) / (2 * h)) + Math.abs(d.sv.y - (pv.y - mv.y) / (2 * h)) + Math.abs(d.sv.z - (pv.z - mv.z) / (2 * h))).toBeLessThan(1e-6)
      const q = surfaceProject(s, d.p)
      const back = surfacePoint(s, q.u, q.v)
      expect(Math.hypot(back.x - d.p.x, back.y - d.p.y, back.z - d.p.z)).toBeLessThan(1e-9)
      // A point off the surface projects along the normal.
      const n = surfaceNormal(s, u, v)
      const off = { x: d.p.x + n.x * 0.05, y: d.p.y + n.y * 0.05, z: d.p.z + n.z * 0.05 }
      const q2 = surfaceProject(s, off)
      const foot = surfacePoint(s, q2.u, q2.v)
      expect(Math.abs(Math.hypot(off.x - foot.x, off.y - foot.y, off.z - foot.z) - 0.05)).toBeLessThan(1e-7)
    })
  }
})

describe("constrained Delaunay triangulation", () => {
  const area = (r: { xs: ReadonlyArray<number>; ys: ReadonlyArray<number> }, [a, b, c]: readonly [number, number, number]) =>
    ((r.xs[b]! - r.xs[a]!) * (r.ys[c]! - r.ys[a]!) - (r.ys[b]! - r.ys[a]!) * (r.xs[c]! - r.xs[a]!)) / 2
  test("square with a polygonal hole and random Steiner points: exact area, all triangles counter-clockwise", () => {
    const hole: Array<[number, number]> = Array.from({ length: 32 }, (_, i) => [5 + 3 * Math.cos(-i / 16 * PI), 5 + 3 * Math.sin(-i / 16 * PI)])
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const steiner: Array<[number, number]> = Array.from({ length: 400 }, () => [rnd() * 10, rnd() * 10])
    const r = triangulateDomain([[[0, 0], [10, 0], [10, 10], [0, 10]], hole], steiner)
    const areas = r.triangles.map((t) => area(r, t))
    expect(areas.every((a) => a > 0)).toBe(true)
    expect(Math.abs(areas.reduce((s, a) => s + a, 0) - (100 - 16 * 9 * Math.sin(PI / 16)))).toBeLessThan(1e-9)
  })
  test("collinear boundary points and a regular grid", () => {
    const g: Array<[number, number]> = []
    for (let i = 0; i <= 10; i++) g.push([i, 0])
    for (let i = 1; i <= 10; i++) g.push([10, i])
    for (let i = 9; i >= 0; i--) g.push([i, 10])
    for (let i = 9; i >= 1; i--) g.push([0, i])
    const inner: Array<[number, number]> = []
    for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) inner.push([i, j])
    const r = triangulateDomain([g], inner)
    expect(r.triangles.length).toBe(200)
    expect(r.triangles.reduce((s, t) => s + area(r, t), 0)).toBeCloseTo(100, 12)
  })
  test("a self-intersecting boundary is reported, not triangulated wrongly", () => {
    expect(() => triangulateDomain([[[0, 0], [10, 10], [10, 0], [0, 10]]])).toThrow(CdtCrossingError)
  })
})

describe("primitives", () => {
  test("box: exact volume, area, centroid and inertia", () => {
    const { mp } = solid(makeBox(10, 20, 30))
    expect(rel(mp.volume, 6000)).toBeLessThan(1e-14)
    expect(rel(mp.area, 2200)).toBeLessThan(1e-14)
    expect(mp.centroid.x).toBeCloseTo(5, 12)
    expect(mp.centroid.y).toBeCloseTo(10, 12)
    expect(mp.centroid.z).toBeCloseTo(15, 12)
    expect(rel(mp.inertia[0], (6000 * (400 + 900)) / 12)).toBeLessThan(1e-12)
    expect(rel(mp.inertia[4], (6000 * (100 + 900)) / 12)).toBeLessThan(1e-12)
    expect(rel(mp.inertia[8], (6000 * (100 + 400)) / 12)).toBeLessThan(1e-12)
    expect(Math.abs(mp.inertia[1])).toBeLessThan(1e-8)
  })
  test("cylinder in a tilted placement: volume, area and axial inertia", () => {
    const f = frame({ x: 3, y: 4, z: -2 }, { x: 1, y: 1, z: 1 })
    const { mp } = solid(makeCylinder(5, 10, f))
    const V = PI * 25 * 10
    expect(rel(mp.volume, V)).toBeLessThan(1e-12)
    expect(rel(mp.area, 2 * PI * 25 + 2 * PI * 5 * 10)).toBeLessThan(1e-12)
    // Centroid on the axis at half height.
    expect(mp.centroid.x).toBeCloseTo(3 + 5 / Math.sqrt(3), 9)
    // Axial moment of inertia: m r² / 2 about the (1,1,1) axis.
    const a = { x: 1 / Math.sqrt(3), y: 1 / Math.sqrt(3), z: 1 / Math.sqrt(3) }
    const I = mp.inertia
    const Ia = a.x * (I[0] * a.x + I[1] * a.y + I[2] * a.z) + a.y * (I[3] * a.x + I[4] * a.y + I[5] * a.z) + a.z * (I[6] * a.x + I[7] * a.y + I[8] * a.z)
    expect(rel(Ia, (V * 25) / 2)).toBeLessThan(1e-10)
  })
  test("cone frustum and both apex orientations (regression: apex at the top ran out of points)", () => {
    expect(rel(solid(makeCone(5, 2, 6)).mp.volume, (PI * 6 / 3) * (25 + 10 + 4))).toBeLessThan(1e-12)
    for (const [r1, r2] of [[4, 0], [0, 4]] as const) {
      const { mp, t } = solid(makeCone(r1, r2, 9))
      expect(rel(mp.volume, (PI * 16 * 9) / 3)).toBeLessThan(1e-12)
      // Regression: the pole triangles were integrated as dropped (area 2/3 of the truth).
      expect(rel(mp.area, PI * 16 + PI * 4 * Math.hypot(4, 9))).toBeLessThan(1e-12)
      expect(t.indices.length / 3).toBeLessThan(400)
    }
  })
  test("sphere: volume, area, inertia; poles and seam watertight", () => {
    const { mp } = solid(makeSphere(7))
    expect(rel(mp.volume, (4 / 3) * PI * 343)).toBeLessThan(1e-12)
    expect(rel(mp.area, 4 * PI * 49)).toBeLessThan(1e-12)
    expect(rel(mp.inertia[0], (2 / 5) * mp.volume * 49)).toBeLessThan(1e-10)
  })
  test("torus: genus 1, Pappus volume and area", () => {
    const { mp } = solid(makeTorus(10, 3), 1)
    expect(rel(mp.volume, 2 * PI * PI * 10 * 9)).toBeLessThan(1e-12)
    expect(rel(mp.area, 4 * PI * PI * 10 * 3)).toBeLessThan(1e-12)
  })
})

describe("sweeps", () => {
  test("extruded plate with a circular hole is genus 1 with the exact net volume", () => {
    const b = extrudeProfile({ loops: [rectangleProfileLoop(0, 0, 40, 30), circleProfileLoop({ x: 20, y: 15 }, 6)] }, 8)
    expect(rel(solid(b, 1).mp.volume, (1200 - PI * 36) * 8)).toBeLessThan(1e-12)
    // Faces: bottom, top, 4 sides, 1 cylinder.
    expect(b.faces.map((f) => f.surface.kind).sort()).toEqual(["cylinder", "plane", "plane", "plane", "plane", "plane", "plane"])
  })
  test("negative extrusion of a rounded rectangle grows downwards", () => {
    const { mp } = solid(extrudeProfile({ loops: [roundedRectangleLoop(0, 0, 40, 30, 5)] }, -4))
    expect(rel(mp.volume, (1200 - (4 - PI) * 25) * 4)).toBeLessThan(1e-12)
    expect(mp.centroid.z).toBeCloseTo(-2, 12)
  })
  test("revolve: full ring (genus 1), solid cylinder, quarter ring with caps", () => {
    expect(rel(solid(revolveProfile({ loops: [rectangleProfileLoop(5, 0, 8, 10)] }, 2 * PI), 1).mp.volume, PI * 39 * 10)).toBeLessThan(1e-12)
    const cyl = revolveProfile({ loops: [rectangleProfileLoop(0, 0, 6, 10)] }, 2 * PI)
    expect(cyl.faces.map((f) => f.surface.kind).sort()).toEqual(["cylinder", "plane", "plane"])
    expect(rel(solid(cyl).mp.volume, PI * 360)).toBeLessThan(1e-12)
    expect(rel(solid(revolveProfile({ loops: [rectangleProfileLoop(5, 0, 8, 10)] }, PI / 2)).mp.volume, (PI * 390) / 4)).toBeLessThan(1e-12)
  })
  test("revolve recognises sphere, cone and torus faces", () => {
    const sph = revolveProfile({ loops: [[{ kind: "arc", center: { x: 0, y: 0 }, radius: 5, start: -PI / 2, end: PI / 2 }, { kind: "line", a: { x: 0, y: 5 }, b: { x: 0, y: -5 } }]] }, 2 * PI)
    expect(sph.faces.map((f) => f.surface.kind)).toEqual(["sphere"])
    expect(rel(solid(sph).mp.area, 100 * PI)).toBeLessThan(1e-12)
    const frustum = revolveProfile({ loops: [polygonProfileLoop([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 2, y: 6 }, { x: 0, y: 6 }])] }, 2 * PI)
    expect(frustum.faces.map((f) => f.surface.kind).sort()).toEqual(["cone", "plane", "plane"])
    expect(rel(solid(frustum).mp.volume, 2 * PI * 39)).toBeLessThan(1e-12)
  })
  test("revolving a full circle welds its start and end (regression: −0 vs 0 split the torus seam)", () => {
    const tor = revolveProfile({ loops: [circleProfileLoop({ x: 10, y: 0 }, 3)] }, 2 * PI)
    expect(tor.faces.map((f) => f.surface.kind)).toEqual(["torus"])
    expect(rel(solid(tor, 1).mp.volume, 2 * PI * PI * 90)).toBeLessThan(1e-12)
    const half = revolveProfile({ loops: [circleProfileLoop({ x: 10, y: 0 }, 3)] }, PI)
    expect(rel(solid(half).mp.volume, PI * PI * 90)).toBeLessThan(1e-12)
  })
})

describe("transforms and tessellation accuracy", () => {
  test("a mirrored solid stays valid with the same volume", () => {
    const b = revolveProfile({ loops: [rectangleProfileLoop(5, 0, 8, 10)] }, PI / 3)
    const mirror = { m: [-1, 0, 0, 0, 1, 0, 0, 0, 1] as const, t: { x: 0, y: 0, z: 0 } }
    const m = transformBrep(b, mirror)
    expect(rel(solid(m).mp.volume, solid(b).mp.volume)).toBeLessThan(1e-12)
    const r = transformBrep(b, rotation({ x: 1, y: 2, z: 3 }, 0.7, { x: 5, y: 0, z: 1 }))
    expect(rel(solid(r).mp.volume, (PI * 390) / 6)).toBeLessThan(1e-12)
  })
  test("every mesh vertex lies on the exact surface and triangle sag stays within the chord tolerance", () => {
    for (const b of [makeSphere(7), makeTorus(10, 3), makeCone(5, 2, 6)]) {
      const t = tessellateBrep(b, { chordTol: 0.01 })
      for (const fm of t.faces) {
        const s = b.faces[fm.face]!.surface
        for (let k = 0; k < fm.uvs.length / 2; k++) {
          const p = surfacePoint(s, fm.uvs[k * 2]!, fm.uvs[k * 2 + 1]!)
          expect(Math.hypot(p.x - fm.positions[k * 3]!, p.y - fm.positions[k * 3 + 1]!, p.z - fm.positions[k * 3 + 2]!)).toBeLessThan(1e-9)
        }
        let worst = 0
        for (let i = 0; i < fm.indices.length; i += 3) {
          const ids = [fm.indices[i]!, fm.indices[i + 1]!, fm.indices[i + 2]!]
          const c = { x: 0, y: 0, z: 0 }
          for (const k of ids) { c.x += fm.positions[k * 3]! / 3; c.y += fm.positions[k * 3 + 1]! / 3; c.z += fm.positions[k * 3 + 2]! / 3 }
          const q = surfaceProject(s, c)
          const f = surfacePoint(s, q.u, q.v)
          worst = Math.max(worst, Math.hypot(f.x - c.x, f.y - c.y, f.z - c.z))
        }
        expect(worst).toBeLessThan(0.01 * 1.5)
      }
    }
  })
  test("parameter rings of a sphere close along both poles and place the seam on both sides", () => {
    const rings: Array<ReadonlyArray<{ readonly u: number; readonly v: number }>> = []
    setTessellationDebug((_, r) => rings.push(...r))
    tessellateBrep(makeSphere(7), { chordTol: 0.5, angleTolDeg: 45 })
    setTessellationDebug(undefined)
    expect(rings.length).toBe(1)
    const us = rings[0]!.map((p) => p.u)
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(2 * PI, 12)
    const vs = rings[0]!.map((p) => p.v)
    expect(Math.max(...vs)).toBeCloseTo(PI / 2, 12)
    expect(Math.min(...vs)).toBeCloseTo(-PI / 2, 12)
  })
})
