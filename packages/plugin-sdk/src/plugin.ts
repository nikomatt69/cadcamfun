/**
 * Plugin entry points (spec 09-plugins.md §2).
 *
 * A plugin is an ES module with a `manifest` and an `activate` that receives the
 * restricted context. `definePlugin` exists purely for inference and for the
 * identity function the loader checks; everything else is convention the host
 * enforces at runtime.
 */
import type { cam } from "@cadcamfun/core"

type Program = cam.Program
type Toolpath = cam.Toolpath
type PostOptions = cam.PostOptions
import type { PluginContext } from "./context.ts"
import type { PluginManifest } from "./manifest.ts"

/** Options a plugin's post-processor receives; mirrors WP2's `PostOptions`. */
export type PluginPostOptions = Partial<PostOptions>

/** A G-code dialect contributed by a plugin. */
export type PluginPostProcessor = (
  program: Program,
  options?: PluginPostOptions
) => string

/** An operation contributed by a plugin, using the WP2 IR types. */
export interface PluginOperation {
  /** Parameter Schema; the host validates UI input with it. */
  readonly schema: unknown
  /** Pure generator: parameters, geometry, tool, stock → toolpath. */
  readonly generate: (params: never, geometry: unknown, tool: unknown, stock: unknown) => Toolpath
}

/** Everything the host looks up on a loaded module. */
export interface PluginModule {
  readonly manifest: PluginManifest
  /**
   * Called once per activation. Whatever it returns is called on deactivation,
   * which keeps teardown next to setup instead of in a second method.
   */
  activate(
    ctx: PluginContext
  ): void | (() => void) | Promise<void | (() => void)>
  deactivate?(): void | Promise<void>
}

/** Identity helper that pins the type of a plugin module. */
export const definePlugin = <M extends PluginModule>(plugin: M): M => plugin

/** Runtime check the loader runs before trusting a module. */
export const isPluginModule = (value: unknown): value is PluginModule => {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { manifest?: unknown; activate?: unknown }
  return typeof candidate.manifest === "object" && candidate.manifest !== null && typeof candidate.activate === "function"
}
