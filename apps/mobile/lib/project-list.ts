/**
 * The Projects tab's lists (nikcli: sessions/index.tsx, repos/index.tsx): newest first, grouped by day,
 * searchable and filterable. Pure so the grouping, the sorting and the search run under bun.
 */
import { dayBucket, type DayBucket } from "./conversation-list"
import { matchesQuery } from "./workspace-filter"

/** An ISO date as epoch milliseconds; a missing or unreadable date is 0, which sorts last and lands in "Earlier". */
export const timeOf = (iso: string | null | undefined): number => {
  const parsed = Date.parse(iso ?? "")
  return Number.isNaN(parsed) ? 0 : parsed
}

export type DaySection<T> = { readonly title: Exclude<DayBucket, "Running">; readonly data: T[] }

/**
 * Groups items that are already newest first under Today / Yesterday / Previous 7 days / Earlier.
 * The order of the items is kept; groups without items are dropped.
 */
export const sectionByDay = <T>(items: readonly T[], timeOfItem: (item: T) => number, now: number = Date.now()): DaySection<T>[] => {
  const sections: DaySection<T>[] = []
  for (const item of items) {
    const title = dayBucket(timeOfItem(item), now)
    const last = sections[sections.length - 1]
    if (last?.title === title) last.data.push(item)
    else {
      const existing = sections.find((section) => section.title === title)
      if (existing) existing.data.push(item)
      else sections.push({ title, data: [item] })
    }
  }
  return sections
}

// ---- projects ---------------------------------------------------------------------------------------

export interface ProjectLike {
  readonly id: string
  readonly name: string
  readonly description?: string | null
  readonly updatedAt: string
}

export type ProjectSort = "recent" | "name"
export type ProjectFilter = "all" | "week"

export const PROJECT_SORTS: ReadonlyArray<{ id: ProjectSort; label: string; description: string }> = [
  { id: "recent", label: "Recently updated", description: "Newest changes first, grouped by day" },
  { id: "name", label: "Name", description: "A to Z" },
]

export const PROJECT_FILTERS: ReadonlyArray<{ id: ProjectFilter; label: string; description: string }> = [
  { id: "all", label: "All projects", description: "Everything on the desktop" },
  { id: "week", label: "Last 7 days", description: "Changed this week" },
]

/** Title of the single group a name-sorted list shows. */
export const NAME_SECTION = "All projects"

export interface ProjectSection<T> {
  readonly title: string
  readonly data: T[]
}

const byName = (a: ProjectLike, b: ProjectLike): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) || a.id.localeCompare(b.id)

/**
 * The projects the list shows: filtered by the sheet's choice and the search words (name or description),
 * then laid out under day headings (recent) or in one alphabetical group (name).
 */
export const listProjects = <T extends ProjectLike>(
  projects: readonly T[],
  options: { query?: string; sort?: ProjectSort; filter?: ProjectFilter; now?: number } = {},
): ProjectSection<T>[] => {
  const { query = "", sort = "recent", filter = "all", now = Date.now() } = options
  const kept = projects.filter((project) =>
    (filter === "all" || dayBucket(timeOf(project.updatedAt), now) !== "Earlier")
    && matchesQuery(`${project.name} ${project.description ?? ""}`, query))
  if (kept.length === 0) return []
  if (sort === "name") return [{ title: NAME_SECTION, data: [...kept].sort(byName) }]
  const recent = [...kept].sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt) || byName(a, b))
  return sectionByDay(recent, (project) => timeOf(project.updatedAt), now)
}

/** The meta line of a row: the parts that exist, joined with a middle dot. */
export const projectMeta = (parts: ReadonlyArray<string | false | null | undefined>): string =>
  parts.filter((part): part is string => typeof part === "string" && part !== "").join(" · ")

// ---- history, pull requests, workflow runs ----------------------------------------------------------

/** Commit time (unix seconds) as epoch milliseconds, for grouping under day headings. */
export const commitMillis = (seconds: number): number => (Number.isFinite(seconds) ? seconds * 1000 : 0)

export const matchesCommit = (commit: { readonly oid: string; readonly message: string; readonly author: { readonly name: string } }, query: string): boolean =>
  matchesQuery(`${commit.message} ${commit.author.name} ${commit.oid}`, query)

export const matchesPull = (pull: { readonly number: number; readonly title: string; readonly head: string; readonly base: string }, query: string): boolean =>
  matchesQuery(`#${pull.number} ${pull.number} ${pull.title} ${pull.head} ${pull.base}`, query)

export const matchesRun = (run: { readonly workflow: string; readonly event: string; readonly ref: string; readonly status: string }, query: string): boolean =>
  matchesQuery(`${run.workflow} ${run.event} ${run.ref} ${run.status}`, query)

/** Runs newest first; a run without a readable start sorts last. */
export const sortRuns = <T extends { readonly startedAt: string }>(runs: readonly T[]): T[] =>
  [...runs].sort((a, b) => timeOf(b.startedAt) - timeOf(a.startedAt))
