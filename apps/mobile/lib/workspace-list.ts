import { sectionByDay, timeOf } from "./project-list"
import { filterEntries } from "./workspace-filter"

export type WorkspaceSort = "recent" | "name"

/** A draft for the user to review; it never starts an assistant turn by itself. */
export function newEntryAssistantDraft(entry: { readonly id: string; readonly name: string }): { readonly mode: "cad"; readonly text: string } {
  return {
    mode: "cad",
    text: `I created an empty design named ${JSON.stringify(entry.name)} (ID: ${entry.id}). Help me define it. Ask me for the geometry, dimensions and intended use before making changes.`,
  }
}

/** Filtering always precedes sorting, and does not change the desktop's copy. */
export function workspaceSections<T extends { readonly id: string; readonly name: string; readonly subtitle: string | null; readonly updatedAt: string }>(
  entries: readonly T[], query: string, sort: WorkspaceSort,
): { readonly title: string; readonly data: T[] }[] {
  const matching = filterEntries(entries, query)
  if (matching.length === 0) return []
  if (sort === "name") {
    matching.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) || a.id.localeCompare(b.id))
    return [{ title: "All items", data: matching }]
  }
  return sectionByDay(matching, (entry) => timeOf(entry.updatedAt))
}
