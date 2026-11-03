/**
 * Which operation of a regenerated program is which operation of the stored one (spec 59 A5).
 *
 * An operation id names the feature behind it, so most operations pair by id. When a feature is moved or resized its id can change
 * (a drill id carries the diameter), so the remaining operations are paired by a geometric signature of what they machine: the strategy
 * and cut class, and the place, size and depth the tool path sweeps. A pair below the confidence is not made: a wrong carry-over of a
 * person's overrides is worse than reporting the override as dropped. Pure.
 */
import { toolpathBounds } from "../ir.ts"
import type { CamArtifact, OperationOutcome } from "./contracts.ts"

export interface OperationSignature {
  readonly strategy: OperationOutcome["strategy"]
  readonly cut: OperationOutcome["cut"]
  readonly cx: number
  readonly cy: number
  readonly width: number
  readonly height: number
  readonly minZ: number
}

export interface OperationPair {
  readonly before: string
  readonly after: string
  readonly by: "id" | "signature"
  /** 1 for an id match; for a signature match 1 minus the distance over the radius the match may span. */
  readonly confidence: number
}

export interface OperationMatching {
  readonly pairs: ReadonlyArray<OperationPair>
  readonly added: ReadonlyArray<string>
  readonly removed: ReadonlyArray<string>
  /** Operations of the old program with overrides of the person's that no pair carries over: listed so the loss is never silent. */
  readonly droppedOverrides: ReadonlyArray<{ readonly id: string; readonly parameters: ReadonlyArray<string>; readonly reason: string }>
  /** For each signature pair, the old operation's overridden parameters and their values, to set on the new operation. */
  readonly carried: ReadonlyArray<{ readonly before: string; readonly after: string; readonly parameters: Readonly<Record<string, unknown>> }>
}

export interface MatchOptions {
  /** The least confidence a signature pair needs (default 0.5). */
  readonly minConfidence?: number
}

/** The signature of each operation that has moves; an operation without a toolpath has none and pairs by id only. */
export const operationSignatures = (artifact: CamArtifact): ReadonlyMap<string, OperationSignature> => {
  const byId = new Map(artifact.program.toolpaths.map((t) => [t.id, t] as const))
  const out = new Map<string, OperationSignature>()
  for (const op of artifact.operations) {
    const toolpath = byId.get(op.id)
    if (toolpath === undefined) continue
    const b = toolpathBounds(toolpath)
    if (!(b.maxX >= b.minX) || ![b.minX, b.maxX, b.minY, b.maxY, b.minZ].every(Number.isFinite)) continue
    out.set(op.id, { strategy: op.strategy, cut: op.cut, cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, width: b.maxX - b.minX, height: b.maxY - b.minY, minZ: b.minZ })
  }
  return out
}

/** Distance between two signatures in mm, and the radius within which they may still be the same feature. */
const compare = (a: OperationSignature, b: OperationSignature): { readonly distance: number; readonly radius: number } => {
  const distance = Math.hypot(a.cx - b.cx, a.cy - b.cy) + 0.5 * (Math.abs(a.width - b.width) + Math.abs(a.height - b.height)) + 0.5 * Math.abs(a.minZ - b.minZ)
  // A feature may move or grow by about a third of its own size, and at least 4 mm.
  const size = Math.max(a.width, a.height, b.width, b.height)
  return { distance, radius: Math.max(4, size / 3) }
}

export const matchOperations = (before: CamArtifact, after: CamArtifact, options: MatchOptions = {}): OperationMatching => {
  const minConfidence = options.minConfidence ?? 0.5
  const oldOps = new Map(before.operations.map((o) => [o.id, o] as const))
  const pairs: OperationPair[] = []
  const usedOld = new Set<string>(), usedNew = new Set<string>()

  for (const next of after.operations) {
    const prev = oldOps.get(next.id)
    if (prev !== undefined && prev.strategy === next.strategy) {
      pairs.push({ before: prev.id, after: next.id, by: "id", confidence: 1 })
      usedOld.add(prev.id); usedNew.add(next.id)
    }
  }

  const sigOld = operationSignatures(before), sigNew = operationSignatures(after)
  const candidates: Array<{ readonly before: string; readonly after: string; readonly distance: number; readonly confidence: number }> = []
  for (const [oldId, a] of sigOld) {
    if (usedOld.has(oldId)) continue
    for (const [newId, b] of sigNew) {
      if (usedNew.has(newId) || a.strategy !== b.strategy || a.cut !== b.cut) continue
      const { distance, radius } = compare(a, b)
      const confidence = 1 - distance / radius
      if (confidence >= minConfidence) candidates.push({ before: oldId, after: newId, distance, confidence })
    }
  }
  // Greedy by distance, ties by id so the result never depends on iteration order.
  candidates.sort((x, y) => x.distance - y.distance || (x.before < y.before ? -1 : x.before > y.before ? 1 : x.after < y.after ? -1 : 1))
  for (const c of candidates) {
    if (usedOld.has(c.before) || usedNew.has(c.after)) continue
    pairs.push({ before: c.before, after: c.after, by: "signature", confidence: Math.round(c.confidence * 1000) / 1000 })
    usedOld.add(c.before); usedNew.add(c.after)
  }

  const added = after.operations.filter((o) => !usedNew.has(o.id)).map((o) => o.id)
  const removed = before.operations.filter((o) => !usedOld.has(o.id)).map((o) => o.id)

  const carried: Array<{ before: string; after: string; parameters: Record<string, unknown> }> = []
  for (const p of pairs) {
    if (p.by !== "signature") continue
    const prev = oldOps.get(p.before)!
    if (prev.overridden.length === 0) continue
    carried.push({ before: p.before, after: p.after, parameters: Object.fromEntries(prev.overridden.map((name) => [name, prev.parameters[name]])) })
  }
  const dropped = removed.flatMap((id) => {
    const op = oldOps.get(id)!
    return op.overridden.length > 0
      ? [{ id, parameters: [...op.overridden], reason: `no operation of the new program matches it with enough confidence (at least ${minConfidence}); its overrides were not carried over` }]
      : []
  })
  return { pairs, added, removed, droppedOverrides: dropped, carried }
}
