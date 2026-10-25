/**
 * The part of a drawing that is not geometry but still belongs to it: the layers, and the machining setup (raw piece, work
 * origin, machine) the CAM workspace reads. They travel with the stored drawing, so a project reopened tomorrow draws on the
 * same layers and machines the same stock; both used to live only in the memory of the editor that happened to be open.
 */
import { drawing } from "@cadcamfun/core"
import { useCADStore } from "../store/cadStore.ts"
import { useDocumentStore } from "../store/documentStore.ts"
import { useLayerStore, type Layer } from "../store/layerStore.ts"

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** What is stored under `setup`: the raw piece, the work origin offset and the machine the program is for. */
export const setupPayload = (): Record<string, unknown> => {
  const { workpiece, originOffset, selectedMachine } = useCADStore.getState()
  return { workpiece, originOffset, selectedMachine }
}

/** Puts a stored `setup` back; any field that is missing or not usable keeps the editor's current value. */
export const restoreSetup = (stored: unknown): void => {
  const setup = record(stored)
  const store = useCADStore.getState()
  const piece = record(setup["workpiece"])
  if (finite(piece["width"]) && finite(piece["height"]) && finite(piece["depth"]) && piece["width"] > 0 && piece["height"] > 0 && piece["depth"] > 0) {
    store.setWorkpiece({ ...store.workpiece, ...piece, width: piece["width"], height: piece["height"], depth: piece["depth"],
      radius: finite(piece["radius"]) ? piece["radius"] : store.workpiece.radius,
      material: typeof piece["material"] === "string" && piece["material"] !== "" ? piece["material"] : store.workpiece.material })
  }
  const origin = record(setup["originOffset"])
  if (finite(origin["x"]) && finite(origin["y"]) && finite(origin["z"])) store.setOriginOffset({ x: origin["x"], y: origin["y"], z: origin["z"] })
  const machine = setup["selectedMachine"]
  if (machine === null) store.setSelectedMachine(null)
  else if (typeof machine === "object" && machine !== null && typeof (machine as { name?: unknown }).name === "string") store.setSelectedMachine(machine as never)
}

const isLayer = (value: unknown): value is Layer => {
  const layer = record(value)
  return typeof layer["id"] === "string" && layer["id"] !== "" && typeof layer["name"] === "string"
    && typeof layer["visible"] === "boolean" && typeof layer["locked"] === "boolean" && typeof layer["color"] === "string"
}

/** Puts the stored layers back (the layer list a drawing was saved with); an empty or invalid list changes nothing. */
export const restoreLayers = (stored: unknown): void => {
  if (!Array.isArray(stored)) return
  const layers = stored.filter(isLayer)
  if (layers.length === 0 || layers.length !== stored.length) return
  const { activeLayer } = useLayerStore.getState()
  useLayerStore.setState({ layers, activeLayer: layers.some((layer) => layer.id === activeLayer) ? activeLayer : layers[0]!.id })
}

/** What the drawing already knows about itself, to fill the title block fields nobody has written. */
export const titleBlockContext = (): drawing.TitleBlockContext => {
  const { name, author, organization } = useDocumentStore.getState()
  const { workpiece, selectedMachine } = useCADStore.getState()
  return {
    ...(name !== null ? { name } : {}), ...(author !== "" ? { author } : {}), ...(organization !== "" ? { organization } : {}),
    ...(workpiece.material !== "" ? { material: workpiece.material } : {}),
    ...(selectedMachine !== null && typeof selectedMachine.name === "string" ? { machine: selectedMachine.name } : {})
  }
}

/** The title block of the open drawing as every screen shows it: what was written (or the given block), over what the drawing knows. */
export const currentTitleBlock = (stored: unknown = useDocumentStore.getState().titleBlock): drawing.CompleteTitleBlock => drawing.completeTitleBlock(stored, titleBlockContext())

/** What is stored under `titleBlock`: the complete block, so a drawing opened anywhere shows and exports the same one. */
export const titleBlockPayload = (): Record<string, unknown> => ({ ...currentTitleBlock() })

/** Puts a stored `titleBlock` back; fields that are missing or damaged are left to the defaults. */
export const restoreTitleBlock = (stored: unknown): void => { useDocumentStore.getState().setTitleBlock(drawing.validTitleBlockFields(stored)) }
