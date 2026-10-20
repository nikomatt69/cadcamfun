import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { IsolatedPaths } from "./isolation.ts"
import { bundledCatalogue } from "./models-snapshot.ts"

/**
 * The host's model catalogue on disk (`<cache>/models.json`).
 *
 * With `NIKCLI_DISABLE_MODELS_FETCH` set, nikcli neither downloads models.dev
 * nor falls back to its embedded snapshot, so `provider.list()` would return
 * only the providers declared in `nikcli.json` (four). Writing the catalogue
 * here once makes `ModelsDev.get()` return it *before* the flag check, which
 * gives the full provider/model list with **zero** host network access: nikcli
 * only ever reads this file.
 *
 * A new installation restores the pinned SDK's full bundled catalogue before starting
 * the host. Only an explicit refresh downloads metadata; no standalone nikcli is needed.
 */
export const MODELS_DEV_URL = "https://models.dev/api.json"

/** The catalogue is ~6 MB; on a slow or proxied connection 10 s is not enough, and a timed-out seed used to leave the host with only the declared providers. */
export const CATALOGUE_FETCH_TIMEOUT_MS = 30_000

export type CatalogueSeed = "present" | "seeded" | "bundled" | "skipped" | "unavailable"

/** Minimum plausible provider count, so a truncated/placeholder body is rejected. */
const MIN_PROVIDERS = 20
export const MAX_CATALOGUE_BYTES = 8 * 1024 * 1024

/** Bound both decoded bytes and buffering, including responses without Content-Length. */
export const readCatalogueBody = async (response: Response): Promise<string | undefined> => {
  if (!response.body) return undefined
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let body = ""
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) return body + decoder.decode()
      size += part.value.byteLength
      if (size > MAX_CATALOGUE_BYTES) {
        await reader.cancel()
        return undefined
      }
      body += decoder.decode(part.value, { stream: true })
    }
  } finally { reader.releaseLock() }
}

export const modelsCacheFile = (paths: IsolatedPaths): string => join(paths.cache, "models.json")

export const seedModelsCache = async (
  paths: IsolatedPaths,
  options?: { readonly network?: boolean; readonly signal?: AbortSignal; readonly refresh?: boolean }
): Promise<CatalogueSeed> => {
  const file = modelsCacheFile(paths)
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  try {
    let present = false
    try {
      const cached: unknown = JSON.parse(await readFile(file, "utf8"))
      present = typeof cached === "object" && cached !== null && !Array.isArray(cached) && Object.keys(cached).length > 0 &&
        Object.values(cached).every((provider) => provider !== null && typeof provider === "object" &&
          "models" in provider && provider.models !== null && typeof provider.models === "object" && !Array.isArray(provider.models))
    } catch { /* Missing or corrupt metadata is repaired from the application, never from a user's nikcli installation. */ }
    if (!present) {
      options?.signal?.throwIfAborted()
      await mkdir(dirname(file), { recursive: true })
      await writeFile(temporary, bundledCatalogue())
      options?.signal?.throwIfAborted()
      await rename(temporary, file)
    }
    if (!options?.refresh) return present ? "present" : "bundled"
    if (options.network !== true) return "skipped"
    const signal = options?.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(CATALOGUE_FETCH_TIMEOUT_MS)]) : AbortSignal.timeout(CATALOGUE_FETCH_TIMEOUT_MS)
    const response = await fetch(MODELS_DEV_URL, { signal })
    if (!response.ok) return "unavailable"
    const body = await readCatalogueBody(response)
    if (body === undefined) return "unavailable"
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed !== "object" || parsed === null) return "unavailable"
    if (Object.keys(parsed).length < MIN_PROVIDERS) return "unavailable"
    if (!Object.values(parsed).every((provider) => provider !== null && typeof provider === "object" &&
      "models" in provider && provider.models !== null && typeof provider.models === "object" && !Array.isArray(provider.models))) return "unavailable"
    signal.throwIfAborted()
    await mkdir(dirname(file), { recursive: true })
    signal.throwIfAborted()
    await writeFile(temporary, body)
    signal.throwIfAborted()
    await rename(temporary, file)
    return "seeded"
  } catch {
    return "unavailable"
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}
