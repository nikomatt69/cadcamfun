/**
 * `cad_edit.export` and `cam_edit.export`: the files the kernels can make, written for real. The bytes are produced here from
 * the exact solids (CAD) or from the stored program and the stock its verification leaves (CAM), then handed to the host, which
 * keeps them in the project's export folder. The answer names the file (key, size, SHA-256) and what went into it; it never
 * carries the bytes, so a large mesh cannot swamp the context, and never an absolute path.
 */
import type { CadExportInput, CamExportInput, ExportedFile } from "@cadcamfun/api"
import { cam } from "@cadcamfun/core"
import { createHash } from "node:crypto"
import { runKernelJob } from "../kernel-job.ts"
import type { ExportBody as Body } from "./export-kernel.ts"
import type { ActionContext } from "./action.ts"
export { closedMesh, encodeMesh, type BodyMesh } from "./export-kernel.ts"

type Rec = Record<string, unknown>
const fail = (error: string, extra: Rec = {}) => ({ ok: false as const, error, ...extra })

/** What a file is called on disk and served as: the extension follows the format, never the model's input. */
const FORMATS: Readonly<Record<string, { readonly extension: string; readonly mime: string }>> = {
  stl: { extension: "stl", mime: "model/stl" },
  stl_ascii: { extension: "stl", mime: "model/stl" },
  obj: { extension: "obj", mime: "model/obj" },
  "3mf": { extension: "3mf", mime: "model/3mf" },
  step: { extension: "step", mime: "model/step" },
  iges: { extension: "igs", mime: "model/iges" },
  html: { extension: "html", mime: "text/html" }
}

const MIME_TEXT = "text/plain"

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")

/** Hands the bytes to the host and shapes its answer; a host that stores nothing says so instead of pretending. */
const store = async (context: ActionContext, stem: string, format: string, bytes: Uint8Array, extension?: string): Promise<{ ok: true; file: ExportedFile } | ReturnType<typeof fail>> => {
  context.signal?.throwIfAborted()
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
  if (input.history !== undefined) return runKernelJob("cad-export-bodies", { history: input.history }, { signal: context.signal })
  if (context.handlers.cadExportBodies === undefined) return fail("The exact solids of the drawing are unavailable in this host.")
  const got = await context.handlers.cadExportBodies(context.projectId, input.ids, context.signal)
  if (!got.ok) return fail(got.error, { ...(got.skipped !== undefined ? { skipped: got.skipped } : {}), ...(got.missing !== undefined ? { missing: got.missing } : {}) })
  return { bodies: got.bodies, warnings: got.skipped.length > 0 ? [`Elements without an exact solid were left out: ${got.skipped.join(", ")}.`] : [] }
}

export const runCadExport = async (input: CadExportInput, context: ActionContext): Promise<unknown> => {
  try {
    if (input.history !== undefined && input.ids !== undefined) return fail("Send ids (elements of the drawing) or history (a part sent inline), not both.")
    const source = input.history !== undefined ? undefined : await bodiesOf(input, context)
    if (source !== undefined && "ok" in source) return source
    const made = await runKernelJob("cad-export", { input, ...(source !== undefined ? { source } : {}) }, { signal: context.signal })
    if (!made.ok) return made
    context.signal?.throwIfAborted()
    const stem = made.stem
    const saved = await store(context, stem, input.format, made.bytes)
    if (!saved.ok) return saved
    return {
      ok: true, format: input.format, file: saved.file, bodies: made.stats, ...(input.format === "step" || input.format === "iges" ? {} : { unit: input.format === "3mf" ? input.unit ?? "millimeter" : "millimeter" }),
      warnings: made.warnings
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
  const made = await runKernelJob("cam-export-stock", { input, preview: got.preview, floor: got.floor }, { signal: context.signal })
  if (!made.ok) return made
  context.signal?.throwIfAborted()
  const saved = await store(context, stemOf(input.name, made.name), made.format, made.bytes)
  if (!saved.ok) return saved
  return {
    ok: true, format: made.format, file: saved.file, operationId: input.operationId, bodies: made.stats,
    cellMm: made.cellMm, thinCells: made.thinCells, programHash: got.programHash, warnings: made.warnings
  }
}

const runCamSetupSheet = async (input: CamExportInput, context: ActionContext): Promise<unknown> => {
  if (context.handlers.operationSetupSheet === undefined) return fail("Setup sheets are unavailable in this host.")
  const sheet = await context.handlers.operationSetupSheet(context.projectId, input.operationId)
  if (!sheet.ok) return fail(sheet.error)
  const saved = await store(context, stemOf(input.name, `setup-sheet-${input.operationId.slice(0, 8)}`), "html", new TextEncoder().encode(sheet.html))
  if (!saved.ok) return saved
  return { ok: true, format: "html", file: saved.file, operationId: input.operationId, release: sheet.release, warnings: sheet.warnings }
}

export const runCamExport = (input: CamExportInput, context: ActionContext): Promise<unknown> =>
  input.kind === "program" ? runCamProgram(input, context) : input.kind === "stock" ? runCamStock(input, context) : runCamSetupSheet(input, context)
