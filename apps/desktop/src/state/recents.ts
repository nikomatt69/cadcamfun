/**
 * Recently opened projects (spec 06-desktop-ui.md §1: the Projects screen lists them).
 *
 * The Tauri shell keeps its own tray-level recents (it needs them for the tray menu);
 * this is the UI's copy for the start screen, and it mirrors into `localStorage` so it
 * survives a webview reload. The two lists share the `RecentProject` wire shape that
 * `commands::set_recent_projects` expects, so pushing to the shell is a straight map.
 */

export interface RecentProject {
  readonly id: string
  readonly name: string
  /** ISO timestamp of the last open. */
  readonly openedAt: string
}

export const MAX_RECENT = 8
const STORAGE_KEY = "cadcamfun.recent"

const isRecent = (value: unknown): value is RecentProject => {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record["id"] === "string" && typeof record["name"] === "string"
}

/** Newest first, deduplicated by id, capped; an unparsable record yields nothing. */
export const decodeRecents = (raw: unknown): ReadonlyArray<RecentProject> => {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: Array<RecentProject> = []
  for (const entry of raw) {
    if (!isRecent(entry) || seen.has(entry.id)) continue
    seen.add(entry.id)
    out.push({ id: entry.id, name: entry.name, openedAt: typeof entry.openedAt === "string" ? entry.openedAt : "" })
    if (out.length >= MAX_RECENT) break
  }
  return out
}

export const readRecents = (): ReadonlyArray<RecentProject> => {
  const store = globalThis.localStorage
  if (store === undefined) return []
  try {
    const raw = store.getItem(STORAGE_KEY)
    return raw === null ? [] : decodeRecents(JSON.parse(raw))
  } catch {
    return []
  }
}

export const writeRecents = (recents: ReadonlyArray<RecentProject>): void => {
  const store = globalThis.localStorage
  if (store === undefined) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(recents))
  } catch {
    // Recents are a convenience; a full storage must never break opening a project.
  }
}

/** Moves `project` to the front, or inserts it, keeping the list newest-first. */
export const pushRecent = (
  recents: ReadonlyArray<RecentProject>,
  project: { readonly id: string; readonly name: string },
  openedAt: string
): ReadonlyArray<RecentProject> =>
  decodeRecents([{ ...project, openedAt }, ...recents.filter((r) => r.id !== project.id)])

export const removeRecent = (
  recents: ReadonlyArray<RecentProject>,
  id: string
): ReadonlyArray<RecentProject> => recents.filter((r) => r.id !== id)

/** `RelativeTimeFormat` gives the locale-correct "2 days ago" for free where available. */
export const formatRecent = (openedAt: string, now: number = Date.now()): string => {
  const then = Date.parse(openedAt)
  if (Number.isNaN(then)) return ""
  const seconds = Math.round((then - now) / 1000)
  if (typeof Intl !== "undefined" && typeof Intl.RelativeTimeFormat === "function") {
    const units: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
      ["year", 31536000],
      ["month", 2592000],
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60]
    ]
    const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
    for (const [unit, size] of units) {
      if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
    }
    return format.format(seconds, "second")
  }
  return new Date(then).toISOString()
}
