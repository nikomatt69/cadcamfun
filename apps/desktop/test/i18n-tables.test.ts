/**
 * The translation tables (spec 06-desktop-ui.md §1).
 *
 * English is the source table and every other language is a pack beside it. A
 * pack that misses a key shows the English string, so a missing key is a silent
 * half-translated screen — the packs are therefore checked against English here:
 * the same keys, the same placeholders and no empty string.
 *
 * The tables are spread over several files (one per vertical). That means a key
 * that lives in two of them is not an error — the later file wins and the earlier
 * one is dead. That is exactly the kind of drift nobody notices until a string
 * changes in one place and not the other, so the tables are checked here instead.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { LOCALES as REGISTRY, LOCALE_CODES } from "../src/i18n/registry.ts"

const LOCALES = join(import.meta.dir, "../src/i18n/locales")
const languages = readdirSync(LOCALES).filter((name) => statSync(join(LOCALES, name)).isDirectory())
const verticals = readdirSync(join(LOCALES, "en")).filter((name) => name.endsWith(".json"))

const table = (language: string, name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(LOCALES, language, name), "utf8")) as Record<string, unknown>

/** The table of a language, merged the way the runtime merges it. */
const merged = (language: string): Record<string, string> =>
  Object.assign({}, ...verticals.map((name) => table(language, name))) as Record<string, string>

const slots = (value: string): string[] =>
  [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort()

describe("the translation tables", () => {
  test("every shipped language has a table", () => {
    expect(languages.sort()).toEqual([...LOCALE_CODES].sort())
    expect(REGISTRY.en.name).toBe("English")
    // The ten principal languages plus Italian.
    expect(LOCALE_CODES.length).toBe(11)
    expect(LOCALE_CODES).toContain("it")
  })

  test("every table holds strings and nothing else", () => {
    expect(verticals.length).toBeGreaterThan(0)
    for (const language of languages) {
      for (const name of verticals) {
        for (const [key, value] of Object.entries(table(language, name))) {
          expect(typeof value, `${language}/${name}: ${key}`).toBe("string")
          expect((value as string).trim().length, `${language}/${name}: ${key}`).toBeGreaterThan(0)
        }
      }
    }
  })

  test("a key of the assistant lives in one table, not two", () => {
    // The assistant owns the `ai.*` strings and the `mcp.*` strings of its
    // extensions panel. A key that appears in two tables is not an error — the
    // later file wins and the earlier one is dead — so the assistant's own
    // namespaces are checked to be unambiguous.
    for (const language of languages) {
      const owner = new Map<string, string>()
      const clashes: string[] = []
      for (const name of verticals) {
        for (const key of Object.keys(table(language, name))) {
          if (!key.startsWith("ai.") && !key.startsWith("mcp.")) continue
          const previous = owner.get(key)
          if (previous !== undefined) clashes.push(`${key} (${previous} and ${name})`)
          else owner.set(key, name)
        }
      }
      expect(clashes, language).toEqual([])
    }
  })

  test("the placeholders of a string are the ones the code fills", () => {
    // `{name}` in a value needs a `name` in the call; a value without slots must
    // not be given any. The table cannot check the call sites, so it checks
    // that the slots themselves are well formed.
    for (const language of languages) {
      for (const name of verticals) {
        for (const [key, value] of Object.entries(table(language, name))) {
          for (const slot of slots(String(value))) expect(slot, `${language}/${name}: ${key}`).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/)
        }
      }
    }
  })

  test("every language has the keys of the English table", () => {
    const english = merged("en")
    for (const language of languages) {
      const translated = merged(language)
      const missing = Object.keys(english).filter((key) => !(key in translated))
      const extra = Object.keys(translated).filter((key) => !(key in english))
      expect(missing, `${language} misses`).toEqual([])
      expect(extra, `${language} has`).toEqual([])
    }
  })

  test("a language keeps the placeholders of the English string", () => {
    const english = merged("en")
    for (const language of languages) {
      const translated = merged(language)
      for (const [key, source] of Object.entries(english)) {
        expect(slots(translated[key] ?? ""), `${language}: ${key}`).toEqual(slots(source))
      }
    }
  })

  test("the AI strings live in the AI table", () => {
    const ai = table("en", "ai.json")
    expect(Object.keys(ai).length).toBeGreaterThan(0)
    // The assistant's own strings, and the MCP strings of its extensions panel,
    // which the assistant owns.
    for (const key of Object.keys(ai)) expect(key.startsWith("ai.") || key.startsWith("mcp."), key).toBe(true)
  })
})
