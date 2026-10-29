/**
 * The one place the Cycles tab talks to `cam.cycles`. Templates, the controller each post uses, and macro snippets
 * all come from core. The tab does not invent NC.
 */
import { cam } from "@cadcamfun/core"

export type CycleController = cam.cycles.CycleController
export type CycleTemplate = cam.cycles.CycleTemplate
export type CycleParameter = cam.cycles.CycleParameter
export type CycleValues = cam.cycles.CycleValues
export type MacroSnippet = cam.cycles.MacroSnippet

export const controllers = (): ReadonlyArray<{ readonly id: CycleController; readonly name: string }> => cam.cycles.CONTROLLERS

export const controllerName = (controller: CycleController): string =>
  controllers().find((entry) => entry.id === controller)?.name ?? controller

/** The controller family of a post. An unknown post uses the generic ISO dialect. */
export const controllerOfPost = (postId: string): CycleController => cam.cycles.controllerOfPost(postId)

export const cycleSupport = (controller: CycleController): { readonly cycles: boolean; readonly macros: boolean; readonly note?: string } =>
  cam.cycles.cycleSupport(controller)

export const availableCycles = (controller: CycleController): ReadonlyArray<CycleTemplate> => cam.cycles.availableCycles(controller)

export const findCycle = (id: string): CycleTemplate | undefined => cam.cycles.findCycle(id)

export const defaultCycleValues = (cycle: CycleTemplate): CycleValues => cam.cycles.defaultCycleValues(cycle)

export const generateCycleCode = (cycle: CycleTemplate, values: CycleValues, controller: CycleController): string =>
  cam.cycles.generateCycleCode(cycle, values, controller)

export const availableMacros = (controller: CycleController): ReadonlyArray<MacroSnippet> => cam.cycles.availableMacros(controller)

export const generateMacro = (snippetId: string, values: CycleValues, controller: CycleController): string =>
  cam.cycles.generateMacro(snippetId, values, controller)

/** Defaults of a parameter list (macro snippets have no template around them). */
export const defaultValues = (parameters: ReadonlyArray<CycleParameter>): CycleValues =>
  Object.fromEntries(parameters.map((param) => [param.name, param.defaultValue]))
