/**
 * The multi-toolpath model (legacy `multiToolpathStore.ts`): one toolpath per CAD element, an execution order, a
 * colour, visibility and a combined program.
 *
 * Pure reducers over a state snapshot; the Solid store (`cam/store/multiToolpathStore.ts`) wires them to signals and
 * persistence. Everything is immutable (the legacy store sorted and mutated arrays in place).
 */
import type { ToolpathSettings } from "./elementJob.ts"

export interface ToolpathPoint {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly feedrate?: number
  readonly type?: string
  readonly isRapid?: boolean
  readonly isArc?: boolean
  readonly elementId?: string
}

/** One toolpath bound to one CAD element. */
export interface ElementToolpath {
  readonly id: string
  readonly elementId: string
  readonly elementType: string
  readonly elementName: string
  readonly toolpathSettings: ToolpathSettings
  readonly gcode: string
  /** Display colour (hex). */
  readonly color: string
  readonly visible: boolean
  readonly toolpathPoints: ReadonlyArray<ToolpathPoint>
  readonly selected: boolean
  /** Execution order. */
  readonly order: number
  /** Seconds. */
  readonly estimatedTime: number
  /** Total path length, mm. */
  readonly distance: number
}

export const TOOLPATH_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FECA57", "#DDA0DD", "#98D8C8", "#FFB6C1", "#FFA07A", "#87CEEB"
] as const

export interface MultiToolpathState {
  readonly toolpaths: ReadonlyArray<ElementToolpath>
  readonly selectedToolpathIds: ReadonlyArray<string>
  readonly activeToolpathId: string | null
  /** Defaults applied to the selected toolpaths by `applyGlobalSettingsToSelected`. */
  readonly globalSettings: Partial<ToolpathSettings>
}

export const INITIAL_GLOBAL_SETTINGS: Partial<ToolpathSettings> = {
  feedrate: 800,
  plungerate: 300,
  rpm: 10000,
  depth: 5,
  stepdown: 1,
  stepover: 40,
  toolDiameter: 6,
  offset: "outside",
  direction: "climb"
}

export const initialState = (): MultiToolpathState => ({ toolpaths: [], selectedToolpathIds: [], activeToolpathId: null, globalSettings: { ...INITIAL_GLOBAL_SETTINGS } })

const reindex = (toolpaths: ReadonlyArray<ElementToolpath>): ElementToolpath[] => toolpaths.map((toolpath, order) => ({ ...toolpath, order }))
const byOrder = (toolpaths: ReadonlyArray<ElementToolpath>): ElementToolpath[] => [...toolpaths].sort((a, b) => a.order - b.order)

export const newToolpathId = (): string => `toolpath-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

/** Adds an empty toolpath for an element; the colour cycles through the palette. */
export const addToolpath = (
  state: MultiToolpathState,
  input: { readonly id?: string; readonly elementId: string; readonly elementType: string; readonly elementName: string; readonly settings: ToolpathSettings }
): MultiToolpathState => ({
  ...state,
  toolpaths: [
    ...state.toolpaths,
    {
      id: input.id ?? newToolpathId(),
      elementId: input.elementId,
      elementType: input.elementType,
      elementName: input.elementName,
      toolpathSettings: input.settings,
      gcode: "",
      color: TOOLPATH_COLORS[state.toolpaths.length % TOOLPATH_COLORS.length]!,
      visible: true,
      toolpathPoints: [],
      selected: false,
      order: state.toolpaths.length,
      estimatedTime: 0,
      distance: 0
    }
  ]
})

export const updateToolpath = (state: MultiToolpathState, id: string, updates: Partial<ElementToolpath>): MultiToolpathState => ({
  ...state,
  toolpaths: state.toolpaths.map(toolpath => (toolpath.id === id ? { ...toolpath, ...updates } : toolpath))
})

const without = (state: MultiToolpathState, ids: ReadonlyArray<string>): MultiToolpathState => ({
  ...state,
  toolpaths: reindex(state.toolpaths.filter(toolpath => !ids.includes(toolpath.id))),
  selectedToolpathIds: state.selectedToolpathIds.filter(id => !ids.includes(id)),
  activeToolpathId: state.activeToolpathId !== null && ids.includes(state.activeToolpathId) ? null : state.activeToolpathId
})

export const removeToolpath = (state: MultiToolpathState, id: string): MultiToolpathState => without(state, [id])

export const removeToolpathsByElementId = (state: MultiToolpathState, elementId: string): MultiToolpathState =>
  without(state, state.toolpaths.filter(toolpath => toolpath.elementId === elementId).map(toolpath => toolpath.id))

export const selectToolpath = (state: MultiToolpathState, id: string): MultiToolpathState => ({
  ...state,
  toolpaths: state.toolpaths.map(toolpath => (toolpath.id === id ? { ...toolpath, selected: true } : toolpath)),
  selectedToolpathIds: state.selectedToolpathIds.includes(id) ? state.selectedToolpathIds : [...state.selectedToolpathIds, id],
  activeToolpathId: id
})

export const deselectToolpath = (state: MultiToolpathState, id: string): MultiToolpathState => ({
  ...state,
  toolpaths: state.toolpaths.map(toolpath => (toolpath.id === id ? { ...toolpath, selected: false } : toolpath)),
  selectedToolpathIds: state.selectedToolpathIds.filter(selected => selected !== id),
  activeToolpathId: state.activeToolpathId === id ? null : state.activeToolpathId
})

export const selectAllToolpaths = (state: MultiToolpathState): MultiToolpathState => ({
  ...state,
  toolpaths: state.toolpaths.map(toolpath => ({ ...toolpath, selected: true })),
  selectedToolpathIds: state.toolpaths.map(toolpath => toolpath.id)
})

export const deselectAllToolpaths = (state: MultiToolpathState): MultiToolpathState => ({
  ...state,
  toolpaths: state.toolpaths.map(toolpath => ({ ...toolpath, selected: false })),
  selectedToolpathIds: [],
  activeToolpathId: null
})

export const toggleToolpathVisibility = (state: MultiToolpathState, id: string): MultiToolpathState => ({
  ...state,
  toolpaths: state.toolpaths.map(toolpath => (toolpath.id === id ? { ...toolpath, visible: !toolpath.visible } : toolpath))
})

export const setAllVisible = (state: MultiToolpathState, visible: boolean): MultiToolpathState => ({
  ...state,
  toolpaths: state.toolpaths.map(toolpath => ({ ...toolpath, visible }))
})

/** Parses G-code into points: every G0 / G1 / G2 / G3 move, with modal X / Y / Z / F carried over (legacy `parseGCodeToPoints`). */
export const parseGCodeToPoints = (gcode: string): ToolpathPoint[] => {
  const points: ToolpathPoint[] = []
  let x = 0
  let y = 0
  let z = 0
  let f = 0
  for (const raw of gcode.split("\n")) {
    const line = raw.replace(/\(.*?\)/g, "").split(";")[0]!.trim()
    if (line.length === 0) continue
    const motion = /(?:^|\s)G0*([0-3])(?!\d)/i.exec(line)
    if (motion === null) continue
    const word = (letter: string): number | undefined => {
      const match = new RegExp(`${letter}([+-]?\\d*\\.?\\d+)`, "i").exec(line)
      return match === null ? undefined : parseFloat(match[1]!)
    }
    x = word("X") ?? x
    y = word("Y") ?? y
    z = word("Z") ?? z
    f = word("F") ?? f
    const code = Number(motion[1])
    points.push({ x, y, z, feedrate: f, type: `G${code}`, isRapid: code === 0, isArc: code === 2 || code === 3 })
  }
  return points
}

/** Path length (mm) and estimated seconds of a point list (legacy: time from the modal feedrate of each move). */
export const measurePoints = (points: ReadonlyArray<ToolpathPoint>): { readonly distance: number; readonly time: number } => {
  let distance = 0
  let time = 0
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!
    const to = points[i]!
    const length = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2 + (to.z - from.z) ** 2)
    distance += length
    if (to.feedrate !== undefined && to.feedrate > 0) time += (length / to.feedrate) * 60
  }
  return { distance, time }
}

/**
 * Stores generated G-code on a toolpath. Distance and time come from the points, unless the generator already
 * measured them (`measured`, the sidecar's statistics).
 */
export const updateToolpathGCode = (
  state: MultiToolpathState,
  id: string,
  gcode: string,
  points: ReadonlyArray<ToolpathPoint>,
  measured?: { readonly distance: number; readonly time: number }
): MultiToolpathState => {
  const { distance, time } = measured ?? measurePoints(points)
  return {
    ...state,
    toolpaths: state.toolpaths.map(toolpath =>
      toolpath.id === id
        ? { ...toolpath, gcode, toolpathPoints: points.map(point => ({ ...point, elementId: toolpath.elementId })), estimatedTime: time, distance }
        : toolpath
    )
  }
}

export const reorderToolpaths = (state: MultiToolpathState, newOrder: ReadonlyArray<string>): MultiToolpathState => ({
  ...state,
  toolpaths: byOrder(state.toolpaths.map(toolpath => ({ ...toolpath, order: newOrder.indexOf(toolpath.id) })))
})

const swap = (state: MultiToolpathState, id: string, delta: -1 | 1): MultiToolpathState => {
  const toolpaths = [...state.toolpaths]
  const index = toolpaths.findIndex(toolpath => toolpath.id === id)
  const target = index + delta
  if (index < 0 || target < 0 || target >= toolpaths.length) return state
  ;[toolpaths[index], toolpaths[target]] = [toolpaths[target]!, toolpaths[index]!]
  return { ...state, toolpaths: reindex(toolpaths) }
}

export const moveToolpathUp = (state: MultiToolpathState, id: string): MultiToolpathState => swap(state, id, -1)
export const moveToolpathDown = (state: MultiToolpathState, id: string): MultiToolpathState => swap(state, id, 1)

export const toolpathByElementId = (state: MultiToolpathState, elementId: string): ElementToolpath | undefined =>
  state.toolpaths.find(toolpath => toolpath.elementId === elementId)

export const applyGlobalSettingsToSelected = (state: MultiToolpathState): MultiToolpathState => ({
  ...state,
  toolpaths: state.toolpaths.map(toolpath =>
    state.selectedToolpathIds.includes(toolpath.id)
      ? { ...toolpath, toolpathSettings: { ...toolpath.toolpathSettings, ...state.globalSettings } as ToolpathSettings }
      : toolpath
  )
})

/**
 * One text from every generated toolpath, in execution order (legacy `generateCombinedGCode`).
 *
 * @deprecated Not a program: every block keeps its own header, `M30` and `%`, and no tool change is written (spec 14 §1). The panel
 * downloads through the setup path (`lib/setup.ts` -> `camSetup.generate`); this stays only for the legacy text view and its test.
 */
export const combineGCode = (toolpaths: ReadonlyArray<ElementToolpath>, stamp: string = new Date().toISOString()): string => {
  const ordered = byOrder(toolpaths)
  let text = "; Combined G-Code from Multiple Toolpaths\n"
  text += `; Generated: ${stamp}\n`
  text += `; Total toolpaths: ${ordered.length}\n\n`
  ordered.forEach((toolpath, index) => {
    if (!toolpath.gcode) return
    text += `\n; ===== Toolpath ${index + 1}: ${toolpath.elementName} =====\n`
    text += `; Element Type: ${toolpath.elementType}\n`
    text += `; Tool: Ø${toolpath.toolpathSettings.toolDiameter}mm\n`
    text += `; Color: ${toolpath.color}\n\n`
    text += toolpath.gcode
    text += "\n"
  })
  text += "\n; ===== End of Combined G-Code =====\n"
  return text
}

export const statistics = (toolpaths: ReadonlyArray<ElementToolpath>) => ({
  totalToolpaths: toolpaths.length,
  generatedToolpaths: toolpaths.filter(toolpath => toolpath.gcode).length,
  totalDistance: toolpaths.reduce((sum, toolpath) => sum + toolpath.distance, 0),
  totalTime: toolpaths.reduce((sum, toolpath) => sum + toolpath.estimatedTime, 0)
})

/** `m:ss` as the legacy panels print estimated time. */
export const formatDuration = (seconds: number): string => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(0).padStart(2, "0")}`
