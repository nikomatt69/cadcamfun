import { brep, elementBrep } from "@cadcamfun/core"
import type { Key } from "../../../i18n/index.ts"

/**
 * The canvas "Measure" inspector (Fusion 360 Inspect > Measure class), the part that does not draw: which exact body a pick stands
 * for, what one or two picks measure, and the rows the panel shows.
 *
 * A target is a face, edge or corner of a part drawn as an exact solid (the index the canvas picked), or a whole part. The body is
 * the element's exact solid as the STEP export and the CAM see it (`elementBrep`, model coordinates, gizmo transform applied), so
 * the face / edge / vertex indices are the ones the canvas drew (the same B-rep, rigidly placed) and the numbers are exact, not
 * read off the display mesh. A part with no exact solid (a sketch, a mesh, a non-uniform scale) is refused with the kernel's reason.
 */

export interface MeasureTarget {
  readonly elementId: string
  readonly kind: brep.MeasureEntityKind
  /** Face, edge or vertex index; ignored for a whole part. */
  readonly index: number
}

export type MeasureOutcome =
  | { readonly ok: true; readonly targets: ReadonlyArray<MeasureTarget>; readonly single?: brep.EntityMeasure; readonly between?: brep.BetweenMeasure; readonly first?: brep.EntityMeasure; readonly second?: brep.EntityMeasure }
  | { readonly ok: false; readonly targets: ReadonlyArray<MeasureTarget>; readonly reason: string }

type Element = Readonly<Record<string, unknown>> & { readonly id: string }

/** Exact bodies by element object: the store replaces an element on every write, so identity is a complete validity key. */
const bodyCache = new WeakMap<object, { readonly operands: ReadonlyArray<unknown>; readonly result: brep.Brep | string }>()

/** The ids a Boolean element depends on, so its cache entry is dropped when an operand changes. */
const operandsOf = (element: Element, byId: ReadonlyMap<string, Element>, seen = new Set<string>()): unknown[] => {
  if (seen.has(element.id)) return []
  seen.add(element.id)
  const ids = Array.isArray(element["operands"]) ? (element["operands"] as unknown[]).map(String) : []
  return ids.flatMap((id) => { const operand = byId.get(id); return operand === undefined ? [undefined] : [operand, ...operandsOf(operand, byId, seen)] })
}

/** The exact body of a part (model coordinates), or why there is none. */
export const bodyOf = (element: Element, elements: ReadonlyArray<Element>): brep.Brep | string => {
  const byId = new Map(elements.map((candidate) => [candidate.id, candidate] as const))
  const operands = operandsOf(element, byId)
  const hit = bodyCache.get(element)
  if (hit !== undefined && hit.operands.length === operands.length && hit.operands.every((operand, index) => operand === operands[index])) return hit.result
  let result: brep.Brep | string
  try {
    const placed = elementBrep(element as never, byId as never)
    result = placed.brep ?? placed.reason ?? "the part has no exact solid"
  } catch (error) {
    result = error instanceof Error ? error.message : String(error)
  }
  bodyCache.set(element, { operands, result })
  return result
}

const refOf = (target: MeasureTarget): brep.MeasureRef => ({ kind: target.kind, index: target.kind === "body" ? 0 : target.index })

/** What the picks measure: one target describes itself, two are measured against each other (and each described). */
export const runMeasure = (targets: ReadonlyArray<MeasureTarget>, elements: ReadonlyArray<Element>): MeasureOutcome => {
  if (targets.length === 0) return { ok: false, targets, reason: "nothing picked" }
  const bodies: brep.Brep[] = []
  for (const target of targets.slice(0, 2)) {
    const element = elements.find((candidate) => candidate.id === target.elementId)
    if (element === undefined) return { ok: false, targets, reason: `part '${target.elementId}' is not in the drawing` }
    const body = bodyOf(element, elements)
    if (typeof body === "string") return { ok: false, targets, reason: body }
    bodies.push(body)
  }
  try {
    if (targets.length === 1) return { ok: true, targets, single: brep.measureEntity(bodies[0]!, refOf(targets[0]!)) }
    const [a, b] = [targets[0]!, targets[1]!]
    return {
      ok: true, targets,
      first: brep.measureEntity(bodies[0]!, refOf(a)),
      second: brep.measureEntity(bodies[1]!, refOf(b)),
      between: brep.measureBetween(bodies[0]!, refOf(a), bodies[1]!, refOf(b))
    }
  } catch (error) {
    return { ok: false, targets, reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * The next pick list: a click adds a target; the same target again removes it; a third distinct target starts a new pair with it
 * (the way Fusion's Measure restarts after two selections).
 */
export const nextTargets = (current: ReadonlyArray<MeasureTarget>, picked: MeasureTarget): ReadonlyArray<MeasureTarget> => {
  const same = (t: MeasureTarget) => t.elementId === picked.elementId && t.kind === picked.kind && (t.kind === "body" || t.index === picked.index)
  if (current.some(same)) return current.filter((t) => !same(t))
  return current.length >= 2 ? [picked] : [...current, picked]
}

/** One line of the panel: an i18n key for the label and the value already formatted. */
export interface MeasureRow { readonly label: Key; readonly value: string; readonly emphasis?: true }

export interface MeasureFormat {
  readonly length: (mm: number) => string
  readonly area: (mm2: number) => string
  readonly volume: (mm3: number) => string
  readonly angle: (degrees: number) => string
  readonly point: (p: brep.Vec3) => string
}

/** The rows that describe one entity. */
export const entityRows = (m: brep.EntityMeasure, f: MeasureFormat): MeasureRow[] => {
  switch (m.kind) {
    case "vertex": return [{ label: "cad.measure.point", value: f.point(m.point) }]
    case "edge": {
      const rows: MeasureRow[] = [{ label: "cad.measure.length", value: f.length(m.length), emphasis: true }, { label: "cad.measure.curve", value: m.curve }]
      if (m.radius !== undefined) rows.push({ label: "cad.measure.radius", value: f.length(m.radius) }, { label: "cad.measure.diameter", value: f.length(2 * m.radius) })
      if (m.center !== undefined) rows.push({ label: "cad.measure.center", value: f.point(m.center) })
      if (m.sweepDeg !== undefined && !m.closed) rows.push({ label: "cad.measure.sweep", value: f.angle(m.sweepDeg) })
      if (!m.closed) rows.push({ label: "cad.measure.start", value: f.point(m.start) }, { label: "cad.measure.end", value: f.point(m.end) })
      return rows
    }
    case "face": {
      const rows: MeasureRow[] = [{ label: "cad.measure.area", value: f.area(m.area), emphasis: true }, { label: "cad.measure.surface", value: m.surface }]
      if (m.normal !== undefined) rows.push({ label: "cad.measure.normal", value: f.point(m.normal) })
      if (m.radius !== undefined) rows.push({ label: m.majorRadius !== undefined ? "cad.measure.minorRadius" : "cad.measure.radius", value: f.length(m.radius) })
      if (m.radius !== undefined && m.majorRadius === undefined && m.surface !== "cone") rows.push({ label: "cad.measure.diameter", value: f.length(2 * m.radius) })
      if (m.majorRadius !== undefined) rows.push({ label: "cad.measure.majorRadius", value: f.length(m.majorRadius) })
      if (m.semiAngleDeg !== undefined) rows.push({ label: "cad.measure.semiAngle", value: f.angle(m.semiAngleDeg) })
      if (m.center !== undefined && m.surface !== "plane") rows.push({ label: "cad.measure.center", value: f.point(m.center) })
      return rows
    }
    case "body": {
      const size = { x: m.box.max.x - m.box.min.x, y: m.box.max.y - m.box.min.y, z: m.box.max.z - m.box.min.z }
      return [
        { label: "cad.measure.volume", value: f.volume(m.volume), emphasis: true },
        { label: "cad.measure.area", value: f.area(m.area) },
        { label: "cad.measure.centroid", value: f.point(m.centroid) },
        { label: "cad.measure.size", value: `${f.length(size.x)} × ${f.length(size.y)} × ${f.length(size.z)}` }
      ]
    }
  }
}

/** The rows of a pair: distance first, then the axis deltas, angle and parallel gap when they apply. */
export const betweenRows = (m: brep.BetweenMeasure, f: MeasureFormat): MeasureRow[] => {
  const rows: MeasureRow[] = [
    { label: "cad.measure.distance", value: f.length(m.distance), emphasis: true },
    { label: "cad.measure.dx", value: f.length(Math.abs(m.delta.x)) },
    { label: "cad.measure.dy", value: f.length(Math.abs(m.delta.y)) },
    { label: "cad.measure.dz", value: f.length(Math.abs(m.delta.z)) }
  ]
  if (m.angleDeg !== undefined) rows.push({ label: "cad.measure.angle", value: f.angle(m.angleDeg), emphasis: true })
  if (m.perpendicularGap !== undefined) rows.push({ label: "cad.measure.gap", value: f.length(m.perpendicularGap) })
  rows.push({ label: "cad.measure.pointA", value: f.point(m.pointA) }, { label: "cad.measure.pointB", value: f.point(m.pointB) })
  return rows
}

/** Plain-text copy of the rows (label: value per line), what "Copy" puts on the clipboard. */
export const rowsText = (rows: ReadonlyArray<MeasureRow>, label: (key: Key) => string): string => rows.map((row) => `${label(row.label)}: ${row.value}`).join("\n")
