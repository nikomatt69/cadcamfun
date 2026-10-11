/**
 * Display formatting for VCS / workflow values. Pure functions so they are unit-testable
 * under bun and shared by every screen.
 */

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/** "just now", "5m ago", "3h ago", "2d ago", else a short date. */
export const relativeTime = (iso: string, now: number = Date.now()): string => {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return iso
  const delta = now - then
  if (delta < MINUTE) return "just now"
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`
  if (delta < 7 * DAY) return `${Math.floor(delta / DAY)}d ago`
  const d = new Date(then)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

/** Short git oid: first 7 characters. */
export const shortOid = (oid: string): string => oid.slice(0, 7)

/** Commit message's first line, unindented. */
export const commitTitle = (message: string): string => {
  const first = message.trim().split("\n")[0] ?? ""
  return first.replace(/^[a-z]+!?\s*:\s*/i, "").trim() || "commit"
}

/** Unix-seconds commit timestamp to ISO, safely. */
export const commitTime = (seconds: number): string => {
  const d = new Date(seconds * 1000)
  return Number.isNaN(d.getTime()) ? "" : d.toISOString()
}

/** Format a duration (workflow runs): "1m 12s". */
export const duration = (start: string, end: string | null): string => {
  const from = Date.parse(start)
  const to = end ? Date.parse(end) : Date.now()
  if (Number.isNaN(from) || Number.isNaN(to)) return ""
  const seconds = Math.max(0, Math.round((to - from) / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

/** A readable label for each workflow run status. */
export const runStatusLabel = (status: string): string =>
  status === "queued" ? "Queued" : status === "running" ? "Running" : status === "success" ? "Passed" : "Failed"

/** First line of a PR body, or a default. */
export const prTitle = (pull: { title: string }): string => pull.title || "Pull request"
