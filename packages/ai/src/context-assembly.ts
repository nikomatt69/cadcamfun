/**
 * One assembly for the context a chat turn carries (AI-11 Step 6). The sidecar acquires the sources the turn may see
 * (`AiContext`, `apps/sidecar/src/services/ai-context.ts`); this module orders them, applies one aggregate budget and says
 * what it left out. The renderers (`renderWorkspaceContext`, `renderProjectContext`, `renderProjectMemory`,
 * `renderUserHabits`, `renderNotes`) still shape each block; only the composition lives here.
 *
 * Each source is delivered at most once per turn (deduplicated by id and by text), in a fixed order of authority:
 * requirements (the user's standing rules), current observations (what the client measured now), UI snapshots (the editor
 * state the desktop saved), memory (Brain, habits, notes) and references. When the budget runs out, the lower kinds are
 * truncated or left out first, and the omission is named in the text the model reads, inside the same budget.
 */

/** What a block is to the model: an instruction it follows, a fact about now, a picture of the UI, a prior, or a pointer. */
export type ContextKind = "requirement" | "observation" | "ui-snapshot" | "memory" | "reference"

export const CONTEXT_KINDS: ReadonlyArray<ContextKind> = ["requirement", "observation", "ui-snapshot", "memory", "reference"]

export interface ContextSource {
  /** Stable identity of the source (`project-rules`, `workspace-snapshot`, `brain-memory`, `user-habits`, `notes`, ...). */
  readonly id: string
  readonly kind: ContextKind
  /** Short human label, used in the manifest and in omission notes. */
  readonly label: string
  /** The rendered block; empty means the source had nothing to say. */
  readonly text: string
  /** Effective timestamp (ms) of what the block describes, when known. */
  readonly at?: number
}

export interface ContextRequest {
  readonly actorId: string
  readonly projectId?: string
  readonly sessionId?: string
  readonly drawingId?: string
  /** Text the client sent for this turn (the current observation of the editor). */
  readonly explicit?: string
  /** False: only the explicit text is delivered; no stored source is acquired or injected. */
  readonly includeContext: boolean
  readonly budget?: number
}

export type OmissionReason = "budget" | "duplicate" | "empty" | "disabled"

export interface ContextManifestEntry {
  readonly id: string
  readonly kind: ContextKind
  readonly label: string
  readonly chars: number
  readonly truncated?: boolean
}

export interface ContextManifest {
  readonly budget: number
  readonly used: number
  readonly included: ReadonlyArray<ContextManifestEntry>
  readonly omitted: ReadonlyArray<{ readonly id: string; readonly kind: ContextKind; readonly label: string; readonly reason: OmissionReason }>
}

export interface ContextAssembly {
  readonly text: string
  readonly manifest: ContextManifest
}

/** Aggregate characters for one turn's context, labels and omission note included. */
export const CONTEXT_BUDGET = 24_000
/** A block cut to fewer characters than this is left out instead: a stub misleads more than it helps. */
const MIN_PARTIAL = 400
const SEPARATOR = "\n\n"
const TRUNCATED = "\n[... truncated to fit the context budget]"

const omissionNote = (omitted: ReadonlyArray<{ readonly label: string }>): string =>
  omitted.length === 0 ? "" : `<context_omitted>Not included to stay within the context budget: ${omitted.map((entry) => entry.label).join(", ")}. Read them with the tools when needed.</context_omitted>`

/** Orders, deduplicates and budgets the sources; never throws. */
export const assembleContext = (sources: ReadonlyArray<ContextSource>, budget: number = CONTEXT_BUDGET): ContextAssembly => {
  const limit = Math.max(0, Math.floor(Number.isFinite(budget) ? budget : CONTEXT_BUDGET))
  const omitted: Array<{ id: string; kind: ContextKind; label: string; reason: OmissionReason }> = []
  const seenIds = new Set<string>()
  const seenTexts = new Set<string>()
  const candidates: ContextSource[] = []
  const ordered = [...sources].map((source, index) => ({ source, index }))
    .sort((a, b) => CONTEXT_KINDS.indexOf(a.source.kind) - CONTEXT_KINDS.indexOf(b.source.kind) || a.index - b.index)
  for (const { source } of ordered) {
    const text = source.text.trim()
    if (text === "") { omitted.push({ id: source.id, kind: source.kind, label: source.label, reason: "empty" }); continue }
    if (seenIds.has(source.id) || seenTexts.has(text)) { omitted.push({ id: source.id, kind: source.kind, label: source.label, reason: "duplicate" }); continue }
    seenIds.add(source.id)
    seenTexts.add(text)
    candidates.push({ ...source, text })
  }

  const blocks: string[] = []
  const included: ContextManifestEntry[] = []
  const overBudget: Array<{ id: string; kind: ContextKind; label: string }> = []
  // Reserve room for the omission note of every later candidate, so the note itself never breaks the budget.
  const reserve = (from: number) => omissionNote(candidates.slice(from)).length + SEPARATOR.length
  let used = 0
  candidates.forEach((source, index) => {
    const separator = blocks.length === 0 ? 0 : SEPARATOR.length
    const room = limit - used - separator - (index < candidates.length - 1 ? reserve(index + 1) : 0)
    if (source.text.length <= room) {
      blocks.push(source.text)
      used += separator + source.text.length
      included.push({ id: source.id, kind: source.kind, label: source.label, chars: source.text.length })
      return
    }
    // The note for this source must fit too if it ends up omitted; partial blocks keep at least MIN_PARTIAL characters.
    const partial = room - TRUNCATED.length
    if (partial >= MIN_PARTIAL) {
      const text = source.text.slice(0, partial) + TRUNCATED
      blocks.push(text)
      used += separator + text.length
      included.push({ id: source.id, kind: source.kind, label: source.label, chars: text.length, truncated: true })
      return
    }
    overBudget.push({ id: source.id, kind: source.kind, label: source.label })
  })
  const note = omissionNote(overBudget)
  if (note !== "" && used + (blocks.length === 0 ? 0 : SEPARATOR.length) + note.length <= limit) {
    used += (blocks.length === 0 ? 0 : SEPARATOR.length) + note.length
    blocks.push(note)
  }
  for (const entry of overBudget) omitted.push({ ...entry, reason: "budget" })
  return { text: blocks.join(SEPARATOR), manifest: { budget: limit, used, included, omitted } }
}

/** Notes newest first by their effective timestamp (the renderer keeps the newest when it must drop some). */
export const notesByRecency = <A extends { readonly updatedAt?: string | number | Date | null }>(notes: ReadonlyArray<A>): ReadonlyArray<A> => {
  const time = (value: A["updatedAt"]): number => value === undefined || value === null ? 0 : new Date(value).getTime() || 0
  return [...notes].map((note, index) => ({ note, index })).sort((a, b) => time(b.note.updatedAt) - time(a.note.updatedAt) || a.index - b.index).map(({ note }) => note)
}
