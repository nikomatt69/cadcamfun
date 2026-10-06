import {
  Api, KeyedInternal, LegacyPluginManifest, PluginBadRequest, PluginConflict, PluginNotFound
} from "@cadcamfun/api"
import { Effect, Schema } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { HttpServerResponse } from "effect/unstable/http"
import JSZip from "jszip"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"
import { AppConfigService } from "../config.ts"
import { bootstrapScript } from "../plugins/bootstrap-script.ts"
import { type LegacyManifest, PluginRegistryRepo } from "../repos/plugin-registry-repo.ts"
import { StorageService } from "../services/storage.ts"

const MIME: Record<string, string> = {
  ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".html": "text/html", ".txt": "text/plain", ".pdf": "application/pdf", ".zip": "application/zip",
  ".7z": "application/x-7z-compressed", ".tar": "application/x-tar", ".gz": "application/gzip", ".bz2": "application/x-bzip2",
  ".rar": "application/x-rar-compressed", ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".mp3": "audio/mpeg",
  ".mp4": "video/mp4", ".avi": "video/x-msvideo", ".mov": "video/quicktime", ".wmv": "video/x-ms-wmv", ".flv": "video/x-flv",
  ".webm": "video/webm", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".oga": "audio/ogg",
  ".opus": "audio/opus", ".m4v": "video/mp4", ".mkv": "video/x-matroska"
}

const decodeManifest = Schema.decodeUnknownResult(LegacyPluginManifest)

/** Legacy zod `validateManifest`: the Schema plus the id/version/repository format rules. */
const validateManifest = (value: unknown): ReadonlyArray<string> => {
  const errors: Array<string> = []
  const decoded = decodeManifest(value)
  if (decoded._tag === "Failure") errors.push(String(decoded.failure))
  if (typeof value === "object" && value !== null) {
    const m = value as Record<string, unknown>
    if (typeof m.id === "string" && !/^[a-z0-9-_.]+$/.test(m.id)) errors.push("id: Invalid")
    if (typeof m.version === "string" && !/^\d+\.\d+\.\d+$/.test(m.version)) errors.push("version: Invalid")
    if (typeof m.name === "string" && m.name.length === 0) errors.push("name: String must contain at least 1 character(s)")
    if (typeof m.repository === "string" && !URL.canParse(m.repository)) errors.push("repository: Invalid url")
  }
  return errors
}

const internal = (log: string, fallback: string) => (e: unknown) =>
  Effect.logError(log, e).pipe(Effect.andThen(Effect.fail(new KeyedInternal({ error: e instanceof Error ? e.message : fallback }))))

/** Reads `manifest.json` from the archive root or from its single top-level folder. */
const readArchive = async (bytes: Uint8Array) => {
  const zip = await JSZip.loadAsync(bytes).catch((e: unknown) => {
    throw new PluginBadRequest({ error: `Failed to extract plugin archive: ${e instanceof Error ? e.message : String(e)}` })
  })
  const names = Object.keys(zip.files).filter((n) => !n.startsWith("__MACOSX/") && !zip.files[n]!.dir)
  let base = ""
  if (!names.includes("manifest.json")) {
    const dirs = new Set(names.filter((n) => n.includes("/")).map((n) => n.split("/")[0]!))
    const only = dirs.size === 1 ? [...dirs][0]! : undefined
    if (only === undefined || !names.includes(`${only}/manifest.json`)) {
      throw new PluginBadRequest({
        error: "Failed to read or parse manifest.json after extraction: manifest.json not found in package root or a single valid sub-directory."
      })
    }
    base = `${only}/`
  }
  let manifest: Record<string, unknown>
  try {
    manifest = JSON.parse(await zip.file(`${base}manifest.json`)!.async("string")) as Record<string, unknown>
    if (!manifest || !manifest.id || !manifest.version || !manifest.main) {
      throw new Error("Extracted manifest is missing required fields (id, version, main).")
    }
  } catch (e) {
    throw new PluginBadRequest({
      error: `Failed to read or parse manifest.json after extraction: ${e instanceof Error ? e.message : String(e)}`
    })
  }
  const files = await Promise.all(names.filter((n) => n.startsWith(base)).map(async (n) => ({
    path: n.slice(base.length), data: await zip.files[n]!.async("uint8array")
  })))
  return { manifest, files }
}

export const PluginsHandlers = HttpApiBuilder.group(Api, "plugins", Effect.fn(function*(handlers) {
  const repo = yield* PluginRegistryRepo
  const storage = yield* StorageService
  const config = yield* AppConfigService
  const registryDir = join(config.dataDir, "plugins-registry")

  const require = Effect.fn("plugins.require")(function*(id: string) {
    const entry = yield* repo.find(id)
    if (!entry) return yield* new PluginNotFound({ error: `Plugin ${id} is not installed` })
    return entry
  })
  const dependents = (id: string) => repo.list().pipe(
    Effect.map((all) => all.filter((p) => Object.keys(p.manifest.dependencies ?? {}).includes(id))))

  type RegistryManifest = typeof import("@cadcamfun/api").RegistryPluginManifest.Type
  const readRegistry = (): Array<RegistryManifest> => {
    if (!existsSync(registryDir)) return []
    const out: Array<RegistryManifest> = []
    for (const dir of readdirSync(registryDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const file = join(registryDir, dir.name, "manifest.json")
      if (!existsSync(file)) continue
      try {
        const m = JSON.parse(readFileSync(file, "utf-8")) as RegistryManifest
        if (m.id && m.name) out.push(m)
      } catch { /* a broken manifest must not hide the others */ }
    }
    return out
  }
  const registryFail = (msg: string) => (e: unknown) =>
    Effect.logError(msg, e).pipe(Effect.andThen(Effect.fail(new KeyedInternal({ error: msg }))))

  return handlers
    .handle("list", () => repo.list().pipe(Effect.map((l) => [...l]),
      Effect.catchTag("DatabaseError", internal("Failed to get plugins", "Failed to retrieve plugin list from storage"))))
    .handle("get", ({ params }) => require(params.id).pipe(
      Effect.catchTag("DatabaseError", internal("Failed to get plugin details", "Failed to get plugin details"))))
    .handle("uninstall", ({ params }) => Effect.gen(function*() {
      yield* require(params.id)
      const blocking = yield* dependents(params.id)
      if (blocking.length > 0) {
        return yield* new KeyedInternal({
          error: `Cannot uninstall plugin ${params.id} because it is required by: ${blocking.map((p) => p.id).join(", ")}`
        })
      }
      yield* storage.deletePrefix(`plugins/${params.id}`)
      yield* repo.remove(params.id)
      return { message: `Plugin ${params.id} uninstalled successfully.` }
    }).pipe(Effect.catchTags({
      DatabaseError: internal("Failed to uninstall plugin", "Failed to uninstall plugin"),
      StorageError: internal("Failed to uninstall plugin", "Failed to uninstall plugin")
    })))
    .handle("getConfig", ({ params }) => repo.getConfig(params.id).pipe(Effect.map((c) => c ?? {}),
      Effect.catchTag("DatabaseError", internal("Error processing config", "Failed to process plugin configuration"))))
    .handle("setConfig", ({ params, payload }) => saveConfig(params.id, payload))
    .handle("updateConfig", ({ params, payload }) => saveConfig(params.id, payload))
    .handle("enable", ({ params }) => Effect.gen(function*() {
      yield* require(params.id)
      yield* repo.setEnabled(params.id, true)
      return { message: `Plugin ${params.id} enabled successfully.` }
    }).pipe(Effect.catchTag("DatabaseError", internal("Failed to enable plugin", "Failed to enable plugin"))))
    .handle("disable", ({ params }) => Effect.gen(function*() {
      const entry = yield* require(params.id)
      if (entry.enabled) {
        const blocking = (yield* dependents(params.id)).filter((p) => p.enabled)
        if (blocking.length > 0) {
          return yield* new KeyedInternal({
            error: `Cannot disable plugin ${params.id} because it is required by these enabled plugins: ${blocking.map((p) => p.id).join(", ")}`
          })
        }
        yield* repo.setEnabled(params.id, false)
      }
      return { message: `Plugin ${params.id} disabled successfully.` }
    }).pipe(Effect.catchTag("DatabaseError", internal("Failed to disable plugin", "Failed to disable plugin"))))
    .handle("update", ({ params, payload }) => updatePlugin(params.id, payload))
    .handle("patch", ({ params, payload }) => updatePlugin(params.id, payload))
    .handle("install", ({ payload }) => Effect.gen(function*() {
      const file = payload.file[0]
      if (!file) return yield* new PluginBadRequest({ error: "No valid plugin package file uploaded or filepath missing." })
      const bytes = yield* Effect.tryPromise({ try: () => readFile(file.path), catch: (e) => e })
      const { manifest, files } = yield* Effect.tryPromise({
        try: () => readArchive(new Uint8Array(bytes)),
        catch: (e) => e instanceof PluginBadRequest ? e : new PluginBadRequest({ error: String(e) })
      })
      const errors = validateManifest(manifest)
      if (errors.length > 0) {
        return yield* new PluginBadRequest({ error: `Invalid plugin manifest: ${errors.join(", ")}` })
      }
      const valid = manifest as unknown as LegacyManifest
      if (yield* repo.find(valid.id)) return yield* new PluginConflict({ error: `Plugin ${valid.id} is already installed` })
      for (const [dep, range] of Object.entries(valid.dependencies ?? {})) {
        if (!(yield* repo.find(dep))) return yield* new PluginBadRequest({ error: `Missing dependency: ${dep} (${range})` })
      }
      yield* storage.deletePrefix(`plugins/${valid.id}`)
      for (const f of files) {
        const rel = normalize(f.path)
        if (rel.startsWith("..") || rel.startsWith("/")) continue
        yield* storage.upload(`plugins/${valid.id}/${rel}`, f.data)
      }
      const plugin = yield* repo.insert(valid)
      return { message: `Plugin ${valid.name} (v${valid.version}) installed successfully.`, plugin }
    }).pipe(Effect.catchTags({
      DatabaseError: internal("Error installing plugin", "Failed to install plugin"),
      StorageError: internal("Error installing plugin", "Failed to install plugin")
    }), Effect.catchIf((e): e is unknown => !(e instanceof PluginBadRequest || e instanceof PluginConflict || e instanceof KeyedInternal),
      internal("Error installing plugin", "Failed to install plugin"))))
    .handle("bootstrap", ({ query }) => Effect.gen(function*() {
      // The three failure bodies share one text schema, so the status is chosen here rather than by error type.
      const fail = (status: number, body: string) =>
        HttpServerResponse.text(body, { status, contentType: "text/html; charset=utf-8" })
      const entry = yield* repo.find(query.id)
      if (!entry) return fail(404, `/* Plugin manifest not found for ID: ${query.id} */`)
      const manifest = entry.manifest
      if (!manifest.main || typeof manifest.main !== "string") {
        return fail(500, `/* Plugin ${query.id} has no valid main entry point in manifest. */`)
      }
      const codeUrl = `/api/plugins/serve?id=${encodeURIComponent(query.id)}&file=${encodeURIComponent(manifest.main)}`
      return HttpServerResponse.text(bootstrapScript(query.id, JSON.stringify(manifest), codeUrl), {
        contentType: "application/javascript; charset=utf-8", headers: { "cache-control": "private, no-store" }
      })
    }).pipe(Effect.catchTag("DatabaseError", () =>
      Effect.succeed(HttpServerResponse.text("/* Plugin manifest not found */", { status: 404, contentType: "text/html; charset=utf-8" })))
    ) as unknown as Effect.Effect<never, string>)
    .handle("serve", ({ query }) => Effect.gen(function*() {
      const rel = normalize(query.file).replace(/^(\.\.(\/|\\|\$))+/, "")
      if (rel.includes("..")) return yield* new PluginBadRequest({ error: "Invalid file path." })
      const bytes = yield* storage.downloadBytes(`plugins/${query.id}/${rel}`)
      if (bytes === null) return yield* new PluginNotFound({ error: "File not found" })
      const ext = extname(rel).toLowerCase()
      return HttpServerResponse.uint8Array(bytes, {
        contentType: MIME[ext] ?? "application/octet-stream",
        headers: { "cache-control": [".js", ".mjs", ".css"].includes(ext) ? "public, max-age=31536000, immutable" : "public, max-age=3600" }
      })
    }).pipe(Effect.catchTag("StorageError", () => Effect.fail(new KeyedInternal({ error: "Internal server error" })))) as unknown as Effect.Effect<never, PluginBadRequest | PluginNotFound | KeyedInternal>)
    .handle("registry", () => Effect.try({ try: readRegistry, catch: (e) => e }).pipe(
      Effect.catch(registryFail("Failed to read plugin registry"))))
    .handle("registryGet", ({ params }) => Effect.gen(function*() {
      const safe = params.id.replace(/[^a-zA-Z0-9-_]/g, "")
      const dir = join(registryDir, safe)
      if (!existsSync(dir)) return yield* new PluginNotFound({ error: "Plugin not found" })
      const file = join(dir, "manifest.json")
      if (!existsSync(file)) return yield* new PluginNotFound({ error: "Plugin manifest not found" })
      const manifest = yield* Effect.try({
        try: () => JSON.parse(readFileSync(file, "utf-8")) as RegistryManifest, catch: (e) => e
      })
      if (!manifest.id || !manifest.name) return yield* new PluginBadRequest({ error: "Invalid plugin manifest" })
      return manifest
    }).pipe(Effect.catchIf((e): e is unknown => !(e instanceof PluginBadRequest || e instanceof PluginNotFound),
      registryFail("Failed to fetch plugin details"))))
    .handle("registrySearch", ({ query }) => Effect.gen(function*() {
      const q = query.q.toLowerCase().trim()
      if (!q) return yield* new PluginBadRequest({ error: "Invalid search query" })
      const hit = (s: string | undefined) => s?.toLowerCase().includes(q) ?? false
      const all = yield* Effect.try({ try: readRegistry, catch: (e) => e })
      return all.filter((m) => hit(m.id) || hit(m.name) || hit(m.description) || hit(m.author))
    }).pipe(Effect.catchIf((e): e is unknown => !(e instanceof PluginBadRequest), registryFail("Failed to search plugin registry"))))

  function saveConfig(id: string, payload: Record<string, unknown>) {
    return Effect.gen(function*() {
      yield* require(id).pipe(Effect.mapError(() => new PluginNotFound({ error: `Plugin ${id} not found.` })))
      yield* repo.setConfig(id, payload)
      return { message: "Configuration updated successfully." }
    }).pipe(Effect.catchTag("DatabaseError", internal("Error processing config", "Failed to process plugin configuration")))
  }

  function updatePlugin(id: string, payload: { readonly manifest?: LegacyManifest | undefined; readonly config?: Record<string, unknown> | undefined }) {
    return Effect.gen(function*() {
      yield* require(id).pipe(Effect.mapError(() => new PluginNotFound({ error: `Plugin with ID ${id} not found.` })))
      if (payload.manifest) {
        const errors = validateManifest(payload.manifest)
        if (errors.length > 0) return yield* new PluginBadRequest({ error: "Invalid manifest data provided.", details: errors })
        if (payload.manifest.id !== id) {
          return yield* new PluginBadRequest({ error: `Manifest ID (${payload.manifest.id}) doesn't match update target (${id})` })
        }
        yield* repo.replaceManifest(id, payload.manifest)
      }
      if (payload.config) yield* repo.setConfig(id, payload.config)
      return yield* require(id)
    }).pipe(Effect.catchTag("DatabaseError", internal("Failed to update plugin", "Failed to update plugin")))
  }
}))
