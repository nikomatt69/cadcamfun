/** Display-time helpers used across screens. */

export const ago = (iso: string): string => {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (Number.isNaN(diff)) return d.toLocaleString()
  const m = Math.round(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

export const short = (oid: string): string => oid.slice(0, 7)

export const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

export const authorOf = (kind: "user" | "ai", id?: string): string =>
  kind === "ai" ? "AI assistant" : (id && id.trim().length > 0 ? `Reviewer ${id.slice(0, 6)}` : "You")