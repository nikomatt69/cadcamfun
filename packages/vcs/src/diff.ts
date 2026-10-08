import { toText } from "./object.ts"
import type { Repository } from "./repository.ts"

export interface PropertyChange {
  /** RFC 6901 pointer inside the entity JSON. */
  readonly pointer: string
  readonly before?: unknown
  readonly after?: unknown
}

export interface EntityChange {
  readonly path: string
  /** `drawings`, `components`, `toolpaths`, `project`, or `other` for non-entity files. */
  readonly kind: "drawings" | "components" | "toolpaths" | "project" | "other"
  readonly id?: string
  readonly name?: string
  readonly status: "added" | "modified" | "deleted"
  readonly changes: readonly PropertyChange[]
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const esc = (k: string): string => k.replaceAll("~", "~0").replaceAll("/", "~1")

/** Property-level changes. Arrays of equal length diff per index (a moved vertex shows up as one change); otherwise atomically. */
export const jsonChanges = (before: unknown, after: unknown, pointer = ""): PropertyChange[] => {
  if (JSON.stringify(before) === JSON.stringify(after)) return []
  if (isObject(before) && isObject(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap((k) => {
      if (!(k in before)) return [{ pointer: `${pointer}/${esc(k)}`, after: after[k] }]
      if (!(k in after)) return [{ pointer: `${pointer}/${esc(k)}`, before: before[k] }]
      return jsonChanges(before[k], after[k], `${pointer}/${esc(k)}`)
    })
  }
  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) return before.flatMap((v, i) => jsonChanges(v, after[i], `${pointer}/${i}`))
  return [{ pointer: pointer || "/", before, after }]
}

const classify = (path: string): { kind: EntityChange["kind"]; id?: string } => {
  const m = /^(drawings|components|toolpaths)\/([^/]+)\.json$/.exec(path)
  if (m) return { kind: m[1] as EntityChange["kind"], id: m[2]! }
  return { kind: path === "project.json" ? "project" : "other" }
}

/** CAD-aware diff between two commits, ready for a PR "Files changed" view on desktop or mobile. */
export const describeDiff = (repo: Repository, from: string | undefined, to: string): EntityChange[] =>
  repo.diff(from, to).map((c) => {
    const read = (oid: string | undefined): unknown => {
      if (!oid) return undefined
      const text = toText(repo.readBlob(oid))
      try {
        return JSON.parse(text)
      } catch {
        return text
      }
    }
    const before = read(c.before)
    const after = read(c.after)
    const named = (isObject(after) ? after : isObject(before) ? before : {}).name
    return {
      path: c.path,
      ...classify(c.path),
      ...(typeof named === "string" && { name: named }),
      status: c.status,
      changes: c.status === "modified" ? jsonChanges(before, after) : jsonChanges(before ?? {}, after ?? {}).filter(() => isObject(before ?? after)),
    }
  })
