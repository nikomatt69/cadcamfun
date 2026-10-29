import { Database as BunDatabase } from "bun:sqlite"
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { Redacted } from "effect"
import { CHUNK_SIZE, MAX_CHECKPOINT_BYTES, checkpointRevision, decodeManifest, safeCheckpointPath, sha256, type CheckpointFile, type CheckpointManifest } from "@cadcamfun/cloud/checkpoint-protocol"
import type { AppConfig } from "../config.ts"

export interface CloudCheckpointOptions {
  readonly dataDir: string
  readonly url: string
  readonly token: string
  readonly epoch: string
  readonly fetch?: typeof fetch
}

const MARKER = ".cloud-checkpoint.json"
const ignored = new Set(["backups", "logs", "log", "cache", "tmp", "node_modules", ".git", MARKER])
const isTransient = (path: string) => path.endsWith("-wal") || path.endsWith("-shm") || path.includes(".cloud-restore-")

/** Restores before SQLite opens; acknowledged mutations publish content-addressed snapshots before returning. */
export class CloudCheckpoint {
  private revision: string | null = null
  private readonly knownChunks = new Set<string>()
  private tail: Promise<void> = Promise.resolve()
  private capture: (() => Uint8Array) | undefined
  private failed = false
  private restored = false
  private readonly request: typeof fetch

  constructor(private readonly options: CloudCheckpointOptions) { this.request = options.fetch ?? fetch }

  private async call(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers)
    headers.set("authorization", `Bearer ${this.options.token}`)
    headers.set("x-cadcamfun-cloud-epoch", this.options.epoch)
    const response = await this.request(`${this.options.url.replace(/\/$/, "")}/${path}`, {
      ...init, headers, redirect: "error", signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`Cloud persistence ${path === "boot" ? "restore" : "write"} failed (${response.status})`)
    }
    return response
  }

  async restore(): Promise<void> {
    const response = await this.call("boot")
    const manifest = decodeManifest(await response.json())
    const root = resolve(this.options.dataDir)
    if (root === "/" || root === resolve(".")) throw new Error("Cloud data must have a dedicated directory")
    await mkdir(root, { recursive: true, mode: 0o700 })
    const previous = await readFile(join(root, MARKER), "utf8").then((text) => decodeManifest(JSON.parse(text))).catch((error: unknown) => {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null
      throw error
    })
    if (!manifest) {
      if (previous) throw new Error("The durable checkpoint is missing; refusing to replace a known workspace")
      this.restored = true
      return
    }
    if (await checkpointRevision(manifest.files) !== manifest.revision) throw new Error("Cloud checkpoint manifest hash mismatch")
    const keep = new Set(manifest.files.map((file) => file.path))
    for (const file of manifest.files) {
      const bytes = new Uint8Array(file.size)
      let offset = 0
      for (const chunk of file.chunks) {
        const object = await this.call(`objects/${chunk.hash}`)
        const data = new Uint8Array(await object.arrayBuffer())
        if (data.byteLength !== chunk.size || await sha256(data) !== chunk.hash) throw new Error("Cloud checkpoint chunk hash mismatch")
        bytes.set(data, offset)
        offset += data.byteLength
        this.knownChunks.add(chunk.hash)
      }
      if (await sha256(bytes) !== file.sha256) throw new Error("Cloud checkpoint file hash mismatch")
      const destination = join(root, file.path)
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
      const temporary = `${destination}.cloud-restore-${crypto.randomUUID()}`
      await writeFile(temporary, bytes, { mode: 0o600 })
      await rename(temporary, destination)
      // A restored SQLite image is self-contained. Old WAL files must never be replayed over it.
      if (/\.(?:db|sqlite|sqlite3)$/.test(file.path)) for (const suffix of ["-wal", "-shm"]) await rm(destination + suffix, { force: true })
    }
    for (const file of previous?.files ?? []) if (!keep.has(file.path)) await rm(join(root, file.path), { force: true })
    await this.writeMarker(manifest)
    this.revision = manifest.revision
    this.restored = true
  }

  /** Called by the database Layer, which serializes queries until this barrier finishes. */
  saveDatabase(snapshot: () => Uint8Array): Promise<void> {
    this.capture = snapshot
    return this.flush()
  }

  flush(): Promise<void> {
    const result = this.tail.then(async () => {
      if (!this.restored) throw new Error("Cloud checkpoint restore has not completed")
      if (this.failed) throw new Error("Cloud persistence failed; the workspace must restart before continuing")
      if (!this.capture) throw new Error("Cloud database is not ready")
      try { await this.save(this.capture()) }
      catch (error) { this.failed = true; throw error }
    })
    this.tail = result.catch(() => undefined)
    return result
  }

  private async save(database: Uint8Array): Promise<void> {
    const root = resolve(this.options.dataDir)
    const files: CheckpointFile[] = []
    let total = 0
    const add = async (path: string, bytes: Uint8Array) => {
      total += bytes.byteLength
      if (total > MAX_CHECKPOINT_BYTES) throw new Error("Cloud workspace exceeds the checkpoint size limit")
      const chunks = []
      for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_SIZE) {
        const data = bytes.slice(offset, offset + CHUNK_SIZE)
        const hash = await sha256(data)
        if (!this.knownChunks.has(hash)) {
          const response = await this.call(`objects/${hash}`, { method: "PUT", headers: { "content-type": "application/octet-stream" }, body: data })
          await response.body?.cancel()
          this.knownChunks.add(hash)
        }
        chunks.push({ hash, size: data.byteLength })
      }
      files.push({ path, size: bytes.byteLength, sha256: await sha256(bytes), chunks })
    }
    await add("cadcamfun.db", database)
    const walk = async (relative: string): Promise<void> => {
      const entries = await readdir(join(root, relative), { withFileTypes: true })
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
        const path = relative ? `${relative}/${entry.name}` : entry.name
        if (ignored.has(entry.name) || path === "cadcamfun.db" || isTransient(path)) continue
        if (!safeCheckpointPath(path)) throw new Error("Invalid cloud state file path")
        if (entry.isDirectory()) await walk(path)
        else if (entry.isFile()) {
          if (/\.(?:db|sqlite|sqlite3)$/.test(path)) {
            // nikcli may own another SQLite connection. Serialize it through SQLite, never copy its live WAL files.
            const sqlite = new BunDatabase(join(root, path), { readonly: true })
            try { await add(path, new Uint8Array(sqlite.serialize())) } finally { sqlite.close() }
          } else await add(path, new Uint8Array(await readFile(join(root, path))))
        }
      }
    }
    await walk("")
    files.sort((a, b) => a.path.localeCompare(b.path, "en"))
    const revision = await checkpointRevision(files)
    if (revision === this.revision) return
    const body = JSON.stringify({ epoch: this.options.epoch, expectedRevision: this.revision, files })
    let persisted = false
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.call("commit", { method: "POST", headers: { "content-type": "application/json" }, body })
        const result: unknown = await response.json()
        if (typeof result !== "object" || result === null || !("revision" in result) || result.revision !== revision) throw new Error("Cloud checkpoint receipt mismatch")
        persisted = true
        break
      } catch (error) {
        if (attempt === 2) throw error
      }
    }
    if (!persisted) throw new Error("Cloud checkpoint was not acknowledged")
    this.revision = revision
    await this.writeMarker({ version: 1, revision, files })
  }

  private async writeMarker(manifest: CheckpointManifest): Promise<void> {
    const path = join(this.options.dataDir, MARKER)
    const temporary = `${path}.cloud-restore-${crypto.randomUUID()}`
    await writeFile(temporary, JSON.stringify(manifest), { mode: 0o600 })
    await rename(temporary, path)
  }
}

const controllers = new Map<string, CloudCheckpoint>()
const optionsFor = (config: AppConfig): CloudCheckpointOptions | null => {
  if (!config.cloudCheckpointUrl && !config.cloudCheckpointToken && !config.cloudEpoch) return null
  if (!config.cloudCheckpointUrl || !config.cloudCheckpointToken || !config.cloudEpoch) throw new Error("Cloud persistence configuration is incomplete")
  const url = new URL(config.cloudCheckpointUrl)
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Cloud checkpoint URL must use HTTPS")
  return { dataDir: config.dataDir, url: url.toString().replace(/\/$/, ""), token: Redacted.value(config.cloudCheckpointToken), epoch: config.cloudEpoch }
}

export const restoreHostedState = async (config: AppConfig): Promise<void> => {
  const options = optionsFor(config)
  if (!options) return
  const controller = new CloudCheckpoint(options)
  await controller.restore()
  controllers.set(config.dataDir, controller)
}
export const checkpointHostedDatabase = (config: AppConfig, snapshot: () => Uint8Array): Promise<void> => {
  const controller = controllers.get(config.dataDir)
  if (!controller) return Promise.reject(new Error("Hosted checkpoint was not restored before opening the database"))
  return controller.saveDatabase(snapshot)
}
export const flushHostedState = async (config: AppConfig): Promise<void> => {
  if (!optionsFor(config)) return
  const controller = controllers.get(config.dataDir)
  if (!controller) throw new Error("Hosted checkpoint is not ready")
  await controller.flush()
}
