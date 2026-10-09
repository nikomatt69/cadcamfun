/**
 * The transform and grouping tools over a list of elements: pure, so they are testable without a database. The geometry is
 * core's (`cad.transformElement`, the editor's own gizmo rules); this finds the element's centre, refuses what cannot be done
 * and checks the result is still an element the editor can draw.
 */
import { cad, cam } from "@cadcamfun/core"
import { normalizeElement } from "@cadcamfun/ai"
import type { Element } from "./ai-elements.ts"

type Fields = Record<string, unknown>
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0)
const BOOLEAN = /^boolean-/
const isContainer = (e: Fields): boolean => e["type"] === "component" || e["type"] === "group"

/**
 * Types whose bounds in core are not where the editor draws them (the editor stands them up or builds them its own way), so a
 * turn or scale about ANOTHER point would land them elsewhere. About their own centre they are fine.
 */
export const UNRELIABLE_PIVOT: ReadonlySet<string> = new Set(["arc", "spring", "bolt", "screw", "wall", "stair", "door", "roof"])

/** Where the element's centre is: the middle of its bounds, plus the `translate*` the gizmo may have written. */
export const centreOf = (e: Fields): cad.Point3 => {
  let c: cad.Point3 = { x: num(e["x"]), y: num(e["y"]), z: num(e["z"]) }
  try {
    const b = cam.generator.elementBounds(e as never)
    if (Number.isFinite(b.min.x) && Number.isFinite(b.max.x) && Number.isFinite(b.min.z) && Number.isFinite(b.max.z)) {
      c = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 }
    }
  } catch { /* keep the element's own point */ }
  return { x: c.x + num(e["translateX"]), y: c.y + num(e["translateY"]), z: c.z + num(e["translateZ"]) }
}

export type TransformResult =
  | { readonly ok: true; readonly copied: boolean; readonly elements: ReadonlyArray<Element> }
  | { readonly ok: false; readonly error: string }

export const transformElements = (
  all: ReadonlyArray<Element>,
  input: { readonly ids: ReadonlyArray<string>; readonly transform: cad.ElementTransform; readonly copies: number },
  newId: () => string
): TransformResult => {
  const missing = input.ids.filter((id) => !all.some((e) => e.id === id))
  if (missing.length > 0) return { ok: false, error: `Unknown element ids: ${missing.join(", ")}. Use cad_describe_drawing to list the ids.` }
  const chosen = all.filter((e) => input.ids.includes(e.id))
  const aboutOther = input.transform.rotate?.about !== undefined || input.transform.scale?.about !== undefined
  for (const e of chosen) {
    if (input.copies > 0 && BOOLEAN.test(e.type)) return { ok: false, error: `${e.id} is a ${e.type}: copy its operands and build the Boolean again.` }
    if (aboutOther && UNRELIABLE_PIVOT.has(e.type)) return { ok: false, error: `${e.id} is a ${e.type}: it cannot be turned or scaled about another point. Move it first, then turn or scale it about its own centre.` }
  }
  const out: Element[] = []
  const refused: string[] = []
  const check = (before: Fields, after: Fields, id: string): boolean => {
    // As cad_modify_entities: an element that was valid must still be; one made by hand in the editor is not judged.
    if (normalizeElement(before).ok && !normalizeElement(after).ok) { refused.push(id); return false }
    return true
  }
  for (const e of chosen) {
    if (input.copies === 0) {
      const next = cad.transformElement(e, input.transform, centreOf(e)) as Element
      if (check(e, next, e.id)) out.push(next)
      continue
    }
    let current: Fields = e
    for (let k = 1; k <= input.copies; k++) {
      current = cad.transformElement(current, input.transform, centreOf(current))
      const copy = { ...current, id: newId() } as Element
      if (check(e, copy, e.id)) out.push(copy)
    }
  }
  if (refused.length > 0) return { ok: false, error: `Nothing changed: the result is not a valid element for ${[...new Set(refused)].join(", ")}.` }
  return { ok: true, copied: input.copies > 0, elements: out }
}

export type GroupResult =
  | { readonly ok: true; readonly removed: ReadonlyArray<string>; readonly added: ReadonlyArray<Element> }
  | { readonly ok: false; readonly error: string }

const hasPoint = (e: Fields): boolean => ("x" in e && "y" in e) || ("x1" in e && "x2" in e)
const origin = (e: Fields): cad.Point3 => ("x" in e && "y" in e ? { x: num(e["x"]), y: num(e["y"]), z: num(e["z"]) } : { x: num(e["x1"]), y: num(e["y1"]), z: num(e["z1"]) })
const negate = (p: cad.Point3): cad.Point3 => ({ x: -p.x, y: -p.y, z: -p.z })

export const groupElements = (
  all: ReadonlyArray<Element>,
  input: { readonly ids: ReadonlyArray<string>; readonly ungroup: boolean; readonly name?: string; readonly layer?: string },
  newId: () => string
): GroupResult => {
  const missing = input.ids.filter((id) => !all.some((e) => e.id === id))
  if (missing.length > 0) return { ok: false, error: `Unknown element ids: ${missing.join(", ")}. Use cad_describe_drawing to list the ids.` }
  const chosen = all.filter((e) => input.ids.includes(e.id))

  if (input.ungroup) {
    const parts: Element[] = []
    for (const e of chosen) {
      if (!isContainer(e)) return { ok: false, error: `${e.id} is a ${e.type}, not a component or group.` }
      if (e["rotation"] !== undefined || e["scale"] !== undefined || num(e["translateX"]) !== 0 || num(e["translateY"]) !== 0 || num(e["translateZ"]) !== 0) {
        return { ok: false, error: `${e.id} is turned, scaled or moved with the gizmo: it cannot be opened without moving its parts. Say so to the user.` }
      }
      const base: cad.Point3 = { x: num(e["x"]), y: num(e["y"]), z: num(e["z"]) }
      const children = Array.isArray(e["elements"]) ? (e["elements"] as Fields[]) : []
      for (const child of children) parts.push({ ...cad.shiftElement(child, base), id: newId(), layerId: e.layerId } as Element)
    }
    return { ok: true, removed: chosen.map((e) => e.id), added: parts }
  }

  if (chosen.length < 1) return { ok: false, error: "Nothing to group." }
  const operands = new Set(all.flatMap((e) => (BOOLEAN.test(e.type) && Array.isArray(e["operands"]) ? (e["operands"] as unknown[]).filter((o): o is string => typeof o === "string") : [])))
  for (const e of chosen) {
    if (BOOLEAN.test(e.type)) return { ok: false, error: `${e.id} is a ${e.type}: a Boolean stays on its own.` }
    if (operands.has(e.id)) return { ok: false, error: `${e.id} is an operand of a Boolean: grouping it would break the Boolean.` }
    if (!hasPoint(e)) return { ok: false, error: `${e.id} is a ${e.type}, which has no position of its own to group around.` }
  }
  const first = origin(chosen[0]!)
  const children = chosen.map((e) => {
    const { id: _id, layerId: _layerId, layer: _layer, ...child } = e as Fields
    return cad.shiftElement(child, negate(first))
  })
  const component = {
    id: newId(), type: "component", name: input.name ?? "Component", x: first.x, y: first.y, z: first.z, elements: children,
    layerId: input.layer ?? chosen[0]!.layerId
  } as Element
  return { ok: true, removed: chosen.map((e) => e.id), added: [component] }
}
