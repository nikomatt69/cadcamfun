/**
 * Which tool the preview draws for a toolpath, and how long it is (spec 31, spec 32 P5/P7): its own model, else the kernel's
 * cutter, else the generator's tool. One rule for the 3D view, the machine's head (the gauge length) and the collision checks.
 */
import { cam } from "@cadcamfun/core"

export interface ToolSources {
  readonly toolModels?: ReadonlyMap<string, cam.ToolModel> | undefined
  readonly tools?: ReadonlyMap<string, cam.kernel.Cutter> | undefined
  readonly defaultToolModel?: cam.ToolModel | undefined
  readonly defaultTool?: cam.kernel.Cutter | undefined
}

export const previewToolFor = (id: string, sources: ToolSources): cam.ToolModel | undefined => {
  const cutter = sources.tools?.get(id)
  const model = sources.toolModels?.get(id)
    ?? (cutter !== undefined ? cam.toolModelFromCutter(cutter) : undefined)
    ?? sources.defaultToolModel
    ?? (sources.defaultTool !== undefined ? cam.toolModelFromCutter(sources.defaultTool) : undefined)
  // A tool setter is on the table, not in the spindle: what plays is a generic cutter.
  return model?.family === "setter" ? cam.toolModelOf({ type: "endmill", diameter: 6 }) : model
}

/** Tip to spindle nose of a tool as drawn: through its holder (the assumed one when it names none). */
export const gaugeOfTool = (model: cam.ToolModel | undefined, withHolder = true): number => {
  // A printer's machine model measures its carriage from the nozzle tip.
  if (model?.family === "nozzle") return 0
  if (model === undefined || (model.family !== "mill" && model.family !== "probe")) return 60
  return cam.toolProfile(model.family === "mill" && withHolder ? { ...model, holder: model.holder ?? cam.assumedHolderOf(model) } : model).length
}

/**
 * The probe the machine carries as a tool model (spec 73 §4): the stylus ball, its length and the body, from the profile's probing
 * block (`undefined` when the machine names no stylus: the preview then draws the generic probe of the settings).
 */
export const probeModelOf = (probing: { readonly stylusDiameter?: number; readonly stylusRadius?: number; readonly stylusLength?: number; readonly body?: { readonly diameter: number } } | undefined): cam.ProbeModel | undefined => {
  const diameter = probing?.stylusDiameter ?? (probing?.stylusRadius !== undefined ? probing.stylusRadius * 2 : undefined)
  if (probing === undefined || diameter === undefined) return undefined
  const assumed: string[] = []
  if (probing.stylusLength === undefined) assumed.push("stylusLength")
  if (probing.body === undefined) assumed.push("bodyDiameter")
  return { family: "probe", ballDiameter: diameter, stylusLength: probing.stylusLength ?? 50, bodyDiameter: probing.body?.diameter ?? 40, assumed }
}
