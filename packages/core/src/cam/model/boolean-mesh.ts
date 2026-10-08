/**
 * Non-destructive Boolean elements (`boolean-union`, `boolean-subtract`, `boolean-intersect`, whose `operands` are the ids of other
 * elements) as a real solid: every operand meshed the way the CAM sees it (`element-mesh.ts`), combined with the mesh Boolean of
 * `cad/csg.ts`. The viewport draws this instead of a placeholder, and hides the operands a Boolean consumes, as every CAD does.
 *
 * Semantics match the part model: a union is every operand united, an intersection is every operand intersected, a subtraction is the
 * first operand minus all the others. An operand that is itself a Boolean is resolved first; a loop or a depth over 16 is an error
 * reported in `warnings`, not an infinite recursion. The result is a mesh (see `csg.ts` for what that does and does not mean).
 */
import { booleanMesh, type BooleanOp } from "../../cad/csg.ts"
import type { Mesh } from "../../cad/solid.ts"
import { elementMesh, placeElementMesh, type Element } from "./element-mesh.ts"

const OPERATIONS: Readonly<Record<string, BooleanOp>> = { "boolean-union": "union", "boolean-subtract": "subtract", "boolean-intersect": "intersect" }

export const isBooleanElement = (e: Element): boolean => typeof e["type"] === "string" && e["type"] in OPERATIONS

const operandIds = (e: Element): string[] => (Array.isArray(e["operands"]) ? (e["operands"] as unknown[]).filter((x): x is string => typeof x === "string") : [])

/** Ids of the elements the visible Booleans consume (they are not drawn or machined on their own). */
export const consumedOperands = (elements: ReadonlyArray<Element>): Set<string> => {
  const out = new Set<string>()
  for (const e of elements) if (isBooleanElement(e) && e["visible"] !== false) for (const id of operandIds(e)) out.add(id)
  return out
}

export interface BooleanResult {
  readonly mesh: Mesh
  readonly warnings: ReadonlyArray<string>
}

const narrow = (m: { readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }): Mesh => ({ positions: Float32Array.from(m.positions), indices: Uint32Array.from(m.indices) })

/** The solid a Boolean element stands for, or `undefined` when it cannot be formed (and then `warnings` says why through `explain`). */
export const booleanElementMesh = (elements: ReadonlyArray<Element>, target: Element, tolerance = 0.01): BooleanResult | undefined => {
  const byId = new Map<string, Element>()
  for (const e of elements) if (typeof e["id"] === "string") byId.set(e["id"], e)
  const warnings: string[] = []
  const solve = (e: Element, trail: ReadonlyArray<string>): Mesh | undefined => {
    const op = OPERATIONS[String(e["type"])]
    if (op === undefined) {
      const m = elementMesh(e, tolerance)
      if (m === undefined) warnings.push(`${String(e["type"])}${typeof e["name"] === "string" ? ` "${e["name"]}"` : ""} is not a solid`)
      return m === undefined ? undefined : narrow(m)
    }
    const id = typeof e["id"] === "string" ? e["id"] : ""
    if (trail.includes(id) || trail.length > 16) { warnings.push("Booleans refer to each other in a loop, or are nested too deep"); return undefined }
    const operands = operandIds(e).map((o) => byId.get(o))
    if (operands.some((o) => o === undefined)) warnings.push("A Boolean refers to an element that is not in the drawing")
    const meshes = operands.flatMap((o) => (o === undefined ? [] : [solve(o, [...trail, id])])).filter((m): m is Mesh => m !== undefined)
    if (meshes.length < 2) { warnings.push(`${String(e["type"])} needs two operands that are solids`); return undefined }
    return meshes.slice(1).reduce((acc, m) => booleanMesh(acc, m, op), meshes[0]!)
  }
  const mesh = solve(target, [])
  if (mesh === undefined) return undefined
  // The Boolean element itself can be moved, turned and scaled with the gizmo like any other: its transform acts on the result.
  const placed = placeElementMesh(target, { positions: Float64Array.from(mesh.positions), indices: mesh.indices })
  return { mesh: narrow(placed), warnings }
}
