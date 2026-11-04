import type { DocsTopic } from "./DocsShot"

// Which illustration heads which docs page. First match wins; everything else
// is the workspace layout.
const RULES: [RegExp, DocsTopic][] = [
  [/^\/docs$/, "docs"],
  [/^\/docs\/guides\/companion-pairing/, "pair"],
  [/^\/docs\/guides\/desktop-troubleshooting/, "diagnostics"],
  [/^\/docs\/guides\/project-lifecycle/, "project"],
  [/^\/docs\/guides$/, "guide"],
  [/^\/docs\/mobile/, "mobile"],
  [/^\/docs\/(setups|guides\/native-manufacturing)/, "machine"],
  [/^\/docs\/(release)/, "update"],
  [/^\/docs\/(workflows)/, "workflow"],
  [/^\/docs\/(plugins|guides\/plugin-authoring)/, "plugin"],
  [/^\/docs\/kernels\/sketch-solver/, "sketch"],
  [/^\/docs\/kernels\/mesh/, "mesh"],
  [/^\/docs\/kernels\/tolerance/, "tolerance"],
  [/^\/docs\/kernels\/(features|brep)/, "feature"],
  [/^\/docs\/viewport/, "playback"],
  [/^\/docs\/(source-map|packages)/, "resource"],
  [/^\/docs\/(stack|conventions|guides\/(install|quickstart|local-dev|contributing))/, "term"],
  [/^\/docs\/(database)/, "db"],
  [/^\/docs\/guides\/accounts/, "account"],
  [/^\/docs\/configuration/, "config"],
  [/^\/docs\/(desktop)/, "cad"],
  [/^\/docs\/documentation/, "resource"],
  [/^\/docs\/sidecar/, "sidecar"],
  [/^\/docs\/(cam|kernels\/cam)/, "cam"],
  [/^\/docs\/(ai|guides\/ai-streaming)/, "ai"],
  [/^\/docs\/(cad|kernels)/, "cad"],
  [/^\/docs\/(api|guides\/(api-tour|api-clients))/, "api"],
  [/^\/docs\/(history|guides\/project-history)/, "history"],
]

export function topicFor(pathname: string): DocsTopic {
  const clean = pathname.replace(/\/$/, "") || "/docs"
  return RULES.find(([re]) => re.test(clean))?.[1] ?? "arch"
}
