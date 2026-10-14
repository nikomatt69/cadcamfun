/**
 * The two faces of one tool result. The validated value is delivered whole: to Code Mode (`result.value`), to the
 * stored part (`metadata.value`) and to the desktop. The model reads a bounded JSON text of that value: when it does
 * not fit, long lists keep their head and long strings their start, and a `_preview` block says exactly what was left
 * out (path, total, returned). Identity, receipts, revisions, ids and verdicts are never shortened, so the text can
 * still name what changed and the consumer that needs the rest reads the value instead.
 *
 * The host would otherwise cut an over-long text mid-JSON and point the model at a file it has no tool to read.
 */
import { actionOutcome, type ActionOutcomeStatus } from "@cadcamfun/api"

/** The model text budget for one tool result, in characters; below the host's own 50 KB truncation. */
export const MODEL_TEXT_BUDGET = 24_000

/** Keys whose values are carried in full whatever their size: what a consumer needs to name, trust or reconcile a result. */
const PROTECTED = new Set([
  "ok", "_tag", "status", "error", "message", "actionId", "receipt", "identity", "revision", "expectedRevision", "actualRevision",
  "programHash", "drawingId", "projectId", "operationId", "elementId", "componentId", "ids", "missingIds", "removed", "total",
  "returned", "omitted", "complete", "nextOffset", "offset", "release", "mutation", "mode", "skipped", "problems"
])

export interface Omission {
  readonly path: string
  readonly total: number
  readonly returned: number
  readonly unit: "items" | "characters"
}

export interface ToolOutput {
  /** What the model reads. */
  readonly text: string
  /** Whether `text` leaves anything out of `value`. */
  readonly bounded: boolean
  readonly omissions: ReadonlyArray<Omission>
  readonly outcome: ActionOutcomeStatus
}

const json = (value: unknown): string | undefined => {
  try { return JSON.stringify(value) } catch { return undefined }
}

/** One shrinking pass: lists keep `items` entries, strings `chars` characters, protected keys stay whole. */
const shrink = (value: unknown, items: number, chars: number, path: string, omissions: Omission[]): unknown => {
  if (typeof value === "string") {
    if (value.length <= chars) return value
    omissions.push({ path: path || "$", total: value.length, returned: chars, unit: "characters" })
    return `${value.slice(0, chars)}…`
  }
  if (Array.isArray(value)) {
    const kept = value.slice(0, items).map((item, index) => shrink(item, items, chars, `${path}[${index}]`, omissions))
    if (value.length > items) omissions.push({ path: path || "$", total: value.length, returned: items, unit: "items" })
    return kept
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) =>
      [key, PROTECTED.has(key) ? child : shrink(child, items, chars, path === "" ? key : `${path}.${key}`, omissions)]))
  }
  return value
}

/** Shrinking schedule: from generous to tight. The last step still keeps every protected field. */
const STEPS: ReadonlyArray<readonly [number, number]> = [[200, 4000], [80, 2000], [40, 1000], [20, 400], [10, 200], [5, 120], [2, 80], [1, 60], [0, 40]]

export const toolOutput = (value: unknown, budget: number = MODEL_TEXT_BUDGET): ToolOutput => {
  const outcome = actionOutcome(value)
  const full = json(value)
  if (full === undefined) {
    return { text: JSON.stringify({ ok: false, error: "Tool returned a value that cannot be serialized." }), bounded: false, omissions: [], outcome: "refused" }
  }
  if (full.length <= budget) return { text: full, bounded: false, omissions: [], outcome }
  for (const [items, chars] of STEPS) {
    const omissions: Omission[] = []
    const shrunk = shrink(value, items, chars, "", omissions)
    const preview = {
      complete: false,
      fullCharacters: full.length,
      omitted: omissions.slice(0, 20),
      ...(omissions.length > 20 ? { omittedPaths: omissions.length - 20 } : {}),
      note: "Bounded view of a larger result. The full value was delivered to code_mode and stored with this call; narrow the request (ids, offset, limit) to read the rest here."
    }
    const text = json(Array.isArray(shrunk) ? { items: shrunk, _preview: preview } : shrunk !== null && typeof shrunk === "object" ? { ...shrunk, _preview: preview } : { value: shrunk, _preview: preview })
    if (text !== undefined && text.length <= budget) return { text, bounded: true, omissions, outcome }
  }
  // Protected fields alone exceed the budget (a batch with thousands of ids): keep the verdict and say where the rest is.
  const record = value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const verdict = Object.fromEntries(["ok", "_tag", "status", "error", "operationId", "drawingId", "projectId", "revision", "programHash"].filter((key) => key in record).map((key) => [key, record[key]]))
  const text = JSON.stringify({ ...verdict, _preview: { complete: false, fullCharacters: full.length, note: "The result is too large to show; it was delivered whole to code_mode and stored with this call." } })
  return { text, bounded: true, omissions: [{ path: "$", total: full.length, returned: 0, unit: "characters" }], outcome }
}
