/**
 * The part to machine, built from the CAD elements the user selected: every solid element is meshed (`element-mesh.ts`),
 * dropped into a dexel grid, and the boolean elements combine their operands exactly. The result is what a 3-axis
 * strategy needs: the height of the finished surface in every column, undercuts and holes included.
 */
import { Dexels, gridFor, type Grid } from "./dexel.ts"
import { elementMesh, meshBounds, type Element, type Mesh64 } from "./element-mesh.ts"

export interface PartModel {
  readonly dexels: Dexels
  readonly grid: Grid
  /** Elements that are not plain solids and so are not part of the model (type + name). */
  readonly skipped: ReadonlyArray<string>
  readonly warnings: ReadonlyArray<string>
  /** Bounds of everything meshed. */
  readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] }
}

export interface ModelOptions {
  /** Column size in mm (default 0.25), enlarged if the part would need more than `maxCells` columns. */
  readonly cell?: number
  /** Chord tolerance of round shapes, mm (default 0.005). */
  readonly tolerance?: number
  readonly maxCells?: number
  /** Extra margin around the part, mm, so a tool can run off its edge. */
  readonly margin?: number
}

const BOOLEANS = new Set(["boolean-union", "boolean-subtract", "boolean-intersect"])

const idOf = (e: Element): string | undefined => (typeof e["id"] === "string" ? e["id"] : undefined)
const label = (e: Element): string => `${String(e["type"])}${typeof e["name"] === "string" ? ` "${e["name"]}"` : ""}`

/** Meshes of the elements in play: the operands a boolean consumes are not machined on their own. */
const resolve = (elements: ReadonlyArray<Element>, tolerance: number) => {
  const byId = new Map<string, Element>()
  for (const e of elements) { const id = idOf(e); if (id !== undefined) byId.set(id, e) }
  const consumed = new Set<string>()
  const skipped: string[] = []
  const warnings: string[] = []
  type Node = { readonly mesh: Mesh64 } | { readonly op: string; readonly operands: ReadonlyArray<Node> }
  const build = (e: Element, depth: number): Node | undefined => {
    if (BOOLEANS.has(String(e["type"]))) {
      if (depth > 16) { warnings.push(`${label(e)}: booleans nested too deep`); return undefined }
      const operands = (Array.isArray(e["operands"]) ? e["operands"] : [])
        .map((id) => (typeof id === "string" ? byId.get(id) : undefined))
        .filter((x): x is Element => x !== undefined)
      for (const o of operands) { const id = idOf(o); if (id !== undefined) consumed.add(id) }
      const nodes = operands.map((o) => build(o, depth + 1)).filter((n): n is Node => n !== undefined)
      if (nodes.length < 2) { warnings.push(`${label(e)}: needs two operands that are solids`); return undefined }
      return { op: String(e["type"]), operands: nodes }
    }
    const mesh = elementMesh(e, tolerance)
    if (mesh === undefined) { skipped.push(label(e)); return undefined }
    return { mesh }
  }
  const roots: Node[] = []
  // Booleans first, so their operands are known before the plain elements are visited.
  for (const e of elements) if (BOOLEANS.has(String(e["type"]))) { const n = build(e, 0); if (n) roots.push(n) }
  for (const e of elements) {
    if (BOOLEANS.has(String(e["type"]))) continue
    const id = idOf(e)
    if (id !== undefined && consumed.has(id)) continue
    const n = build(e, 0)
    if (n) roots.push(n)
  }
  return { roots, skipped, warnings }
}

export const buildPartModel = (elements: ReadonlyArray<Element>, options: ModelOptions = {}): PartModel | undefined => {
  const tolerance = options.tolerance ?? 0.005
  const { roots, skipped, warnings } = resolve(elements, tolerance)
  const meshes: Mesh64[] = []
  const collect = (n: (typeof roots)[number]): void => { if ("mesh" in n) meshes.push(n.mesh); else n.operands.forEach(collect) }
  roots.forEach(collect)
  if (meshes.length === 0) return undefined
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const m of meshes) { const b = meshBounds(m); for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a]!, b.min[a]!); max[a] = Math.max(max[a]!, b.max[a]!) } }
  const margin = options.margin ?? 0
  const grid = gridFor(min[0] - margin, min[1] - margin, max[0] + margin, max[1] + margin, options.cell ?? 0.25, options.maxCells)
  if (grid.cellX > (options.cell ?? 0.25) * 1.001 || grid.cellY > (options.cell ?? 0.25) * 1.001) {
    warnings.push(`Surface resolution coarsened to ${Math.max(grid.cellX, grid.cellY).toFixed(3)} mm to keep the model within ${options.maxCells ?? 1_500_000} columns`)
  }
  const fill = (n: (typeof roots)[number]): Dexels => {
    if ("mesh" in n) {
      const { dexels, unpaired } = Dexels.fromMesh(n.mesh, grid)
      if (unpaired > 0) warnings.push(`${unpaired} column(s) of a solid had an odd number of surface hits (the mesh is not closed there)`)
      return dexels
    }
    const [first, ...rest] = n.operands.map(fill)
    return rest.reduce((acc, d) => (n.op === "boolean-union" ? acc.union(d) : n.op === "boolean-subtract" ? acc.subtract(d) : acc.intersect(d)), first!)
  }
  const dexels = roots.map(fill).reduce((acc, d) => acc.union(d))
  return { dexels, grid, skipped, warnings, bounds: { min, max } }
}

/**
 * The part to machine from solids that are already triangle meshes (the bodies of a parametric history, the result of a Boolean in
 * `cad/csg.ts`): each is dropped into the same dexel grid and united, so the surface strategies cut it exactly as they cut a model
 * built from elements. Positions and indices may be single precision; they are widened here.
 */
export const buildPartModelFromMeshes = (
  meshes: ReadonlyArray<{ readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }>,
  options: ModelOptions = {}
): PartModel | undefined => {
  const wide: Mesh64[] = meshes
    .filter((m) => m.indices.length >= 3)
    .map((m) => ({ positions: Float64Array.from(m.positions), indices: Uint32Array.from(m.indices) }))
  if (wide.length === 0) return undefined
  const warnings: string[] = []
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const m of wide) { const b = meshBounds(m); for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a]!, b.min[a]!); max[a] = Math.max(max[a]!, b.max[a]!) } }
  const margin = options.margin ?? 0
  const grid = gridFor(min[0] - margin, min[1] - margin, max[0] + margin, max[1] + margin, options.cell ?? 0.25, options.maxCells)
  if (grid.cellX > (options.cell ?? 0.25) * 1.001 || grid.cellY > (options.cell ?? 0.25) * 1.001) {
    warnings.push(`Surface resolution coarsened to ${Math.max(grid.cellX, grid.cellY).toFixed(3)} mm to keep the model within ${options.maxCells ?? 1_500_000} columns`)
  }
  const dexels = wide
    .map((m) => {
      const { dexels: d, unpaired } = Dexels.fromMesh(m, grid)
      if (unpaired > 0) warnings.push(`${unpaired} column(s) of a body had an odd number of surface hits (the mesh is not closed there)`)
      return d
    })
    .reduce((acc, d) => acc.union(d))
  return { dexels, grid, skipped: [], warnings, bounds: { min, max } }
}
