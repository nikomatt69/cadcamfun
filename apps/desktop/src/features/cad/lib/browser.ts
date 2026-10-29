/**
 * Browser tree rules of the CAD sidebar (Fusion 360 / Creo model browser): which section an element
 * belongs to, how the roots are grouped, and what "isolate" and "show all" change. Pure functions over
 * snapshots, so the rules are testable without a DOM; the explorer only renders their result.
 */

import { t, type Key } from "../../../i18n/index.ts"

export type BrowserKind = "bodies" | "sketches" | "components"
export type GroupMode = "kind" | "layer" | "flat"

const BODIES = new Set(["cube", "box", "sphere", "cylinder", "cone", "torus", "pyramid", "hemisphere", "ellipsoid", "capsule", "prism", "extrude", "revolve", "solid", "extrusion", "revolution", "sweep", "loft", "parametric", "brep", "boolean-union", "boolean-subtract", "boolean-intersect"])
const COMPONENTS = new Set(["component", "group", "assembly", "custom", "composite"])

/** The Fusion-style section of an element type: 3D solids are bodies, containers are components, the rest sketches. */
export const classify = (type: string): BrowserKind => {
  const kind = type.toLowerCase()
  if (COMPONENTS.has(kind)) return "components"
  if (BODIES.has(kind)) return "bodies"
  return "sketches"
}

const KIND_KEY: Readonly<Record<BrowserKind, Key>> = { bodies: "browser.kind.bodies", sketches: "browser.kind.sketches", components: "browser.kind.components" }
/** Section title of a kind in the current language (read at call time, so a language switch reaches it). */
export const kindLabel = (kind: BrowserKind): string => t(KIND_KEY[kind])
const KIND_ORDER: ReadonlyArray<BrowserKind> = ["bodies", "sketches", "components"]

export interface BrowserItem {
  readonly id: string
  readonly type: string
  readonly layerId: string
}

export interface BrowserSection<T extends BrowserItem> {
  readonly id: string
  readonly label: string
  readonly items: ReadonlyArray<T>
}

/**
 * Splits root items into sections. `kind` gives Bodies / Sketches / Components, `layer` one section per layer
 * (empty layers included, so a new layer is visible at once), `flat` a single section. Empty kind sections are dropped.
 */
export const partition = <T extends BrowserItem>(
  items: ReadonlyArray<T>,
  mode: GroupMode,
  layers: ReadonlyArray<{ readonly id: string; readonly name: string }>
): ReadonlyArray<BrowserSection<T>> => {
  if (mode === "flat") return [{ id: "all", label: t("browser.section.elements"), items }]
  if (mode === "layer") {
    const known = new Set(layers.map((layer) => layer.id))
    const sections = layers.map((layer) => ({ id: layer.id, label: layer.name, items: items.filter((item) => item.layerId === layer.id) }))
    const orphans = items.filter((item) => !known.has(item.layerId))
    return orphans.length > 0 ? [...sections, { id: "orphans", label: t("browser.section.noLayer"), items: orphans }] : sections
  }
  return KIND_ORDER
    .map((kind) => ({ id: kind, label: kindLabel(kind), items: items.filter((item) => classify(item.type) === kind) }))
    .filter((section) => section.items.length > 0)
}

export interface VisibilityItem {
  readonly id: string
  readonly visible?: boolean | undefined
}

/** `visible` patches that show only `keep` (and everything they sit in is the caller's business); nothing to change returns `[]`. */
export const isolate = (items: ReadonlyArray<VisibilityItem>, keep: ReadonlyArray<string>): ReadonlyArray<{ readonly id: string; readonly visible: boolean }> => {
  const kept = new Set(keep)
  if (kept.size === 0) return []
  return items.flatMap((item) => {
    const want = kept.has(item.id)
    return (item.visible !== false) === want ? [] : [{ id: item.id, visible: want }]
  })
}

/** Patches that make every hidden item visible again. */
export const showAll = (items: ReadonlyArray<VisibilityItem>): ReadonlyArray<{ readonly id: string; readonly visible: boolean }> =>
  items.filter((item) => item.visible === false).map((item) => ({ id: item.id, visible: true }))

/** Next name for a rename: trimmed, never empty (an empty name keeps the old one). */
export const renamed = (current: string, typed: string): string => typed.trim() === "" ? current : typed.trim()

/** Three-state of a bulk toggle: all on, all off, or mixed (mixed switches everything on). */
export const bulkNext = (flags: ReadonlyArray<boolean>): boolean => !flags.every(Boolean)
