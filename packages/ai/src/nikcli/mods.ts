/**
 * Mods the application owns (spec 27 §4.3, RM-11): the extension modules the embedded nikcli host loads from the
 * app's isolated configuration — nothing from the user's home or the project ever is.
 *
 * A mod is a nikcli extension module that exports `register(on, options)`: its hooks observe and rewrite tool calls,
 * the prompt and the session (`@nikcli-ai/plugin/mod` lists every event). The store keeps one ES module per mod under
 * `<dataDir>/ai/nikcli/mods/` and an `index.json` of records; `modSpecs` turns the enabled ones into the `file://`
 * plugin entries `buildHostConfig` writes into the global `nikcli.json`. The host loads them when it starts, so a
 * change applies to the next host, not to the conversation that made it.
 *
 * A mod an assistant authors is deliberately dependency-free: it exports `register` and imports nothing — every
 * capability it may reach arrives on the `$` argument of its hooks, and `modSourceProblems` refuses anything else.
 * The file is data the host imports; the person's consent is the `enabled` flag the UI and the tools both write.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { IsolatedPaths } from "./isolation.ts"

/** `plugin.json`-style id, lower case and short, because it names a file. */
export const MOD_ID_PATTERN = /^[a-z][a-z0-9_-]{0,39}$/

/** The largest source a mod may carry; the whole file is read by the person in the UI. */
export const MAX_MOD_SOURCE_CHARS = 20_000

/** Who wrote the module; plugin-contributed mods live in their own space and never pass through this store. */
export type ModOrigin = "assistant" | "user"

export interface ModRecord {
  readonly id: string
  /** Display name; the UI falls back to the id. */
  readonly name: string
  /** What the mod hooks, in the words of whoever wrote it; the assistant reads this before enabling one. */
  readonly description: string
  readonly enabled: boolean
  readonly origin: ModOrigin
  readonly createdAt: string
  readonly updatedAt: string
}

export const modsDir = (paths: IsolatedPaths): string => join(paths.root, "mods")
export const modIndexFile = (paths: IsolatedPaths): string => join(modsDir(paths), "index.json")
export const modModuleFile = (paths: IsolatedPaths, id: string): string => join(modsDir(paths), `${id}.js`)

/** The plugin spec the host loads for one mod: an absolute `file://` URL, the only shape the config accepts for local code. */
export const modSpec = (paths: IsolatedPaths, id: string): string => pathToFileURL(modModuleFile(paths, id)).href

/** Reasons a mod source is not acceptable, each a full sentence the model can act on. Empty: the source is fine. */
export const modSourceProblems = (source: string): ReadonlyArray<string> => {
  const problems: string[] = []
  if (source.trim().length === 0) return ["The source is empty."]
  if (source.length > MAX_MOD_SOURCE_CHARS) problems.push(`The source is longer than ${MAX_MOD_SOURCE_CHARS} characters.`)
  if (!/export\s+(const|function)\s+register\b/.test(source) && !/export\s*\{\s*register\b/.test(source)) {
    problems.push("The module must export `register` (`export const register = (on, options) => { ... }`).")
  }
  if (/^\s*import\b/m.test(source) || /\brequire\s*\(/.test(source) || /\bimport\s*\(/.test(source)) {
    problems.push("A mod imports nothing: remove every `import`/`require` and reach what you need through the `on`/`next` hook API.")
  }
  return problems
}

/** Reads the index; a missing or unreadable file is an empty store, never an error at startup. */
export const readModIndex = (paths: IsolatedPaths): ReadonlyArray<ModRecord> => {
  const file = modIndexFile(paths)
  if (!existsSync(file)) return []
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"))
    if (!Array.isArray(value)) return []
    return value.flatMap((entry): ReadonlyArray<ModRecord> => {
      if (typeof entry !== "object" || entry === null) return []
      const record = entry as Record<string, unknown>
      if (typeof record["id"] !== "string" || !MOD_ID_PATTERN.test(record["id"])) return []
      return [{
        id: record["id"],
        name: typeof record["name"] === "string" && record["name"].length > 0 ? record["name"] : record["id"],
        description: typeof record["description"] === "string" ? record["description"] : "",
        enabled: record["enabled"] === true,
        origin: record["origin"] === "user" ? "user" : "assistant",
        createdAt: typeof record["createdAt"] === "string" ? record["createdAt"] : new Date(0).toISOString(),
        updatedAt: typeof record["updatedAt"] === "string" ? record["updatedAt"] : new Date(0).toISOString()
      }]
    })
  } catch { return [] }
}

const writeIndex = (paths: IsolatedPaths, records: ReadonlyArray<ModRecord>): void => {
  mkdirSync(modsDir(paths), { recursive: true })
  const temporary = `${modIndexFile(paths)}.${crypto.randomUUID()}.tmp`
  writeFileSync(temporary, JSON.stringify(records, null, 2), { mode: 0o600 })
  renameSync(temporary, modIndexFile(paths))
}

/** The `file://` specs of the enabled mods, `index.json` order; what the host config declares. */
export const modSpecs = (paths: IsolatedPaths): ReadonlyArray<string> =>
  readModIndex(paths).filter((record) => record.enabled).map((record) => modSpec(paths, record.id))

/**
 * Writes (or replaces) one mod: the module first, then the index. Enabling is a separate call — a replacement keeps
 * the current flag, so editing a running mod does not silently switch it on.
 */
export const saveMod = (
  paths: IsolatedPaths,
  input: { readonly id: string; readonly name?: string; readonly description: string; readonly source: string; readonly origin?: ModOrigin; readonly now?: string }
): ModRecord => {
  if (!MOD_ID_PATTERN.test(input.id)) throw new RangeError(`"${input.id}" is not a valid mod id: lower case, starting with a letter, letters/digits/underscore/dash, 40 at most.`)
  const problems = modSourceProblems(input.source)
  if (problems.length > 0) throw new RangeError(problems.join(" "))
  const now = input.now ?? new Date().toISOString()
  const records = readModIndex(paths)
  const existing = records.find((record) => record.id === input.id)
  const record: ModRecord = {
    id: input.id,
    name: input.name !== undefined && input.name.length > 0 ? input.name : existing?.name ?? input.id,
    description: input.description,
    enabled: existing?.enabled ?? false,
    origin: input.origin ?? existing?.origin ?? "assistant",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }
  mkdirSync(modsDir(paths), { recursive: true })
  const temporary = `${modModuleFile(paths, input.id)}.${crypto.randomUUID()}.tmp`
  writeFileSync(temporary, input.source, { mode: 0o600 })
  renameSync(temporary, modModuleFile(paths, input.id))
  writeIndex(paths, [...records.filter((candidate) => candidate.id !== input.id), record])
  return record
}

export const setModEnabled = (paths: IsolatedPaths, id: string, enabled: boolean, now?: string): ModRecord => {
  const records = readModIndex(paths)
  const record = records.find((candidate) => candidate.id === id)
  if (record === undefined) throw new RangeError(`There is no mod "${id}".`)
  const next: ModRecord = { ...record, enabled, updatedAt: now ?? new Date().toISOString() }
  writeIndex(paths, records.map((candidate) => (candidate.id === id ? next : candidate)))
  return next
}

/** Removes the record and its module; the module is gone from disk before the index stops naming it. */
export const removeMod = (paths: IsolatedPaths, id: string): boolean => {
  const records = readModIndex(paths)
  if (!records.some((record) => record.id === id)) return false
  rmSync(modModuleFile(paths, id), { force: true })
  writeIndex(paths, records.filter((record) => record.id !== id))
  return true
}
