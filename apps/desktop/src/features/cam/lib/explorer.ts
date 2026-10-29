/**
 * Pure rules behind the CAM element explorer (legacy `CAMElementExplorer.tsx`).
 *
 * The explorer lists the CAD elements, selects them for the generator and links one as the raw piece. These
 * functions work on store *snapshots* (arrays of CAD elements, arrays of ids), so the tree, the filter and the
 * selection rules are testable without a DOM or the stores' reactivity.
 */
import type { CadElement } from "./job.ts"
import { t, type Key } from "../../../i18n/index.ts"

export interface ExplorerNode {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly layerId: string
  readonly visible: boolean
  readonly children: ExplorerNode[]
}

/** Element types that own other elements through `childrenIds`. */
const GROUP_TYPES = new Set(["group", "composite", "component", "custom"])
/** Types that are scene helpers, never machined. */
const NON_MACHINABLE = new Set(["grid", "axis", "light"])

const idOf = (element: CadElement): string => String(element["id"])
const typeOf = (element: CadElement): string => String(element["type"] ?? "")

export const elementName = (element: CadElement): string => {
  const name = element["name"]
  return typeof name === "string" && name.length > 0 ? name : `${typeOf(element)}-${idOf(element).slice(0, 6)}`
}

/** The element hierarchy: children under their `parentId` (or the group's `childrenIds`), everything else at the root. */
export const buildTree = (elements: ReadonlyArray<CadElement>): ExplorerNode[] => {
  const nodes = new Map<string, ExplorerNode>()
  for (const element of elements) {
    nodes.set(idOf(element), {
      id: idOf(element),
      name: elementName(element),
      type: typeOf(element),
      layerId: String(element["layerId"] ?? ""),
      visible: element["visible"] !== false,
      children: []
    })
  }
  const roots: ExplorerNode[] = []
  const adopt = (parent: ExplorerNode, child: ExplorerNode): void => {
    if (!parent.children.includes(child)) parent.children.push(child)
  }
  for (const element of elements) {
    const node = nodes.get(idOf(element))!
    const parentId = element["parentId"]
    if (typeof parentId === "string" && parentId.length > 0) {
      const parent = nodes.get(parentId)
      if (parent !== undefined) adopt(parent, node)
      else roots.push(node)
    } else {
      if (GROUP_TYPES.has(typeOf(element))) {
        const childrenIds = Array.isArray(element["childrenIds"]) ? (element["childrenIds"] as ReadonlyArray<unknown>) : []
        for (const childId of childrenIds) {
          const child = nodes.get(String(childId))
          if (child !== undefined) adopt(node, child)
        }
      }
      roots.push(node)
    }
  }
  // A child reachable from a group is not also a root: no duplicates in the tree.
  const nested = new Set<string>()
  for (const node of nodes.values()) for (const child of node.children) nested.add(child.id)
  return roots.filter(node => !nested.has(node.id))
}

const matches = (node: ExplorerNode, needle: string): boolean =>
  node.name.toLowerCase().includes(needle) || node.type.toLowerCase().includes(needle) || node.children.some(child => matches(child, needle))

/** Roots whose name, type or any descendant matches the query (case-insensitive); an empty query keeps all. */
export const filterTree = (roots: ReadonlyArray<ExplorerNode>, query: string): ExplorerNode[] => {
  const needle = query.trim().toLowerCase()
  return needle.length === 0 ? [...roots] : roots.filter(node => matches(node, needle))
}

/** Ids of every node under `roots`, depth first (what "Expand all" opens). */
export const allNodeIds = (roots: ReadonlyArray<ExplorerNode>): string[] =>
  roots.flatMap(node => [node.id, ...allNodeIds(node.children)])

/** Ancestor group ids of `id`, nearest first: what must be open to reveal a selected element. */
export const ancestorsOf = (elements: ReadonlyArray<CadElement>, id: string): string[] => {
  const byId = new Map(elements.map(element => [idOf(element), element] as const))
  const result: string[] = []
  const seen = new Set<string>([id])
  let parentId = byId.get(id)?.["parentId"]
  while (typeof parentId === "string" && byId.has(parentId) && !seen.has(parentId)) {
    result.push(parentId)
    seen.add(parentId)
    parentId = byId.get(parentId)?.["parentId"]
  }
  return result
}

/**
 * The multi-selection after a click: a plain click selects only that element, an additive click (Ctrl/Cmd or the
 * "Multi" toggle) adds it, or removes it when it was already selected. Click order is kept (first = primary).
 */
export const nextSelection = (current: ReadonlyArray<string>, id: string, additive: boolean): string[] => {
  if (!additive) return [id]
  return current.includes(id) ? current.filter(selected => selected !== id) : [...current, id]
}

/** Elements the generator can machine: anything but scene helpers and the raw piece drawn as a `workpiece`. */
export const isMachinable = (element: CadElement): boolean => !NON_MACHINABLE.has(typeOf(element)) && typeOf(element) !== "workpiece"

/** The ids in `selection` that still exist and can be machined, in selection order. */
export const machinableSelection = (elements: ReadonlyArray<CadElement>, selection: ReadonlyArray<string>): string[] => {
  const byId = new Map(elements.map(element => [idOf(element), element] as const))
  return selection.filter(id => {
    const element = byId.get(id)
    return element !== undefined && isMachinable(element)
  })
}

/** What the generator will do with the elements, as one line for the explorer footer. */
export const selectionSummary = (elements: ReadonlyArray<CadElement>, selection: ReadonlyArray<string>): string => {
  const ids = machinableSelection(elements, selection)
  if (ids.length === 0) return t("cam.explorer.summaryNone")
  const byId = new Map(elements.map(element => [idOf(element), element] as const))
  const first = elementName(byId.get(ids[0]!)!)
  return ids.length === 1 ? t("cam.explorer.summaryOne", { name: first }) : t("cam.explorer.summaryMany", { count: ids.length, name: first })
}

/** Tool / material presets of the explorer's per-element panels (legacy ids and parameters). */
export const EXPLORER_TOOLS: Readonly<Record<string, { readonly name: string; readonly type: "endmill" | "ballnose" | "v-bit"; readonly diameter: number; readonly angle?: number }>> = {
  "endmill-3mm": { name: "Endmill 3mm", type: "endmill", diameter: 3 },
  "endmill-6mm": { name: "Endmill 6mm", type: "endmill", diameter: 6 },
  "ballnose-3mm": { name: "Ballnose 3mm", type: "ballnose", diameter: 3 },
  "v-bit-60deg": { name: "V-bit 60°", type: "v-bit", diameter: 6, angle: 60 }
}

export const EXPLORER_MATERIALS: Readonly<Record<string, { readonly name: string; readonly hardness: string; readonly feedrateFactor: number }>> = {
  "wood-oak": { name: "Wood - Oak", hardness: "medium", feedrateFactor: 1.0 },
  "wood-maple": { name: "Wood - Maple", hardness: "hard", feedrateFactor: 0.8 },
  "aluminum": { name: "Aluminum", hardness: "hard", feedrateFactor: 0.5 },
  "acrylic": { name: "Acrylic", hardness: "medium", feedrateFactor: 0.7 }
}

/** Display name of a preset tool in the current language; the English `name` stays the stored/data value. */
export const toolLabel = (toolId: string): string => {
  const key = `cam.explorer.toolName.${toolId}` as Key
  const label = t(key)
  return label === key ? (EXPLORER_TOOLS[toolId]?.name ?? toolId) : label
}

/** Display name of a preset material in the current language. */
export const materialLabel = (materialId: string): string => {
  const key = `cam.explorer.materialName.${materialId}` as Key
  const label = t(key)
  return label === key ? (EXPLORER_MATERIALS[materialId]?.name ?? materialId) : label
}

/** Tool type (`endmill`, `ballnose`, `v-bit`) in the current language. */
export const toolTypeLabel = (type: string): string => {
  const key = `cam.explorer.toolType.${type}` as Key
  const label = t(key)
  return label === key ? type : label
}

/** Material hardness (`medium`, `hard`) in the current language. */
export const hardnessLabel = (hardness: string): string => {
  const key = `cam.explorer.hardness.${hardness}` as Key
  const label = t(key)
  return label === key ? hardness : label
}
