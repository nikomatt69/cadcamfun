/**
 * What a tool result proves, read from the result itself (pure, so it is tested without a DOM). The transcript shows it under the
 * call the way Claude Code shows a test run under the command: the release level the CAM kernel gave the program, the claims that
 * passed, failed or stayed undecided (each failed one with the kernel's own detail), the verdict of a replay of the NC or of a
 * parametric rebuild, and the receipt of a write (which revision it replaced, or the revision that moved on under it).
 *
 * Nothing here upgrades a result: an unknown or missing field shows nothing, and a bounded model view whose claim list was cut
 * says the counts are partial instead of presenting them as the whole.
 */
import { actionOutcome, type ActionOutcomeStatus } from "@cadcamfun/api"

type Rec = Record<string, unknown>
const rec = (value: unknown): Rec | undefined => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Rec) : undefined)
const str = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined)

export type ReleaseLevel = "blocked" | "preview" | "verified-program"
const RELEASES: ReadonlyArray<string> = ["blocked", "preview", "verified-program"]
export type ClaimStatus = "passed" | "failed" | "unsupported" | "unresolved"
const CLAIM_STATUSES: ReadonlyArray<string> = ["passed", "failed", "unsupported", "unresolved"]

export interface EvidenceClaim {
  readonly id: string
  readonly status: ClaimStatus
  readonly detail: string
  readonly setup?: string
}

/** A verdict of a check: the NC replay (`clean` / `faults` / `incomplete`), a parametric rebuild (`valid` / `review` / `failed`), a lathe replay. */
export interface EvidenceVerdict {
  readonly source: "nc" | "parametric" | "lathe"
  readonly value: string
  /** Whether the verdict is a pass (`clean`, `valid`, `matches`); `review` and `incomplete` are neither pass nor fault. */
  readonly tone: "ok" | "warn" | "error"
  readonly reasons: ReadonlyArray<string>
}

export interface EvidenceWrite {
  readonly kind: "committed" | "conflict"
  readonly previousRevision?: string
  readonly revision?: string
}

export interface ToolEvidence {
  readonly outcome: ActionOutcomeStatus
  readonly release?: ReleaseLevel
  readonly claims: { readonly passed: number; readonly failed: number; readonly unsupported: number; readonly unresolved: number }
  /** Failed first, then unresolved: what keeps the program from `verified-program`. */
  readonly attention: ReadonlyArray<EvidenceClaim>
  /** The claim list was cut in a bounded view: the counts are of what was shown, not of every claim. */
  readonly partialClaims: boolean
  readonly verdict?: EvidenceVerdict
  readonly write?: EvidenceWrite
}

const parse = (output: string | undefined): unknown => {
  if (output === undefined || output === "") return undefined
  try { return JSON.parse(output) } catch { return undefined }
}

/** The answer itself: a version-control style `{ok, value}` wrapper is opened, an `artifact` inside a result is the program. */
const layers = (root: Rec): ReadonlyArray<Rec> => {
  const out: Rec[] = [root]
  const value = rec(root["value"])
  if (value !== undefined) out.push(value)
  for (const layer of [...out]) {
    const artifact = rec(layer["artifact"])
    if (artifact !== undefined) out.push(artifact)
    const result = rec(layer["result"])
    if (result !== undefined) out.push(result)
  }
  return out
}

const claimsOf = (list: unknown): ReadonlyArray<EvidenceClaim> => Array.isArray(list)
  ? list.flatMap((item) => {
    const c = rec(item)
    const id = str(c?.["id"]); const status = str(c?.["status"])
    if (c === undefined || id === undefined || status === undefined || !CLAIM_STATUSES.includes(status)) return []
    return [{ id, status: status as ClaimStatus, detail: str(c["detail"]) ?? "", ...(str(c["setup"]) !== undefined ? { setup: str(c["setup"])! } : {}) }]
  })
  : []

const VERDICT_TONES: Readonly<Record<string, EvidenceVerdict["tone"]>> = {
  clean: "ok", faults: "error", incomplete: "warn", valid: "ok", review: "warn", failed: "error", matches: "ok", differs: "error"
}

const verdictOf = (layer: Rec): EvidenceVerdict | undefined => {
  const strings = (value: unknown): ReadonlyArray<string> => (Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [])
  const own = str(layer["verdict"])
  if (own === "clean" || own === "faults" || own === "incomplete") return { source: "nc", value: own, tone: VERDICT_TONES[own]!, reasons: strings(layer["reasons"]) }
  if (own === "matches" || own === "differs") return { source: "lathe", value: own, tone: VERDICT_TONES[own]!, reasons: strings(layer["reasons"]) }
  const verification = rec(layer["verification"])
  const parametric = str(verification?.["verdict"]) ?? (own === "valid" || own === "review" || own === "failed" ? own : undefined)
  if (parametric === "valid" || parametric === "review" || parametric === "failed") {
    return { source: "parametric", value: parametric, tone: VERDICT_TONES[parametric]!, reasons: strings((verification ?? layer)["attention"]) }
  }
  return undefined
}

const writeOf = (layer: Rec): EvidenceWrite | undefined => {
  const receipt = rec(layer["receipt"])
  if (receipt !== undefined && str(receipt["revision"]) !== undefined) {
    return { kind: "committed", revision: str(receipt["revision"])!, ...(str(receipt["previousRevision"]) !== undefined ? { previousRevision: str(receipt["previousRevision"])! } : {}) }
  }
  if (layer["_tag"] === "ActionConflict" || layer["_tag"] === "ActionStale" || layer["status"] === "conflict" || layer["status"] === "stale") {
    return {
      kind: "conflict",
      ...(str(layer["expectedRevision"]) !== undefined ? { previousRevision: str(layer["expectedRevision"])! } : {}),
      ...(str(layer["actualRevision"]) !== undefined ? { revision: str(layer["actualRevision"])! } : {})
    }
  }
  return undefined
}

/** The evidence of one tool result, or undefined when it carries none (a plain read, a text answer). */
export const evidenceOf = (output: string | undefined): ToolEvidence | undefined => {
  const root = rec(parse(output))
  if (root === undefined) return undefined
  let release: ReleaseLevel | undefined
  let claims: ReadonlyArray<EvidenceClaim> = []
  let verdict: EvidenceVerdict | undefined
  let write: EvidenceWrite | undefined
  for (const layer of layers(root)) {
    const level = str(layer["release"])
    if (release === undefined && level !== undefined && RELEASES.includes(level)) release = level as ReleaseLevel
    if (claims.length === 0) claims = claimsOf(layer["claims"])
    verdict ??= verdictOf(layer)
    write ??= writeOf(layer)
  }
  if (release === undefined && claims.length === 0 && verdict === undefined && write === undefined) return undefined
  const count = (status: ClaimStatus) => claims.filter((c) => c.status === status).length
  const preview = rec(root["_preview"])
  const omitted = Array.isArray(preview?.["omitted"]) ? (preview!["omitted"] as unknown[]) : []
  // A cut list is named by its path; when the omissions themselves were cut (`omittedPaths`) or not listed, the claims may be among them.
  const partialClaims = preview !== undefined && (omitted.length === 0 || typeof preview["omittedPaths"] === "number" ||
    omitted.some((o) => /(^|\.)claims$/.test(String(rec(o)?.["path"] ?? ""))))
  return {
    outcome: actionOutcome(root),
    ...(release !== undefined ? { release } : {}),
    claims: { passed: count("passed"), failed: count("failed"), unsupported: count("unsupported"), unresolved: count("unresolved") },
    attention: [...claims.filter((c) => c.status === "failed"), ...claims.filter((c) => c.status === "unresolved")],
    partialClaims: partialClaims && claims.length > 0,
    ...(verdict !== undefined ? { verdict } : {}),
    ...(write !== undefined ? { write } : {})
  }
}

/** The weakest release among a turn's results: an answer is only as released as its least released program. */
export const weakestRelease = (levels: ReadonlyArray<ReleaseLevel | undefined>): ReleaseLevel | undefined => {
  const known = levels.filter((level): level is ReleaseLevel => level !== undefined)
  if (known.length === 0) return undefined
  return known.includes("blocked") ? "blocked" : known.includes("preview") ? "preview" : "verified-program"
}
