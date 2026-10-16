/**
 * The mods the assistant manages: the actions behind the `mods` and `mods_edit` tools, implemented against the
 * app-owned store (`mods.ts`) and the live runtime. The catalogue owns their ids, effects and validation
 * (`actions/mods.ts`); this module contributes the implementations, which is why they are not catalogue code: they
 * need the store *and* `runtime.reloadMods`/`runtime.loadedMods`, and the runtime is built above the tool handlers.
 *
 * Reads never start a host (`loadedMods` answers the empty list when none runs for the project); every mutation is
 * followed by a reload and a read, so the answer says what the host actually reports after the change. A mod that
 * was armed but did not load is disarmed again: a broken rule must not stay a landmine on every host start.
 */
import { readFileSync } from "node:fs"
import { Effect, Result } from "effect"
import type { HostModInfo } from "@nikcli-ai/sdk-next"
import {
  MAX_MOD_SOURCE_CHARS, MOD_ID_PATTERN, modModuleFile, modSourceProblems, modSpec,
  readModIndex, removeMod, saveMod, setModEnabled, type ModRecord
} from "./mods.ts"
import type { IsolatedPaths } from "./isolation.ts"
import type { ActionContribution } from "../actions/action.ts"
import type { ToolContext } from "../tools/define.ts"

/** What the contributions need: the runtime satisfies this structurally (its `paths` and the two methods below). */
export interface ModToolDependencies {
  /** The isolated store root the mods live under (the runtime's `paths`). */
  readonly paths: IsolatedPaths
  /** The mods the live host reports for a project (`runtime.loadedMods`); the empty list when none runs there yet. */
  loadedMods(projectId: string): Effect.Effect<ReadonlyArray<HostModInfo>, unknown>
  /** Rewrite the host configuration and make live hosts re-read it (`runtime.reloadMods`). */
  reloadMods(): Effect.Effect<void, unknown>
  /** Test seam for timestamps. */
  readonly now?: () => string
}

/** One entry of `mods.list`: the store's record plus what the live host reports; a plugin's own mod is `origin: "plugin"`. */
interface ModSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly enabled: boolean
  readonly origin: "assistant" | "user" | "plugin"
  readonly createdAt: string
  readonly updatedAt: string
  readonly events: ReadonlyArray<string>
}

/** The sentence every refusal ends with: what exists, so the model can correct itself in the next call. */
const known = (records: ReadonlyArray<ModRecord>): string =>
  records.length > 0 ? ` Known mods: ${records.map((record) => record.id).join(", ")}.` : " No mod is stored yet."

const message = (cause: unknown): string =>
  cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "The store refused the change."

/** The host reports a configuration mod under its exact `file://` spec (`Plugin.loadExternal` passes the spec as the id). */
const loadedOf = (paths: IsolatedPaths, loaded: ReadonlyArray<HostModInfo>, id: string): HostModInfo | undefined =>
  loaded.find((info) => info.id === modSpec(paths, id))

const sourceOf = (paths: IsolatedPaths, id: string): string => {
  try { return readFileSync(modModuleFile(paths, id), "utf8") } catch { return "" }
}

/** The five contributions of the mods tools, keyed by the catalogue's action id. */
export const modToolContributions = (deps: ModToolDependencies): Readonly<Record<string, ActionContribution>> => {
  const paths = deps.paths
  // Mutations are app-wide: they rewrite one shared index, so two project conversations must not interleave them.
  let changing: Promise<unknown> = Promise.resolve()

  /**
   * Tell the live hosts to re-read the configuration and answer with what this mod reports afterwards. A reload that
   * fails is not a failed action: the store is the source of truth and the change applies from the next host start,
   * which the `note` says in as many words.
   */
  const settled = (projectId: string, id: string): Effect.Effect<{ readonly loaded: boolean | undefined; readonly events: ReadonlyArray<string>; readonly reloaded: boolean; readonly note?: string }> =>
    Effect.gen(function* () {
      const reloaded = yield* Effect.result(deps.reloadMods())
      const inspected = yield* Effect.result(deps.loadedMods(projectId))
      const info = Result.isSuccess(inspected) ? loadedOf(paths, inspected.success, id) : undefined
      const note = Result.isFailure(reloaded)
        ? "The mod is stored but the running host did not re-read its configuration; it applies from the next host start."
        : Result.isFailure(inspected)
          ? "The mod change is stored, but the host's loaded-mod status could not be read. Read it again to verify the running hooks."
          : undefined
      return {
        loaded: Result.isSuccess(inspected) ? info !== undefined : undefined,
        events: info?.events ?? [],
        reloaded: Result.isSuccess(reloaded),
        ...(note !== undefined ? { note } : {})
      }
    })

  const run = (action: string) => (input: never, context: ToolContext): Effect.Effect<unknown, unknown> =>
    Effect.gen(function* () {
      const value = input as Record<string, unknown>

      if (action === "mods.list") {
        const records = readModIndex(paths)
        const stored = new Set(records.map((record) => modSpec(paths, record.id)))
        const loaded = yield* deps.loadedMods(context.projectId)
        const mods: ModSummary[] = records.map((record) => ({
          id: record.id, name: record.name, description: record.description, enabled: record.enabled,
          origin: record.origin, createdAt: record.createdAt, updatedAt: record.updatedAt,
          events: loadedOf(paths, loaded, record.id)?.events ?? []
        }))
        for (const info of loaded) {
          if (stored.has(info.id)) continue
          mods.push({
            id: info.id, name: info.name,
            description: "Contributed by a plugin: the host loads it from the plugin's own module, not from the mods store.",
            enabled: true, origin: "plugin", createdAt: "", updatedAt: "", events: info.events
          })
        }
        return { ok: true, mods }
      }

      if (action === "mods.read") {
        const id = String(value["id"])
        const records = readModIndex(paths)
        const record = records.find((candidate) => candidate.id === id)
        if (record === undefined) return { ok: false, error: `There is no mod "${id}".${known(records)}` }
        const loaded = yield* deps.loadedMods(context.projectId)
        const info = loadedOf(paths, loaded, id)
        return { ok: true, ...record, source: sourceOf(paths, id), events: info?.events ?? [], tools: info?.tools ?? [] }
      }

      if (action === "mods_edit.save") {
        const id = String(value["id"])
        const source = String(value["source"])
        const description = typeof value["description"] === "string" ? value["description"] : ""
        const name = typeof value["name"] === "string" ? value["name"] : undefined
        const problems = MOD_ID_PATTERN.test(id)
          ? modSourceProblems(source)
          : [`"${id}" is not a valid mod id: lower case, starting with a letter, letters/digits/underscore/dash, ${MAX_MOD_SOURCE_CHARS} at most.`]
        if (problems.length > 0) return { ok: false, error: problems.join(" "), problems }
        const saved = yield* Effect.result(Effect.try({
          try: () => saveMod(paths, { id, ...(name !== undefined ? { name } : {}), description, source, ...(deps.now !== undefined ? { now: deps.now() } : {}) }),
          catch: (cause) => cause
        }))
        if (Result.isFailure(saved)) return { ok: false, error: message(saved.failure) }
        // An explicit flag is a decision (`enable: false` stops a mod too); an absent one keeps what the record had.
        let enabled = saved.success.enabled
        if (value["enable"] === true || value["enable"] === false) {
          enabled = setModEnabled(paths, id, value["enable"] === true, deps.now?.()).enabled
        }
        return yield* armed(context.projectId, id, enabled)
      }

      if (action === "mods_edit.set_enabled") {
        const id = String(value["id"])
        const records = readModIndex(paths)
        if (!records.some((record) => record.id === id)) return { ok: false, error: `There is no mod "${id}".${known(records)}` }
        const enabled = setModEnabled(paths, id, value["enabled"] === true, deps.now?.()).enabled
        return yield* armed(context.projectId, id, enabled)
      }

      const id = String(value["id"])
      if (!removeMod(paths, id)) return { ok: false, error: `There is no mod "${id}".${known(readModIndex(paths))}` }
      const state = yield* settled(context.projectId, id)
      return { ok: true, id, removed: true, reloaded: state.reloaded, ...(state.note !== undefined ? { note: state.note } : {}) }
    })

  /**
   * Reload, then check the outcome for an armed mod: the answer says what the host reports, and a mod that failed to
   * load is disarmed again with the reason, so a broken rule cannot quietly stay armed for the next host start.
   */
  const armed = (projectId: string, id: string, enabled: boolean): Effect.Effect<unknown> =>
    Effect.gen(function* () {
      const state = yield* settled(projectId, id)
      if (!enabled || !state.reloaded || state.loaded === undefined) return { ok: true, id, enabled, events: state.events, reloaded: state.reloaded, ...(state.note !== undefined ? { note: state.note } : {}) }
      if (state.loaded) {
        return { ok: true, id, enabled: true, events: state.events, reloaded: state.reloaded, ...(state.note !== undefined ? { note: state.note } : {}) }
      }
      setModEnabled(paths, id, false, deps.now?.())
      const after = yield* settled(projectId, id)
      return {
        ok: false,
        id, enabled: false, events: after.events,
        error: `The mod "${id}" was saved but the host did not load it (a hook at import time can do that); it is stored and disabled. Read it back, fix the source, then enable it again.`
      }
    })

  const call = (action: string) => (input: never, context: ToolContext): Promise<unknown> => {
    const execute = () => context.signal?.aborted
      ? Promise.resolve({ ok: false, _tag: "ActionInterrupted", actionId: action, error: "Tool execution cancelled." })
      : Effect.runPromise(run(action)(input, context), { signal: context.signal })
    // A mutation queues behind the previous one; reads run now.
    // Bind the signal when the queued work actually starts: cancellation during an earlier reload must prevent writes.
    if (!action.startsWith("mods_edit.")) return execute()
    const pending = changing.catch(() => undefined).then(execute)
    changing = pending
    return pending
  }

  return {
    "mods.list": call("mods.list"),
    "mods.read": call("mods.read"),
    "mods_edit.save": call("mods_edit.save"),
    "mods_edit.set_enabled": call("mods_edit.set_enabled"),
    "mods_edit.remove": call("mods_edit.remove")
  }
}

/** The ids of the two tools these contributions answer for; the host registers them like every other tool of the catalogue. */
export const MOD_TOOL_IDS = ["mods", "mods_edit"] as const

export const modToolIds = (): ReadonlyArray<string> => [...MOD_TOOL_IDS]
