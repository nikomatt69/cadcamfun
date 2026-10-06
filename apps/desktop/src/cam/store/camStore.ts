// src/cam/store/camStore.ts
/**
 * CAM workspace store (spec 06-desktop-ui.md §3: "all editor state lives in the
 * CAM store, screens are projections over the data").
 *
 * Two kinds of state live here:
 *  - **persisted**: the current toolpath (program), the post-processor choice and
 *    the workpiece; the toolbar/sidebar reflect them.
 *  - **ephemeral**: the simulation clock, the selected operation, the panel
 *    visibility flags; they reset when the screen unmounts.
 *
 * Every action is a small pure reducer, so the page can wire up undo/redo or
 * persist a subset by reading `getState()` and replaying the actions.
 */
import { Schema } from "effect"
import { cam } from "@cadcamfun/core"
import { create } from "../../state/zustand.ts"
import { useCADStore } from "../../cad/store/cadStore.ts"
import { useElementsStore } from "../../cad/store/elementsStore.ts"
import { useSelectionStore } from "../../cad/store/selectorStore.ts"

export type ControllerType = "gcode" | "grbl" | "fanuc"

export type ActiveTab = "preview" | "editor" | "toolpath" | "post"
export type SidebarTab = "workpiece" | "generator" | "operations"
export type RightTab = "generator" | "cycles" | "control"

export interface Workpiece {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface OperationKind {
  readonly id: "profile" | "pocket" | "engrave" | "drill" | "face"
  readonly label: string
  readonly params: Readonly<Record<string, unknown>>
}

/** Size of the raw piece derived from a CAD element (legacy `DerivedWorkpieceDimensions`). */
export interface DerivedWorkpieceDimensions {
  readonly width: number
  readonly height: number
  readonly depth: number
}

interface CAMState {
  // Persistent state
  workpiece: Workpiece
  material: string
  controller: ControllerType
  activeTab: ActiveTab
  sidebarTab: SidebarTab
  rightTab: RightTab
  operation: OperationKind["id"]

  // Ephemeral state
  sidebarOpen: boolean
  rightOpen: boolean
  floatingOpen: boolean
  selectedOperationId: string | undefined
  playing: boolean
  playbackTime: number

  // Last generated program (camera simulation)
  program: cam.Program

  // Legacy CAM store (src/store/camStore.ts): the generated text, the selection and the raw piece
  gcode: string
  selectedEntities: string[]
  selectedWorkpieceElementId: string | null
  derivedWorkpieceDimensions: DerivedWorkpieceDimensions | null
  stockAllowance: number
  isLatheSetup: boolean
  isLoading: boolean
  error: string | null
  workpieceElements: ReadonlyArray<Record<string, unknown>>
  preserveGeometry: boolean

  // Actions
  setWorkpiece(workpiece: Workpiece): void
  setMaterial(material: string): void
  setController(controller: ControllerType): void
  setActiveTab(tab: ActiveTab): void
  setSidebarTab(tab: SidebarTab): void
  setRightTab(tab: RightTab): void
  setOperation(operation: OperationKind["id"]): void
  toggleSidebar(): void
  toggleRight(): void
  toggleFloating(): void
  setSelectedOperationId(id: string | undefined): void
  setPlaying(playing: boolean): void
  setPlaybackTime(seconds: number): void
  setProgram(program: cam.Program): void
  setGcode(gcode: string): void
  toggleEntitySelection(id: string): void
  clearSelectedEntities(): void
  setSelectedWorkpieceElementId(id: string | null): void
  setDerivedWorkpieceDimensions(dimensions: DerivedWorkpieceDimensions | null): void
  setStockAllowance(allowance: number): void
  setIsLatheSetup(isLathe: boolean): void
  setLoading(loading: boolean): void
  setError(error: string | null): void
  resetWorkpieceSelection(): void
  /** Links the CAD workpiece / selected element as the raw piece (legacy `syncWorkpieceFromCAD`). */
  syncWorkpieceFromCAD(): void
  setWorkpieceElements(elements: ReadonlyArray<Record<string, unknown>>): void
  getWorkpieceGeometry(): { dimensions: DerivedWorkpieceDimensions; elementId: string | null } | null
  reset(): void
}

const legacyInitial = {
  gcode: "",
  selectedEntities: [] as string[],
  selectedWorkpieceElementId: null as string | null,
  derivedWorkpieceDimensions: null as DerivedWorkpieceDimensions | null,
  stockAllowance: 1.0,
  isLatheSetup: false,
  isLoading: false,
  error: null as string | null,
  workpieceElements: [] as ReadonlyArray<Record<string, unknown>>,
  preserveGeometry: true
}

/** Sensible defaults — pulled from the original screens/cam.tsx so behaviour is unchanged. */
const initialWorkpiece: Workpiece = { x: 300, y: 180, z: 10 }
const initialProgram = cam.makeProgram("untitled", [], {})

export const useCamStore = create<CAMState>((set, get) => ({
  workpiece: initialWorkpiece,
  material: "",
  controller: "gcode",
  activeTab: "editor",
  sidebarTab: "workpiece",
  rightTab: "generator",
  operation: "profile",

  sidebarOpen: true,
  rightOpen: true,
  floatingOpen: true,
  selectedOperationId: undefined,
  playing: false,
  playbackTime: 0,
  program: initialProgram,
  ...legacyInitial,

  setWorkpiece: (workpiece) => set({ workpiece }),
  setMaterial: (material) => set({ material }),
  setController: (controller) => set({ controller }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setRightTab: (tab) => set({ rightTab: tab }),
  setOperation: (operation) => set({ operation }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleRight: () => set((state) => ({ rightOpen: !state.rightOpen })),
  toggleFloating: () => set((state) => ({ floatingOpen: !state.floatingOpen })),
  setSelectedOperationId: (id) => set({ selectedOperationId: id }),
  setPlaying: (playing) => set({ playing }),
  setPlaybackTime: (seconds) => set({ playbackTime: seconds }),
  setProgram: (program) => set({ program }),
  setGcode: (gcode) => set({ gcode }),
  toggleEntitySelection: (id) => set((state) => ({
    selectedEntities: state.selectedEntities.includes(id) ? state.selectedEntities.filter((entity) => entity !== id) : [...state.selectedEntities, id]
  })),
  clearSelectedEntities: () => set({ selectedEntities: [] }),
  setSelectedWorkpieceElementId: (id) => set((state) => ({
    selectedWorkpieceElementId: id,
    // Clearing the selection keeps nothing derived from it.
    derivedWorkpieceDimensions: id ? state.derivedWorkpieceDimensions : null
  })),
  setDerivedWorkpieceDimensions: (dimensions) => set({ derivedWorkpieceDimensions: dimensions }),
  setStockAllowance: (allowance) => set({ stockAllowance: allowance >= 0 ? allowance : 0 }),
  setIsLatheSetup: (isLathe) => set({ isLatheSetup: isLathe }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  resetWorkpieceSelection: () => set({ selectedWorkpieceElementId: null, derivedWorkpieceDimensions: null }),

  syncWorkpieceFromCAD: () => {
    const { elements, selectedElement } = useElementsStore.getState()
    const cadWorkpiece = useCADStore.getState().workpiece
    const mirror = (dimensions: DerivedWorkpieceDimensions) => set({ workpiece: { x: dimensions.width, y: dimensions.height, z: dimensions.depth } })

    // 1. The CAD workpiece already points at an element: that element is the raw piece.
    const linked = cadWorkpiece.elementId !== undefined ? elements.find((element) => element.id === cadWorkpiece.elementId) : undefined
    if (linked !== undefined) {
      const dimensions = cam.generator.calculateElementDimensions(linked)
      set({ selectedWorkpieceElementId: linked.id, derivedWorkpieceDimensions: dimensions, workpieceElements: [linked], preserveGeometry: true })
      mirror(dimensions)
      return
    }
    // 2. Otherwise the selected element becomes the raw piece, and the CAD store learns about it.
    if (selectedElement !== null) {
      const dimensions = cam.generator.calculateElementDimensions(selectedElement)
      set({ selectedWorkpieceElementId: selectedElement.id, derivedWorkpieceDimensions: dimensions, workpieceElements: [selectedElement], preserveGeometry: true })
      useCADStore.getState().setWorkpiece({
        width: dimensions.width || cadWorkpiece.width,
        height: dimensions.height || cadWorkpiece.height,
        depth: dimensions.depth || cadWorkpiece.depth,
        material: String(selectedElement["material"] ?? cadWorkpiece.material),
        radius: Number(selectedElement["radius"] ?? cadWorkpiece.radius ?? 0),
        elementId: selectedElement.id
      })
      mirror(dimensions)
      return
    }
    // 3. Nothing selected: just expose the available elements and take the CAD workpiece size.
    set({ workpieceElements: elements, preserveGeometry: true })
    mirror({ width: cadWorkpiece.width, height: cadWorkpiece.height, depth: cadWorkpiece.depth })
  },

  setWorkpieceElements: (elements) => set({ workpieceElements: elements }),

  getWorkpieceGeometry: () => {
    const { selectedWorkpieceElementId, derivedWorkpieceDimensions } = get()
    if (selectedWorkpieceElementId !== null && derivedWorkpieceDimensions !== null) {
      return { dimensions: derivedWorkpieceDimensions, elementId: selectedWorkpieceElementId }
    }
    const cadWorkpiece = useCADStore.getState().workpiece
    return { dimensions: { width: cadWorkpiece.width, height: cadWorkpiece.height, depth: cadWorkpiece.depth }, elementId: null }
  },

  reset: () => set({
    workpiece: initialWorkpiece,
    material: "",
    controller: "gcode",
    activeTab: "editor",
    sidebarTab: "workpiece",
    rightTab: "generator",
    operation: "profile",
    sidebarOpen: true,
    rightOpen: true,
    floatingOpen: true,
    selectedOperationId: undefined,
    playing: false,
    playbackTime: 0,
    program: initialProgram,
    ...legacyInitial
  })
}))

/** Elements the user has selected in the CAD editor, as CAM operations see them (legacy `selectedEntities` + CAD selection). */
export const selectedCadElementIds = (): ReadonlyArray<string> => useSelectionStore.getState().selectedElementIds

/**
 * Validates a toolpath generation request against the current state. Returns
 * either the list of cuts (a toolpath), or an error message the form can show
 * inline.
 */
export type ToolpathFailure =
  | { readonly _tag: "NoProject" }
  | { readonly _tag: "NoGeometry" }
  | { readonly _tag: "NoTool" }
  | { readonly _tag: "InvalidStock" }
  | { readonly _tag: "DecodeError"; readonly issue: string }

export interface GenerateInput {
  readonly projectId: string | undefined
  readonly entities: ReadonlyArray<unknown>
  readonly workpiece: Workpiece
  readonly totalDepth: number
  readonly tool: unknown
}

/** Helper kept here so it is testable in isolation from any Solid component. */
export const validateGenerate = (input: GenerateInput): ToolpathFailure | undefined => {
  if (input.projectId === undefined) return { _tag: "NoProject" }
  if (input.entities.length === 0) return { _tag: "NoGeometry" }
  if (input.tool === undefined) return { _tag: "NoTool" }
  const dims = [input.workpiece.x, input.workpiece.y, input.workpiece.z]
  if (dims.some((value) => !Number.isFinite(value) || value <= 0)) return { _tag: "InvalidStock" }
  if (input.totalDepth > input.workpiece.z) return { _tag: "InvalidStock" }
  return undefined
}

/** Build a typed `Tool` from a row that comes from the `tools.list` endpoint. */
export interface ToolRow {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly diameter: number
  readonly numberOfFlutes?: number
  readonly maxRPM?: number
}

/**
 * Best-effort coercion of a `tools.list` row to a `cam.Tool`. If the `type`
 * field is not a known tool kind, the row is rejected and a safe default is
 * returned so the UI keeps a working value to display.
 */
export const toolFromRow = (row: ToolRow): cam.Tool => {
  const known: ReadonlyArray<cam.Tool["kind"]> = ["endmill", "ballnose", "drill", "vbit", "facemill"]
  const kind = (known as ReadonlyArray<string>).includes(row.type) ? (row.type as cam.Tool["kind"]) : "endmill"
  const candidate: cam.Tool = {
    id: row.id,
    name: row.name,
    kind,
    diameter: row.diameter,
    flutes: row.numberOfFlutes ?? 2,
    maxRpm: row.maxRPM ?? 18000
  }
  const decoded = Schema.decodeUnknownOption(cam.ToolSchema)(candidate)
  if (decoded._tag === "Some") return decoded.value
  // Schema rejected: keep the row id so it still shows up in selectors, but pin
  // everything else to safe defaults so the rest of the editor can rely on it.
  return {
    id: row.id,
    name: row.name,
    kind: "endmill",
    diameter: Number.isFinite(row.diameter) && row.diameter > 0 ? row.diameter : 1,
    flutes: row.numberOfFlutes && row.numberOfFlutes >= 1 ? row.numberOfFlutes : 2,
    maxRpm: row.maxRPM && row.maxRPM > 0 ? row.maxRPM : 18000
  }
}

/** Reads a JSON blob as a typed `cam.Program`. Returns `undefined` on shape mismatch. */
export const decodeProgramOrUndefined = (value: unknown): cam.Program | undefined => {
  const decoded = Schema.decodeUnknownOption(cam.ProgramSchema)(value)
  return decoded._tag === "Some" ? decoded.value : undefined
}