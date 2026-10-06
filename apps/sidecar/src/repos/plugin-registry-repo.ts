/**
 * Registry of the legacy (browser-side) plugin system behind `/api/plugins/*`.
 *
 * These rows use the legacy manifest (`main`, `permissions`, `engines`), unlike the
 * worker-based host in `plugins/repo.ts`, which stores SDK manifests in the same
 * table. Each side skips rows it cannot decode, so they can coexist.
 */
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { InstalledPlugin, LegacyPluginManifest } from "@cadcamfun/api"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"

export type LegacyManifest = typeof LegacyPluginManifest.Type
export type PluginEntry = typeof InstalledPlugin.Type

const decodeManifest = Schema.decodeUnknownOption(LegacyPluginManifest)

type DbRow = typeof schema.pluginRegistryEntryTable.$inferSelect

const STATES = ["none", "installed", "enabled", "disabled", "loaded", "activated", "deactivated", "error"] as const
type State = (typeof STATES)[number]

const toEntry = (row: DbRow): PluginEntry | undefined => {
  let json: unknown
  try { json = JSON.parse(row.manifestJson) } catch { return undefined }
  const manifest = decodeManifest(json)
  if (manifest._tag === "None") return undefined
  return {
    id: row.id,
    manifest: manifest.value,
    state: (STATES as ReadonlyArray<string>).includes(row.state) ? (row.state as State) : "installed",
    enabled: row.enabled,
    version: row.version,
    installedAt: row.installedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    errorCount: row.errorCount,
    ...(row.lastError ? { lastError: row.lastError } : {})
  }
}

export class PluginRegistryRepo extends Context.Service<PluginRegistryRepo, {
  list(): Effect.Effect<ReadonlyArray<PluginEntry>, DatabaseError>
  find(id: string): Effect.Effect<PluginEntry | undefined, DatabaseError>
  /** Inserts a freshly installed plugin (disabled). */
  insert(manifest: LegacyManifest): Effect.Effect<PluginEntry, DatabaseError>
  /** Replaces the manifest after an update: version bumps, disabled again, errors cleared. */
  replaceManifest(id: string, manifest: LegacyManifest): Effect.Effect<PluginEntry | undefined, DatabaseError>
  setEnabled(id: string, enabled: boolean): Effect.Effect<void, DatabaseError>
  remove(id: string): Effect.Effect<void, DatabaseError>
  getConfig(id: string): Effect.Effect<Record<string, unknown> | null, DatabaseError>
  setConfig(id: string, config: Record<string, unknown>): Effect.Effect<void, DatabaseError>
}>()("cadcamfun/PluginRegistryRepo") {
  static readonly layer = Layer.effect(PluginRegistryRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const T = schema.pluginRegistryEntryTable
    const C = schema.pluginConfigurationTable
    const one = async (db: Parameters<Parameters<typeof query>[1]>[0], id: string) => {
      const [row] = await db.select().from(T).where(eq(T.id, id)).limit(1)
      return row === undefined ? undefined : toEntry(row)
    }
    return PluginRegistryRepo.of({
      list: () => query("pluginRegistry.list", async (db) =>
        (await db.select().from(T)).map(toEntry).filter((e): e is PluginEntry => e !== undefined)),
      find: (id) => query("pluginRegistry.find", (db) => one(db, id)),
      insert: (manifest) => query("pluginRegistry.insert", async (db) => {
        await db.insert(T).values({
          id: manifest.id, manifestJson: JSON.stringify(manifest), state: "installed", enabled: false,
          version: manifest.version, errorCount: 0, lastError: null
        })
        return (await one(db, manifest.id))!
      }),
      replaceManifest: (id, manifest) => query("pluginRegistry.replaceManifest", async (db) => {
        await db.update(T).set({
          manifestJson: JSON.stringify(manifest), version: manifest.version, state: "installed",
          enabled: false, errorCount: 0, lastError: null
        }).where(eq(T.id, id))
        return one(db, id)
      }),
      setEnabled: (id, enabled) => query("pluginRegistry.setEnabled", async (db) => {
        await db.update(T).set({ enabled, state: enabled ? "enabled" : "disabled" }).where(eq(T.id, id))
      }),
      remove: (id) => query("pluginRegistry.remove", async (db) => {
        await db.delete(C).where(eq(C.pluginId, id))
        await db.delete(T).where(eq(T.id, id))
      }),
      getConfig: (id) => query("pluginRegistry.getConfig", async (db) => {
        const [row] = await db.select().from(C).where(eq(C.pluginId, id)).limit(1)
        if (row === undefined) return null
        try { return JSON.parse(row.configJson) as Record<string, unknown> } catch { return null }
      }),
      setConfig: (id, config) => query("pluginRegistry.setConfig", async (db) => {
        const configJson = JSON.stringify(config)
        await db.insert(C).values({ pluginId: id, configJson }).onConflictDoUpdate({ target: C.pluginId, set: { configJson } })
      })
    })
  }))
}
