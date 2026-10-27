/**
 * Corpus runner (spec 55 §2, E1). Every entry is run and classified:
 *   pass      the result matches the oracle within its tolerances and the budget
 *   refused   the kernel declined with a reason the refusal registry knows (allowed, reported)
 *   wrong     anything else: a value off its oracle, an invalid solid, an unregistered refusal, a changed input,
 *             or an expected refusal that no longer happens (the oracle has to be written). `wrong` fails CI.
 *   slow      correct, but over the entry's time budget
 * The oracles are analytic (the formula is in the entry), never a value the kernel produced and was recorded.
 */
import { createHash } from "node:crypto"
import { massProperties } from "../../src/cad/brep/mass.ts"
import { validateBrep } from "../../src/cad/brep/validate.ts"
import { rebuildExact } from "../../src/cad/history-brep.ts"
import { rebuild } from "../../src/cad/history.ts"
import { meshVolume } from "../../src/cad/solid.ts"
import { historyOf, type CorpusSource } from "./fixtures.ts"
import manifestJson from "./corpus.json"
import refusalsJson from "./refusals.json"

export type Expected =
  | {
    readonly outcome: "pass"
    readonly bodies: number
    /** Exact volume of the first body, mm³, from `formula`. */
    readonly volume: number
    readonly formula: string
    /** Relative tolerance of the exact volume. */
    readonly volumeRelTol: number
    /** Relative tolerance of the display mesh's volume against the same oracle. */
    readonly meshRelTol: number
  }
  | { readonly outcome: "refused"; readonly refusal: string }

export interface CorpusEntry {
  readonly id: string
  readonly set: "a" | "b" | "c" | "d"
  readonly kind: "history"
  readonly source: CorpusSource
  readonly licence: string
  /** sha256 of the canonical JSON of the input history. */
  readonly hash: string
  readonly budgetMs: number
  /** Scorecard capabilities this entry is evidence for (spec 55 §5). */
  readonly capabilities: ReadonlyArray<string>
  readonly expected: Expected
}

export interface Refusal {
  readonly id: string
  /** Substring of the kernel's refusal text. */
  readonly match: string
  /** Where the refusal is decided or specified. */
  readonly spec: string
  readonly note: string
}

export type Outcome = "pass" | "refused" | "wrong" | "slow"

export interface EntryResult {
  readonly id: string
  readonly outcome: Outcome
  readonly detail: string
  readonly ms: number
  readonly measured?: { readonly volume?: number; readonly meshVolume?: number }
}

export const CORPUS: ReadonlyArray<CorpusEntry> = manifestJson.entries as ReadonlyArray<CorpusEntry>
export const REFUSALS: ReadonlyArray<Refusal> = refusalsJson.refusals as ReadonlyArray<Refusal>

/** JSON with sorted keys, so a hash does not depend on the order fields were written in. */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`
  }
  return JSON.stringify(value)
}
export const hashOf = (value: unknown): string => `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`

/** Problems of the manifest itself: duplicate ids, refusals the registry does not know, impossible tolerances. */
export const manifestProblems = (entries: ReadonlyArray<CorpusEntry>, refusals: ReadonlyArray<Refusal>): string[] => {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    if (seen.has(e.id)) problems.push(`${e.id}: duplicate id`)
    seen.add(e.id)
    if (!(e.budgetMs > 0)) problems.push(`${e.id}: budget must be positive`)
    if (e.capabilities.length === 0) problems.push(`${e.id}: names no capability`)
    if (e.expected.outcome === "refused" && !refusals.some((r) => r.id === (e.expected as { refusal: string }).refusal)) problems.push(`${e.id}: refusal '${e.expected.refusal}' is not in the registry`)
    if (e.expected.outcome === "pass" && !(e.expected.volume > 0 && e.expected.volumeRelTol > 0 && e.expected.meshRelTol > 0 && e.expected.formula.trim() !== "")) problems.push(`${e.id}: an oracle needs a volume, a formula and positive tolerances`)
  }
  return problems
}

/** What a run measured, before it is judged; kept apart so the classification can be tested on its own. */
export interface Measurement {
  readonly hash: string
  readonly ms: number
  readonly meshErrors: ReadonlyArray<string>
  readonly bodies: ReadonlyArray<{ readonly volume?: number; readonly valid?: boolean; readonly reason?: string }>
  readonly meshVolume?: number
}

const rel = (got: number, want: number): number => Math.abs(got - want) / Math.abs(want)

export const classify = (entry: CorpusEntry, m: Measurement, refusals: ReadonlyArray<Refusal> = REFUSALS): Omit<EntryResult, "id" | "ms"> => {
  const e = entry.expected
  const measured = { ...(m.bodies[0]?.volume !== undefined ? { volume: m.bodies[0].volume } : {}), ...(m.meshVolume !== undefined ? { meshVolume: m.meshVolume } : {}) }
  const wrong = (detail: string) => ({ outcome: "wrong" as const, detail, measured })
  if (m.hash !== entry.hash) return wrong(`the input changed (${m.hash.slice(0, 19)}…, manifest ${entry.hash.slice(0, 19)}…): re-derive the oracle, then update the hash`)
  // A refusal reaches the caller two ways: a feature the rebuild declines (an error on it, the exact replay then skips it too)
  // or an exact body that carries a reason. Both are matched against the registry.
  const refusalTexts = [...m.meshErrors, ...m.bodies.flatMap((b) => (b.reason !== undefined ? [b.reason] : []))]
  const registered = (text: string) => refusals.find((r) => text.toLowerCase().includes(r.match.toLowerCase()))
  if (e.outcome === "refused") {
    if (refusalTexts.length === 0) return wrong(`expected the refusal '${e.refusal}', got an exact model: write its oracle`)
    return refusalTexts.some((t) => registered(t)?.id === e.refusal)
      ? { outcome: "pass", detail: `refused as expected (${e.refusal})`, measured }
      : wrong(`expected the refusal '${e.refusal}', got: ${refusalTexts.join("; ")}`)
  }
  const unknown = refusalTexts.filter((t) => registered(t) === undefined)
  if (unknown.length > 0) return wrong(`${m.meshErrors.includes(unknown[0]!) ? "rebuild error" : "unregistered refusal"}: ${unknown.join("; ")}`)
  if (refusalTexts.length > 0) return { outcome: "refused", detail: refusalTexts.map((t) => `${registered(t)!.id}: ${t}`).join("; "), measured }
  if (m.bodies.length !== e.bodies) return wrong(`${m.bodies.length} bodies, expected ${e.bodies}`)
  const first = m.bodies[0]!
  if (first.valid !== true) return wrong("the exact body is not a valid closed solid")
  if (first.volume === undefined || rel(first.volume, e.volume) > e.volumeRelTol) return wrong(`exact volume ${first.volume?.toFixed(6)} mm³, oracle ${e.volume} (${e.formula}), relative error ${first.volume === undefined ? "n/a" : rel(first.volume, e.volume).toExponential(2)} > ${e.volumeRelTol}`)
  if (m.meshVolume === undefined || rel(m.meshVolume, e.volume) > e.meshRelTol) return wrong(`mesh volume ${m.meshVolume?.toFixed(3)} mm³ is ${m.meshVolume === undefined ? "missing" : `${rel(m.meshVolume, e.volume).toExponential(2)} off the oracle`} (> ${e.meshRelTol})`)
  if (m.ms > entry.budgetMs) return { outcome: "slow", detail: `${Math.round(m.ms)} ms over the ${entry.budgetMs} ms budget`, measured }
  return { outcome: "pass", detail: `exact volume within ${rel(first.volume, e.volume).toExponential(1)}`, measured }
}

/** Builds, rebuilds (mesh and exact) and measures one entry. Never throws: a crash is a `wrong` result. */
export const measure = (entry: CorpusEntry): Measurement => {
  const history = historyOf(entry.source)
  const hash = hashOf(history)
  const started = performance.now()
  const result = rebuild(history)
  // The exact replay gets room past the budget, so a slow entry is measured instead of cut off; a hang still ends.
  const exact = rebuildExact(history, result, { budgetMs: Math.max(60_000, entry.budgetMs * 5) })
  const ms = performance.now() - started
  return {
    hash, ms,
    meshErrors: result.issues.filter((i) => i.severity === "error").map((i) => `${i.feature}: ${i.message}`),
    bodies: exact.bodies.map((b) => b.brep === undefined
      ? { reason: b.reason ?? "no exact model" }
      : { volume: massProperties(b.brep).volume, valid: (() => { const r = validateBrep(b.brep); return r.valid && r.manifoldSolid })() }),
    ...(result.bodies[0] !== undefined ? { meshVolume: Math.abs(meshVolume(result.bodies[0].mesh)) } : {})
  }
}

export const runEntry = (entry: CorpusEntry): EntryResult => {
  const started = performance.now()
  try {
    const m = measure(entry)
    return { id: entry.id, ms: Math.round(m.ms), ...classify(entry, m) }
  } catch (error) {
    return { id: entry.id, outcome: "wrong", detail: `crashed: ${error instanceof Error ? error.message : String(error)}`, ms: Math.round(performance.now() - started) }
  }
}

export const countOutcomes = (results: ReadonlyArray<EntryResult>): Record<Outcome, number> => {
  const counts: Record<Outcome, number> = { pass: 0, refused: 0, wrong: 0, slow: 0 }
  for (const r of results) counts[r.outcome]++
  return counts
}

export const renderTable = (results: ReadonlyArray<EntryResult>): string => {
  const width = Math.max(4, ...results.map((r) => r.id.length))
  const rows = results.map((r) => `${r.id.padEnd(width)}  ${r.outcome.padEnd(7)}  ${String(r.ms).padStart(7)} ms  ${r.detail}`)
  const c = countOutcomes(results)
  return [`${"id".padEnd(width)}  outcome       time  detail`, ...rows, `${c.pass} pass, ${c.refused} refused, ${c.wrong} wrong, ${c.slow} slow`].join("\n")
}
