/**
 * The central tool registry, as an Effect service (nikcli's `ToolRegistry.Service`, `tool/registry.ts`).
 *
 * Every surface that reaches a tool reads it here: the embedded host registers `tools(projectId)` and publishes
 * `ids`/`approvalIds` into its permission map, the HTTP bridge (`AiActions`) runs `tool(projectId, id)`, and the settings
 * page lists `catalogue(projectId)`. There is no second place that assembles a tool set.
 *
 * Sources, in the order nikcli resolves them:
 * - the built-in tools of the action catalogue (`BUILT_IN_TOOLS`), whose ids are reserved, as are the host's native ids;
 * - contributed tools, read again on every resolution of a project (the plugins the operator switched on; nikcli's
 *   config-dir/plugin derivation, which joins its instance hot reload);
 * - runtime registrations (`register`): the last registration of an id wins, and closing its handle reveals the
 *   previous occupant of that id (nikcli `lastWins` + `Handle.close`).
 *
 * Action implementations the application owns (libraries, version control, delegation) are contributed the same way
 * (`contribute`), so a layer that owns a resource — the background scheduler of the host — adds its implementations for
 * as long as its scope lives instead of every caller passing its own copy.
 *
 * Per-project state is resolved once and kept until something changes (nikcli `InstanceState`); every change bumps
 * `revision` and is pushed to the attached sinks, which is how a live host learns that its tool set moved.
 *
 * The resolved list is in canonical id order: the tool array is the first and largest block of the provider prompt, so an
 * equivalent set must serialize to the same bytes whatever order it was registered in (nikcli `compareIds`).
 */
import { Context, Effect, Layer, Option, Schema, Scope } from "effect"
import type { ActionContribution } from "../actions/action.ts"
import type { HostToolSpec } from "../nikcli/runtime.ts"
import { NATIVE_TOOLS } from "../nikcli/tool-registry.ts"
import type { ToolDefinition } from "./define.ts"
import type { ToolHandlersShape } from "./handlers.ts"
import { BUILT_IN_TOOLS, buildTools } from "./registry.ts"

/** A registration that was refused: a malformed id, or one that belongs to the catalogue or to the host. */
export class ToolRegistryError extends Schema.TaggedError<ToolRegistryError>()("ToolRegistryError", {
  message: Schema.String,
  tool: Schema.optionalKey(Schema.String)
}) {}

/** Undoes one `register` or `contribute`. Closing twice is harmless. */
export interface ToolHandle {
  readonly close: Effect.Effect<void>
}

export interface ToolRegistrySources {
  readonly handlers: ToolHandlersShape
  /** Implementations present from the start; more are added with `contribute`. */
  readonly contributions?: Readonly<Record<string, ActionContribution>>
  /** Read again whenever a project's tool set is resolved (the switched-on plugins). Ids must be unique among them. */
  readonly contributed?: () => ReadonlyArray<ToolDefinition>
}

export interface ToolCatalogueEntry {
  readonly id: string
  readonly description: string
}

export interface ToolRegistryShape {
  /** Adds a tool for every project; it shadows a contributed or earlier registered tool of the same id until closed. */
  readonly register: (tool: ToolDefinition) => Effect.Effect<ToolHandle, ToolRegistryError>
  /** Like `register`, closed with the scope: the tool lives exactly as long as the layer that registered it. */
  readonly registerScoped: (tool: ToolDefinition) => Effect.Effect<void, ToolRegistryError, Scope.Scope>
  /** Adds action implementations (keys are catalogue action ids); a later contribution of a key wins until closed. */
  readonly contribute: (contributions: Readonly<Record<string, ActionContribution>>) => Effect.Effect<ToolHandle>
  readonly contributeScoped: (contributions: Readonly<Record<string, ActionContribution>>) => Effect.Effect<void, never, Scope.Scope>
  /** The action implementations in force now (what `contributionGuard` checks). */
  readonly contributions: Effect.Effect<Readonly<Record<string, ActionContribution>>>
  /** The project's tool set as the host registers it, in canonical id order. */
  readonly tools: (projectId: string) => Effect.Effect<ReadonlyArray<HostToolSpec>>
  readonly tool: (projectId: string, id: string) => Effect.Effect<Option.Option<HostToolSpec>>
  readonly ids: (projectId: string) => Effect.Effect<ReadonlyArray<string>>
  /** Tools the host asks the person about before every call (`ToolDefinition.approval`). */
  readonly approvalIds: (projectId: string) => Effect.Effect<ReadonlyArray<string>>
  /** Registered tools plus the host's native ones: what the assistant can reach, as the settings page lists it. */
  readonly catalogue: (projectId: string) => Effect.Effect<ReadonlyArray<ToolCatalogueEntry>>
  /** Drops the resolved per-project state, so contributed sources are read again (nikcli `invalidateReloadable`). */
  readonly reload: Effect.Effect<void>
  /** Bumped by every change of the tool set or of the contributions. */
  readonly revision: Effect.Effect<number>
  /** Calls `sink` with the new revision after every change until the scope closes. */
  readonly attach: (sink: (revision: number) => Effect.Effect<void>) => Effect.Effect<void, never, Scope.Scope>
  /**
   * The promise-side boundary for the embedded host, whose bootstrap is not Effect code (nikcli's `InstanceState.ambient`):
   * the same resolution as `tools`, read synchronously, and a listener that `attach` would feed.
   */
  readonly snapshot: (projectId: string) => ReadonlyArray<HostToolSpec>
  readonly subscribe: (listener: (revision: number) => void) => () => void
}

const TOOL_ID = /^[a-z][a-z0-9_]{0,79}$/

/** Locale-independent: the same set must give the same bytes on every machine (nikcli `ToolRegistry.compareIds`). */
export const compareToolIds = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0)

/** The last entry of an id wins (nikcli `ToolRegistry.lastWins`). */
export const lastWins = <T extends { readonly id: string }>(tools: ReadonlyArray<T>): ReadonlyArray<T> => {
  const byId = new Map<string, T>()
  for (const tool of tools) {
    byId.delete(tool.id)
    byId.set(tool.id, tool)
  }
  return [...byId.values()]
}

/** Ids nobody may register over: the catalogue's tools and the host's native ones. */
export const RESERVED_TOOL_IDS: ReadonlySet<string> = new Set([...BUILT_IN_TOOLS.map((tool) => tool.id), ...NATIVE_TOOLS.map((tool) => tool.id)])

interface Entry<T> {
  readonly token: number
  readonly value: T
}

/** Builds the registry without a layer (tests, and the sidecar, which provides it with `ToolRegistry.layer`). */
export const makeToolRegistry = (sources: ToolRegistrySources): ToolRegistryShape => {
  const registered: Array<Entry<ToolDefinition>> = []
  const contributionEntries: Array<Entry<Readonly<Record<string, ActionContribution>>>> = sources.contributions ? [{ token: 0, value: sources.contributions }] : []
  let nextToken = 1
  let revision = 0
  const resolved = new Map<string, ReadonlyArray<HostToolSpec>>()
  const listeners = new Set<(revision: number) => void>()

  const changed = () => {
    revision++
    resolved.clear()
    for (const listener of [...listeners]) {
      try { listener(revision) } catch { /* a listener's failure is its own; the registry stays consistent */ }
    }
  }

  const currentContributions = (): Readonly<Record<string, ActionContribution>> =>
    Object.assign({}, ...contributionEntries.map((entry) => entry.value)) as Record<string, ActionContribution>

  const resolve = (projectId: string): ReadonlyArray<HostToolSpec> => {
    const cached = resolved.get(projectId)
    if (cached !== undefined) return cached
    // Contributed sources are strict among themselves (two plugins may not claim one id, `buildTools` refuses it);
    // a runtime registration shadows a contributed tool of its id, and among registrations the last one wins.
    const runtime = lastWins(registered.map((entry) => entry.value))
    const shadowed = new Set(runtime.map((tool) => tool.id))
    const contributed = (sources.contributed?.() ?? []).filter((tool) => !shadowed.has(tool.id))
    const specs = buildTools(sources.handlers, projectId, [...contributed, ...runtime], currentContributions())
    const snapshot = Object.freeze([...specs].sort((left, right) => compareToolIds(left.id, right.id)))
    resolved.set(projectId, snapshot)
    return snapshot
  }

  const register = (tool: ToolDefinition): Effect.Effect<ToolHandle, ToolRegistryError> =>
    Effect.gen(function* () {
      if (!TOOL_ID.test(tool.id)) return yield* new ToolRegistryError({ message: `Invalid tool id "${tool.id}": lowercase letters, digits and underscores, starting with a letter.`, tool: tool.id })
      if (RESERVED_TOOL_IDS.has(tool.id)) return yield* new ToolRegistryError({ message: `Tool id "${tool.id}" belongs to the catalogue or to the host and cannot be registered over.`, tool: tool.id })
      const token = nextToken++
      registered.push({ token, value: tool })
      changed()
      return { close: closeEntry(registered, token) }
    })

  const contribute = (contributions: Readonly<Record<string, ActionContribution>>): Effect.Effect<ToolHandle> =>
    Effect.sync(() => {
      const token = nextToken++
      contributionEntries.push({ token, value: contributions })
      changed()
      return { close: closeEntry(contributionEntries, token) }
    })

  const closeEntry = <T>(entries: Array<Entry<T>>, token: number): Effect.Effect<void> =>
    Effect.sync(() => {
      const index = entries.findIndex((entry) => entry.token === token)
      if (index < 0) return
      entries.splice(index, 1)
      changed()
    })

  const subscribe = (listener: (revision: number) => void): (() => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  const tools = (projectId: string) => Effect.sync(() => resolve(projectId))

  return {
    register,
    registerScoped: (tool) => Effect.acquireRelease(register(tool), (handle) => handle.close).pipe(Effect.asVoid),
    contribute,
    contributeScoped: (contributions) => Effect.acquireRelease(contribute(contributions), (handle) => handle.close).pipe(Effect.asVoid),
    contributions: Effect.sync(currentContributions),
    tools,
    tool: (projectId, id) => Effect.sync(() => Option.fromNullishOr(resolve(projectId).find((spec) => spec.id === id))),
    ids: (projectId) => Effect.sync(() => resolve(projectId).map((spec) => spec.id)),
    approvalIds: (projectId) => Effect.sync(() => resolve(projectId).filter((spec) => spec.approval === true).map((spec) => spec.id)),
    catalogue: (projectId) => Effect.sync(() => [...resolve(projectId).map(({ id, description }) => ({ id, description })), ...NATIVE_TOOLS.map(({ id, description }) => ({ id, description }))]),
    reload: Effect.sync(changed),
    revision: Effect.sync(() => revision),
    attach: (sink) =>
      Effect.gen(function* () {
        const services = yield* Effect.context<never>()
        const unsubscribe = subscribe((next) => { Effect.runForkWith(services)(sink(next)) })
        yield* Effect.addFinalizer(() => Effect.sync(unsubscribe))
      }),
    snapshot: resolve,
    subscribe
  }
}

export class ToolRegistry extends Context.Service<ToolRegistry, ToolRegistryShape>()("cadcamfun/ToolRegistry") {
  static layer = (sources: ToolRegistrySources): Layer.Layer<ToolRegistry> => Layer.sync(ToolRegistry, () => makeToolRegistry(sources))
}
