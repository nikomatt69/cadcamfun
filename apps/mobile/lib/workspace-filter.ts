/**
 * Search, filters and summaries for the project and workspace screens. Pure so they run under bun.
 */

/** Whitespace-separated words, all of which must appear somewhere in the haystack (case-insensitive). */
export const matchesQuery = (haystack: string, query: string): boolean => {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const text = haystack.toLocaleLowerCase()
  return words.every((word) => text.includes(word))
}

const timeOf = (iso: string): number => {
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed
}

/** Workspace rows matching the query on name or subtitle, most recently updated first. */
export const filterEntries = <T extends { readonly name: string; readonly subtitle: string | null; readonly updatedAt: string }>(
  entries: readonly T[],
  query: string,
): T[] => entries
  .filter((entry) => matchesQuery(`${entry.name} ${entry.subtitle ?? ""}`, query))
  .sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt) || a.name.localeCompare(b.name))

export type PullFilter = "open" | "merged" | "closed" | "all"

export const PULL_FILTERS: readonly { readonly id: PullFilter; readonly label: string }[] = [
  { id: "open", label: "Open" },
  { id: "merged", label: "Merged" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
]

/** Count per state plus `all`, so every chip can show its number before it is chosen. */
export const pullCounts = (pulls: readonly { readonly state: "open" | "merged" | "closed" }[]): Record<PullFilter, number> => {
  const counts: Record<PullFilter, number> = { open: 0, merged: 0, closed: 0, all: pulls.length }
  for (const pull of pulls) counts[pull.state] += 1
  return counts
}

/** Pulls in one state, newest number first. */
export const filterPulls = <T extends { readonly state: "open" | "merged" | "closed"; readonly number: number }>(pulls: readonly T[], filter: PullFilter): T[] =>
  pulls.filter((pull) => filter === "all" || pull.state === filter).sort((a, b) => b.number - a.number)

/** Open requests first when there are any, otherwise everything: the list never opens on an empty filter. */
export const defaultPullFilter = (pulls: readonly { readonly state: "open" | "merged" | "closed" }[]): PullFilter =>
  pulls.some((pull) => pull.state === "open") ? "open" : "all"

type ChangeStatus = "added" | "modified" | "deleted"

export interface DiffSummary {
  readonly files: number
  readonly added: number
  readonly modified: number
  readonly deleted: number
  readonly properties: number
}

export const diffSummary = (changes: readonly { readonly status: ChangeStatus; readonly changes: readonly unknown[] }[]): DiffSummary => {
  let added = 0, modified = 0, deleted = 0, properties = 0
  for (const change of changes) {
    if (change.status === "added") added += 1
    else if (change.status === "deleted") deleted += 1
    else modified += 1
    properties += change.changes.length
  }
  return { files: changes.length, added, modified, deleted, properties }
}

/** `3 files · 1 added · 2 modified · 7 properties`; zero counts are left out. */
export const formatDiffSummary = (summary: DiffSummary): string => [
  `${summary.files} ${summary.files === 1 ? "file" : "files"}`,
  summary.added ? `${summary.added} added` : "",
  summary.modified ? `${summary.modified} modified` : "",
  summary.deleted ? `${summary.deleted} deleted` : "",
  summary.properties ? `${summary.properties} ${summary.properties === 1 ? "property" : "properties"}` : "",
].filter(Boolean).join(" · ")

export type ChangeFilter = ChangeStatus | "all"

export const filterChanges = <T extends { readonly status: ChangeStatus }>(changes: readonly T[], filter: ChangeFilter): readonly T[] =>
  filter === "all" ? changes : changes.filter((change) => change.status === filter)

/** The commit message after its title line, with surrounding blank lines removed. */
export const commitBody = (message: string): string => {
  const lines = message.replace(/\r\n/g, "\n").trim().split("\n")
  return lines.slice(1).join("\n").trim()
}
