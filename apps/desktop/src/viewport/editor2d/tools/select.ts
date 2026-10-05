/**
 * Select tool (spec 06-desktop-ui.md §2): click, box and add/remove selection.
 *
 * Selection is UI state, never entity state (spec 03 §2), so this tool only
 * produces ids. It is also the tool that must feel instant at 10 000 entities,
 * hence the spatial index in the `hits` of the pointer event rather than a scan.
 */
import type { Vec2 } from "@cadcamfun/core"
import type { Command } from "../../../state/commands.ts"
import { removeEntities } from "../../../state/commands.ts"
import { type PointerEvent, type Tool, type ToolFactory } from "./tool.ts"

export interface SelectState {
  /** Ids selected before the current gesture started (for additive drags). */
  readonly base: ReadonlyArray<string>
  /** Ids selected now. */
  readonly selection: ReadonlyArray<string>
  /** Anchor and current corner of the rubber band. */
  readonly band: { readonly from: Vec2; readonly to: Vec2 } | undefined
  /** Entities rubber-banded so far; recomputed while dragging. */
  readonly bandHits: ReadonlyArray<string>
  /** True once the pointer went down, so a click and a drag can be told apart. */
  readonly dragging: boolean
}

const initial: SelectState = {
  base: [],
  selection: [],
  band: undefined,
  bandHits: [],
  dragging: false
}

/** Rubber-band threshold in mm; below it the gesture counts as a click. */
export const CLICK_SLOP = 1e-3

/**
 * The select tool. `hits` must come from the spatial index; the band reuses it
 * by asking the editor for candidates through `hits`, so this module stays pure.
 */
export const selectTool = (lookup: (bounds: {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}) => ReadonlyArray<string>): ToolFactory => {
  return (): Tool => withState(initial)

  function withState(state: SelectState): Tool {
    return {
      id: "select",
      status: {
        hint: state.band === undefined ? "Click to select, drag for a box, Shift adds" : "Release to select the box",
        ready: true
      },
      start: () => withState(initial),
      onPointerDown: (event) =>
        withState({
          ...state,
          base: event.modifiers.shift ? state.selection : [],
          band: { from: event.point, to: event.point },
          bandHits: [],
          dragging: false
        }),
      onPointerMove: (event) => {
        if (state.band === undefined) return withState(state)
        const band = { from: state.band.from, to: event.point }
        const dragging =
          state.dragging || Math.hypot(band.to.x - band.from.x, band.to.y - band.from.y) > CLICK_SLOP
        return withState({ ...state, band, bandHits: dragging ? lookup(normalise(band)) : [], dragging })
      },
      onPointerUp: (event) => {
        if (state.band === undefined) return withState(state)
        const additive = event.modifiers.shift
        if (!state.dragging) {
          // A click: toggle the topmost entity under the cursor.
          const hit = event.hits?.[0]
          const selection =
            hit === undefined
              ? additive
                ? state.base
                : []
              : additive
              ? toggle(state.base, hit)
              : [hit]
          return withState({ ...initial, selection, base: selection })
        }
        const additive2 = event.modifiers.shift
        const selection = additive2 ? [...new Set([...state.base, ...state.bandHits])] : state.bandHits
        return withState({ ...initial, selection, base: selection })
      },
      onKey: (key) => {
        if (key === "Escape") return withState({ ...state, selection: state.base, band: undefined, bandHits: [] })
        if (key === "Delete" || key === "Backspace") return withState({ ...state, band: undefined })
        return withState(state)
      },
      preview: () => [],
      command: (tool): Command | undefined => deleteSelection(tool),
      state
    }
  }
}

/** The current selection, for the rest of the editor (properties panel, keys). */
export const selectionOf = (tool: Tool): ReadonlyArray<string> =>
  tool.id === "select" && isSelectState(tool.state) ? tool.state.selection : []

export const selectionBand = (tool: Tool): SelectState["band"] =>
  tool.id === "select" && isSelectState(tool.state) ? tool.state.band : undefined

const isSelectState = (state: unknown): state is SelectState =>
  typeof state === "object" && state !== null && "selection" in state

const deleteSelection = (tool: Tool): Command | undefined => {
  const selection = selectionOf(tool)
  return selection.length === 0 ? undefined : removeEntities(selection, "delete")
}

const toggle = (ids: ReadonlyArray<string>, id: string): string[] =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]

const normalise = (band: { readonly from: Vec2; readonly to: Vec2 }) => ({
  minX: Math.min(band.from.x, band.to.x),
  minY: Math.min(band.from.y, band.to.y),
  maxX: Math.max(band.from.x, band.to.x),
  maxY: Math.max(band.from.y, band.to.y)
})
