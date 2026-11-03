import type { DocsTopic } from "./DocsShot"

// Which illustration heads which docs page. First match wins; everything else
// is the workspace layout.
const RULES: [RegExp, DocsTopic][] = [
  [/^\/docs$/, "docs"],
  [/^\/docs\/(mobile|guides\/companion-pairing)/, "mobile"],
  [/^\/docs\/(setups)/, "post"],
  [/^\/docs\/(cam|viewport|kernels\/(cam|tolerance)|guides\/native-manufacturing)/, "cam"],
  [/^\/docs\/(ai|guides\/ai-streaming)/, "ai"],
  [/^\/docs\/(cad|kernels)/, "cad"],
  [/^\/docs\/(api|plugins|workflows|guides\/(api-tour|api-clients|plugin-authoring))/, "api"],
  [/^\/docs\/(history|release|guides\/(project-history|project-lifecycle))/, "history"],
]

export function topicFor(pathname: string): DocsTopic {
  const clean = pathname.replace(/\/$/, "") || "/docs"
  return RULES.find(([re]) => re.test(clean))?.[1] ?? "arch"
}
