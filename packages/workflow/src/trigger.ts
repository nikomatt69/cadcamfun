import type { Workflow } from "./schema.ts"

export type TriggerEvent =
  | { readonly type: "push"; readonly branch: string; readonly changedPaths: readonly string[] }
  | { readonly type: "pull-request"; readonly base: string }
  | { readonly type: "manual" }

/** `*` matches within a path segment, `**` across segments. */
export const globToRegExp = (glob: string): RegExp => {
  const body = glob
    .split("**")
    .map((part) => part.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"))
    .join(".*")
  return new RegExp(`^${body}$`)
}

const anyMatch = (globs: readonly string[] | undefined, value: string): boolean => globs === undefined || globs.some((g) => globToRegExp(g).test(value))

export const matchesTrigger = (w: Workflow, event: TriggerEvent): boolean => {
  switch (event.type) {
    case "manual":
      return w.on.manual !== undefined
    case "pull-request":
      return w.on.pullRequest !== undefined && anyMatch(w.on.pullRequest.branches, event.base)
    case "push": {
      const p = w.on.push
      if (!p || !anyMatch(p.branches, event.branch)) return false
      return p.paths === undefined || event.changedPaths.some((path) => anyMatch(p.paths, path))
    }
  }
}
