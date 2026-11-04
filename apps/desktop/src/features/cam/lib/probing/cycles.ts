/**
 * Probe cycles as element toolpaths (spec 73 §4): one source of truth, the multi-toolpath store. A cycle is an `ElementToolpath` whose
 * `toolpathSettings.operationType` is "probing" and whose `probe` holds the operation, so it is listed, ordered, shown and hidden
 * like every toolpath. Pure reducers over a state snapshot; the store wraps them.
 */
import { cam } from "@cadcamfun/core"
import * as model from "../multiToolpath.ts"
import type { ElementToolpath, MultiToolpathState } from "../multiToolpath.ts"
import type { ProbeOperation } from "./operation.ts"

export const PROBE_ELEMENT_TYPE = "probe"

export type ProbeToolpath = ElementToolpath & { readonly probe: ProbeOperation }

export const isProbeToolpath = (toolpath: ElementToolpath): toolpath is ProbeToolpath => toolpath.probe !== undefined

/** The probe cycles in execution order. */
export const probeCycles = (state: Pick<MultiToolpathState, "toolpaths">): ReadonlyArray<ProbeToolpath> =>
  [...state.toolpaths].filter(isProbeToolpath).sort((a, b) => a.order - b.order)

const settingsOf = (): ElementToolpath["toolpathSettings"] => cam.generator.decodeSettings({ machineType: "mill", operationType: "probing" })

/** Adds `probe` as a new toolpath at the end of the order; returns the new state and the id. */
export const addProbeCycle = (state: MultiToolpathState, probe: ProbeOperation, id: string = model.newToolpathId()): { readonly state: MultiToolpathState; readonly id: string } => {
  const added = model.addToolpath(state, { id, elementId: id, elementType: PROBE_ELEMENT_TYPE, elementName: probe.name, settings: settingsOf() })
  return { id, state: model.updateToolpath(added, id, { probe }) }
}

/** `patch` laid over the cycle's operation; the toolpath's name follows the operation's. A non-probe id is left alone. */
export const updateProbeCycle = (state: MultiToolpathState, id: string, patch: Partial<ProbeOperation>): MultiToolpathState => {
  const found = state.toolpaths.find((toolpath) => toolpath.id === id)
  if (found?.probe === undefined) return state
  const probe = { ...found.probe, ...patch }
  return model.updateToolpath(state, id, { probe, elementName: probe.name })
}

/** Copy of a cycle placed after it, named `<name> copy`. */
export const duplicateProbeCycle = (state: MultiToolpathState, id: string, copyId: string = model.newToolpathId()): { readonly state: MultiToolpathState; readonly id: string | undefined } => {
  const found = state.toolpaths.find((toolpath) => toolpath.id === id)
  if (found?.probe === undefined) return { state, id: undefined }
  const added = addProbeCycle(state, { ...found.probe, name: `${found.probe.name} copy` }, copyId)
  const order = added.state.toolpaths.map((toolpath) => toolpath.id).filter((other) => other !== copyId)
  order.splice(order.indexOf(id) + 1, 0, copyId)
  return { state: model.reorderToolpaths(added.state, order), id: copyId }
}
