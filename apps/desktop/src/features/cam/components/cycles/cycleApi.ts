/**
 * The one place the Cycles tab talks to `cam.cycles`. The core exposes every controller, fixed-cycle template and
 * macro snippet; where the core build in use predates a function (controller table, macros) the tab degrades to the
 * original Fanuc / Heidenhain behaviour instead of crashing.
 */
import { cam } from "@cadcamfun/core"

export type CycleController = "fanuc" | "haas" | "mazak" | "okuma" | "siemens" | "heidenhain" | "linuxcnc" | "generic"
export type CycleTemplate = cam.cycles.CycleTemplate
export type CycleParameter = cam.cycles.CycleParameter
export type CycleValues = cam.cycles.CycleValues

/** A macro / variable snippet: parameters work exactly like those of a cycle template. */
export interface MacroSnippet {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly parameters: ReadonlyArray<CycleParameter>
}

interface CycleCore {
  readonly CONTROLLERS?: ReadonlyArray<{ readonly id: CycleController; readonly name: string }>
  readonly controllerOfPost?: (postId: string) => CycleController | undefined
  readonly cycleSupport?: (controller: CycleController) => { readonly cycles: boolean; readonly macros: boolean; readonly note?: string }
  readonly availableCycles: (controller: never) => ReadonlyArray<CycleTemplate & { readonly family?: string }>
  readonly findCycle: (id: string) => CycleTemplate | undefined
  readonly defaultCycleValues: (cycle: CycleTemplate) => CycleValues
  readonly generateCycleCode: (cycle: CycleTemplate, values: CycleValues, controller: never) => string
  readonly availableMacros?: (controller: CycleController) => ReadonlyArray<MacroSnippet>
  readonly generateMacro?: (snippetId: string, values: CycleValues, controller: CycleController) => string
}

const core = cam.cycles as unknown as CycleCore

const LEGACY_CONTROLLERS: ReadonlyArray<{ readonly id: CycleController; readonly name: string }> = [
  { id: "fanuc", name: "Fanuc" },
  { id: "heidenhain", name: "Heidenhain" }
]

export const controllers = (): ReadonlyArray<{ readonly id: CycleController; readonly name: string }> => core.CONTROLLERS ?? LEGACY_CONTROLLERS

export const controllerName = (controller: CycleController): string => controllers().find((entry) => entry.id === controller)?.name ?? controller

/** The controller family of a post; unknown posts fall back to the generic dialect. */
export const controllerOfPost = (postId: string): CycleController =>
  core.controllerOfPost?.(postId) ?? (postId === "heidenhain" ? "heidenhain" : postId === "fanuc" ? "fanuc" : "generic")

export const cycleSupport = (controller: CycleController): { readonly cycles: boolean; readonly macros: boolean; readonly note?: string } =>
  core.cycleSupport?.(controller) ?? { cycles: controller === "fanuc" || controller === "heidenhain", macros: false }

export const availableCycles = (controller: CycleController): ReadonlyArray<CycleTemplate & { readonly family?: string }> =>
  core.availableCycles(controller as never)

export const findCycle = (id: string): CycleTemplate | undefined => core.findCycle(id)
export const defaultCycleValues = (cycle: CycleTemplate): CycleValues => core.defaultCycleValues(cycle)
export const generateCycleCode = (cycle: CycleTemplate, values: CycleValues, controller: CycleController): string =>
  core.generateCycleCode(cycle, values, controller as never)

export const availableMacros = (controller: CycleController): ReadonlyArray<MacroSnippet> => core.availableMacros?.(controller) ?? []
export const generateMacro = (snippetId: string, values: CycleValues, controller: CycleController): string =>
  core.generateMacro?.(snippetId, values, controller) ?? ""

/** Defaults of a parameter list (macro snippets have no template around them). */
export const defaultValues = (parameters: ReadonlyArray<CycleParameter>): CycleValues =>
  Object.fromEntries(parameters.map((param) => [param.name, param.defaultValue]))
