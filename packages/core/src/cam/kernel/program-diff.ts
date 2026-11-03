/**
 * The difference between two kernel programs (spec 59 A4): what a regeneration would change, shown before it is accepted.
 * Operations are matched by id (the planner's ids are stable for the same feature); a rename of the feature behind an id is
 * a change the diff shows, not a carry-over. Pure: it reads two artifacts and stores nothing.
 */
import type { CamArtifact, Claim, OperationOutcome } from "./contracts.ts"
import { canonicalJson } from "./identity.ts"

const EPS_TIME = 0.05
const EPS_LENGTH = 0.01
const EPS_VOLUME = 0.5

export type OperationField = "status" | "strategy" | "tool" | "cut" | "parameters" | "cutLength" | "time" | "removedVolume"

export interface OperationChange {
  readonly id: string
  readonly name: string
  readonly fields: ReadonlyArray<OperationField>
  readonly timeSeconds: { readonly before: number; readonly after: number }
  readonly removedVolume: { readonly before: number; readonly after: number }
  /** The parameters whose value differs, by name. */
  readonly parameters: ReadonlyArray<string>
}

export interface ClaimChange {
  readonly id: string
  readonly before: Claim["status"] | "absent"
  readonly after: Claim["status"] | "absent"
  /** `worse` when the claim went from passed to anything else, `better` for the reverse, `changed` otherwise. */
  readonly direction: "worse" | "better" | "changed"
}

export interface ProgramDiff {
  readonly same: boolean
  readonly operations: {
    readonly added: ReadonlyArray<{ readonly id: string; readonly name: string }>
    readonly removed: ReadonlyArray<{ readonly id: string; readonly name: string }>
    readonly changed: ReadonlyArray<OperationChange>
  }
  readonly tools: { readonly added: ReadonlyArray<string>; readonly removed: ReadonlyArray<string> }
  readonly cycleTimeSeconds: { readonly before: number; readonly after: number; readonly delta: number }
  readonly removedVolume: { readonly before: number; readonly after: number; readonly delta: number }
  readonly claims: ReadonlyArray<ClaimChange>
  readonly release: { readonly before: CamArtifact["release"]; readonly after: CamArtifact["release"]; readonly direction: "same" | "lower" | "higher" }
  readonly nc: { readonly linesBefore: number; readonly linesAfter: number; readonly linesAdded: number; readonly linesRemoved: number; readonly identical: boolean }
  /** Whether accepting the new program loses nothing: the release is not lower and no claim got worse. */
  readonly safe: boolean
}

const RANK: Readonly<Record<CamArtifact["release"], number>> = { blocked: 0, preview: 1, "verified-program": 2 }

const parameterDiff = (a: OperationOutcome["parameters"], b: OperationOutcome["parameters"]): string[] => {
  const names = new Set([...Object.keys(a), ...Object.keys(b)])
  const out: string[] = []
  for (const name of names) {
    let same: boolean
    try { same = canonicalJson(a[name] ?? null) === canonicalJson(b[name] ?? null) } catch { same = a[name] === b[name] }
    if (!same) out.push(name)
  }
  return out.sort()
}

/** Lines of `a` and `b` as multisets: a line-diff summary that does not depend on order (a regenerated program often shifts line numbers). */
const lineCounts = (nc: string): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const line of nc.split("\n")) counts.set(line, (counts.get(line) ?? 0) + 1)
  return counts
}

export const programDiff = (before: CamArtifact, after: CamArtifact): ProgramDiff => {
  const oldOps = new Map(before.operations.map((o) => [o.id, o] as const))
  const newOps = new Map(after.operations.map((o) => [o.id, o] as const))
  const added = after.operations.filter((o) => !oldOps.has(o.id)).map((o) => ({ id: o.id, name: o.name }))
  const removed = before.operations.filter((o) => !newOps.has(o.id)).map((o) => ({ id: o.id, name: o.name }))
  const changed: OperationChange[] = []
  for (const next of after.operations) {
    const prev = oldOps.get(next.id)
    if (prev === undefined) continue
    const fields: OperationField[] = []
    if (prev.status !== next.status) fields.push("status")
    if (prev.strategy !== next.strategy) fields.push("strategy")
    if (prev.toolId !== next.toolId) fields.push("tool")
    if (prev.cut !== next.cut) fields.push("cut")
    const parameters = parameterDiff(prev.parameters, next.parameters)
    if (parameters.length > 0) fields.push("parameters")
    if (Math.abs(prev.cutLength - next.cutLength) > EPS_LENGTH) fields.push("cutLength")
    if (Math.abs(prev.timeSeconds - next.timeSeconds) > EPS_TIME) fields.push("time")
    if (Math.abs(prev.removedVolume - next.removedVolume) > EPS_VOLUME) fields.push("removedVolume")
    if (fields.length > 0) {
      changed.push({
        id: next.id, name: next.name, fields, parameters,
        timeSeconds: { before: prev.timeSeconds, after: next.timeSeconds }, removedVolume: { before: prev.removedVolume, after: next.removedVolume }
      })
    }
  }

  const oldTools = new Set(before.tools.map((t) => t.id)), newTools = new Set(after.tools.map((t) => t.id))
  const toolsAdded = [...newTools].filter((id) => !oldTools.has(id)).sort()
  const toolsRemoved = [...oldTools].filter((id) => !newTools.has(id)).sort()

  const oldClaims = new Map(before.claims.map((c) => [c.id, c.status] as const))
  const newClaims = new Map(after.claims.map((c) => [c.id, c.status] as const))
  const claims: ClaimChange[] = []
  for (const id of new Set([...oldClaims.keys(), ...newClaims.keys()])) {
    const a = oldClaims.get(id) ?? "absent", b = newClaims.get(id) ?? "absent"
    if (a === b) continue
    claims.push({ id, before: a, after: b, direction: a === "passed" ? "worse" : b === "passed" ? "better" : "changed" })
  }
  claims.sort((x, y) => (x.id < y.id ? -1 : 1))

  const removedBefore = before.stock.initialVolume - before.stock.finalVolume
  const removedAfter = after.stock.initialVolume - after.stock.finalVolume

  const a = lineCounts(before.nc), b = lineCounts(after.nc)
  let linesAdded = 0, linesRemoved = 0
  for (const [line, n] of b) linesAdded += Math.max(0, n - (a.get(line) ?? 0))
  for (const [line, n] of a) linesRemoved += Math.max(0, n - (b.get(line) ?? 0))
  const direction = RANK[after.release] === RANK[before.release] ? "same" : RANK[after.release] < RANK[before.release] ? "lower" : "higher"
  const identical = before.nc === after.nc

  const diff = {
    operations: { added, removed, changed },
    tools: { added: toolsAdded, removed: toolsRemoved },
    cycleTimeSeconds: { before: before.cycleTimeSeconds, after: after.cycleTimeSeconds, delta: after.cycleTimeSeconds - before.cycleTimeSeconds },
    removedVolume: { before: removedBefore, after: removedAfter, delta: removedAfter - removedBefore },
    claims,
    release: { before: before.release, after: after.release, direction },
    nc: { linesBefore: before.nc.split("\n").length, linesAfter: after.nc.split("\n").length, linesAdded, linesRemoved, identical }
  } as const
  return {
    same: identical && added.length === 0 && removed.length === 0 && changed.length === 0 && claims.length === 0 && direction === "same",
    ...diff,
    safe: direction !== "lower" && !claims.some((c) => c.direction === "worse")
  }
}
