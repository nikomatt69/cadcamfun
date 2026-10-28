import { createHash } from "node:crypto"

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

import { sealText } from "./untrusted.ts"

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
  /** Characters of the observation (editor state) part; default `OBSERVATION_BUDGET`. */
  readonly observationBudget?: number
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

/** The sources whose renderer frames its own text in a tag: the frame is ours, only the text inside it is somebody's. */
const OWN_FRAMES: Readonly<Record<string, string>> = {
  "project-rules": "memory action context_read",
  "brain-memory": "project_memory",
  "user-habits": "user_habits"
}

/**
 * Last line of defence (spec 64): whatever a source contains, it cannot close or forge a delimiter of ours, start a
 * `Current context:` header, carry a control or invisible character, or imitate a chat-template token. A source with its own
 * frame keeps that frame; everything else (client text, a stored snapshot string, rendered labels) is sealed whole.
 */
const sealSource = (id: string, text: string): string => {
  const tag = Object.hasOwn(OWN_FRAMES, id) ? OWN_FRAMES[id]! : undefined
  if (tag !== undefined) {
    const open = `<${tag}>\n`, close = `\n</${tag}>`
    const trimmed = text.trim()
    if (trimmed.startsWith(open) && trimmed.endsWith(close) && trimmed.length >= open.length + close.length) {
      return `${open}${sealText(trimmed.slice(open.length, trimmed.length - close.length))}${close}`
    }
  }
  return sealText(text)
}

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
    const text = sealSource(source.id, source.text).trim()
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

/*
 * Stable context and observation (spec 64 Phase 1, nikcli `session/instruction-sync.ts`).
 *
 * The provider caches the request prefix. Requirements, memory and references change when the user edits the rules or Brain
 * rewrites memory, so they stay in the turn's system block. What the editor shows right now changes between most turns: inside
 * the system block it would move the prefix in front of the whole conversation. It is delivered instead as one synthetic text
 * part of the turn's user message, and only when it differs from the observation last delivered in the session, so the
 * history is append-only. The hash of the last delivery is stored as an attribute of that part in the host session.
 */

/** Kinds that describe what the editor shows now; they leave the system block and travel as the observation. */
export const OBSERVATION_KINDS: ReadonlyArray<ContextKind> = ["observation", "ui-snapshot"]
/** Characters of observation per turn: header, counts, selection, active layer, machine. The rest is read with the tools. */
export const OBSERVATION_BUDGET = 2_000

const isObservation = (source: { readonly kind: ContextKind }): boolean => OBSERVATION_KINDS.includes(source.kind)

export interface ContextParts {
  /** Requirements, memory and references: the text of the turn's system block. */
  readonly stable: ContextAssembly
  /** Observation and UI snapshot: the text of the observation part. */
  readonly observation: ContextAssembly
  /** Newest effective timestamp (ms) among the included observation sources, when one is known. */
  readonly observationAt?: number
  /** Both manifests as one, stable first. */
  readonly manifest: ContextManifest
}

export interface ContextPartsOptions {
  /** Budget of the stable text (default `CONTEXT_BUDGET`). */
  readonly budget?: number
  /** Budget of the observation text (default `OBSERVATION_BUDGET`). */
  readonly observationBudget?: number
}

/** `assembleContext` applied to the stable kinds and to the observation kinds separately, each inside its own budget. */
export const assembleContextParts = (sources: ReadonlyArray<ContextSource>, options: ContextPartsOptions = {}): ContextParts => {
  const stable = assembleContext(sources.filter((source) => !isObservation(source)), options.budget)
  const observation = assembleContext(sources.filter(isObservation), options.observationBudget ?? OBSERVATION_BUDGET)
  const included = new Set(observation.manifest.included.map((entry) => entry.id))
  const times = sources.filter((source) => isObservation(source) && included.has(source.id) && source.at !== undefined && Number.isFinite(source.at)).map((source) => source.at!)
  return {
    stable, observation,
    ...(times.length > 0 ? { observationAt: Math.max(...times) } : {}),
    manifest: {
      budget: stable.manifest.budget + observation.manifest.budget,
      used: stable.manifest.used + observation.manifest.used,
      included: [...stable.manifest.included, ...observation.manifest.included],
      omitted: [...stable.manifest.omitted, ...observation.manifest.omitted]
    }
  }
}

/** Where a section of the context travels: in the turn's system block, or in the user message as the observation part. */
export type ContextPlacement = "system" | "message"

/** One included source as the context gauge reads it: what it is, how much, where it goes. */
export interface ContextSection {
  readonly id: string
  readonly kind: ContextKind
  readonly label: string
  readonly chars: number
  /** nikcli's `Token.estimate`: four characters per token. */
  readonly tokens: number
  readonly truncated?: boolean
  readonly placement: ContextPlacement
}

const tokensOf = (chars: number): number => Math.max(0, Math.round(chars / 4))

export const contextSections = (parts: ContextParts): ReadonlyArray<ContextSection> => [
  ...parts.stable.manifest.included.map((entry): ContextSection => ({ ...entry, tokens: tokensOf(entry.chars), placement: "system" })),
  ...parts.observation.manifest.included.map((entry): ContextSection => ({ ...entry, tokens: tokensOf(entry.chars), placement: "message" }))
]

/** The observation of a turn, rendered by the caller's assembly: text, the drawing it describes, when it was captured. */
export interface ObservationInput {
  readonly text: string
  readonly drawingId?: string
  /** Revision of the drawing or snapshot when the caller knows one; it is part of the digest. */
  readonly revision?: string
  /** ISO time the observation describes (default: the delivery time). */
  readonly at?: string
}

/** The synthetic text part that carries an observation into the host session. `metadata` is the attribute the next turn reads back. */
export interface ObservationPart {
  readonly type: "text"
  readonly text: string
  readonly synthetic: true
  readonly metadata: Readonly<Record<string, string>>
}

/** Part attribute holding the digest of the observation the part delivered. */
export const OBSERVATION_METADATA_KEY = "cadcamObservation"

export const OBSERVATION_SUPERSEDED = "The newest editor_state supersedes every earlier editor_state in this conversation."

/**
 * The text that identifies an observation. The line `renderWorkspaceContext` writes with the capture time (`Snapshot: ...`)
 * is left out: a snapshot saved again without a change must not count as a new observation.
 */
const digestText = (text: string): string => text.split(/\r?\n/).filter((line) => !line.startsWith("Snapshot: ")).join("\n").trim()

/** Equal observation, equal digest: 16 hex digits of the SHA-256 over drawing, revision and text. */
export const observationDigest = (input: ObservationInput): string =>
  createHash("sha256").update(JSON.stringify([input.drawingId ?? "", input.revision ?? "", digestText(input.text)])).digest("hex").slice(0, 16)

const attribute = (value: string): string => value.replace(/[&"<>\r\n\t]/g, (char) => char === "&" ? "&amp;" : char === '"' ? "&quot;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : " ")

/** `<editor_state ...>` around the observation; a closing tag inside the text cannot end the block early. */
export const renderObservation = (input: ObservationInput, now: Date = new Date()): string => {
  const at = input.at !== undefined && Number.isFinite(Date.parse(input.at)) ? new Date(input.at).toISOString() : now.toISOString()
  const attributes = [
    input.drawingId !== undefined && input.drawingId !== "" ? ` drawing="${attribute(input.drawingId)}"` : "",
    input.revision !== undefined && input.revision !== "" ? ` revision="${attribute(input.revision)}"` : "",
    ` at="${at}"`
  ].join("")
  return `<editor_state${attributes}>\n${input.text.trim().replaceAll("</editor_state", "<\\/editor_state")}\n</editor_state>\n${OBSERVATION_SUPERSEDED}`
}

export interface ObservationPlan {
  /** Digest of the observation; absent when the turn has none. */
  readonly digest?: string
  /** The part to append to the user message; absent when the turn has no observation or the session already holds it. */
  readonly part?: ObservationPart
  readonly status: "sent" | "unchanged" | "none"
}

/**
 * Decides whether this turn's observation is new to the session. `delivered` is the digest read back from the session's last
 * observation part (see `deliveredObservationDigest`); equal digest sends nothing, so the conversation prefix stays put.
 */
export const planObservation = (input: ObservationInput | undefined, delivered: string | undefined, now: Date = new Date()): ObservationPlan => {
  if (input === undefined || input.text.trim() === "") return { status: "none" }
  const digest = observationDigest(input)
  if (digest === delivered) return { digest, status: "unchanged" }
  return { digest, status: "sent", part: { type: "text", text: renderObservation(input, now), synthetic: true, metadata: { [OBSERVATION_METADATA_KEY]: digest } } }
}

/** The part of a stored host message the digest is read from. */
export interface StoredPart { readonly type: string; readonly metadata?: Readonly<Record<string, unknown>> }
export interface StoredMessage { readonly info: { readonly role: string; readonly summary?: boolean }; readonly parts: ReadonlyArray<StoredPart> }

/**
 * The digest of the observation last delivered in the session: the newest observation part among `messages` (oldest first).
 * A compaction summary ends the search. What came before it is folded into the summary, so the observation is sent again
 * rather than assumed to be in the model's view.
 */
export const deliveredObservationDigest = (messages: ReadonlyArray<StoredMessage>): string | undefined => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!
    if (message.info.summary === true) return undefined
    if (message.info.role !== "user") continue
    for (let at = message.parts.length - 1; at >= 0; at--) {
      const part = message.parts[at]!
      const digest = part.type === "text" ? part.metadata?.[OBSERVATION_METADATA_KEY] : undefined
      if (typeof digest === "string" && digest !== "") return digest
    }
  }
  return undefined
}

/** Notes newest first by their effective timestamp (the renderer keeps the newest when it must drop some). */
export const notesByRecency = <A extends { readonly updatedAt?: string | number | Date | null }>(notes: ReadonlyArray<A>): ReadonlyArray<A> => {
  const time = (value: A["updatedAt"]): number => value === undefined || value === null ? 0 : new Date(value).getTime() || 0
  return [...notes].map((note, index) => ({ note, index })).sort((a, b) => time(b.note.updatedAt) - time(a.note.updatedAt) || a.index - b.index).map(({ note }) => note)
}
