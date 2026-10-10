import { existsSync } from "node:fs"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { IsolatedPaths } from "./isolation.ts"

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
 * The download is our own single request to a public metadata endpoint (no
 * credentials are sent); it runs only when the file is missing and only when
 * the caller explicitly allows it, so tests stay offline.
 */
export const MODELS_DEV_URL = "https://models.dev/api.json"

export type CatalogueSeed = "present" | "seeded" | "skipped" | "unavailable"

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
  options?: { readonly network?: boolean; readonly signal?: AbortSignal }
): Promise<CatalogueSeed> => {
  const file = modelsCacheFile(paths)
  if (existsSync(file)) return "present"
  if (options?.network !== true) return "skipped"
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  try {
    const signal = options?.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000)
    const response = await fetch(MODELS_DEV_URL, { signal })
    if (!response.ok) return "unavailable"
    const body = await readCatalogueBody(response)
    if (body === undefined) return "unavailable"
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed !== "object" || parsed === null) return "unavailable"
    if (Object.keys(parsed).length < MIN_PROVIDERS) return "unavailable"
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
