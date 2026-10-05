/**
 * `PluginRepo`: the only place that touches the plugin tables
 * (spec 09-plugins.md §3).
 *
 * The registry stores the *manifest* as JSON so a reinstall can be compared
 * without re-reading the folder, plus the lifecycle state and the crash counter
 * that drives the auto-disable rule.
 */
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { PluginManifestSchema, type PluginManifest } from "@cadcamfun/plugin-sdk"

/** Lifecycle states, mirroring the `state` column. */
export const PLUGIN_STATES = ["installed", "enabled", "disabled", "faulted"] as const
export type PluginState = (typeof PLUGIN_STATES)[number]

/** A registry row as the rest of the app sees it. */
export interface PluginRow {
  readonly id: string
  readonly manifest: PluginManifest
  readonly state: PluginState
  readonly enabled: boolean
  readonly version: string
  readonly installedAt: string
  readonly updatedAt: string
  readonly errorCount: number
  readonly lastError: string | null
}

type DbRow = typeof schema.pluginRegistryEntryTable.$inferSelect

/**
 * Decodes a stored manifest.
 *
 * `put` validates the manifest before writing it, so the decode succeeds for every
 * row this process wrote. A row left behind by an older build yields `undefined`
 * and is skipped, so one stale row cannot take the whole registry down with it.
 *
 * The synchronous Schema decoder is deliberate: these run inside the asynchronous
 * query callback, where running an Effect synchronously fails.
 */
const decodeStored = (json: string): PluginManifest | undefined => {
  let value: unknown
  try {
    value = JSON.parse(json) as unknown
  } catch {
    return undefined
  }
  try {
    return Schema.decodeUnknownSync(PluginManifestSchema)(value) as PluginManifest
  } catch {
    return undefined
  }
}

const serialize = (row: DbRow): PluginRow | undefined => {
  const manifest = decodeStored(row.manifestJson)
  if (manifest === undefined) return undefined
  return {
    id: row.id,
    manifest,
    state: (PLUGIN_STATES as ReadonlyArray<string>).includes(row.state)
      ? (row.state as PluginState)
      : "installed",
    enabled: row.enabled,
    version: row.version,
    installedAt: row.installedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    errorCount: row.errorCount,
    lastError: row.lastError
  }
}

/** Decodes many rows, dropping the ones that no longer parse. */
const serializeAll = (rows: ReadonlyArray<DbRow>): ReadonlyArray<PluginRow> =>
  rows.map(serialize).filter((row): row is PluginRow => row !== undefined)


/** The repository surface the plugin handlers consume. */
export interface PluginRepoService {
  /** Every registered plugin. */
  readonly list: () => Effect.Effect<ReadonlyArray<PluginRow>, DatabaseError>
  readonly find: (id: string) => Effect.Effect<PluginRow | undefined, DatabaseError>
  /** Inserts or replaces the registry row for a validated manifest. */
  readonly put: (manifest: PluginManifest, state?: PluginState) => Effect.Effect<PluginRow, DatabaseError>
  readonly setState: (id: string, state: PluginState, enabled: boolean) => Effect.Effect<void, DatabaseError>
  /** Records a crash and returns the new count, which drives the auto-disable. */
  readonly recordError: (id: string, message: string) => Effect.Effect<number, DatabaseError>
  readonly clearErrors: (id: string) => Effect.Effect<void, DatabaseError>
  /** Removes the registry row and, by cascade, its configuration. */
  readonly remove: (id: string) => Effect.Effect<void, DatabaseError>
  /** Per-plugin configuration, or `undefined` when none was stored. */
  readonly getConfig: (id: string) => Effect.Effect<Record<string, unknown> | undefined, DatabaseError>
  readonly setConfig: (id: string, config: Record<string, unknown>) => Effect.Effect<void, DatabaseError>
}


/**
 * Builds the repository over an already-resolved `Database` service. Exported so a
 * test can hand it its own `:memory:` database without Layer plumbing.
 */
export const makePluginRepo = Effect.gen(function*() {
  const { query } = yield* Database
  const T = schema.pluginRegistryEntryTable
  const C = schema.pluginConfigurationTable

  const list = (): Effect.Effect<ReadonlyArray<PluginRow>, DatabaseError> =>
    query("plugins.list", async (db) => serializeAll(await db.select().from(T)))

  const find = (id: string): Effect.Effect<PluginRow | undefined, DatabaseError> =>
    query("plugins.find", async (db) => {
      const [row] = await db.select().from(T).where(eq(T.id, id)).limit(1)
      return row === undefined ? undefined : serialize(row)
    })

  const put = (
    manifest: PluginManifest,
    state: PluginState = "installed"
  ): Effect.Effect<PluginRow, DatabaseError> =>
    query("plugins.put", async (db) => {
      const now = new Date()
      const manifestJson = JSON.stringify(manifest)
      await db
        .insert(T)
        .values({
          id: manifest.id,
          manifestJson,
          state,
          enabled: state === "enabled",
          version: manifest.version,
          installedAt: now,
          updatedAt: now,
          errorCount: 0,
          lastError: null
        })
        .onConflictDoUpdate({
          target: T.id,
          set: { manifestJson, state, enabled: state === "enabled", version: manifest.version, updatedAt: now }
        })
      const [row] = await db.select().from(T).where(eq(T.id, manifest.id)).limit(1)
      if (row === undefined) throw new Error(`plugin ${manifest.id} vanished after insert`)
      const decoded = serialize(row)
      if (decoded === undefined) throw new Error(`plugin ${manifest.id} did not decode after insert`)
      return decoded
    })

  const setState = (id: string, state: PluginState, enabled: boolean): Effect.Effect<void, DatabaseError> =>
    query("plugins.setState", async (db) => {
      await db.update(T).set({ state, enabled, updatedAt: new Date() }).where(eq(T.id, id))
    })

  const recordError = (id: string, message: string): Effect.Effect<number, DatabaseError> =>
    query("plugins.recordError", async (db) => {
      const [row] = await db.select({ n: T.errorCount }).from(T).where(eq(T.id, id)).limit(1)
      const count = (row?.n ?? 0) + 1
      await db
        .update(T)
        .set({ errorCount: count, lastError: message, updatedAt: new Date() })
        .where(eq(T.id, id))
      return count
    })

  const clearErrors = (id: string): Effect.Effect<void, DatabaseError> =>
    query("plugins.clearErrors", async (db) => {
      await db.update(T).set({ errorCount: 0, lastError: null, updatedAt: new Date() }).where(eq(T.id, id))
    })

  const remove = (id: string): Effect.Effect<void, DatabaseError> =>
    query("plugins.remove", async (db) => {
      // The configuration row cascades; deleting it explicitly keeps the intent
      // obvious and survives a relaxed foreign key.
      await db.delete(C).where(eq(C.pluginId, id))
      await db.delete(T).where(eq(T.id, id))
    })

  const getConfig = (id: string): Effect.Effect<Record<string, unknown> | undefined, DatabaseError> =>
    query("plugins.getConfig", async (db) => {
      const [row] = await db.select().from(C).where(eq(C.pluginId, id)).limit(1)
      if (row === undefined) return undefined
      const parsed = JSON.parse(row.configJson) as unknown
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {}
    })

  const setConfig = (id: string, config: Record<string, unknown>): Effect.Effect<void, DatabaseError> =>
    query("plugins.setConfig", async (db) => {
      const configJson = JSON.stringify(config)
      await db
        .insert(C)
        .values({ pluginId: id, configJson })
        .onConflictDoUpdate({ target: C.pluginId, set: { configJson } })
    })

  return { list, find, put, setState, recordError, clearErrors, remove, getConfig, setConfig }
})

export class PluginRepo extends Context.Service<PluginRepo, PluginRepoService>()("cadcamfun/PluginRepo") {
  static readonly layer = Layer.effect(PluginRepo, makePluginRepo)
}
