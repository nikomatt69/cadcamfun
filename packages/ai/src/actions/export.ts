/**
 * `cad_edit.export` and `cam_edit.export`: the files the kernels can make, written for real. The bytes are produced here from
 * the exact solids (CAD) or from the stored program and the stock its verification leaves (CAM), then handed to the host, which
 * keeps them in the project's export folder. The answer names the file (key, size, SHA-256) and what went into it; it never
 * carries the bytes, so a large mesh cannot swamp the context, and never an absolute path.
 */
import type { CadExportInput, CamExportInput, ExportedFile } from "@cadcamfun/api"
import { brep, cam, exchange, meshTopology, rebuildExact } from "@cadcamfun/core"
import { createHash } from "node:crypto"
import { EXACT_ACTION_BUDGET_MS, decodeHistory } from "../parametric.ts"
import type { ActionContext } from "./action.ts"

type Rec = Record<string, unknown>
type MeshFormat = "stl" | "stl_ascii" | "obj" | "3mf"
type LengthUnit = NonNullable<CadExportInput["unit"]>

const round = (x: number, d = 4): number => Math.round(x * 10 ** d) / 10 ** d
const fail = (error: string, extra: Rec = {}) => ({ ok: false as const, error, ...extra })

interface Body { readonly id: string; readonly name: string; readonly brep: brep.Brep }

/** What a file is called on disk and served as: the extension follows the format, never the model's input. */
const FORMATS: Readonly<Record<string, { readonly extension: string; readonly mime: string }>> = {
  stl: { extension: "stl", mime: "model/stl" },
  stl_ascii: { extension: "stl", mime: "model/stl" },
  obj: { extension: "obj", mime: "model/obj" },
  "3mf": { extension: "3mf", mime: "model/3mf" },
  step: { extension: "step", mime: "model/step" },
  iges: { extension: "igs", mime: "model/iges" }
}

const MIME_TEXT = "text/plain"

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")

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
  /** Present when no tolerance closed the mesh and the cracks were filled: what was repaired. */
  readonly repaired?: { readonly filledHoles: number; readonly filledTriangles: number; readonly remaining: ReadonlyArray<string> }
}

/**
 * The watertight mesh of an exact body. A tolerance the caller asked for is used as it is; otherwise the kernel's default is tried
 * first and, when it leaves a crack between two faces, a ladder of other tolerances, and as a last resort the cracks are filled.
 * Whatever was changed is returned, never hidden: a mesh that is still open says so in `remaining`.
 */
export const closedMesh = (body: brep.Brep, tolerance?: number): BodyMesh => {
  const ladder = tolerance !== undefined ? [tolerance] : CHORD_LADDER
  let first: exchange.MeshData | undefined
  for (const chordTol of ladder) {
    const mesh = exchange.brepMesh(body, chordTol === undefined ? {} : { chordTol })
    first ??= mesh
    if (meshTopology(mesh).solid) return { mesh, ...(chordTol !== undefined && tolerance === undefined ? { tolerance: chordTol } : {}) }
  }
  const fixed = exchange.repairMesh(first!, { maxHoleEdges: 64 })
  return { mesh: fixed.mesh, repaired: { filledHoles: fixed.report.defects.filledHoles, filledTriangles: fixed.report.defects.filledTriangles, remaining: fixed.report.remaining } }
}

const meshStats = (meshes: ReadonlyArray<exchange.NamedMesh>) => meshes.map(({ name, mesh }) => {
  const t = meshTopology(mesh)
  return { name, triangles: t.triangles, solid: t.solid, volumeMm3: round(t.volume, 3) }
})

/** Hands the bytes to the host and shapes its answer; a host that stores nothing says so instead of pretending. */
const store = async (context: ActionContext, stem: string, format: string, bytes: Uint8Array, extension?: string): Promise<{ ok: true; file: ExportedFile } | ReturnType<typeof fail>> => {
  if (context.handlers.saveFile === undefined) return fail("File export is unavailable in this host: nothing was written.")
  const spec = FORMATS[format]
  const ext = extension ?? spec?.extension ?? "bin"
  const stored = await context.handlers.saveFile(context.projectId, { name: `${stem}.${ext}`, mime: spec?.mime ?? MIME_TEXT, bytes })
  if (!stored.ok) return fail(stored.error)
  return { ok: true, file: { name: stored.name, key: stored.key, mime: spec?.mime ?? MIME_TEXT, bytes: bytes.length, sha256: sha256(bytes) } }
}

const stemOf = (given: string | undefined, fallback: string): string => given ?? fallback

// ---------------------------------------------------------------- cad_edit.export

export const bodiesOf = async (input: { readonly ids?: ReadonlyArray<string> | undefined; readonly history?: Record<string, unknown> | undefined }, context: ActionContext): Promise<{ readonly bodies: ReadonlyArray<Body>; readonly warnings: ReadonlyArray<string> } | ReturnType<typeof fail>> => {
  if (input.history !== undefined && input.ids !== undefined) return fail("Send ids (elements of the drawing) or history (a part sent inline), not both.")
  if (input.history !== undefined) {
    const decoded = decodeHistory(input.history)
    if (!decoded.success) return fail("The history is not a valid parametric history.")
    const history = decoded.data
    const exact = brep.withBudget(EXACT_ACTION_BUDGET_MS, () => rebuildExact(history))
    const bodies = exact.bodies.filter((b) => b.brep !== undefined).map((b) => ({ id: b.id, name: b.id, brep: b.brep! }))
    const missing = exact.bodies.filter((b) => b.brep === undefined).map((b) => b.id)
    if (bodies.length === 0) return fail("No body of the history has an exact model to export.", { reasons: missing })
    return { bodies, warnings: missing.length > 0 ? [`Bodies without an exact model were left out: ${missing.join(", ")}.`] : [] }
  }
  if (context.handlers.cadExportBodies === undefined) return fail("The exact solids of the drawing are unavailable in this host.")
  const got = await context.handlers.cadExportBodies(context.projectId, input.ids)
  if (!got.ok) return fail(got.error, { ...(got.skipped !== undefined ? { skipped: got.skipped } : {}), ...(got.missing !== undefined ? { missing: got.missing } : {}) })
  return { bodies: got.bodies, warnings: got.skipped.length > 0 ? [`Elements without an exact solid were left out: ${got.skipped.join(", ")}.`] : [] }
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
  const stats = meshStats(meshes).map((s, k) => ({ ...s, ...(made[k]!.tolerance !== undefined ? { chordTolMm: made[k]!.tolerance } : {}), ...(made[k]!.repaired !== undefined ? { repaired: made[k]!.repaired } : {}) }))
  const notes = made.flatMap((m) => [
    ...(m.tolerance !== undefined ? [`${m.name}: the default tessellation left a crack between two faces; meshed at ${m.tolerance} mm chord tolerance instead.`] : []),
    ...(m.repaired !== undefined ? [`${m.name}: no tolerance closed the mesh; ${m.repaired.filledHoles} cracks (${m.repaired.filledTriangles} triangles) were filled.`] : [])
  ])
  return { bytes: encodeMesh(input.format, meshes, stem, input.unit), stats, open: stats.filter((s) => !("solid" in s) || !s.solid).map((s) => s.name), notes }
})

export const runCadExport = async (input: CadExportInput, context: ActionContext): Promise<unknown> => {
  try {
    const got = await bodiesOf(input, context)
    if ("ok" in got) return got
    const { bodies, warnings } = got
    const stem = stemOf(input.name, bodies.length === 1 ? bodies[0]!.name.replace(/[^A-Za-z0-9._\-()]+/g, "_") || "part" : "parts")
    const made = render(input, bodies, stem)
    const saved = await store(context, stem, input.format, made.bytes)
    if (!saved.ok) return saved
    return {
      ok: true, format: input.format, file: saved.file, bodies: made.stats, ...(input.format === "step" || input.format === "iges" ? {} : { unit: input.format === "3mf" ? input.unit ?? "millimeter" : "millimeter" }),
      warnings: [...warnings, ...made.notes, ...(made.open.length > 0 ? [`Not a closed manifold after meshing (a slicer may refuse it): ${made.open.join(", ")}.`] : [])]
    }
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : String(cause))
  }
}

// ---------------------------------------------------------------- cam_edit.export

const runCamProgram = async (input: CamExportInput, context: ActionContext): Promise<unknown> => {
  if (context.handlers.operationProgram === undefined) return fail("Stored programs are unavailable in this host.")
  const program = await context.handlers.operationProgram(context.projectId, input.operationId)
  if (!program.ok) return fail(program.error)
  const text = program.gcode.endsWith("\n") ? program.gcode : `${program.gcode}\n`
  const saved = await store(context, stemOf(input.name, `program-${input.operationId.slice(0, 8)}`), "program", new TextEncoder().encode(text), input.extension ?? "nc")
  if (!saved.ok) return saved
  return {
    ok: true, format: input.extension ?? "nc", file: saved.file, operationId: input.operationId,
    lines: text.split("\n").length - 1, programHash: cam.kernel.sha256(program.gcode), warnings: []
  }
}

const runCamStock = async (input: CamExportInput, context: ActionContext): Promise<unknown> => {
  if (context.handlers.operationStock === undefined) return fail("The verified stock is unavailable in this host.")
  const got = await context.handlers.operationStock(context.projectId, input.operationId)
  if (!got.ok) return fail(got.error)
  let mesh: cam.verify.StockMesh
  try { mesh = cam.verify.stockMeshFromPreview(got.preview, { floor: got.floor }) } catch (cause) { return fail(cause instanceof Error ? cause.message : String(cause)) }
  const format = input.format ?? "stl"
  const name = `stock-${input.operationId.slice(0, 8)}`
  const meshes = [{ name, mesh: { positions: mesh.positions, indices: mesh.indices } }]
  const stats = meshStats(meshes)
  const saved = await store(context, stemOf(input.name, name), format, encodeMesh(format, meshes, name, input.unit))
  if (!saved.ok) return saved
  return {
    ok: true, format, file: saved.file, operationId: input.operationId, bodies: stats,
    cellMm: round(Math.max(mesh.cellX, mesh.cellY)), thinCells: mesh.thinCells, programHash: got.programHash,
    warnings: [
      `The stock is the height field of the verified program at ${round(Math.max(mesh.cellX, mesh.cellY))} mm cells: faceted, and it cannot hold an undercut.`,
      ...(mesh.thinCells > 0 ? [`${mesh.thinCells} cells have no material above the floor (a cut through the stock): they have no thickness in the mesh.`] : [])
    ]
  }
}

export const runCamExport = (input: CamExportInput, context: ActionContext): Promise<unknown> =>
  input.kind === "program" ? runCamProgram(input, context) : runCamStock(input, context)
