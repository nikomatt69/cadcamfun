/** Groups of the fixed-cycle list. The core may name a family on a template; otherwise it is derived from id, name and icon. */
export type CycleFamily = "drilling" | "thread" | "pocket" | "contour" | "pattern" | "transform" | "probing" | "other"

export const FAMILY_ORDER: ReadonlyArray<CycleFamily> = ["drilling", "thread", "pocket", "contour", "pattern", "transform", "probing", "other"]

const RULES: ReadonlyArray<readonly [CycleFamily, RegExp]> = [
  ["probing", /prob|touch|measur|tast|calibrat/],
  ["pattern", /pattern|bolt|grid|hole-?circle|circle-?hole|polar|rows|linear-?holes/],
  ["transform", /rotat|mirror|scal|datum|shift|translat|transform|tilt|zero-?point/],
  ["thread", /thread/],
  ["drilling", /drill|bor(e|ing)|ream|\btap|tapping|peck|counter|sink/],
  ["pocket", /pocket|slot|island|plunge|face-?mill|facing|stud|spigot/],
  ["contour", /contour|chamfer|profile|path|engrav|trochoid/]
]

const known = (value: string | undefined): CycleFamily | undefined => FAMILY_ORDER.find((family) => family === value)

export const familyOf = (cycle: { readonly id: string; readonly name: string; readonly icon?: string; readonly family?: string }): CycleFamily => {
  const named = known(cycle.family)
  if (named) return named
  const text = `${cycle.id} ${cycle.name} ${cycle.icon ?? ""}`.toLowerCase()
  return RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? "other"
}

export interface CycleGroup<T> { readonly family: CycleFamily; readonly items: ReadonlyArray<T> }

/** The items grouped by family in the fixed order; empty groups are left out. */
export const groupByFamily = <T extends { readonly id: string; readonly name: string; readonly icon?: string; readonly family?: string }>(items: ReadonlyArray<T>): ReadonlyArray<CycleGroup<T>> =>
  FAMILY_ORDER.map((family) => ({ family, items: items.filter((item) => familyOf(item) === family) })).filter((group) => group.items.length > 0)

/** Case-insensitive filter over name, id and description. */
export const matchesFilter = (item: { readonly id: string; readonly name: string; readonly description?: string }, query: string): boolean => {
  const needle = query.trim().toLowerCase()
  return needle === "" || `${item.name} ${item.id} ${item.description ?? ""}`.toLowerCase().includes(needle)
}
