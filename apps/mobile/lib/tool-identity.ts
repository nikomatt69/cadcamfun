/**
 * What a tool call (or a permission request for one) is, said once for every transcript surface.
 *
 * nikcli picks a glyph from the tool's verb (bash, read, grep, fetch). CADCAMFUN's tools carry their domain in the
 * prefix (`cad_*`, `cam_*`, `vcs_*`), so the category comes from the prefix and the glyph from the verb: a render
 * looks like a camera whether the CAD or the CAM side took it, G-code looks like code, a simulation like a play button.
 * Pure data (icon *keys*, not components) so the rules are testable without a renderer.
 */

export type ToolIconKey = "box" | "route" | "git" | "workflow" | "gauge" | "wrench" | "camera" | "code" | "play" | "terminal" | "file" | "globe" | "shield"

export type ToolCategory = "CAD" | "CAM" | "VERSION CONTROL" | "ACTIONS" | "ANALYSIS" | "TOOL"

export interface ToolIdentity {
  readonly icon: ToolIconKey
  readonly category: ToolCategory
  /** `fillet_edges` → "Fillet Edges". */
  readonly title: string
}

/** The verbs that override the category's own glyph. First match wins. */
const VERB_ICONS: readonly (readonly [RegExp, ToolIconKey])[] = [
  [/snapshot|screenshot|render|capture|photo|view_?port|preview_image/, "camera"],
  [/gcode|g_code|post_?process|nc_program|\bpost\b/, "code"],
  [/simulat|playback|run_?program/, "play"],
  [/verify|analy[sz]|measure|inspect|interfer|check|validate|mass|collision/, "gauge"],
]

const titleOf = (label: string): string => label.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

/** `raw` is the tool's real name (`cad_extrude`); `label` is the display label the transcript already stripped. */
export function toolIdentity(raw: string | undefined, label: string): ToolIdentity {
  const value = (raw ?? label).toLowerCase()
  const title = titleOf(label)
  const verb = VERB_ICONS.find(([pattern]) => pattern.test(value))?.[1]
  if (value.startsWith("cad_")) return { icon: verb ?? "box", category: "CAD", title }
  if (value.startsWith("cam_") || value.includes("toolpath") || value.includes("gcode")) return { icon: verb ?? "route", category: "CAM", title }
  if (value.startsWith("vcs_") || value.includes("pull_request")) return { icon: verb ?? "git", category: "VERSION CONTROL", title }
  if (value.startsWith("actions_") || value.includes("workflow")) return { icon: verb ?? "workflow", category: "ACTIONS", title }
  if (value.includes("verify") || value.includes("analy")) return { icon: "gauge", category: "ANALYSIS", title }
  return { icon: verb ?? "wrench", category: "TOOL", title }
}

/**
 * The glyph for a permission request. Permissions are named after the tool that asks (`cad_delete_entities`) or after
 * a host capability (`edit`, `bash`, `webfetch`), so tool names resolve through the identity rules first.
 */
export function permissionIcon(permission: string): ToolIconKey {
  const value = permission.toLowerCase()
  if (/^(cad|cam|vcs|actions)_/.test(value)) return toolIdentity(value, value).icon
  if (/bash|execute|shell|terminal|command/.test(value)) return "terminal"
  if (/read|edit|write|file|patch/.test(value)) return "file"
  if (/web|fetch|http|url|network/.test(value)) return "globe"
  return "shield"
}

/** The domain a tool belongs to, for a folded run's caption: `cad_extrude` → "CAD". */
export function toolDomain(raw: string | undefined, label: string): string {
  const head = (raw ?? label).split("_")[0] ?? ""
  return head ? head.toUpperCase() : "TOOL"
}
