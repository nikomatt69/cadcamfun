import { batch } from "solid-js"
import { create } from "../../../shared/state/zustand.ts"
import { useCADStore } from "../../cad/store/cadStore.ts"
import { useDocumentStore } from "../../cad/store/documentStore.ts"
import { useCamStore } from "./camStore.ts"
import { useGeneratorStore } from "./generatorStore.ts"
import { useVerifyStore } from "./verifyStore.ts"

const capture = () => {
  const cam = useCamStore.getState(), gen = useGeneratorStore.getState(), cad = useCADStore.getState()
  return structuredClone({
    cam: { gcode: cam.gcode, program: cam.program, kernelArtifact: cam.kernelArtifact, kernelRequest: cam.kernelRequest, operationResults: cam.operationResults,
      workpiece: cam.workpiece, material: cam.material, controller: cam.controller, stockAllowance: cam.stockAllowance,
      selectedWorkpieceElementId: cam.selectedWorkpieceElementId, derivedWorkpieceDimensions: cam.derivedWorkpieceDimensions },
    generator: { settings: gen.settings, kernelSettings: gen.kernelSettings, printer: gen.printer, geometryType: gen.geometryType, rectangleWidth: gen.rectangleWidth, rectangleHeight: gen.rectangleHeight,
      circleRadius: gen.circleRadius, polygonSides: gen.polygonSides, polygonRadius: gen.polygonRadius, customPath: gen.customPath, selectedLibraryTool: gen.selectedLibraryTool, depthSetManually: gen.depthSetManually },
    stock: cad.workpiece
  })
}
type Snapshot = ReturnType<typeof capture>
type HistoryLabel = "cam.history.initial" | "cam.history.native" | "cam.history.edit" | "cam.history.settings"
export interface CamHistoryEntry { readonly id: number; readonly label: HistoryLabel; readonly time: number; readonly bytes: number; readonly snapshot: Snapshot }
interface State {
  entries: ReadonlyArray<CamHistoryEntry>; index: number
  undo(): void; redo(): void; restore(index: number): void
}
const MAX_ENTRIES = 50, MAX_BYTES = 32 * 1024 * 1024
let serial = 0, restoring = false, generation = 0
let baseline: Snapshot | undefined
let signature = ""
let queued = false
let owner = ""
const ownerKey = () => { const document = useDocumentStore.getState(); return `${document.projectId ?? ""}:${document.drawingId ?? ""}` }

const replay = (index: number): void => {
  const state = useCamHistoryStore.getState(), entry = state.entries[index]
  if (!entry || owner !== ownerKey()) return
  generation++; queued = false; restoring = true
  const next = structuredClone(entry.snapshot)
  try {
    batch(() => {
      useCamStore.setState({ ...next.cam, playing: false, playbackTime: 0 })
      useGeneratorStore.setState({ ...next.generator, currentGCode: next.cam.gcode, error: null, success: null, detectedCycles: [], selectedCycle: null })
      useCADStore.setState({ workpiece: next.stock })
      useVerifyStore.getState().reset()
      useCamHistoryStore.setState({ index })
    })
    baseline = next; signature = JSON.stringify(next)
  } finally { restoring = false }
}

export const useCamHistoryStore = create<State>((set, get) => ({
  entries: [], index: -1,
  undo: () => { if (get().index > 0) replay(get().index - 1) },
  redo: () => { if (get().index < get().entries.length - 1) replay(get().index + 1) },
  restore: replay
}))

export const resetCamHistory = (): void => {
  generation++; queued = false
  const snapshot = capture(), json = JSON.stringify(snapshot)
  owner = ownerKey(); baseline = snapshot; signature = json
  useCamHistoryStore.setState({ entries: [{ id: serial++, label: "cam.history.initial", time: Date.now(), bytes: json.length * 2, snapshot }], index: 0 })
}

/** Store notifications are coalesced so a generation/import is one coherent program checkpoint. */
export const flushCamHistory = (): void => {
  queued = false
  if (restoring) return
  if (!baseline || owner !== ownerKey()) { resetCamHistory(); return }
  const snapshot = capture(), json = JSON.stringify(snapshot)
  if (json === signature) return
  const before = baseline
  const label: HistoryLabel = snapshot.cam.kernelArtifact?.nc === snapshot.cam.gcode && snapshot.cam.kernelArtifact?.identity.job !== before.cam.kernelArtifact?.identity.job
    ? "cam.history.native" : snapshot.cam.gcode !== before.cam.gcode ? "cam.history.edit" : "cam.history.settings"
  const state = useCamHistoryStore.getState()
  const time = Date.now()
  const withoutProgram = (value: Snapshot) => ({ ...value, cam: { ...value.cam, program: null } })
  const parseOnly = snapshot.cam.gcode === before.cam.gcode && JSON.stringify(withoutProgram(snapshot)) === JSON.stringify(withoutProgram(before))
  const entries = [...(parseOnly ? state.entries : state.entries.slice(0, state.index + 1))]
  const last = entries[state.index]
  const groupEdit = state.index > 0 && last?.label === label && label === "cam.history.edit" && time - last.time < 800
  const entry = { id: serial++, label, time, bytes: json.length * 2, snapshot }
  if (last && (parseOnly || groupEdit)) entries[state.index] = { ...entry, id: last.id, label: last.label }
  else entries.push(entry)
  let bytes = entries.reduce((sum, item) => sum + item.bytes, 0)
  while (entries.length > 2 && (entries.length > MAX_ENTRIES || bytes > MAX_BYTES)) bytes -= entries.shift()!.bytes
  baseline = snapshot; signature = json
  useCamHistoryStore.setState({ entries, index: parseOnly ? state.index : entries.length - 1 })
}

const schedule = (): void => {
  if (restoring || queued) return
  queued = true
  const expected = generation
  queueMicrotask(() => { if (expected === generation) flushCamHistory() })
}
const changed = (next: object, previous: object, fields: ReadonlyArray<string>) => fields.some((field) => (next as Record<string, unknown>)[field] !== (previous as Record<string, unknown>)[field])

/** The page owns subscription lifetime; UI-only playback and panel changes create no history entries. */
export const mountCamHistory = (): (() => void) => {
  const current = useCamHistoryStore.getState()
  if (!baseline || owner !== ownerKey() || current.entries.length === 1 && baseline.cam.gcode === useCamStore.getState().gcode) resetCamHistory()
  else flushCamHistory()
  const off = [
    useCamStore.subscribe((next, previous) => { if (changed(next, previous, Object.keys(baseline?.cam ?? {}))) schedule() }),
    useGeneratorStore.subscribe((next, previous) => { if (changed(next, previous, Object.keys(baseline?.generator ?? {}))) schedule() }),
    useCADStore.subscribe((next, previous) => { if (next.workpiece !== previous.workpiece) schedule() }),
    useDocumentStore.subscribe((next, previous) => {
      if (next.projectId !== previous.projectId || next.drawingId !== previous.drawingId) {
        if (previous.projectId === null && next.projectId !== null && JSON.stringify(capture()) === signature) owner = ownerKey()
        else resetCamHistory()
      }
    })
  ]
  return () => { flushCamHistory(); for (const dispose of off) dispose(); generation++; queued = false }
}
