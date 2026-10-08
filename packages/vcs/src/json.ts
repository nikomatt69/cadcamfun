/** Canonical JSON + structural three-way merge, so concurrent CAD edits to different keys never conflict. */

export const canonicalJson = (value: unknown): string => `${JSON.stringify(sortKeys(value), null, 2)}\n`

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    )
  }
  return value
}

const equal = (a: unknown, b: unknown): boolean => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b))

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

export type JsonMerge = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly conflicts: readonly string[] }

const ABSENT = Symbol("absent")
type Slot = unknown | typeof ABSENT

const merge3 = (base: Slot, ours: Slot, theirs: Slot, pointer: string, conflicts: string[]): Slot => {
  if (equal(ours, theirs)) return ours
  if (equal(base, ours)) return theirs
  if (equal(base, theirs)) return ours
  if (isObject(ours) && isObject(theirs)) {
    const b = isObject(base) ? base : {}
    const out: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(b)])) {
      const slot = (o: Record<string, unknown>): Slot => (key in o ? o[key] : ABSENT)
      const merged = merge3(slot(b), slot(ours), slot(theirs), `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`, conflicts)
      if (merged !== ABSENT) out[key] = merged
    }
    return out
  }
  conflicts.push(pointer || "/")
  return ours
}

/** Objects merge per key; arrays and scalars are atomic. A conflict reports JSON pointers and keeps `ours`. */
export const mergeJson = (base: unknown, ours: unknown, theirs: unknown): JsonMerge => {
  const conflicts: string[] = []
  const value = merge3(base ?? ABSENT, ours, theirs, "", conflicts)
  return conflicts.length > 0 ? { ok: false, conflicts } : { ok: true, value }
}
