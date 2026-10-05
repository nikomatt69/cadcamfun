/**
 * The plugin context: the restricted API surface the host hands to a plugin
 * (spec 09-plugins.md §2).
 *
 * Every surface is optional, and it is only present when the capability was
 * granted. A plugin therefore has to check `ctx.drawing` before using it, which
 * is the point: a missing capability must be visible in the type *and* at
 * runtime, not a silent no-op.
 */
import type { cad, cam } from "@cadcamfun/core"

type Drawing = cad.Drawing
type Program = cam.Program
type Toolpath = cam.Toolpath
import type { CommandContribution, PanelContribution } from "./manifest.ts"
import type { Capability } from "./capability.ts"

/** What a plugin may log; the host prefixes it with the plugin id. */
export interface PluginLogger {
  debug(message: string, ...args: ReadonlyArray<unknown>): void
  info(message: string, ...args: ReadonlyArray<unknown>): void
  warn(message: string, ...args: ReadonlyArray<unknown>): void
  error(message: string, ...args: ReadonlyArray<unknown>): void
}

/** Namespaced key-value storage, private to the plugin instance. */
export interface PluginStorage {
  get(key: string): string | undefined
  set(key: string, value: string): void
  delete(key: string): void
  keys(): ReadonlyArray<string>
}

/** A patch applied to the drawing, in the same shape the UI uses. */
export type DrawingPatch =
  | { readonly _tag: "AddEntity"; readonly entity: Drawing["entities"][number] }
  | { readonly _tag: "UpdateEntity"; readonly id: string; readonly entity: Drawing["entities"][number] }
  | { readonly _tag: "RemoveEntity"; readonly id: string }

/** Read/patch access to the current drawing. */
export interface DrawingApi {
  /** The whole drawing, or `undefined` when no drawing is open. */
  read(): Drawing | undefined
  /** Applies a patch and returns the new revision. */
  patch(patch: DrawingPatch): number
}

/** Read access to toolpaths and G-code programs. */
export interface ToolpathApi {
  list(): ReadonlyArray<Toolpath>
  program(toolpathId: string): Program | undefined
}

/** Declarative UI contributions. There is no DOM access, ever. */
export interface UiApi {
  registerCommand(command: CommandContribution): void
  registerPanel(panel: PanelContribution): void
}

/** The context a plugin receives; each surface is present only when granted. */
export interface PluginContext {
  readonly pluginId: string
  /** Capabilities actually in force, already resolved through implication. */
  readonly capabilities: ReadonlyArray<Capability>
  readonly log: PluginLogger
  readonly drawing?: DrawingApi
  readonly toolpath?: ToolpathApi
  readonly storage?: PluginStorage
  readonly ui?: UiApi
}

/**
 * Type-level guard: narrows a context to one that surely has `surface`.
 * `requireCapability(ctx, "drawing:read")` is its runtime counterpart.
 */
export const requireCapability = <K extends keyof PluginContext>(
  ctx: PluginContext,
  capability: Capability,
  surface: K
): NonNullable<PluginContext[K]> => {
  const value = ctx[surface]
  if (value === undefined) {
    throw new CapabilityError(ctx.pluginId, capability)
  }
  return value as NonNullable<PluginContext[K]>
}

/** Thrown when a plugin touches a capability it was not granted. */
export class CapabilityError extends Error {
  readonly _tag = "CapabilityDenied"
  constructor(
    readonly pluginId: string,
    readonly capability: Capability
  ) {
    super(`Plugin ${pluginId} may not use "${capability}": it was not granted at install time`)
    this.name = "CapabilityError"
  }
}
