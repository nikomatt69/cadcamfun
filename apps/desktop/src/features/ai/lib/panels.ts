/**
 * The disclosure panels of the assistant: which one is open.
 *
 * The header used to keep a boolean per panel, so opening one left the others open
 * too — the header's buttons toggled their own flag and nothing closed the rest,
 * while the slash commands closed every other panel. Two ways to open the same
 * thing, two different behaviours.
 *
 * One accessor with one value removes the ambiguity: a panel is open or it is not,
 * and opening one closes the other.
 */
export const PANEL_IDS = [
  "sessions",
  "tools",
  "skills",
  "stats",
  "context",
  "providers",
  "extensions",
  "bridge",
  "catalog",
  "help"
] as const

export type PanelId = (typeof PANEL_IDS)[number]

/** True for a value that names a panel. */
export const isPanelId = (value: string): value is PanelId =>
  (PANEL_IDS as ReadonlyArray<string>).includes(value)

/**
 * The next open panel: opening the one that is open closes it, opening another
 * closes the first.
 */
export const nextPanel = (current: PanelId | undefined, wanted: PanelId): PanelId | undefined =>
  current === wanted ? undefined : wanted
