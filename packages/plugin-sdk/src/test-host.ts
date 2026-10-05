/**
 * `createTestHost`: the in-memory host plugin authors unit-test against
 * (spec 09-plugins.md §2, §5).
 *
 * It is deliberately a *host*, not a mock: capability enforcement is the same as
 * in production (a missing capability means the surface is absent and a typed
 * `CapabilityError` is thrown), because a mock that grants everything would let
 * a plugin pass its tests and fail at install time.
 */
import type { cad, cam } from "@cadcamfun/core"

type Drawing = cad.Drawing
type Program = cam.Program
type Toolpath = cam.Toolpath
import { type Capability, effectiveCapabilities, storageNamespace } from "./capability.ts"
import {
  type DrawingApi,
  type DrawingPatch,
  type PluginContext,
  type PluginLogger,
  type PluginStorage,
  type ToolpathApi,
  type UiApi,
  CapabilityError
} from "./context.ts"
import {
  type CommandContribution,
  type PanelContribution,
  type PluginId,
  type PluginManifest,
  manifestKey
} from "./manifest.ts"
import { type PluginModule, type PluginPostProcessor } from "./plugin.ts"

export interface TestHostOptions {
  /** Manifest under test; defaults to a minimal granted-plugin manifest. */
  readonly manifest?: PluginManifest
  /** Capabilities the "user" granted; defaults to everything the manifest asks for. */
  readonly granted?: ReadonlyArray<Capability>
  readonly drawing?: Drawing
  readonly toolpaths?: ReadonlyArray<Toolpath>
  readonly programs?: ReadonlyArray<Program>
  /** Post-processors a plugin registered, keyed by post id. */
  readonly log?: PluginLogger
}

export interface TestHost {
  readonly manifest: PluginManifest
  readonly key: string
  /** Capabilities in force (granted plus implied). */
  readonly capabilities: ReadonlyArray<Capability>
  /** The context handed to `activate`. */
  readonly context: PluginContext
  /** Everything the plugin registered through `ctx.ui`. */
  readonly ui: {
    readonly commands: ReadonlyArray<CommandContribution>
    readonly panels: ReadonlyArray<PanelContribution>
  }
  /** Storage values, already stripped of the namespace. */
  readonly storage: Readonly<Record<string, string>>
  /** Current drawing after every patch the plugin applied. */
  drawing(): Drawing | undefined
  /** Toolpaths visible to the plugin. */
  toolpaths(): ReadonlyArray<Toolpath>
  /** Registers a handler for a command id the plugin declared. */
  on(commandId: string, handler: (args: unknown) => unknown): void
  /** Calls a registered command handler and returns its result. */
  invoke(commandId: string, args?: unknown): unknown
  /** Runs a plugin module: `activate`, then the returned teardown on `deactivate`. */
  activate(plugin: PluginModule): Promise<() => void | Promise<void>>
}

/** Minimal manifest used when the test does not supply one. */
export const testManifest = (overrides: Partial<PluginManifest> = {}): PluginManifest => ({
  id: "com.example.test-plugin" as PluginId,
  name: "Test Plugin",
  version: "1.0.0",
  apiVersion: "1",
  entry: "index.js",
  capabilities: [],
  ...overrides
})

const defaultLogger = (): PluginLogger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
})

/**
 * Builds a test host. Only granted capabilities materialise on the context:
 * `drawing` appears with `drawing:write`, `toolpath` with `toolpath:read`, and so
 * on. A plugin reaching for a surface it does not have gets a `CapabilityError`
 * from `requireCapability`, exactly like in the sidecar.
 */
export const createTestHost = (options: TestHostOptions = {}): TestHost => {
  const manifest = options.manifest ?? testManifest()
  const granted = options.granted ?? manifest.capabilities
  const capabilities = effectiveCapabilities(granted)
  const pluginId = manifest.id
  const prefix = storageNamespace(pluginId)
  const log = options.log ?? defaultLogger()

  let drawing: Drawing | undefined = options.drawing
  let revision = 0
  const storageValues = new Map<string, string>()
  const commands: CommandContribution[] = []
  const panels: PanelContribution[] = []
  const handlers = new Map<string, (args: unknown) => unknown>()

  const storage: PluginStorage = {
    get: (key) => storageValues.get(key),
    set: (key, value) => {
      storageValues.set(key, value)
    },
    delete: (key) => {
      storageValues.delete(key)
    },
    keys: () => [...storageValues.keys()].sort()
  }

  const drawingApi: DrawingApi = {
    read: () => drawing,
    patch: (patch: DrawingPatch) => {
      revision += 1
      if (drawing === undefined) return revision
      const entities = [...drawing.entities]
      switch (patch._tag) {
        case "AddEntity":
          entities.push(patch.entity)
          break
        case "UpdateEntity": {
          const index = entities.findIndex((e) => e.id === patch.id)
          if (index >= 0) entities[index] = patch.entity
          break
        }
        case "RemoveEntity": {
          const index = entities.findIndex((e) => e.id === patch.id)
          if (index >= 0) entities.splice(index, 1)
          break
        }
      }
      drawing = { ...drawing, entities, version: drawing.version + 1 }
      return revision
    }
  }

  const toolpathApi: ToolpathApi = {
    list: () => options.toolpaths ?? [],
    program: (toolpathId) =>
      (options.programs ?? []).find((p) => p.toolpaths.some((t: Toolpath) => t.id === toolpathId))
  }

  const ui: UiApi = {
    registerCommand: (command) => {
      commands.push(command)
    },
    registerPanel: (panel) => {
      panels.push(panel)
    }
  }

  const context: PluginContext = {
    pluginId,
    capabilities,
    log,
    ...(capabilities.includes("drawing:write") ? { drawing: drawingApi } : {}),
    ...(capabilities.includes("toolpath:read") ? { toolpath: toolpathApi } : {}),
    ...(capabilities.includes("storage") ? { storage } : {}),
    ...(capabilities.includes("ui:panel") ? { ui } : {})
  }

  return {
    manifest,
    key: manifestKey(manifest),
    capabilities,
    context,
    ui: { commands, panels },
    storage: Object.fromEntries([...storageValues.entries()]),
    drawing: () => drawing,
    toolpaths: () => options.toolpaths ?? [],
    on: (commandId, handler) => {
      handlers.set(commandId, handler)
    },
    invoke: (commandId, args) => {
      const handler = handlers.get(commandId)
      if (handler === undefined) throw new CapabilityError(pluginId, "ui:panel")
      return handler(args)
    },
    activate: async (plugin) => {
      const teardown = await plugin.activate(context)
      return typeof teardown === "function" ? teardown : () => {}
    }
  }
}

/** Convenience for testing a contributed post-processor without a worker. */
export const runPostProcessor = (
  post: PluginPostProcessor,
  program: Program,
  options?: Parameters<PluginPostProcessor>[1]
): string => post(program, options)

/** Storage key a plugin sees; exported so tests can assert namespacing. */
export const keyOf = (pluginId: string, key: string): string => `${storageNamespace(pluginId)}${key}`
