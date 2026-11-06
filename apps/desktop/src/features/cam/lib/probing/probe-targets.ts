/**
 * What can be probed on the part (spec 73 §4): the features of the drawn elements and of the stock as cycle presets, a pick on the
 * 3D model resolved to the nearest one, and the preset laid over a cycle. Coordinates are work coordinates: the stock centre (or
 * corner) is X0 Y0 and the stock top is Z0, the origin the generator uses.
 */
import { cam } from "@cadcamfun/core"
import type { ProbeCycleKind } from "./contract.ts"
import { defaultSpecOf, type CycleSpec } from "./cycle-fields.ts"

type CadElement = cam.generator.CadElement

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }

export interface WorkOrigin { readonly x: number; readonly y: number; readonly z: number }

/** The work origin of a stock: its centre at the top face, or its lower-left corner at the top face. */
export const workOriginOf = (stock: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly topZ: number }, at: "centre" | "corner" = "centre"): WorkOrigin =>
  at === "centre" ? { x: stock.x, y: stock.y, z: stock.topZ } : { x: stock.x - stock.width / 2, y: stock.y - stock.height / 2, z: stock.topZ }

export interface ProbeTarget {
  readonly id: string
  /** The element it belongs to; `stock` for the stock itself. */
  readonly elementId: string
  readonly label: string
  readonly kind: ProbeCycleKind
  /** The cycle fields this feature fixes (wire units), laid over `defaultSpecOf(kind)`. */
  readonly patch: Readonly<Record<string, unknown>>
  /** A representative point and the surface normal there, work coordinates (what a pick is matched against). */
  readonly point: Vec3
  readonly normal: Vec3
  /** For a round feature: its centre and radius, so a pick on the wall of a bore finds the bore. */
  readonly round?: { readonly centre: Vec3; readonly radius: number }
}

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback)
const r3 = (v: number): number => Math.round(v * 1000) / 1000
const Z: Vec3 = { x: 0, y: 0, z: 1 }
const name = (e: CadElement): string => (typeof e["name"] === "string" && e["name"] !== "" ? e["name"] : String(e["type"]))
const SIDE_DEPTH = 3

interface Box { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number; readonly top: number }

const boxTargets = (id: string, label: string, box: Box, origin: WorkOrigin, solid: boolean): ProbeTarget[] => {
  const x0 = r3(box.minX - origin.x), x1 = r3(box.maxX - origin.x), y0 = r3(box.minY - origin.y), y1 = r3(box.maxY - origin.y)
  const top = r3(box.top - origin.z)
  const cx = r3((x0 + x1) / 2), cy = r3((y0 + y1) / 2)
  const depth = SIDE_DEPTH
  const out: ProbeTarget[] = [
    { id: `${id}:top`, elementId: id, label: `${label}: top face`, kind: "z-surface", patch: { at: { x: cx, y: cy }, expectedZ: top }, point: { x: cx, y: cy, z: top }, normal: Z }
  ]
  const sides: ReadonlyArray<readonly [string, number, number, number, number, number]> = [
    ["right", x1, cy, 1, 0, 0], ["left", x0, cy, -1, 0, 180], ["back", cx, y1, 0, 1, 90], ["front", cx, y0, 0, -1, 270]
  ]
  for (const [side, x, y, nx, ny, angle] of sides) {
    out.push({
      id: `${id}:${side}`, elementId: id, label: `${label}: ${side} edge`, kind: "edge",
      patch: { at: { x, y, z: r3(top - depth) }, normalAngle: solid ? angle : (angle + 180) % 360 },
      point: { x, y, z: top - depth }, normal: { x: nx, y: ny, z: 0 }
    })
  }
  const corners: ReadonlyArray<readonly [string, number, number, 1 | -1, 1 | -1]> = [
    ["right back", x1, y1, -1, -1], ["left back", x0, y1, 1, -1], ["left front", x0, y0, 1, 1], ["right front", x1, y0, -1, 1]
  ]
  for (const [corner, x, y, xs, ys] of corners) {
    out.push({
      id: `${id}:corner:${corner}`, elementId: id, label: `${label}: ${corner} corner`, kind: "corner",
      patch: { corner: { x, y }, inside: !solid, xSense: xs, ySense: ys, depth, top }, point: { x, y, z: top - depth }, normal: { x: xs * -1, y: ys * -1, z: 0 }
    })
  }
  out.push({
    id: `${id}:rectangle`, elementId: id, label: `${label}: ${solid ? "block" : "pocket"} sides`, kind: "rectangle",
    patch: { inside: !solid, centre: { x: cx, y: cy }, size: { x: r3(x1 - x0), y: r3(y1 - y0) }, depth, top }, point: { x: cx, y: cy, z: top - depth }, normal: Z
  })
  return out
}

const roundTargets = (id: string, label: string, centre: { x: number; y: number; r: number; top: number }, origin: WorkOrigin): ProbeTarget[] => {
  const cx = r3(centre.x - origin.x), cy = r3(centre.y - origin.y), top = r3(centre.top - origin.z), d = r3(centre.r * 2)
  const round = { centre: { x: cx, y: cy, z: top - SIDE_DEPTH }, radius: centre.r }
  return [
    { id: `${id}:bore`, elementId: id, label: `${label}: bore`, kind: "bore", patch: { centre: { x: cx, y: cy }, diameter: d, depth: SIDE_DEPTH, top }, point: { x: cx, y: cy, z: top - SIDE_DEPTH }, normal: Z, round },
    { id: `${id}:boss`, elementId: id, label: `${label}: boss`, kind: "boss", patch: { centre: { x: cx, y: cy }, diameter: d, depth: SIDE_DEPTH, top }, point: { x: cx, y: cy, z: top - SIDE_DEPTH }, normal: Z, round },
    { id: `${id}:top`, elementId: id, label: `${label}: top face`, kind: "z-surface", patch: { at: { x: cx, y: cy }, expectedZ: top }, point: { x: cx, y: cy, z: top }, normal: Z }
  ]
}

/** Every feature of the elements and the stock a cycle can measure; nothing is invented for an element the generator cannot read. */
export const targetsOf = (
  elements: ReadonlyArray<CadElement>,
  options: { readonly origin: WorkOrigin; readonly stock?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly topZ: number } }
): ReadonlyArray<ProbeTarget> => {
  const out: ProbeTarget[] = []
  if (options.stock !== undefined) {
    const s = options.stock
    out.push(...boxTargets("stock", "Stock", { minX: s.x - s.width / 2, maxX: s.x + s.width / 2, minY: s.y - s.height / 2, maxY: s.y + s.height / 2, top: s.topZ }, options.origin, true))
  }
  for (const element of cam.generator.flattenElements(elements)) {
    const type = String(element["type"])
    if (type === "workpiece") continue
    const id = String(element["id"] ?? type)
    const label = name(element)
    const shape = cam.generator.pocketShape(element)
    const bounds = cam.generator.elementBounds(element)
    const top = bounds.max.z
    if (type === "point") {
      out.push({ id: `${id}:top`, elementId: id, label: `${label}: point`, kind: "z-surface", patch: { at: { x: r3(num(element["x"]) - options.origin.x), y: r3(num(element["y"]) - options.origin.y) }, expectedZ: r3(top - options.origin.z) }, point: { x: num(element["x"]) - options.origin.x, y: num(element["y"]) - options.origin.y, z: top - options.origin.z }, normal: Z })
      continue
    }
    if (shape?.kind === "circle") {
      out.push(...roundTargets(id, label, { x: shape.cx, y: shape.cy, r: shape.r, top }, options.origin))
    } else if (shape?.kind === "rect") {
      out.push(...boxTargets(id, label, { minX: shape.cx - shape.w / 2, maxX: shape.cx + shape.w / 2, minY: shape.cy - shape.h / 2, maxY: shape.cy + shape.h / 2, top }, options.origin, true))
    } else if (shape !== undefined) {
      out.push(...boxTargets(id, label, { minX: bounds.min.x, maxX: bounds.max.x, minY: bounds.min.y, maxY: bounds.max.y, top }, options.origin, true).filter((t) => t.kind === "z-surface"))
    }
  }
  return out
}

/** How far a pick is from a target; a round feature is reached inside its circle or at its wall, a face anywhere on its plane. */
const distanceTo = (hit: { readonly point: Vec3; readonly normal: Vec3 }, target: ProbeTarget): number => {
  const dz = Math.abs(hit.point.z - target.point.z)
  if (target.round !== undefined) {
    const planar = Math.hypot(hit.point.x - target.round.centre.x, hit.point.y - target.round.centre.y)
    const vertical = Math.abs(hit.normal.z) > 0.7
    // A top-face hit inside the circle is the bore (the boss is the same circle); outside it the top face is meant, not the hole.
    return (vertical ? (planar <= target.round.radius ? 1 : 100 + planar - target.round.radius) : Math.abs(planar - target.round.radius)) + dz * 0.1
  }
  const facing = hit.normal.x * target.normal.x + hit.normal.y * target.normal.y + hit.normal.z * target.normal.z
  const along = Math.hypot(hit.point.x - target.point.x, hit.point.y - target.point.y)
  // A top face is the same plane everywhere on it: its representative point is not where the click has to be.
  const reach = target.kind === "z-surface" ? Math.min(along, 15) : along
  // The surface normal of the pick must agree with the feature's; a disagreement pushes it behind every agreeing feature.
  return reach + dz * 0.5 + (facing < 0.5 ? 1000 : 0)
}

/** The target a pick on the model means: the nearest feature whose surface faces the same way; undefined when there are none. */
export const targetAt = (hit: { readonly point: Vec3; readonly normal: Vec3 }, targets: ReadonlyArray<ProbeTarget>, maxDistance = 25): ProbeTarget | undefined => {
  let best: ProbeTarget | undefined
  let bestDistance = Infinity
  for (const target of targets) {
    // Prefer the bore to the boss when both are the same circle: a pick cannot tell them apart, the user flips the kind.
    const d = distanceTo(hit, target) + (target.kind === "boss" ? 1e-6 : 0)
    if (d < bestDistance) { best = target; bestDistance = d }
  }
  return best !== undefined && bestDistance <= maxDistance ? best : undefined
}

/** The cycle spec of a target: the kind's defaults with the feature's own figures; the kind of the current cycle is kept when it fits. */
export const applyTarget = (current: CycleSpec | undefined, target: ProbeTarget): CycleSpec => {
  const keep = current !== undefined && current.kind === target.kind ? current : defaultSpecOf(target.kind)
  return { ...keep, ...target.patch, kind: target.kind } as CycleSpec
}
