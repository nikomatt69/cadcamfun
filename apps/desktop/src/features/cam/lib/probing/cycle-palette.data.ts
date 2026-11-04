/**
 * The probing cycle palette (spec 73 §4): which cycles the panel offers, in which group, and whether the machine in front of the
 * user can run each one. Pure data and one pure function, so the rules are testable without a DOM.
 */
import type { Key } from "../../../../i18n/index.ts"
import type { MachineProfile, ProbeCycleKind } from "./contract.ts"

export type PaletteGroupId = "setup" | "five-axis" | "calibration" | "tool-setter" | "inspection"

export interface PaletteEntry {
  /** Stable id: a cycle kind, or `inspect-<kind>` for the inspection presets. */
  readonly id: string
  readonly kind: ProbeCycleKind
  readonly group: PaletteGroupId
  readonly label: Key
  readonly hint: Key
  /** An inspection entry starts in `report` mode with a characteristic for each result (nothing is written to the machine). */
  readonly preset?: "inspect"
}

export interface PaletteGroup { readonly id: PaletteGroupId; readonly label: Key }

export const PALETTE_GROUPS: ReadonlyArray<PaletteGroup> = [
  { id: "setup", label: "cam.probing.group.setup" },
  { id: "five-axis", label: "cam.probing.group.fiveAxis" },
  { id: "calibration", label: "cam.probing.group.calibration" },
  { id: "tool-setter", label: "cam.probing.group.toolSetter" },
  { id: "inspection", label: "cam.probing.group.inspection" }
]

const entry = (kind: ProbeCycleKind, group: PaletteGroupId, preset?: "inspect"): PaletteEntry => ({
  id: preset === undefined ? kind : `inspect-${kind}`,
  kind,
  group,
  label: `cam.probing.cycle.${kind}` as Key,
  hint: `cam.probing.cycleHint.${kind}` as Key,
  ...(preset !== undefined ? { preset } : {})
})

export const PALETTE: ReadonlyArray<PaletteEntry> = [
  entry("z-surface", "setup"), entry("edge", "setup"), entry("corner", "setup"), entry("web", "setup"), entry("pocket", "setup"),
  entry("rectangle", "setup"), entry("bore", "setup"), entry("boss", "setup"), entry("edge-angle", "setup"),
  entry("plane", "five-axis"), entry("sphere", "five-axis"),
  entry("stylus-calibrate", "calibration"), entry("rotary-axis", "calibration"),
  entry("tool-length", "tool-setter"), entry("tool-radius", "tool-setter"), entry("broken-tool", "tool-setter"),
  entry("bore", "inspection", "inspect"), entry("boss", "inspection", "inspect"), entry("rectangle", "inspection", "inspect"),
  entry("plane", "inspection", "inspect"), entry("edge-angle", "inspection", "inspect")
]

export const entriesOf = (group: PaletteGroupId): ReadonlyArray<PaletteEntry> => PALETTE.filter((e) => e.group === group)

export type Availability = { readonly ok: true } | { readonly ok: false; readonly reason: Key }

/**
 * Whether the machine can run the entry. A machine without a stored probe still plans with the settings defaults, so the setup
 * cycles are always open; what needs hardware the profile does not have is closed with the reason the panel shows.
 */
export const availability = (e: PaletteEntry, profile: Pick<MachineProfile, "kind" | "axes" | "rotary" | "toolSetter" | "probing"> | undefined): Availability => {
  if (profile !== undefined && profile.kind !== "mill") return { ok: false, reason: "cam.probing.unavailable.notMill" }
  if (e.group === "tool-setter" && profile?.toolSetter === undefined) return { ok: false, reason: "cam.probing.unavailable.noToolSetter" }
  if (e.kind === "rotary-axis" && profile?.rotary === undefined) return { ok: false, reason: "cam.probing.unavailable.noRotary" }
  if (e.group === "five-axis" && e.kind === "sphere" && profile !== undefined && (profile.axes ?? 3) < 4 && profile.rotary === undefined) return { ok: false, reason: "cam.probing.unavailable.noRotary" }
  return { ok: true }
}
