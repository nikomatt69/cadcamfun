import { Context, Data, Effect, Layer } from "effect"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"
import { AppConfigService } from "../config.ts"

export class StorageError extends Data.TaggedError("StorageError")<{ readonly operation: string; readonly cause: unknown }> {}

export type ObjectType = "component" | "tool" | "material" | "machine-config" | "toolpath"

/**
 * Local replacement for the legacy S3/4everland bucket: objects are files under `<dataDir>/storage/`.
 * Keys keep the legacy layout (`materials/<id>-<timestamp>.json`).
 */
export class StorageService extends Context.Service<StorageService, {
  generateObjectPath(type: ObjectType, id: string, version?: string): string
  upload(key: string, data: string | Uint8Array | object): Effect.Effect<string, StorageError>
  /** Parsed JSON when the object is JSON, otherwise the raw bytes; `null` when absent. */
  download(key: string): Effect.Effect<unknown | null, StorageError>
  delete(key: string): Effect.Effect<void, StorageError>
  /** Local stand-in for a pre-signed URL: a `file://` URL (no expiry). */
  signedUrl(key: string): Effect.Effect<string, StorageError>
  listByPrefix(prefix: string): Effect.Effect<string[], StorageError>
}>()("cadcamfun/StorageService") {
  static readonly layer = Layer.effect(
    StorageService,
    Effect.gen(function*() {
      const { dataDir } = yield* AppConfigService
      const root = resolve(dataDir, "storage")
      const pathOf = (key: string) => {
        const full = resolve(root, key)
        if (full !== root && !full.startsWith(root + sep)) throw new Error(`Invalid storage key: ${key}`)
        return full
      }
      const run = <A>(operation: string, f: () => Promise<A>) =>
        Effect.tryPromise({ try: f, catch: (cause) => new StorageError({ operation, cause }) })
      return StorageService.of({
        generateObjectPath: (type, id, version) => `${type}s/${id}${version ? `-${version}` : ""}-${Date.now()}.json`,
        upload: (key, data) => run("upload", async () => {
          const file = pathOf(key)
          await mkdir(dirname(file), { recursive: true })
          await writeFile(file, typeof data === "string" || data instanceof Uint8Array ? data : JSON.stringify(data))
          return key
        }),
        download: (key) => run("download", async () => {
          const file = pathOf(key)
          const buf = await readFile(file).catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? null : Promise.reject(e)))
          if (buf === null) return null
          if (!key.endsWith(".json")) return new Uint8Array(buf)
          try { return JSON.parse(buf.toString("utf8")) } catch { return new Uint8Array(buf) }
        }),
        delete: (key) => run("delete", () => rm(pathOf(key), { force: true })),
        signedUrl: (key) => run("signedUrl", async () => `file://${pathOf(key)}`),
        listByPrefix: (prefix) => run("list", async () => {
          const dir = pathOf(prefix.includes("/") ? prefix.slice(0, prefix.lastIndexOf("/")) : "")
          const names = await readdir(dir, { recursive: true }).catch(() => [] as string[])
          return names.map((n) => join(prefix.includes("/") ? prefix.slice(0, prefix.lastIndexOf("/")) : "", n)).filter((k) => k.startsWith(prefix))
        })
      })
    })
  )
}
