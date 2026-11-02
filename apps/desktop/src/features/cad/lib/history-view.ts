import { booleanAll, rebuild, sketchProfiles, type History, type Issue, type Mesh, type RebuildResult, type Sketch, type SketchEntity, type SolveStatus } from "@cadcamfun/core"
import * as THREE from "three"
import { createLines, polylineToSegments } from "../../../viewport/lines.ts"
import { currentLookTier } from "../../../viewport/render-look-setting.ts"

/**
 * What the canvas shows of a parametric part besides its solid: the sketches of the history (with their solve status and constraint
 * glyphs), the errors of the features that failed, and a solid drawn even when the bodies cannot be united.
 *
 * One `rebuild` per history object, shared by the solid, the sketches and the issue list; the replay is the expensive part of an edit.
 */
type V3 = { readonly x: number; readonly y: number; readonly z: number }
type Offset = V3

export interface HistoryView {
  readonly result: RebuildResult
  /** The solid(s) to draw, in the history's own coordinates: one united solid, or the separate bodies when they cannot be united. */
  readonly parts: ReadonlyArray<Mesh>
  /** Whether `parts` is the one united solid (false: the bodies are drawn one by one because the union failed). */
  readonly united: boolean
}

const views = new WeakMap<object, HistoryView>()

/** The replay of a history, remembered on the history object (the store replaces it on every edit, so identity is a perfect key). */
export const historyView = (history: History): HistoryView => {
  const cached = views.get(history)
  if (cached !== undefined) return cached
  const result = rebuild(history)
  const meshes = result.bodies.map((body) => body.mesh)
  let view: HistoryView
  if (meshes.length <= 1) view = { result, parts: meshes, united: true }
  else {
    try { view = { result, parts: [booleanAll(meshes, "union")], united: true } } catch { view = { result, parts: meshes, united: false } }
  }
  views.set(history, view)
  return view
}

/** The errors of a replay, for the banner: a feature that failed is still listed when the rest of the part is drawn. */
export const historyErrors = (view: HistoryView): ReadonlyArray<Issue> => view.result.issues.filter((issue) => issue.severity === "error")

// ------------------------------------------------------------------------------------------------------------- sketches

export interface SketchGlyph {
  /** The constraint type, for tests and tooltips. */
  readonly kind: string
  /** What is written at the anchor. */
  readonly label: string
  readonly at: { readonly x: number; readonly y: number }
  /** A dimension (a number) rather than a geometric relation. */
  readonly dimension: boolean
}

const fmt = (value: number): string => String(Number(value.toFixed(2)))

type Pt = { readonly x: number; readonly y: number }

/**
 * The glyphs of a solved sketch's constraints, placed on the geometry they act on (a relation at the middle of its line, a
 * dimension where it measures). Several glyphs on one anchor are stacked so none hides another.
 */
export const constraintGlyphs = (sketch: Sketch): SketchGlyph[] => {
  const byId = new Map<string, SketchEntity>(sketch.entities.map((entity) => [entity.id, entity]))
  const point = (id: string): Pt | undefined => { const e = byId.get(id); return e?.kind === "point" ? e : undefined }
  const anchor = (id: string): Pt | undefined => {
    const e = byId.get(id)
    if (e === undefined) return undefined
    switch (e.kind) {
      case "point": return e
      case "line": { const a = point(e.p1), b = point(e.p2); return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : undefined }
      case "circle": case "arc": case "ellipse": return point(e.center)
      case "spline": return point(e.points[0]!)
    }
  }
  const mid = (a: string, b: string): Pt | undefined => { const p = anchor(a), q = anchor(b); return p && q ? { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } : p ?? q }
  const radiusOf = (id: string): number => { const e = byId.get(id); return e?.kind === "circle" ? e.radius : 0 }
  const out: SketchGlyph[] = []
  const add = (kind: string, label: string, at: Pt | undefined, dimension = false, driven = false): void => {
    if (at !== undefined) out.push({ kind, label: driven ? `(${label})` : label, at, dimension })
  }
  for (const c of sketch.constraints) {
    const driven = c.driven === true
    switch (c.type) {
      case "fixed": add(c.type, "F", anchor(c.point)); break
      case "horizontal": add(c.type, "H", anchor(c.line)); break
      case "vertical": add(c.type, "V", anchor(c.line)); break
      case "horizontalPoints": add(c.type, "H", mid(c.a, c.b)); break
      case "verticalPoints": add(c.type, "V", mid(c.a, c.b)); break
      case "parallel": add(c.type, "∥", anchor(c.a)); break
      case "perpendicular": add(c.type, "⊥", anchor(c.a)); break
      case "equalLength": case "equalRadius": add(c.type, "=", anchor(c.a)); add(c.type, "=", anchor(c.b)); break
      case "pointOnLine": add(c.type, "P", anchor(c.point)); break
      case "pointOnCircle": case "pointOnEllipse": add(c.type, "P", anchor(c.point)); break
      case "midpoint": add(c.type, "M", anchor(c.point)); break
      case "symmetric": add(c.type, "S", mid(c.a, c.b)); break
      case "tangentLineCircle": add(c.type, "T", anchor(c.line)); break
      case "tangentCircles": add(c.type, "T", mid(c.a, c.b)); break
      case "concentric": add(c.type, "◎", mid(c.a, c.b)); break
      case "collinear": add(c.type, "L", anchor(c.b)); break
      case "coincident": break
      case "distance": case "distanceX": case "distanceY": add(c.type, fmt(c.value), mid(c.a, c.b), true, driven); break
      case "length": add(c.type, fmt(c.value), anchor(c.line), true, driven); break
      case "radius": { const o = anchor(c.circle); add(c.type, `R${fmt(c.value)}`, o && { x: o.x + radiusOf(c.circle) * Math.SQRT1_2, y: o.y + radiusOf(c.circle) * Math.SQRT1_2 }, true, driven); break }
      case "diameter": { const o = anchor(c.circle); add(c.type, `⌀${fmt(c.value)}`, o && { x: o.x + radiusOf(c.circle) * Math.SQRT1_2, y: o.y + radiusOf(c.circle) * Math.SQRT1_2 }, true, driven); break }
      case "angle": add(c.type, `${fmt((c.value * 180) / Math.PI)}°`, mid(c.a, c.b), true, driven); break
      case "ellipseSize": add(c.type, `${fmt(c.radiusX)}×${fmt(c.radiusY)}`, anchor(c.ellipse), true, driven); break
    }
  }
  // Stack the glyphs that share an anchor.
  const seen = new Map<string, number>()
  let reach = 0
  for (const e of sketch.entities) if (e.kind === "point") reach = Math.max(reach, Math.abs(e.x), Math.abs(e.y))
  const step = Math.max(reach, 1) * 0.05
  return out.map((glyph) => {
    const key = `${glyph.at.x.toFixed(4)},${glyph.at.y.toFixed(4)}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    return n === 0 ? glyph : { ...glyph, at: { x: glyph.at.x, y: glyph.at.y + n * step } }
  })
}

export const SKETCH_COLORS: Readonly<Record<SolveStatus, number>> = {
  "fully-constrained": 0xeceff1,
  "under-constrained": 0x4fc3f7,
  "over-constrained": 0xff5252,
  conflicting: 0xff5252,
  failed: 0xff5252
}

/** Maximum glyphs drawn for one sketch: a hundred labels stop being information. */
export const MAX_GLYPHS = 120

/** Whether any other feature of the history refers to the sketch (an extrude, a revolve, a sweep, a rib, a split...). */
export const sketchIsConsumed = (history: History, id: string): boolean =>
  history.features.some((feature) => feature.id !== id && Object.values(feature).some((value) => value === id || (Array.isArray(value) && value.includes(id))))

const glyphTextures = new Map<string, THREE.Texture>()
/** One small canvas texture per label, shared by every sketch (`document` is absent in a headless test: the sprite is then bare). */
const glyphTexture = (label: string, dimension: boolean): THREE.Texture | undefined => {
  if (typeof document === "undefined") return undefined
  const key = `${dimension ? "d" : "r"}:${label}`
  const hit = glyphTextures.get(key)
  if (hit !== undefined) return hit
  const canvas = document.createElement("canvas")
  canvas.width = 128
  canvas.height = 64
  const context = canvas.getContext("2d")
  if (context === null) return undefined
  context.fillStyle = dimension ? "rgba(255,214,0,0.92)" : "rgba(30,34,40,0.85)"
  context.beginPath()
  context.roundRect?.(4, 8, 120, 48, 10)
  if (context.roundRect === undefined) context.rect(4, 8, 120, 48)
  context.fill()
  context.fillStyle = dimension ? "#1b1b1b" : "#4fc3f7"
  context.font = "bold 34px sans-serif"
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.fillText(label, 64, 33, 112)
  const texture = new THREE.CanvasTexture(canvas)
  glyphTextures.set(key, texture)
  return texture
}

const to3 = (frame: { readonly u: V3; readonly v: V3; readonly origin: V3 }, p: Pt, at: Offset): THREE.Vector3 =>
  new THREE.Vector3(
    frame.origin.x + frame.u.x * p.x + frame.v.x * p.y + at.x,
    frame.origin.y + frame.u.y * p.x + frame.v.y * p.y + at.y,
    frame.origin.z + frame.u.z * p.x + frame.v.z * p.y + at.z
  )

/**
 * One group per sketch of the history: its closed profiles and open chains as lines coloured by solve status (blue free, white fully
 * constrained, red over-constrained or conflicting), the points that can still move, and the constraint glyphs. `consumed` sketches
 * (an extrude or revolve uses them) are hidden unless the person asks for sketches; a sketch nothing uses is always shown.
 * `at` is where the element sits in the scene (its x, y, z plus the drawing's origin offset).
 */
export const createSketchOverlays = (history: History, view: HistoryView, at: Offset): THREE.Group[] => {
  const groups: THREE.Group[] = []
  for (const [id, entry] of Object.entries(view.result.sketches)) {
    const solved = entry.solve.sketch
    let profiles: ReturnType<typeof sketchProfiles>
    try { profiles = sketchProfiles(solved) } catch { continue }
    const segments: number[] = []
    for (const loop of profiles.loops) segments.push(...polylineToSegments(loop.flatMap((p) => { const q = to3(entry.frame, p, at); return [q.x, q.y, q.z] }), true))
    for (const chain of profiles.open) segments.push(...polylineToSegments(chain.flatMap((p) => { const q = to3(entry.frame, p, at); return [q.x, q.y, q.z] }), false))
    const group = new THREE.Group()
    group.name = `sketch:${id}`
    const color = SKETCH_COLORS[entry.solve.status]
    if (segments.length > 0) {
      const lines = createLines(segments, { color, width: 1.6 }, { quality: currentLookTier() })
      lines.renderOrder = 4
      group.add(lines)
    }
    // The points that can still move, like Fusion's blue (unconstrained) sketch points.
    const free = new Set(entry.solve.free)
    const dots: number[] = []
    for (const entity of solved.entities) if (entity.kind === "point" && free.has(entity.id)) { const q = to3(entry.frame, entity, at); dots.push(q.x, q.y, q.z) }
    if (dots.length > 0) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(dots, 3))
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: SKETCH_COLORS["under-constrained"], size: 5, sizeAttenuation: false, depthTest: false }))
      points.renderOrder = 5
      points.raycast = () => undefined
      group.add(points)
    }
    for (const glyph of constraintGlyphs(solved).slice(0, MAX_GLYPHS)) {
      const material = new THREE.SpriteMaterial({ depthTest: false, sizeAttenuation: false, transparent: true, ...(glyphTexture(glyph.label, glyph.dimension) ? { map: glyphTexture(glyph.label, glyph.dimension)! } : {}) })
      const sprite = new THREE.Sprite(material)
      const p = to3(entry.frame, glyph.at, at)
      sprite.position.copy(p)
      sprite.scale.set(glyph.dimension ? 0.07 : 0.04, glyph.dimension ? 0.035 : 0.02, 1)
      sprite.renderOrder = 6
      sprite.raycast = () => undefined
      sprite.userData.glyph = glyph.kind
      group.add(sprite)
    }
    group.userData.sketchOverlay = true
    group.userData.sketchId = id
    group.userData.sketchStatus = entry.solve.status
    group.userData.consumed = sketchIsConsumed(history, id)
    groups.push(group)
  }
  return groups
}

/** The sketch groups under `root` take their visibility from the "show sketches" toggle: used ones only when it is on. Returns whether anything changed. */
export const applySketchVisibility = (root: THREE.Object3D, showSketches: boolean): boolean => {
  let changed = false
  root.traverse((object) => {
    if (object.userData.sketchOverlay !== true) return
    const visible = object.userData.consumed !== true || showSketches
    if (object.visible !== visible) { object.visible = visible; changed = true }
  })
  return changed
}
