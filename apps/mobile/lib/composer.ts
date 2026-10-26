/** Copy for the chat composer, kept apart from the view so the wording is testable. */

export type ComposerMode = "general" | "cad" | "cam" | "gcode" | "toolpath"

export const COMPOSER_MODES: ReadonlyArray<{ value: ComposerMode; label: string; hint: string }> = [
  { value: "general", label: "General", hint: "Any question about the project" },
  { value: "cad", label: "CAD", hint: "Sketches, features and geometry" },
  { value: "cam", label: "CAM", hint: "Setups, tools and operations" },
  { value: "toolpath", label: "Toolpath", hint: "Strategies, feeds and simulation" },
  { value: "gcode", label: "G-code", hint: "Review and post-processor output" },
]

const MODE_PLACEHOLDER: Record<ComposerMode, string> = {
  general: "Ask CADCAMFUN…",
  cad: "Describe the geometry…",
  cam: "Ask about setups and operations…",
  toolpath: "Ask for a toolpath…",
  gcode: "Ask about the G-code…",
}

/** The field's hint: the connection state wins, then the live turn, then the mode's own wording. */
export const composerPlaceholder = (state: { offline: boolean; busy: boolean; mode: ComposerMode }): string =>
  state.offline ? "Desktop offline · message waits to send" : state.busy ? "Steer the current turn…" : MODE_PLACEHOLDER[state.mode]

/** The model pill names the mode only when it is not the default, so the chosen focus is never hidden. */
export const modelPillLabel = (modelLabel: string, mode: ComposerMode): string => {
  if (mode === "general") return modelLabel
  const label = COMPOSER_MODES.find((item) => item.value === mode)?.label ?? mode
  return `${label} · ${modelLabel}`
}
