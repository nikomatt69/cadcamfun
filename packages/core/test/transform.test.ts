import { describe, expect, test } from "bun:test"
import { boundingBox } from "../src/cad/bounds.ts"
import { type Entity, baseEntity, isClosedShape } from "../src/cad/entities.ts"
import { tessellate } from "../src/cad/tessellate.ts"
import {
  type Affine2D,
  IDENTITY_AFFINE,
  applyAffine,
  applyTransform,
  composeTransforms,
  invertAffine,
  mirror,
  rotateEntity,
  rotationAffine,
  scaleAffine,
  scaleEntity,
  scaleUniform,
  translate,
  translationAffine
} from "../src/cad/transform.ts"
import type { Vec2 } from "../src/cad/vec.ts"
import { makeRng, pointSeg } from "./cam/fixtures.ts"

const e = (extra: Record<string, unknown>): Entity => ({ ...baseEntity("x"), ...extra }) as Entity

const shapes: Entity[] = [
  e({ _tag: "Line", start: { x: 1, y: 2 }, end: { x: 7, y: -3 } }),
  e({ _tag: "Circle", center: { x: 3, y: 4 }, radius: 5 }),
  e({ _tag: "Arc", center: { x: 3, y: 4 }, radius: 5, startAngle: 0.4, endAngle: 2.2, clockwise: false }),
  e({ _tag: "Arc", center: { x: -1, y: 0 }, radius: 3, startAngle: 5, endAngle: 1, clockwise: true }),
  e({ _tag: "Polyline", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }], closed: true, bulge: [0, 0.6, 0, -0.4] }),
  e({ _tag: "Polyline", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 9, y: 1 }], closed: false }),
  e({ _tag: "Rectangle", corner1: { x: 1, y: 1 }, corner2: { x: 6, y: 4 } }),
  e({ _tag: "Ellipse", center: { x: 2, y: -1 }, radiusX: 6, radiusY: 2, rotation: 0.5 }),
  e({ _tag: "Ellipse", center: { x: 2, y: -1 }, radiusX: 2, radiusY: 6, rotation: 5.9 }),
  e({ _tag: "Spline", controlPoints: [{ x: 0, y: 0 }, { x: 3, y: 6 }, { x: 8, y: -2 }, { x: 12, y: 4 }], degree: 3, closed: false }),
  e({ _tag: "Spline", controlPoints: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }], degree: 2, closed: true })
]

const chainDistance = (p: Vec2, entity: Entity, tol: number): number => {
  let best = Infinity
  const closed = isClosedShape(entity)
  for (const ring of tessellate(entity, tol)) {
    const n = closed ? ring.length : ring.length - 1
    for (let i = 0; i < n; i++) best = Math.min(best, pointSeg(p, ring[i]!, ring[(i + 1) % ring.length]!))
  }
  return best
}

/** Every dense sample of `original` mapped through `t` must lie on `transformed`, and vice versa. */
const expectSameCurve = (original: Entity, transformed: Entity, t: Affine2D, tolerance = 5e-3): void => {
  const dense = (entity: Entity): Vec2[] => tessellate(entity, 3e-3).flatMap((ring) => ring)
  for (const p of dense(original)) {
    expect(chainDistance(applyAffine(t, p), transformed, 1e-3)).toBeLessThanOrEqual(tolerance)
  }
  // And the other way round: the transformed curve maps back onto the original one.
  const inverse = invertAffine(t)
  for (const p of dense(transformed)) {
    expect(chainDistance(applyAffine(inverse, p), original, 1e-3)).toBeLessThanOrEqual(tolerance * 6)
  }
}

const randomAffine = (rng: () => number, similarity: boolean): Affine2D => {
  const angle = rng() * 6.28
  const s = 0.4 + rng() * 2.5
  const mirrorX = rng() < 0.5 ? -1 : 1
  const rot = rotationAffine(angle)
  const scale = similarity ? scaleAffine({ x: s * mirrorX, y: s }) : scaleAffine({ x: s * mirrorX, y: 0.3 + rng() * 3 })
  const shear: Affine2D = similarity ? IDENTITY_AFFINE : { a: 1, b: 0, c: (rng() - 0.5) * 1.2, d: 1, e: 0, f: 0 }
  return composeTransforms(composeTransforms(scale, shear), composeTransforms(rot, translationAffine({ x: rng() * 20 - 10, y: rng() * 20 - 10 })))
}

describe("applyTransform", () => {
  test("property: similarity maps keep every curve exactly (arcs and bulges stay circular)", () => {
    const rng = makeRng(11)
    for (let trial = 0; trial < 8; trial++) {
      const t = randomAffine(rng, true)
      for (const shape of shapes) {
        const moved = applyTransform(shape, t)
        expect(moved._tag === shape._tag || (shape._tag === "Rectangle" && moved._tag === "Polyline")).toBe(true)
        expectSameCurve(shape, moved, t)
      }
    }
  })

  test("property: general affine maps (shear, non-uniform scale, mirror) still trace the mapped curve", () => {
    const rng = makeRng(12)
    for (let trial = 0; trial < 8; trial++) {
      const t = randomAffine(rng, false)
      for (const shape of shapes) expectSameCurve(shape, applyTransform(shape, t), t)
    }
  })

  test("non-uniform scale turns a circle into an ellipse with the exact radii; uniform scale keeps a circle", () => {
    const circle = shapes[1]!
    const ellipse = scaleEntity(circle, { x: 2, y: 0.5 })
    expect(ellipse).toMatchObject({ _tag: "Ellipse", radiusX: 10, radiusY: 2.5 })
    if (ellipse._tag === "Ellipse") expect(ellipse.rotation).toBeCloseTo(0, 12)
    expect(scaleUniform(circle, 3)).toMatchObject({ _tag: "Circle", radius: 15, center: { x: 9, y: 12 } })
  })

  test("a rotated non-uniform scale of a circle has the right axes (SVD)", () => {
    const circle = e({ _tag: "Circle", center: { x: 0, y: 0 }, radius: 1 })
    const t = composeTransforms(scaleAffine({ x: 4, y: 1 }), rotationAffine(Math.PI / 3))
    const result = applyTransform(circle, t)
    expect(result).toMatchObject({ _tag: "Ellipse" })
    if (result._tag === "Ellipse") {
      expect(result.radiusX).toBeCloseTo(4, 9)
      expect(result.radiusY).toBeCloseTo(1, 9)
      expect(result.rotation).toBeCloseTo(Math.PI / 3, 9)
    }
  })

  test("a rectangle stays a rectangle under axis-aligned maps and becomes a closed polyline otherwise", () => {
    const rect = shapes[6]!
    expect(translate(rect, { x: 5, y: 5 })).toMatchObject({ _tag: "Rectangle" })
    expect(rotateEntity(rect, Math.PI / 2)).toMatchObject({ _tag: "Rectangle" })
    const turned = rotateEntity(rect, 0.4)
    expect(turned).toMatchObject({ _tag: "Polyline", closed: true })
    if (turned._tag === "Polyline") expect(turned.points).toHaveLength(4)
  })

  test("mirroring flips arcs and bulges; mirroring twice restores the geometry", () => {
    const arc = shapes[2]!
    const m = mirror(arc, { x: 0, y: 0 }, 0)
    expect(m).toMatchObject({ _tag: "Arc", clockwise: true })
    const back = mirror(m, { x: 0, y: 0 }, 0)
    if (back._tag === "Arc" && arc._tag === "Arc") {
      expect(back.startAngle).toBeCloseTo(arc.startAngle, 9)
      expect(back.endAngle).toBeCloseTo(arc.endAngle, 9)
      expect(back.clockwise).toBe(arc.clockwise)
    }
    const poly = shapes[4]!
    const mp = mirror(poly, { x: 5, y: 4 }, Math.PI / 2)
    if (mp._tag === "Polyline") expect(mp.bulge).toEqual([-0, -0.6, -0, 0.4].map((v) => (Object.is(v, -0) ? -0 : v)))
  })

  test("transforms about an origin leave that origin fixed", () => {
    const origin = { x: 7, y: 3 }
    const line = e({ _tag: "Line", start: origin, end: { x: 10, y: 3 } })
    for (const moved of [rotateEntity(line, 1.1, origin), scaleEntity(line, { x: 2, y: 3 }, origin), mirror(line, origin, 0.7)]) {
      if (moved._tag === "Line") {
        expect(moved.start.x).toBeCloseTo(7, 9)
        expect(moved.start.y).toBeCloseTo(3, 9)
      }
    }
  })

  test("a non-similar map of an arc becomes a sampled polyline", () => {
    const result = scaleEntity(shapes[2]!, { x: 2, y: 1 })
    expect(result._tag).toBe("Polyline")
  })

  test("bounding boxes follow the transform", () => {
    const t = composeTransforms(rotationAffine(0.7), translationAffine({ x: 3, y: -4 }))
    for (const shape of shapes) {
      const moved = applyTransform(shape, t)
      const pts = tessellate(shape, 1e-4).flat().map((p) => applyAffine(t, p))
      const box = boundingBox(moved)
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(box.minX - 2e-3)
        expect(p.x).toBeLessThanOrEqual(box.maxX + 2e-3)
        expect(p.y).toBeGreaterThanOrEqual(box.minY - 2e-3)
        expect(p.y).toBeLessThanOrEqual(box.maxY + 2e-3)
      }
    }
  })

  test("text, hatch and dimension follow rotation and scale", () => {
    const text = e({ _tag: "Text", position: { x: 1, y: 0 }, text: "a", fontSize: 2, fontFamily: "x", rotation: 0, alignment: "left", baseline: "bottom" })
    const moved = rotateEntity(scaleUniform(text, 2), Math.PI / 2)
    expect(moved).toMatchObject({ _tag: "Text", fontSize: 4 })
    if (moved._tag === "Text") {
      expect(moved.rotation).toBeCloseTo(Math.PI / 2, 12)
      expect(moved.position.y).toBeCloseTo(2, 12)
    }
    const hatch = e({ _tag: "Hatch", boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], pattern: "lines", scale: 1, angle: 0, fillColor: "#fff" })
    const h = rotateEntity(hatch, 0.5)
    if (h._tag === "Hatch") expect(h.angle).toBeCloseTo(0.5, 12)
  })

  test("polyline bounds include the bulge arcs", () => {
    const bow = e({ _tag: "Polyline", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false, bulge: [1, 0] })
    const b = boundingBox(bow)
    expect(b.minY).toBeCloseTo(-5, 9)
    expect(b.maxY).toBeCloseTo(0, 9)
    expect(b.minX).toBeCloseTo(0, 9)
    expect(b.maxX).toBeCloseTo(10, 9)
  })
})
