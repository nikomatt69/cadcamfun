export const TAG_COLORS = [
  { id: "red", name: "Red", hex: "#E5484D" },
  { id: "orange", name: "Orange", hex: "#E87928" },
  { id: "yellow", name: "Yellow", hex: "#D4A017" },
  { id: "green", name: "Green", hex: "#30A46C" },
  { id: "blue", name: "Blue", hex: "#3984DB" },
  { id: "purple", name: "Purple", hex: "#9664CF" },
  { id: "gray", name: "Gray", hex: "#85858B" },
] as const

export interface ListTag { id: string; name: string; color: string }
export interface TagCollection { tags: ListTag[]; assignments: Record<string, string[]> }
export const defaultTagCollection = (): TagCollection => ({ tags: TAG_COLORS.map(({ id, name, hex }) => ({ id, name, color: hex })), assignments: {} })
export const tagScope = (desktop: string, account: string): string => JSON.stringify([desktop, account])
export const tagTarget = (kind: "project" | "session", id: string): string => `${kind}:${id}`
export const assignedTags = (collection: TagCollection, target: string): ListTag[] => collection.tags.filter((tag) => collection.assignments[target]?.includes(tag.id))
export const matchesTag = (collection: TagCollection, target: string, filter: string | null): boolean => filter === null || (filter === "untagged" ? assignedTags(collection, target).length === 0 : Boolean(collection.assignments[target]?.includes(filter)))
export function toggleTag(collection: TagCollection, target: string, id: string): TagCollection {
  if (!collection.tags.some((tag) => tag.id === id)) return collection
  const previous = collection.assignments[target] ?? []
  return { ...collection, assignments: { ...collection.assignments, [target]: previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id] } }
}
export function saveTag(collection: TagCollection, tag: ListTag): TagCollection {
  const name = tag.name.trim().slice(0, 40)
  if (!name || !TAG_COLORS.some((color) => color.hex === tag.color) || collection.tags.some((item) => item.id !== tag.id && item.name.toLowerCase() === name.toLowerCase())) return collection
  return { ...collection, tags: collection.tags.some((item) => item.id === tag.id) ? collection.tags.map((item) => item.id === tag.id ? { ...tag, name } : item) : [...collection.tags, { ...tag, name }] }
}
export const deleteTag = (collection: TagCollection, id: string): TagCollection => ({ tags: collection.tags.filter((tag) => tag.id !== id), assignments: Object.fromEntries(Object.entries(collection.assignments).map(([target, ids]) => [target, ids.filter((value) => value !== id)])) })
