import { cam } from "@cadcamfun/core"
import { t } from "../../../i18n/index.ts"

type Status = ReturnType<typeof cam.kernel.programStatus>

/** The sentence for a model change (spec 59 A2), or nothing when the model is the same. */
export const modelChangeText = (change: Status): string | undefined => {
  if (change.status !== "stale") return undefined
  const count = change.added.length + change.removed.length + change.changed.length
  const round = (n: number): string => String(Math.round(n * 1000) / 1000)
  switch (change.class) {
    case "geometry": return t("cam.kernel.model.geometry", { count })
    case "topology": return t("cam.kernel.model.topology", { count })
    case "rigid": return t("cam.kernel.model.rigid", { x: round(change.move?.x ?? 0), y: round(change.move?.y ?? 0), z: round(change.move?.z ?? 0) })
    case "inputs": return t("cam.kernel.model.inputs", { settings: change.inputs.join(", ") })
  }
}

/** A stored program against the drawing it belongs to: what to say and how serious it is (`unknown` is never shown as current). */
export const programStatusText = (status: Status): { readonly tone: "ok" | "warn" | "muted"; readonly text: string; readonly detail?: string } => {
  if (status.status === "current") return { tone: "ok", text: t("cam.kernel.model.current") }
  if (status.status === "unknown") return { tone: "muted", text: t("cam.kernel.model.unknown"), detail: status.reason }
  return { tone: "warn", text: modelChangeText(status) ?? "", detail: status.reasons.join("; ") }
}

/** What `cam.kernel.programDiff` and the regeneration route's `diff` share: the part the sentences read. */
export interface DiffLike {
  readonly same: boolean
  readonly nc: { readonly identical: boolean }
  readonly operations: { readonly added: ReadonlyArray<unknown>; readonly removed: ReadonlyArray<unknown>; readonly changed: ReadonlyArray<unknown> }
  readonly cycleTimeSeconds: { readonly delta: number }
  readonly release: { readonly before: string; readonly after: string }
  readonly claims: ReadonlyArray<{ readonly id: string; readonly direction: string }>
  readonly safe: boolean
}

/** The sentences for what a regeneration changed (spec 59 A4); none when there was no program before it. */
export const diffLines = (diff: DiffLike | undefined): ReadonlyArray<string> => {
  if (diff === undefined) return []
  if (diff.same || diff.nc.identical) return [t("cam.kernel.diff.same")]
  const signed = (n: number): string => `${n >= 0 ? "+" : "-"}${Math.abs(n).toFixed(1)}`
  const lines = [t("cam.kernel.diff.summary", {
    added: diff.operations.added.length, removed: diff.operations.removed.length, changed: diff.operations.changed.length,
    seconds: signed(diff.cycleTimeSeconds.delta), before: diff.release.before, after: diff.release.after
  })]
  const worse = diff.claims.filter((c) => c.direction === "worse").map((c) => c.id)
  if (worse.length > 0) lines.push(t("cam.kernel.diff.worse", { claims: worse.join(", ") }))
  if (!diff.safe) lines.push(t("cam.kernel.diff.unsafe"))
  return lines
}
