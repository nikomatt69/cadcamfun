/**
 * Whether a probe operation can be written as the control's own cycle (spec 73 §5.9): Renishaw `G65 P98xx`, Heidenhain `TCH PROBE 4xx`,
 * Siemens `CYCLE97x`. The answer is the core's (`nativeCycle` on the locally planned routine with the actions the program would carry),
 * so the panel refuses exactly what the post refuses and names the same reason. A native cycle is the vendor's code: the simulation
 * replays the inline touches it stands for, never the cycle itself.
 */
import { CamProbingDialect } from "@cadcamfun/api"
import { Schema } from "effect"
import { nativeCycle, probing, type MacroStyle, type MachineProfile } from "./contract.ts"
import { actionsOf, planLocal, type ProbeOperation } from "./operation.ts"
import { contextOf, type ResolveInput } from "./resolve.ts"

export type NativeStatus =
  | { readonly ok: true; readonly style: Exclude<MacroStyle, "inline">; readonly word: string }
  | { readonly ok: false; readonly reason: "noPackage" | "refused"; readonly detail?: string }

/** The machine's cycle package, when it has one (`probing.macroStyle`; `inline` is none). */
export const macroStyleOf = (profile: Pick<MachineProfile, "probing"> | undefined): Exclude<MacroStyle, "inline"> | undefined => {
  const style = profile?.probing?.macroStyle
  return style === undefined || style === "inline" ? undefined : style
}

/** What `native` would write for this operation on this machine, or why it cannot. */
export const nativeStatusOf = (op: ProbeOperation, input: ResolveInput): NativeStatus => {
  const style = macroStyleOf(input.profile)
  if (style === undefined) return { ok: false, reason: "noPackage" }
  const planned = planLocal(op, input)
  if (!planned.ok) return { ok: false, reason: "refused", detail: planned.reason }
  const decoded = Schema.decodeUnknownOption(Schema.Array(probing.ProbeActionSchema))(actionsOf(op))
  if (decoded._tag === "None") return { ok: false, reason: "refused", detail: "the actions of the operation are not valid" }
  const settings = planned.settings
  const { probe } = contextOf(settings, input)
  const marked = nativeCycle(planned.routine.cycle, decoded.value, style, [], { probe, safeZ: settings.safeZ, clearance: settings.clearance, tilted: op.frame !== undefined })
  return "refused" in marked ? { ok: false, reason: "refused", detail: marked.refused } : { ok: true, style, word: marked.word }
}

/** The defaults the inline touches get back when native is turned off (`defaultOperation`): a datum write is limited again. */
const INLINE_DEADBAND = 0.001
const INLINE_LIMIT = 5

/**
 * The edit of turning native on or off. A native cycle writes the datum unconditionally (the vendor cycle has no deadband, limit or
 * tolerance rule), so turning it on clears them in the operation, where the editor shows it; turning it off restores the limit, so
 * the inline program never loses its wrong-datum alarm without the user seeing it.
 */
export const nativePatch = (op: ProbeOperation, on: boolean): Partial<ProbeOperation> =>
  on
    ? { native: true, deadband: 0, limit: 0, ...(op.updateMode === "update-within-tolerance" || op.updateMode === "alarm-outside-tolerance" ? { updateMode: "set" as const } : {}) }
    : { native: false, ...(op.deadband === 0 ? { deadband: INLINE_DEADBAND } : {}), ...(op.limit === 0 ? { limit: INLINE_LIMIT } : {}) }

/** The posts the probing routes write and replay (`CamProbingDialect`); another post of the panel's list is simulated without a program. */
export const isProbingDialect = Schema.is(CamProbingDialect)
