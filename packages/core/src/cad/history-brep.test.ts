import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { DimConstraint, Feature, History, SketchFeature } from "./history.ts"
import type { SketchEntity } from "./sketch.ts"
import { meshVolume } from "./solid.ts"
import { buildRecipe } from "./recipes.ts"
import { rebuildExact } from "./history-brep.ts"
import { massProperties, validateBrep } from "./brep/index.ts"

setDefaultTimeout(60_000)

const PI = Math.PI
const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })
const rectangle = (id: string, plane: SketchFeature["plane"], x: number, y: number, w: number | string, h: number | string, offset?: number): SketchFeature => ({
  id, type: "sketch", plane, ...(offset !== undefined ? { offset } : {}),
  sketch: {
    entities: [pt("p1", x + 0.2, y - 0.1), pt("p2", x + 9, y + 0.3), pt("p3", x + 11, y + 6), pt("p4", x - 0.4, y + 5), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")],
    constraints: [
      { type: "fixed", point: "p1", x, y }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
      { type: "length", line: "l1", value: w }, { type: "length", line: "l2", value: h }
    ] as DimConstraint[]
  }
})
const circles = (id: string, plane: SketchFeature["plane"], cx: number, cy: number, radii: number[]): SketchFeature => ({
  id, type: "sketch", plane,
  sketch: {
    entities: [pt("c", cx, cy), ...radii.map((_, i): SketchEntity => ({ id: `k${i}`, kind: "circle", center: "c", radius: 1 + i }))],
    constraints: [{ type: "fixed", point: "c" }, ...radii.map((r, i) => ({ type: "radius", circle: `k${i}`, value: r }) as DimConstraint)]
  }
})
const history = (features: Feature[], parameters: History["parameters"] = {}): History => ({ parameters, features })
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

/** The single exact body of a history: valid, and its volume. */
const exactVolume = (h: History, index = 0): number => {
  const r = rebuildExact(h)
  expect(r.result.issues.filter((i) => i.severity === "error")).toEqual([])
  const b = r.bodies[index]!
  expect(b.reason).toBeUndefined()
  const rep = validateBrep(b.brep!)
  expect(rep.issues.map((i) => i.message)).toEqual([])
  return massProperties(b.brep!).volume
}

describe("exact replay of a parametric history", () => {
  const plate = (extra: Feature[] = [], parameters: History["parameters"] = {}) =>
    history([rectangle("s1", "XY", 0, 0, "width", "height"), { id: "plate", type: "extrude", sketch: "s1", depth: "thick", operation: "new" }, ...extra], { width: 40, height: 25, thick: 6, ...parameters })

  test("an extruded sketch is the exact plate and follows its parameters", () => {
    expect(rel(exactVolume(plate()), 6000)).toBeLessThan(1e-9)
    expect(rel(exactVolume(plate([], { width: 60 })), 60 * 25 * 6)).toBeLessThan(1e-9)
    const b = rebuildExact(plate()).bodies[0]!.brep!
    expect(b.faces.map((f) => f.name)).toContain("plate.top")
  })

  test("a hole is an exact cylinder cut", () => {
    const v = exactVolume(plate([{ id: "h1", type: "hole", plane: "XY", offset: 6, at: [20, 12.5], diameter: 8, depth: 6 }]))
    expect(rel(v, 6000 - PI * 16 * 6)).toBeLessThan(1e-9)
  })

  test("a pattern and its mirror of holes", () => {
    const v = exactVolume(plate([
      { id: "h1", type: "hole", plane: "XY", offset: 6, at: [6, 6], diameter: 4, depth: 6 },
      { id: "row", type: "pattern", feature: "h1", kind: "linear", count: 3, step: [10, 0, 0] },
      { id: "m", type: "mirror", feature: "h1", plane: "ZX", offset: 12.5 }
    ]))
    // The hole, its two pattern copies and its mirror image.
    const holes = 4
    expect(rel(v, 6000 - holes * PI * 4 * 6)).toBeLessThan(1e-9)
  })

  test("nested circles extrude to an exact ring", () => {
    const v = exactVolume(history([circles("s", "XY", 0, 0, [10, 6]), { id: "ring", type: "extrude", sketch: "s", depth: 5, operation: "new" }]))
    expect(rel(v, PI * (100 - 36) * 5)).toBeLessThan(1e-9)
  })

  test("a revolved rectangle is an exact ring of rectangular section", () => {
    const v = exactVolume(history([rectangle("s", "XY", 5, 0, 3, 10), { id: "r", type: "revolve", sketch: "s", axis: "y", operation: "new" }]))
    expect(rel(v, PI * (64 - 25) * 10)).toBeLessThan(1e-9)
  })

  test("a turned catalogue cylinder subtracted across the plate", () => {
    const v = exactVolume(plate([
      { id: "bar", type: "primitive", element: "cylinder", params: { radius: 2, height: 60 }, at: [20, 12.5, 3], rotation: [0, 90, 0], operation: "subtract" }
    ]))
    expect(rel(v, 6000 - PI * 4 * 40)).toBeLessThan(1e-9)
  })

  test("a split keeps the volume on both sides", () => {
    const r = rebuildExact(plate([{ id: "cut", type: "split", plane: "YZ", offset: 15, keep: "both" }]))
    const vols = r.bodies.map((b) => massProperties(b.brep!).volume)
    expect(vols.length).toBe(2)
    expect(rel(vols[0]! + vols[1]!, 6000)).toBeLessThan(1e-9)
    expect(rel(Math.min(...vols), 15 * 25 * 6)).toBeLessThan(1e-9)
  })

  test("rounded and bevelled profile corners are exact arcs and lines", () => {
    const filleted = plate([], {}).features.map((f) => (f.id === "plate" ? { ...f, corner: { style: "fillet" as const, size: 5 } } : f))
    const vf = exactVolume({ parameters: { width: 40, height: 25, thick: 6 }, features: filleted })
    expect(rel(vf, (1000 - (4 - PI) * 25) * 6)).toBeLessThan(1e-9)
    const r = rebuildExact({ parameters: { width: 40, height: 25, thick: 6 }, features: filleted })
    // Four quarter-round walls, exact cylinders of radius 5.
    const cylinders = r.bodies[0]!.brep!.faces.filter((f) => f.surface.kind === "cylinder")
    expect(cylinders.length).toBe(4)
    expect(cylinders.every((f) => f.surface.kind === "cylinder" && Math.abs(f.surface.radius - 5) < 1e-12)).toBe(true)
    const chamfered = plate([], {}).features.map((f) => (f.id === "plate" ? { ...f, corner: { style: "chamfer" as const, size: 3 } } : f))
    expect(rel(exactVolume({ parameters: { width: 40, height: 25, thick: 6 }, features: chamfered }), (1000 - 2 * 9) * 6)).toBeLessThan(1e-9)
  })

  test("a corner treatment that does not fit is reported, not approximated", () => {
    const tooBig = plate([], {}).features.map((f) => (f.id === "plate" ? { ...f, corner: { style: "fillet" as const, size: 30 } } : f))
    const r = rebuildExact({ parameters: { width: 40, height: 25, thick: 6 }, features: tooBig })
    expect(r.bodies.every((b) => b.brep === undefined)).toBe(true)
  })

  test("a feature without an exact counterpart is reported per body, the mesh stays", () => {
    const r = rebuildExact(plate([{ id: "squash", type: "scale", factor: [1, 2, 1] }]))
    expect(r.bodies[0]!.brep).toBeUndefined()
    expect(r.bodies[0]!.reason).toContain("non-uniform scale")
    expect(r.result.bodies[0]!.mesh.indices.length).toBeGreaterThan(0)
  })

  test("a fillet of every edge is the exact rolling-ball solid (inner box plus ball)", () => {
    const r = 1
    const v = exactVolume(plate([{ id: "round", type: "fillet", radius: r }]))
    const a = 40 - 2 * r, b = 25 - 2 * r, c = 6 - 2 * r
    expect(rel(v, a * b * c + 2 * r * (a * b + b * c + a * c) + PI * r * r * (a + b + c) + (4 / 3) * PI * r ** 3)).toBeLessThan(1e-8)
    const faces = rebuildExact(plate([{ id: "round", type: "fillet", radius: r }])).bodies[0]!.brep!.faces
    expect(faces.filter((f) => f.surface.kind === "sphere").length).toBe(8)
  }, 180_000)

  test("a chamfer of the vertical edges, and of every edge", () => {
    const c = 2
    // The four vertical edges: four 45-degree flats.
    expect(rel(exactVolume(plate([{ id: "bevel", type: "fillet", style: "chamfer", radius: c, edges: { parallel: "z" } }])), 6000 - 4 * (c * c / 2) * 6)).toBeLessThan(1e-10)
    // Every edge: the twelve chamfer planes, inclusion-exclusion at the eight corners.
    expect(rel(exactVolume(plate([{ id: "bevel", type: "fillet", style: "chamfer", radius: c }])), 6000 - 2 * c * c * (40 + 25 + 6) + 6 * c ** 3)).toBeLessThan(1e-9)
  }, 180_000)

  test("an extrusion's edge treatment: its end rims chamfered or filleted exactly, holes when asked", () => {
    const c = 2
    const withEdge = (edge: NonNullable<Extract<Feature, { type: "extrude" }>["edge"]>, extra: Feature[] = []) =>
      ({ ...plate(extra), features: plate(extra).features.map((f) => (f.id === "plate" ? { ...f, edge } : f)) })
    // Top rim only: four 45-degree prisms along the perimeter, overlapping by c^3 / 3 at each corner.
    expect(rel(exactVolume(withEdge({ style: "chamfer", size: c, ends: "top" })), 6000 - (c * c / 2) * 130 + 4 * (c ** 3 / 3))).toBeLessThan(1e-9)
    // Both rims: twice that.
    expect(rel(exactVolume(withEdge({ style: "chamfer", size: c })), 6000 - 2 * ((c * c / 2) * 130 - 4 * (c ** 3 / 3)))).toBeLessThan(1e-9)
    // A hole's rims too: the outer chamfers plus a revolved triangle at each end of the bore (Pappus).
    // The bore is a circle in the plate's own sketch, so it is an inner loop of the end faces.
    const [s1, extrude] = plate().features as [SketchFeature, Extract<Feature, { type: "extrude" }>]
    const holed = history([
      { ...s1, sketch: { entities: [...s1.sketch.entities, pt("c", 20, 12.5), { id: "k", kind: "circle", center: "c", radius: 4 }], constraints: [...s1.sketch.constraints, { type: "fixed", point: "c" }] } },
      { ...extrude, edge: { style: "chamfer", size: 1, holes: true } }
    ], plate().parameters)
    const outer = 6000 - 2 * ((1 / 2) * 130 - 4 * (1 / 3))
    const bore = PI * 16 * 6 + 2 * (2 * PI * (4 + 1 / 3) * (1 / 2))
    expect(rel(exactVolume(holed), outer - bore)).toBeLessThan(1e-9)
    // A fillet agrees with the mesh rebuild's.
    const rounded = rebuildExact(withEdge({ style: "fillet", size: 1 }))
    expect(rounded.bodies[0]!.reason).toBeUndefined()
    expect(validateBrep(rounded.bodies[0]!.brep!).issues).toEqual([])
    expect(rel(massProperties(rounded.bodies[0]!.brep!).volume, meshVolume(rounded.result.bodies[0]!.mesh))).toBeLessThan(2e-3)
    // A rounded profile corner's arc is not a rim the exact blend takes: the reason, not an approximation.
    const both = { ...plate(), features: plate().features.map((f) => (f.id === "plate" ? { ...f, corner: { style: "fillet" as const, size: 5 }, edge: { style: "chamfer" as const, size: 1 } } : f)) }
    expect(rebuildExact(both).bodies[0]!.reason).toContain("straight edges and full circles only")
  }, 180_000)

  test("a drafted extrusion leans its walls exactly: planes tilt, arcs become cones, holes widen towards the top", () => {
    const k = Math.tan((5 * PI) / 180), h = 6
    const drafted = (base: History) => ({ ...base, features: base.features.map((f) => (f.id === "plate" ? { ...f, taper: 5 } : f)) })
    // The area at height z is a quadratic in z; Simpson's rule integrates it exactly.
    const simpson = (area: (z: number) => number) => (h / 6) * (area(0) + 4 * area(h / 2) + area(h))
    const rect = (z: number) => (40 - 2 * k * z) * (25 - 2 * k * z)
    expect(rel(exactVolume(drafted(plate())), simpson(rect))).toBeLessThan(1e-9)
    // A bore of radius 4 in the profile widens by k per mm of height.
    const [s1, extrude] = plate().features as [SketchFeature, Extract<Feature, { type: "extrude" }>]
    const bored = history([{ ...s1, sketch: { entities: [...s1.sketch.entities, pt("c", 20, 12.5), { id: "k", kind: "circle", center: "c", radius: 4 }], constraints: [...s1.sketch.constraints, { type: "fixed", point: "c" }] } }, { ...extrude, taper: 5 }], plate().parameters)
    expect(rel(exactVolume(bored), simpson((z) => rect(z) - PI * (4 + k * z) ** 2))).toBeLessThan(1e-9)
    // Rounded corners (r = 5) shrink to concentric arcs: cones at the corners.
    const rounded = drafted({ ...plate(), features: plate().features.map((f) => (f.id === "plate" ? { ...f, corner: { style: "fillet" as const, size: 5 } } : f)) })
    const r = rebuildExact(rounded)
    const v = massProperties(r.bodies[0]!.brep!).volume
    expect(rel(v, simpson((z) => rect(z) - (4 - PI) * (5 - k * z) ** 2))).toBeLessThan(1e-9)
    expect(r.bodies[0]!.brep!.faces.filter((f) => f.surface.kind === "cone").length).toBe(4)
    expect(rel(v, meshVolume(r.result.bodies[0]!.mesh))).toBeLessThan(2e-3)
  })

  test("a face draft leans a planar face about its hinge: material removed above the neutral plane, added below", () => {
    const k = Math.tan((5 * PI) / 180)
    const draft = (neutral: number, angle = 5): Feature => ({ id: "lean", type: "draft", near: [40, 12.5, 3], normal: [1, 0, 0], angle, neutral })
    // Hinge on the bottom edge: a wedge 6 high and 6 tan(5) deep leaves the 25 mm wide face.
    const removed = rebuildExact(plate([draft(0)]))
    expect(rel(massProperties(removed.bodies[0]!.brep!).volume, 6000 - 25 * (36 * k) / 2)).toBeLessThan(1e-9)
    expect(rel(massProperties(removed.bodies[0]!.brep!).volume, meshVolume(removed.result.bodies[0]!.mesh))).toBeLessThan(1e-6)
    // Hinge on the top edge: the face leans out below it, the wedge is added.
    expect(rel(exactVolume(plate([draft(6)])), 6000 + 25 * (36 * k) / 2)).toBeLessThan(1e-9)
    // Hinge half way up: both, and they cancel.
    expect(rel(exactVolume(plate([draft(3)])), 6000)).toBeLessThan(1e-9)
  })

  test("features without an exact counterpart are never skipped silently", () => {
    const pushed = rebuildExact(plate([{ id: "pp", type: "pushpull", near: [40, 12.5, 3], distance: 2 }]))
    expect(pushed.bodies[0]!.reason).toContain("push-pull")
    // A hole wall is curved: its draft says so instead of leaving the body as it was.
    const bored = plate([{ id: "h1", type: "hole", plane: "XY", offset: 6, at: [20, 12.5], diameter: 8, depth: 6 }, { id: "lean", type: "draft", near: [24, 12.5, 3], angle: 3 }])
    expect(rebuildExact(bored).bodies[0]!.reason).toContain("curved face")
  })

  test("a shell hollows the extrusion exactly: closed, open at the top, a tube around a bore, a rounded box", () => {
    const shell = (open: "none" | "top" | "bottom" | "both", base = plate()): History =>
      history([...base.features, { id: "hollow", type: "shell", feature: "plate", thickness: 1, open }], base.parameters)
    // 40 x 25 x 6 with a 1 mm wall: the cavity is 38 x 23 by 4 closed, by 5 open at the top.
    expect(rel(exactVolume(shell("none")), 6000 - 38 * 23 * 4)).toBeLessThan(1e-9)
    expect(rel(exactVolume(shell("top")), 6000 - 38 * 23 * 5)).toBeLessThan(1e-9)
    // A bore of radius 4 in the profile: open at both ends the part is a tube with a 1 mm wall round the bore and outside.
    const [s1, extrude] = plate().features as [SketchFeature, Extract<Feature, { type: "extrude" }>]
    const bored = history([{ ...s1, sketch: { entities: [...s1.sketch.entities, pt("c", 20, 12.5), { id: "k", kind: "circle", center: "c", radius: 4 }], constraints: [...s1.sketch.constraints, { type: "fixed", point: "c" }] } }, extrude], plate().parameters)
    expect(rel(exactVolume(shell("both", bored)), 6 * ((1000 - 16 * PI) - (38 * 23 - 25 * PI)))).toBeLessThan(1e-9)
    // Rounded profile corners (r = 5): the cavity's corners are concentric arcs of radius 4.
    const rounded = { ...plate(), features: plate().features.map((f) => (f.id === "plate" ? { ...f, corner: { style: "fillet" as const, size: 5 } } : f)) }
    const r = rebuildExact(shell("top", rounded))
    const v = massProperties(r.bodies[0]!.brep!).volume
    expect(rel(v, (1000 - (4 - PI) * 25) * 6 - (38 * 23 - (4 - PI) * 16) * 5)).toBeLessThan(1e-9)
    expect(rel(v, meshVolume(r.result.bodies[0]!.mesh))).toBeLessThan(2e-3)
  }, 180_000)

  test("a shell of a full revolution: a hollow ring, an open ring, a cup and a closed can, exactly", () => {
    const turned = (x: number, w: number, h: number, open: "none" | "top" | "bottom" | "both", t: number, degrees?: number) =>
      history([rectangle("s1", "XY", x, 0, w, h), { id: "ring", type: "revolve", sketch: "s1", axis: "y", ...(degrees !== undefined ? { angle: degrees } : {}), operation: "new" }, { id: "hollow", type: "shell", feature: "ring", thickness: t, open }])
    // A ring of section 5..8 x 0..10: the cavity is 5.5..7.5 x 0.5..9.5, or through the top.
    expect(rel(exactVolume(turned(5, 3, 10, "none", 0.5)), PI * (64 - 25) * 10 - PI * (7.5 ** 2 - 5.5 ** 2) * 9)).toBeLessThan(1e-9)
    expect(rel(exactVolume(turned(5, 3, 10, "top", 0.5)), PI * (64 - 25) * 10 - PI * (7.5 ** 2 - 5.5 ** 2) * 9.5)).toBeLessThan(1e-9)
    // A solid cylinder r 10 x 20 (its profile on the axis): a cup with a 1 mm wall and floor, and a closed can.
    const cup = rebuildExact(turned(0, 10, 20, "top", 1))
    expect(cup.bodies[0]!.reason).toBeUndefined()
    const v = massProperties(cup.bodies[0]!.brep!).volume
    expect(rel(v, PI * 100 * 20 - PI * 81 * 19)).toBeLessThan(1e-9)
    expect(rel(v, meshVolume(cup.result.bodies[0]!.mesh))).toBeLessThan(2e-3)
    expect(rel(exactVolume(turned(0, 10, 20, "none", 1)), PI * 100 * 20 - PI * 81 * 18)).toBeLessThan(1e-9)
    // A partial revolution cannot be shelled: the rebuild reports it on the feature, and both views keep the half ring.
    const part = rebuildExact(turned(5, 3, 10, "none", 0.5, 180))
    expect(part.result.issues.some((i) => i.feature === "hollow" && i.severity === "error")).toBe(true)
    expect(rel(massProperties(part.bodies[0]!.brep!).volume, (PI * (64 - 25) * 10) / 2)).toBeLessThan(1e-9)
  })

  test("fillets between curved faces of a turned part: cylinder to cone (convex) and cone to cylinder (concave), exact tori", () => {
    const shaft = history([
      { id: "s1", type: "sketch", plane: "XY", sketch: { entities: [
        pt("a", 0, 0), pt("b", 10, 0), pt("c", 10, 20), pt("d", 6, 24), pt("e", 6, 50), pt("f", 0, 50),
        line("l1", "a", "b"), line("l2", "b", "c"), line("l3", "c", "d"), line("l4", "d", "e"), line("l5", "e", "f"), line("l6", "f", "a")
      ], constraints: ["a", "b", "c", "d", "e", "f"].map((p) => ({ type: "fixed", point: p }) as DimConstraint) } },
      { id: "shaft", type: "revolve", sketch: "s1", axis: "y", operation: "new" },
      { id: "round", type: "fillet", radius: 1, edges: { curved: true, kind: "both", within: { min: [-11, 19, -11], max: [11, 25, 11] } } }
    ])
    // The ring a rolling ball of radius rho leaves at a corner P of the section (r, a) between faces with outward normals
    // nA, nB, by Pappus: the area between the corner and the ball (kite minus sector) times the path of its centroid.
    const ring = (P: [number, number], nA: [number, number], nB: [number, number], rho: number, convex: boolean): number => {
      const alpha = Math.acos(nA[0] * nB[0] + nA[1] * nB[1])
      const s = [nA[0] + nB[0], nA[1] + nB[1]], sl = Math.hypot(s[0]!, s[1]!)
      const w = convex ? [-s[0]! / sl, -s[1]! / sl] : [s[0]! / sl, s[1]! / sl]
      const d = rho / Math.cos(alpha / 2)
      const C = [P[0] + w[0]! * d, P[1] + w[1]! * d]
      const k = convex ? 1 : -1
      const T1 = [C[0]! + k * nA[0] * rho, C[1]! + k * nA[1] * rho], T2 = [C[0]! + k * nB[0] * rho, C[1]! + k * nB[1] * rho]
      const kite = rho * rho * Math.tan(alpha / 2), sector = rho * rho * (alpha / 2)
      const gk = (2 * P[0] + T1[0]! + T2[0]! + 2 * C[0]!) / 6
      const gs = C[0]! - w[0]! * (2 * rho * Math.sin(alpha / 2)) / (3 * (alpha / 2))
      const area = kite - sector
      return 2 * PI * ((kite * gk - sector * gs) / area) * area
    }
    // A 45 degree cone: the mesh blend, and the exact one with it, leave shallower junctions (under 25 degrees) alone.
    const l = Math.SQRT2
    const cone: [number, number] = [1 / l, 1 / l]
    const plain = PI * 100 * 20 + (PI * 4 / 3) * (100 + 60 + 36) + PI * 36 * 26
    const r = rebuildExact(shaft)
    expect(r.bodies[0]!.reason).toBeUndefined()
    const v = massProperties(r.bodies[0]!.brep!).volume
    expect(rel(v, plain - ring([10, 20], [1, 0], cone, 1, true) + ring([6, 24], cone, [1, 0], 1, false))).toBeLessThan(1e-9)
    expect(r.bodies[0]!.brep!.faces.filter((f) => f.surface.kind === "torus").length).toBe(2)
  }, 180_000)

  test("hole mouths are rounded with exact tori when curved edges are asked for", () => {
    const r = 1
    const holed = plate([{ id: "h1", type: "hole", plane: "XY", offset: 6, at: [20, 12.5], diameter: 8, depth: 6 }, { id: "round", type: "fillet", radius: r, edges: { curved: true, within: { min: [10, 5, -1], max: [30, 20, 7] } } }])
    const s = { area: r * r * (1 - PI / 4), centroid: ((10 - 3 * PI) / (12 - 3 * PI)) * r }
    expect(rel(exactVolume(holed), 6000 - PI * 16 * 6 - 2 * (2 * PI * (4 + s.centroid) * s.area))).toBeLessThan(1e-8)
  }, 180_000)

  test("recipes: the exact solid agrees with the mesh within the meshing error", () => {
    for (const [name, input] of [["mounting_plate", {}], ["flange", {}], ["l_bracket", {}], ["stepped_shaft", { sections: [{ diameter: 20, length: 30 }, { diameter: 14, length: 40 }] }]] as const) {
      const r = rebuildExact(buildRecipe(name, input).history)
      for (const b of r.bodies) {
        if (b.brep === undefined) continue
        expect(validateBrep(b.brep).valid).toBe(true)
        const mesh = meshVolume(r.result.bodies.find((m) => m.id === b.id)!.mesh)
        expect(rel(massProperties(b.brep).volume, mesh)).toBeLessThan(2e-3)
      }
      expect(r.bodies.some((b) => b.brep !== undefined)).toBe(true)
    }
    // Recipes with an edge chamfer on their extrusion: every body exact.
    for (const [name, input] of [["mounting_plate", { chamfer: 1 }], ["flange", { chamfer: 1 }]] as const) {
      const r = rebuildExact(buildRecipe(name, input).history)
      for (const b of r.bodies) {
        expect(b.reason).toBeUndefined()
        const mesh = meshVolume(r.result.bodies.find((m) => m.id === b.id)!.mesh)
        expect(rel(massProperties(b.brep!).volume, mesh)).toBeLessThan(2e-3)
      }
    }
  })
})

describe("exact replay on work planes", () => {
  const centroidOf = (positions: Float32Array) => {
    let x = 0, y = 0, z = 0
    for (let i = 0; i < positions.length; i += 3) { x += positions[i]!; y += positions[i + 1]!; z += positions[i + 2]! }
    const n = positions.length / 3
    return { x: x / n, y: y / n, z: z / n }
  }

  test("a sketch on an offset work plane is extruded from that plane", () => {
    const h = history([
      { id: "w", type: "plane", from: { kind: "offset", base: "XY", distance: 10 } },
      rectangle("s1", "w", 0, 0, 40, 25),
      { id: "plate", type: "extrude", sketch: "s1", depth: 6, operation: "new" }
    ])
    expect(rel(exactVolume(h), 6000)).toBeLessThan(1e-9)
    const c = massProperties(rebuildExact(h).bodies[0]!.brep!).centroid
    expect(c.z).toBeCloseTo(13, 6)
  })

  test("a sketch on a tilted work plane sits where the mesh rebuild puts it", () => {
    const h = history([
      { id: "w", type: "plane", from: { kind: "angle", base: "XY", angle: 30, about: "u" } },
      rectangle("s1", "w", 0, 0, 40, 25),
      { id: "plate", type: "extrude", sketch: "s1", depth: 6, operation: "new" }
    ])
    const r = rebuildExact(h)
    expect(rel(exactVolume(h), 6000)).toBeLessThan(1e-9)
    expect(rel(meshVolume(r.result.bodies[0]!.mesh), 6000)).toBeLessThan(1e-6)
    // A box: the mean of its eight corners is its centroid, so the exact and mesh bodies must coincide.
    const exact = massProperties(r.bodies[0]!.brep!).centroid
    const mesh = centroidOf(r.result.bodies[0]!.mesh.positions)
    expect(Math.hypot(exact.x - mesh.x, exact.y - mesh.y, exact.z - mesh.z)).toBeLessThan(1e-3)
  })

  test("a hole on a work plane says it has no exact model and adds no body", () => {
    const h = history([
      rectangle("s1", "XY", 0, 0, 40, 25),
      { id: "plate", type: "extrude", sketch: "s1", depth: 6, operation: "new" },
      { id: "w", type: "plane", from: { kind: "offset", base: "XY", distance: 6 } },
      { id: "h1", type: "hole", plane: "w", at: [20, 12.5], diameter: 8, depth: 6 }
    ])
    const r = rebuildExact(h)
    expect(r.bodies.length).toBe(1)
    expect(r.bodies[0]!.reason).toContain("work plane 'w'")
  })
})
