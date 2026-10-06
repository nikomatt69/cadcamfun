import { Context, Data, Effect, Layer } from "effect"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { AppConfigService } from "../config.ts"

export class KvError extends Data.TaggedError("KvError")<{ readonly operation: string; readonly cause: unknown }> {}

export interface KvEntry {
  readonly key: string
  readonly value: unknown
  readonly updatedAt: string
}

/**
 * Persistent key-value state (the same idea as nikcli's `kv.json`): small JSON values under dotted keys
 * (`ai.settings.model`, `ai.memory.<id>`, `ai.context.<projectId>`...). One file in the data directory, loaded once,
 * written atomically (temp file + rename) after every change.
 */
export class KvStore extends Context.Service<KvStore, {
  get(key: string): Effect.Effect<KvEntry | undefined>
  set(key: string, value: unknown): Effect.Effect<KvEntry, KvError>
  delete(key: string): Effect.Effect<boolean, KvError>
  list(prefix?: string): Effect.Effect<ReadonlyArray<KvEntry>>
}>()("cadcamfun/KvStore") {
  static readonly layer = Layer.effect(KvStore, Effect.gen(function*() {
    const { dataDir } = yield* AppConfigService
    const file = join(dataDir, "kv.json")
    const entries = new Map<string, KvEntry>()
    const loaded = yield* Effect.promise(() => readFile(file, "utf8").then((t) => JSON.parse(t) as Record<string, KvEntry>).catch(() => ({} as Record<string, KvEntry>)))
    for (const [key, entry] of Object.entries(loaded)) entries.set(key, entry)

    // Writes are serialised so two quick `set` calls cannot interleave their rename.
    let chain: Promise<void> = Promise.resolve()
    const persist = (operation: string) => Effect.tryPromise({
      try: () => {
        chain = chain.then(async () => {
          await mkdir(dirname(file), { recursive: true })
          const tmp = `${file}.${process.pid}.tmp`
          await writeFile(tmp, JSON.stringify(Object.fromEntries(entries), null, 2))
          await rename(tmp, file)
        })
        return chain
      },
      catch: (cause) => new KvError({ operation, cause })
    })

    return KvStore.of({
      get: (key) => Effect.sync(() => entries.get(key)),
      set: (key, value) => Effect.gen(function*() {
        const entry: KvEntry = { key, value, updatedAt: new Date().toISOString() }
        entries.set(key, entry)
        yield* persist("set")
        return entry
      }),
      delete: (key) => Effect.gen(function*() {
        const existed = entries.delete(key)
        if (existed) yield* persist("delete")
        return existed
      }),
      list: (prefix) => Effect.sync(() =>
        [...entries.values()].filter((e) => !prefix || e.key.startsWith(prefix)).sort((a, b) => a.key.localeCompare(b.key)))
    })
  }))
}
