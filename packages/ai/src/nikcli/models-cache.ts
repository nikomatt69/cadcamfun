import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
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

export const modelsCacheFile = (paths: IsolatedPaths): string => join(paths.cache, "models.json")

export const seedModelsCache = async (
  paths: IsolatedPaths,
  options?: { readonly network?: boolean }
): Promise<CatalogueSeed> => {
  const file = modelsCacheFile(paths)
  if (existsSync(file)) return "present"
  if (options?.network !== true) return "skipped"
  try {
    const response = await fetch(MODELS_DEV_URL, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return "unavailable"
    const body = await response.text()
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed !== "object" || parsed === null) return "unavailable"
    if (Object.keys(parsed).length < MIN_PROVIDERS) return "unavailable"
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, body)
    return "seeded"
  } catch {
    return "unavailable"
  }
}
