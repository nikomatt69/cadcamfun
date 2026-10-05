/**
 * Affine transformations over entities.
 *
 * An entity's own `transform` field is a `Transform2D` (scale, then rotate, then
 * translate) mapping its geometry to world space. General composite transforms
 * (which may contain shear or mirroring) are `Affine2D`. `applyTransform` bakes
 * a transform into the geometry **exactly**:
 *
 *  - similarity maps (rotation, translation, uniform scale, mirroring) keep every
 *    entity kind, including arcs and polyline bulges (a mirror flips their sense);
 *  - a non-similar map of a `Circle` or `Ellipse` is an `Ellipse` computed with
 *    a closed-form SVD (spec: non-uniform scale of a circle produces an ellipse);
 *  - a non-similar map of an `Arc` or of bulged polyline segments has no exact
 *    entity (it is an elliptical arc), so those become sampled polylines (1 degree
 *    steps, chord error below 0.015% of the radius);
 *  - an axis-aligned image of a `Rectangle` stays a `Rectangle`, any other image is
 *    a closed `Polyline`.
 * The result never carries a `transform` field: it has been folded in.
 */
import { angleOf, type Vec2 } from "./vec.ts"
import { bulgeToArc, normalizeAngle } from "./arc-math.ts"
import { type Entity, type PolylineEntity } from "./entities.ts"
import { rectCorners } from "./shapes.ts"

/** General 2D affine map `[a b c d e f]`: `x' = a·x + c·y + e`, `y' = b·x + d·y + f`. */
export interface Affine2D {
  readonly a: number
  readonly b: number
  readonly c: number
  readonly d: number
  readonly e: number
  readonly f: number
}

export const IDENTITY_AFFINE: Affine2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

export const translationAffine = (t: Vec2): Affine2D => ({ ...IDENTITY_AFFINE, e: t.x, f: t.y })

export const scaleAffine = (s: Vec2): Affine2D => ({ a: s.x, b: 0, c: 0, d: s.y, e: 0, f: 0 })

export const rotationAffine = (angle: number): Affine2D => ({
  a: Math.cos(angle),
  b: Math.sin(angle),
  c: -Math.sin(angle),
  d: Math.cos(angle),
  e: 0,
  f: 0
})

/** `composeTransforms(t, u)` applies `t` first, then `u`. */
export const composeTransforms = (t: Affine2D, u: Affine2D): Affine2D => ({
  a: u.a * t.a + u.c * t.b,
  b: u.b * t.a + u.d * t.b,
  c: u.a * t.c + u.c * t.d,
  d: u.b * t.c + u.d * t.d,
  e: u.a * t.e + u.c * t.f + u.e,
  f: u.b * t.e + u.d * t.f + u.f
})

export const invertAffine = (t: Affine2D): Affine2D => {
  const det = t.a * t.d - t.b * t.c
  if (Math.abs(det) < 1e-18) return IDENTITY_AFFINE
  return {
    a: t.d / det,
    b: -t.b / det,
    c: -t.c / det,
    d: t.a / det,
    e: (t.c * t.f - t.d * t.e) / det,
    f: (t.b * t.e - t.a * t.f) / det
  }
}

export const applyAffine = (t: Affine2D, p: Vec2): Vec2 => ({
  x: t.a * p.x + t.c * p.y + t.e,
  y: t.b * p.x + t.d * p.y + t.f
})

/** Direction part only (translation removed) — for normals and tangents. */
export const applyLinear = (t: Affine2D, v: Vec2): Vec2 => ({
  x: t.a * v.x + t.c * v.y,
  y: t.b * v.x + t.d * v.y
})

/** Determinant; negative for mirrored transforms. */
export const affineDeterminant = (t: Affine2D): number => t.a * t.d - t.b * t.c

/**
 * Local-to-world affine of an entity's own `Transform2D`
 * (scale, then rotate, then translate); the identity when it has none.
 */
export const transformOf = (entity: Entity): Affine2D => {
  const t = entity.transform
  if (t === undefined) return IDENTITY_AFFINE
  return composeTransforms(
    scaleAffine(t.scale),
    composeTransforms(rotationAffine(t.rotation), translationAffine(t.translation))
  )
}

// ---------------------------------------------------------------- SVD of the linear part

interface Svd {
  /** Larger singular value (>= 0). */
  readonly major: number
  /** Smaller singular value (>= 0). */
  readonly minor: number
  /** Angle of the major axis of the image of the unit circle. */
  readonly angle: number
}

/** Closed-form SVD of the 2x2 matrix `[[m00 m01] [m10 m11]]`. */
const svd2 = (m00: number, m01: number, m10: number, m11: number): Svd => {
  const e = (m00 + m11) / 2
  const f = (m00 - m11) / 2
  const g = (m10 + m01) / 2
  const h = (m10 - m01) / 2
  const q = Math.hypot(e, h)
  const r = Math.hypot(f, g)
  const a1 = Math.atan2(g, f)
  const a2 = Math.atan2(h, e)
  return { major: q + r, minor: Math.abs(q - r), angle: (a2 + a1) / 2 }
}

const SIMILARITY_EPS = 1e-9

/** Uniform scale factor when the linear part is a similarity (rotation/mirror x uniform scale). */
const similarityScale = (t: Affine2D): number | undefined => {
  const s = svd2(t.a, t.c, t.b, t.d)
  if (s.major <= 0) return undefined
  return s.minor >= s.major * (1 - SIMILARITY_EPS) ? s.major : undefined
}

const ARC_STEP = Math.PI / 180

// ---------------------------------------------------------------- baking

/** Bakes `t` into the entity geometry, folding in any local transform. The result has no `transform`. */
export const applyTransform = (entity: Entity, t: Affine2D): Entity => {
  const baked = bakeTransform(entity, t)
  if (baked.transform === undefined) return baked
  const { transform: _folded, ...rest } = baked
  return rest as Entity
}

const withoutBulge = (entity: PolylineEntity): PolylineEntity => {
  const { bulge: _bulge, ...rest } = entity
  return rest
}

/** Polyline vertices with every bulge segment expanded into 1-degree chords. */
const expandBulges = (entity: PolylineEntity): Vec2[] => {
  const n = entity.points.length
  const count = entity.closed ? n : n - 1
  const out: Vec2[] = []
  for (let i = 0; i < count; i++) {
    const p0 = entity.points[i]!
    const p1 = entity.points[(i + 1) % n]!
    out.push(p0)
    const arc = bulgeToArc(p0, p1, entity.bulge?.[i] ?? 0)
    if (arc === undefined) continue
    const steps = Math.max(2, Math.ceil(Math.abs(arc.sweep) / ARC_STEP))
    for (let k = 1; k < steps; k++) {
      const a = arc.startAngle + (arc.sweep * k) / steps
      out.push({ x: arc.center.x + arc.radius * Math.cos(a), y: arc.center.y + arc.radius * Math.sin(a) })
    }
  }
  if (!entity.closed) out.push(entity.points[n - 1]!)
  return out
}

const bakeTransform = (entity: Entity, t: Affine2D): Entity => {
  const full = composeTransforms(transformOf(entity), t)
  const det = affineDeterminant(full)
  const mirrored = det < 0
  const at = (p: Vec2): Vec2 => applyAffine(full, p)
  const sim = similarityScale(full)
  const areaScale = Math.sqrt(Math.abs(det))

  switch (entity._tag) {
    case "Line":
      return { ...entity, start: at(entity.start), end: at(entity.end) }

    case "Circle": {
      if (sim !== undefined) return { ...entity, center: at(entity.center), radius: entity.radius * sim }
      const s = svd2(full.a, full.c, full.b, full.d)
      return ellipseOrSegment(entity, at(entity.center), s.major * entity.radius, s.minor * entity.radius, s.angle)
    }

    case "Arc": {
      const center = at(entity.center)
      if (sim !== undefined) {
        const onArc = (angle: number): Vec2 =>
          at({ x: entity.center.x + entity.radius * Math.cos(angle), y: entity.center.y + entity.radius * Math.sin(angle) })
        const s = onArc(entity.startAngle)
        const e = onArc(entity.endAngle)
        return {
          ...entity,
          center,
          radius: entity.radius * sim,
          startAngle: normalizeAngle(angleOf({ x: s.x - center.x, y: s.y - center.y })),
          endAngle: normalizeAngle(angleOf({ x: e.x - center.x, y: e.y - center.y })),
          clockwise: mirrored ? !entity.clockwise : entity.clockwise
        }
      }
      // An elliptical arc has no entity of its own: sample it.
      let sweep = entity.clockwise ? entity.startAngle - entity.endAngle : entity.endAngle - entity.startAngle
      sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      if (sweep < 1e-12) sweep = 2 * Math.PI
      const steps = Math.max(2, Math.ceil(sweep / ARC_STEP))
      const dir = entity.clockwise ? -1 : 1
      const points: Vec2[] = []
      for (let i = 0; i <= steps; i++) {
        const a = entity.startAngle + (dir * sweep * i) / steps
        points.push(at({ x: entity.center.x + entity.radius * Math.cos(a), y: entity.center.y + entity.radius * Math.sin(a) }))
      }
      return {
        id: entity.id,
        layerId: entity.layerId,
        visible: entity.visible,
        locked: entity.locked,
        ...(entity.lineStyle !== undefined ? { lineStyle: entity.lineStyle } : {}),
        ...(entity.userData !== undefined ? { userData: entity.userData } : {}),
        _tag: "Polyline",
        points,
        closed: false
      }
    }

    case "Polyline": {
      const hasBulge = entity.bulge !== undefined && entity.bulge.some((b) => Math.abs(b) > 1e-12)
      if (!hasBulge) return { ...withoutBulge(entity), points: entity.points.map(at) }
      if (sim !== undefined) {
        // A similarity keeps arcs circular; mirroring reverses their sense.
        return { ...entity, points: entity.points.map(at), bulge: entity.bulge!.map((b) => (mirrored ? -b : b)) }
      }
      return { ...withoutBulge(entity), points: expandBulges(entity).map(at) }
    }

    case "Rectangle": {
      const c1 = at(entity.corner1)
      const c2 = at(entity.corner2)
      const diagonal = Math.abs(full.b) < 1e-12 && Math.abs(full.c) < 1e-12
      const quarterTurn = Math.abs(full.a) < 1e-12 && Math.abs(full.d) < 1e-12
      if (diagonal || quarterTurn) return { ...entity, corner1: c1, corner2: c2 }
      return {
        id: entity.id,
        layerId: entity.layerId,
        visible: entity.visible,
        locked: entity.locked,
        ...(entity.lineStyle !== undefined ? { lineStyle: entity.lineStyle } : {}),
        ...(entity.userData !== undefined ? { userData: entity.userData } : {}),
        _tag: "Polyline",
        points: rectCorners(entity.corner1, entity.corner2).map(at),
        closed: true
      }
    }

    case "Ellipse": {
      const cos = Math.cos(entity.rotation)
      const sin = Math.sin(entity.rotation)
      const u = applyLinear(full, { x: cos * entity.radiusX, y: sin * entity.radiusX })
      const v = applyLinear(full, { x: -sin * entity.radiusY, y: cos * entity.radiusY })
      const lu = Math.hypot(u.x, u.y)
      const lv = Math.hypot(v.x, v.y)
      const center = at(entity.center)
      // Axes that stay perpendicular keep their roles (and the entity its parameters).
      if (Math.abs(u.x * v.x + u.y * v.y) <= 1e-9 * lu * lv && lu > 0 && lv > 0) {
        return { ...entity, center, radiusX: lu, radiusY: lv, rotation: normalizeAngle(angleOf(u)) }
      }
      const s = svd2(u.x, v.x, u.y, v.y)
      return ellipseOrSegment(entity, center, s.major, s.minor, s.angle)
    }

    case "Spline":
      return { ...entity, controlPoints: entity.controlPoints.map(at) }

    case "Text":
      return {
        ...entity,
        position: at(entity.position),
        rotation: normalizeAngle(entity.rotation + Math.atan2(full.b, full.a)),
        fontSize: areaScale > 0 ? entity.fontSize * areaScale : entity.fontSize
      }

    case "Dimension":
      return {
        ...entity,
        start: at(entity.start),
        end: at(entity.end),
        textPosition: at(entity.textPosition),
        arrowSize: entity.arrowSize * areaScale,
        textSize: areaScale > 0 ? entity.textSize * areaScale : entity.textSize
      }

    case "Hatch": {
      const dir = applyLinear(full, { x: Math.cos(entity.angle), y: Math.sin(entity.angle) })
      return {
        ...entity,
        boundary: entity.boundary.map(at),
        angle: normalizeAngle(angleOf(dir)),
        scale: areaScale > 0 ? entity.scale * areaScale : entity.scale
      }
    }

    case "Block":
      return {
        ...entity,
        basePoint: at(entity.basePoint),
        // Children are block-local (placed at `basePoint`), so only the linear part applies to them.
        entities: entity.entities.map((child) => applyTransform(child, { ...full, e: 0, f: 0 }))
      }
  }
}

/** An `Ellipse` from principal radii, or a `Line` when the map flattened it to a segment. */
const ellipseOrSegment = (
  entity: Entity,
  center: Vec2,
  radiusX: number,
  radiusY: number,
  angle: number
): Entity => {
  const base = {
    id: entity.id,
    layerId: entity.layerId,
    visible: entity.visible,
    locked: entity.locked,
    ...(entity.lineStyle !== undefined ? { lineStyle: entity.lineStyle } : {}),
    ...(entity.userData !== undefined ? { userData: entity.userData } : {})
  }
  if (radiusY < 1e-12 * Math.max(radiusX, 1e-300) || radiusY < 1e-12) {
    const dx = radiusX * Math.cos(angle)
    const dy = radiusX * Math.sin(angle)
    return { ...base, _tag: "Line", start: { x: center.x - dx, y: center.y - dy }, end: { x: center.x + dx, y: center.y + dy } }
  }
  return { ...base, _tag: "Ellipse", center, radiusX, radiusY, rotation: normalizeAngle(angle) }
}

// ---------------------------------------------------------------- convenience

/** `op` applied about `origin`: translate to the origin, transform, translate back. */
const about = (op: Affine2D, origin: Vec2): Affine2D =>
  composeTransforms(translationAffine({ x: -origin.x, y: -origin.y }), composeTransforms(op, translationAffine(origin)))

/** Translates an entity. */
export const translate = (entity: Entity, delta: Vec2): Entity => applyTransform(entity, translationAffine(delta))

/** Rotates an entity counter-clockwise around `origin` (default: the world origin). */
export const rotateEntity = (entity: Entity, angle: number, origin: Vec2 = { x: 0, y: 0 }): Entity =>
  applyTransform(entity, about(rotationAffine(angle), origin))

/** Scales an entity about `origin`. A non-uniform scale turns circles into ellipses. */
export const scaleEntity = (entity: Entity, factor: Vec2, origin: Vec2 = { x: 0, y: 0 }): Entity =>
  applyTransform(entity, about(scaleAffine(factor), origin))

/** Uniform scale about `origin`; circles stay circles. */
export const scaleUniform = (entity: Entity, factor: number, origin: Vec2 = { x: 0, y: 0 }): Entity =>
  scaleEntity(entity, { x: factor, y: factor }, origin)

/** Mirrors an entity across the line through `origin` at `angle` radians. */
export const mirror = (entity: Entity, origin: Vec2 = { x: 0, y: 0 }, angle = 0): Entity => {
  const reflection: Affine2D = {
    a: Math.cos(2 * angle),
    b: Math.sin(2 * angle),
    c: Math.sin(2 * angle),
    d: -Math.cos(2 * angle),
    e: 0,
    f: 0
  }
  return applyTransform(entity, about(reflection, origin))
}

/** Folds `base` and then `t` into the entity. */
export const applyTransforms = (entity: Entity, base: Affine2D, t: Affine2D): Entity =>
  applyTransform(applyTransform(entity, base), t)
