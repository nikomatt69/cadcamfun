/**
 * What the export actions need from the project, as plain functions: which exact solids a request means, where a file is kept
 * and which stock a stored verification still describes. `ai.ts` binds them to the repositories and the storage service.
 */
import { cad, cam } from "@cadcamfun/core"
import { runKernelJob, type ToolHandlersShape } from "@cadcamfun/ai"

type Exported = Awaited<ReturnType<NonNullable<ToolHandlersShape["cadExportBodies"]>>>
type Stock = Awaited<ReturnType<NonNullable<ToolHandlersShape["operationStock"]>>>

const record = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** The exact solids a request names (or all of them), each with the reason when one cannot be exported. */
export const bodiesForExport = (elements: Parameters<typeof cad.sceneParts>[0], ids: ReadonlyArray<string> | undefined, signal?: AbortSignal): Promise<Exported> =>
  runKernelJob("cad-export-scene", { elements, ...(ids !== undefined ? { ids } : {}) }, { signal })

/** A file name the storage folder keeps as it is: no folder, no leading dot, no character a file system or a URL treats specially. */
export const safeFileName = (name: string): string => {
  const clean = name.replace(/[^A-Za-z0-9._\-() ]+/g, "_").replace(/^[. ]+/, "").slice(0, 100)
  return clean === "" ? "export" : clean
}

/** The first key under `exports/<project>/` that holds no file yet: an export never replaces an earlier one. */
export const freeKey = async (exists: (key: string) => Promise<boolean>, projectId: string, fileName: string): Promise<string> => {
  const name = safeFileName(fileName)
  const dot = name.lastIndexOf(".")
  const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : ""
  for (let n = 1; n < 1000; n++) {
    const key = `exports/${projectId}/${n === 1 ? name : `${stem}-${n}${ext}`}`
    if (!(await exists(key))) return key
  }
  throw new RangeError("The export folder holds 999 files with this name; give the file another name")
}

/**
 * The stock a verification left, if it still describes the program stored now: the program, the settings and the drawing must be the
 * ones the report was made for (the same test `cam.review` applies), and the height field must be in the report.
 */
export const stockOfVerification = (
  data: Record<string, unknown>, gcode: string | null, current: { readonly revision: string; readonly requestRevision: string; readonly programRevision: string }
): Stock => {
  const evidence = record(data["verification"])
  if (evidence["revision"] === undefined) return { ok: false, error: "The operation has no verification yet: run cam_edit verify first, then export its stock." }
  const programHash = cam.kernel.sha256(gcode ?? "")
  if (gcode === null || gcode === "" || evidence["programRevision"] !== current.programRevision || evidence["programHash"] !== programHash) {
    return { ok: false, error: "The stored program changed since it was verified. Verify it again, then export the stock." }
  }
  if (evidence["revision"] !== current.revision || evidence["requestRevision"] !== current.requestRevision) {
    return { ok: false, error: "The drawing, stock or operation settings changed since the program was verified. Verify it again, then export the stock." }
  }
  const preview = record(record(evidence["report"])["preview"])
  const decoded = decodePreview(preview)
  if (decoded === undefined) return { ok: false, error: "The verification kept no stock height field to export." }
  // The verified stock box is flat bounds (`minZ`), the bottom of the material the height field stands on.
  const floor = record(record(evidence["request"])["stock"])["minZ"]
  if (typeof floor !== "number" || !Number.isFinite(floor)) return { ok: false, error: "The verification did not record the bottom of the stock." }
  return { ok: true, preview: decoded, floor, programHash }
}

const decodePreview = (value: Record<string, unknown>) => {
  const heights = value["heights"]
  const numbers = ["nx", "ny", "minX", "minY", "cellX", "cellY", "minZ", "maxZ"] as const
  if (!Array.isArray(heights) || heights.length === 0 || !numbers.every((k) => typeof value[k] === "number" && Number.isFinite(value[k]))) return undefined
  return value as unknown as Extract<Stock, { ok: true }>["preview"]
}
