/** Pure export geometry and encoding; scoped workers own execution, action adapters own authorization and files. */
import type { CadExportInput, CamExportInput } from "@cadcamfun/api"
import { brep, cad, cam, exchange, meshTopology, rebuildExact } from "@cadcamfun/core"
import { EXACT_ACTION_BUDGET_MS, decodeHistory } from "../parametric.ts"

type Rec = Record<string, unknown>
type MeshFormat = "stl" | "stl_ascii" | "obj" | "3mf"
type LengthUnit = NonNullable<CadExportInput["unit"]>
const round = (x: number, d = 4): number => Math.round(x * 10 ** d) / 10 ** d
const fail = (error: string, extra: Rec = {}) => ({ ok: false as const, error, ...extra })
export interface ExportBody { readonly id: string; readonly name: string; readonly brep: brep.Brep }
type Body = ExportBody

export const cadExportScene = ({ elements, ids }: { readonly elements: Parameters<typeof cad.sceneParts>[0]; readonly ids?: ReadonlyArray<string> }) => {
  const scene = cad.sceneParts(cad.selectElements(elements, ids))
  const wanted = ids === undefined ? undefined : new Set(ids)
  const parts = scene.parts.filter((p) => wanted === undefined || wanted.has(p.id))
  const missing = ids?.filter((id) => !parts.some((p) => p.id === id)) ?? []
  const skipped = scene.skipped.map((s) => `${s.name} (${s.reason})`)
  if (parts.length === 0) return { ok: false as const, error: ids === undefined ? "The drawing has no exact solid to export." : "None of the requested elements has an exact solid to export.", skipped, missing }
  if (missing.length > 0) return { ok: false as const, error: "Some requested elements have no exact solid to export.", skipped, missing }
  return { ok: true as const, bodies: parts.map((p) => ({ id: p.id, name: p.name, brep: p.brep })), skipped }
}

/** One binary or text file from named meshes. STL cannot hold several objects, so the meshes are joined into one. */
export const encodeMesh = (format: MeshFormat, meshes: ReadonlyArray<exchange.NamedMesh>, name: string, unit: LengthUnit = "millimeter"): Uint8Array => {
  if (format === "3mf") return exchange.write3mf(meshes, { unit })
  if (format === "obj") return new TextEncoder().encode(exchange.writeObj(meshes))
  const positions: number[] = [], indices: number[] = []
  for (const { mesh } of meshes) {
    const base = positions.length / 3
    for (const v of mesh.positions) positions.push(v)
    for (const i of mesh.indices) indices.push(i + base)
  }
  const joined = { positions: Float64Array.from(positions), indices: Uint32Array.from(indices) }
  return format === "stl_ascii" ? new TextEncoder().encode(exchange.writeStlAscii(joined, name)) : exchange.writeStl(joined, name)
}

/** Chord tolerances tried in turn when the kernel's own tessellation leaves a crack between two faces (mm). */
const CHORD_LADDER: ReadonlyArray<number | undefined> = [undefined, 0.01, 0.005, 0.02, 0.05]

export interface BodyMesh {
  readonly mesh: exchange.MeshData
  /** The chord tolerance that gave a closed mesh, mm; absent when the kernel's default did. */
  readonly tolerance?: number
  /** Triangles split where one face sampled a shared edge more finely than its neighbour (a T-junction); the geometry does not move. */
  readonly tJunctions?: number
  /** Present when no tolerance closed the mesh and the cracks were filled: what was repaired. */
  readonly repaired?: { readonly filledHoles: number; readonly filledTriangles: number; readonly remaining: ReadonlyArray<string> }
}

/**
 * The watertight mesh of an exact body. A tolerance the caller asked for is used as it is; otherwise the kernel's default is tried
 * first and, when it leaves a crack between two faces, the T-junctions are split, then a ladder of other tolerances is tried (each with the
 * same split), and as a last resort the cracks are filled.
 * Whatever was changed is returned, never hidden: a mesh that is still open says so in `remaining`.
 */
export const closedMesh = (body: brep.Brep, tolerance?: number): BodyMesh => {
  const ladder = tolerance !== undefined ? [tolerance] : CHORD_LADDER
  let first: exchange.MeshData | undefined
  for (const chordTol of ladder) {
    const mesh = exchange.brepMesh(body, chordTol === undefined ? {} : { chordTol })
    first ??= mesh
    const used = chordTol !== undefined && tolerance === undefined ? { tolerance: chordTol } : {}
    if (meshTopology(mesh).solid) return { mesh, ...used }
    // Two faces that sample their shared edge differently leave a crack the geometry does not have: split the triangle that runs past.
    const joined = exchange.closeByTJunctions(mesh)
    if (joined.closed) return { mesh: joined.mesh, ...used, tJunctions: joined.splitEdges }
  }
  const fixed = exchange.repairMesh(first!, { maxHoleEdges: 64 })
  return { mesh: fixed.mesh, repaired: { filledHoles: fixed.report.defects.filledHoles, filledTriangles: fixed.report.defects.filledTriangles, remaining: fixed.report.remaining } }
}

const meshStats = (meshes: ReadonlyArray<exchange.NamedMesh>) => meshes.map(({ name, mesh }) => {
  const t = meshTopology(mesh)
  return { name, triangles: t.triangles, solid: t.solid, volumeMm3: round(t.volume, 3) }
})


export const cadExportBodies = (input: { readonly history: Record<string, unknown> }) => {
  const decoded = decodeHistory(input.history)
  if (!decoded.success) return fail("The history is not a valid parametric history.")
  const history = decoded.data
  const exact = brep.withBudget(EXACT_ACTION_BUDGET_MS, () => rebuildExact(history))
  const bodies = exact.bodies.filter((b) => b.brep !== undefined).map((b) => ({ id: b.id, name: b.id, brep: b.brep! }))
  const missing = exact.bodies.filter((b) => b.brep === undefined).map((b) => b.id)
  if (bodies.length === 0) return fail("No body of the history has an exact model to export.", { reasons: missing })
  return { bodies, warnings: missing.length > 0 ? [`Bodies without an exact model were left out: ${missing.join(", ")}.`] : [] }
}

/** The kernel's long loops stop at the deadline `withBudget` sets, which only covers synchronous work: meshing and writing stay inside it, storing is awaited outside. */
const render = (input: CadExportInput, bodies: ReadonlyArray<Body>, stem: string) => brep.withBudget(EXACT_ACTION_BUDGET_MS, () => {
  if (input.format === "step" || input.format === "iges") {
    const parts = bodies.map(({ name, brep: b }) => ({ name, brep: b }))
    const text = input.format === "step" ? brep.writeStepBreps(parts) : brep.writeIgesBreps(parts)
    return { bytes: new TextEncoder().encode(text), stats: bodies.map((b) => ({ name: b.name })), open: [] as string[], notes: [] as string[] }
  }
  const made = bodies.map((b) => ({ name: b.name, ...closedMesh(b.brep, input.tolerance) }))
  const meshes = made.map((m) => ({ name: m.name, mesh: m.mesh }))
  const stats = meshStats(meshes).map((s, k) => ({ ...s, ...(made[k]!.tolerance !== undefined ? { chordTolMm: made[k]!.tolerance } : {}), ...(made[k]!.tJunctions !== undefined ? { tJunctionsSplit: made[k]!.tJunctions } : {}), ...(made[k]!.repaired !== undefined ? { repaired: made[k]!.repaired } : {}) }))
  const notes = made.flatMap((m) => [
    ...(m.tolerance !== undefined ? [`${m.name}: the default tessellation left a crack between two faces; meshed at ${m.tolerance} mm chord tolerance instead.`] : []),
    ...(m.tJunctions !== undefined ? [`${m.name}: two faces sampled a shared edge differently; ${m.tJunctions} triangle edge(s) were split to close it (no vertex moved).`] : []),
    ...(m.repaired !== undefined ? [`${m.name}: no tolerance closed the mesh; ${m.repaired.filledHoles} cracks (${m.repaired.filledTriangles} triangles) were filled.`] : [])
  ])
  return { bytes: encodeMesh(input.format, meshes, stem, input.unit), stats, open: stats.filter((s) => !("solid" in s) || !s.solid).map((s) => s.name), notes }
})

export interface CadExportJobInput {
  readonly input: CadExportInput
  readonly source?: { readonly bodies: ReadonlyArray<ExportBody>; readonly warnings: ReadonlyArray<string> }
}

export const cadExport = ({ input, source }: CadExportJobInput) => {
  if (input.history !== undefined && input.ids !== undefined) return fail("Send ids (elements of the drawing) or history (a part sent inline), not both.")
  const got = input.history !== undefined ? cadExportBodies({ history: input.history }) : source
  if (got === undefined) return fail("The exact solids of the drawing are unavailable in this host.")
  if ("ok" in got) return got
  const { bodies, warnings } = got
  const stem = input.name ?? (bodies.length === 1 ? bodies[0]!.name.replace(/[^A-Za-z0-9._\-()]+/g, "_") || "part" : "parts")
  const made = render(input, bodies, stem)
  return {
    ok: true as const, stem, bytes: made.bytes, stats: made.stats,
    warnings: [...warnings, ...made.notes, ...(made.open.length > 0 ? [`Not a closed manifold after meshing (a slicer may refuse it): ${made.open.join(", ")}.`] : [])]
  }
}

export interface CamStockExportJobInput {
  readonly input: CamExportInput
  readonly preview: Parameters<typeof cam.verify.stockMeshFromPreview>[0]
  readonly floor: number
}

export const camStockExport = ({ input, ...got }: CamStockExportJobInput) => {
  let mesh: cam.verify.StockMesh
  try { mesh = cam.verify.stockMeshFromPreview(got.preview, { floor: got.floor }) } catch (cause) { return fail(cause instanceof Error ? cause.message : String(cause)) }
  const format = input.format ?? "stl"
  const name = `stock-${input.operationId.slice(0, 8)}`
  const meshes = [{ name, mesh: { positions: mesh.positions, indices: mesh.indices } }]
  const stats = meshStats(meshes)
  return {
    ok: true as const, format, name, bytes: encodeMesh(format, meshes, name, input.unit), stats,
    cellMm: round(Math.max(mesh.cellX, mesh.cellY)), thinCells: mesh.thinCells,
    warnings: [
      `The stock is the height field of the verified program at ${round(Math.max(mesh.cellX, mesh.cellY))} mm cells: faceted, and it cannot hold an undercut.`,
      ...(mesh.thinCells > 0 ? [`${mesh.thinCells} cells have no material above the floor (a cut through the stock): they have no thickness in the mesh.`] : [])
    ]
  }
}
