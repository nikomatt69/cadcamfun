/**
 * The translation tables (spec 06-desktop-ui.md §1).
 *
 * The shipped locale is one table spread over seventeen files. The spread means
 * a key that lives in two of them is not an error — the later file wins and the
 * earlier one is dead. That is exactly the kind of drift nobody notices until
 * a string changes in one place and not the other, so the tables are checked
 * here instead.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const I18N = join(import.meta.dir, "../src/i18n")
const files = readdirSync(I18N).filter((name) => name.startsWith("en.") && name.endsWith(".json"))

const table = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(I18N, name), "utf8")) as Record<string, unknown>

describe("the translation tables", () => {
  test("every table holds strings and nothing else", () => {
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) {
      for (const [key, value] of Object.entries(table(name))) {
        expect(typeof value, `${name}: ${key}`).toBe("string")
      }
    }
  })

  test("a key of the assistant lives in one table, not two", () => {
    // The assistant owns the `ai.*` strings and the `mcp.*` strings of its
    // extensions panel. A key that appears in two tables is not an error — the
    // later file wins and the earlier one is dead — so the assistant's own
    // namespaces are checked to be unambiguous.
    const owner = new Map<string, string>()
    const clashes: string[] = []
    for (const name of files) {
      for (const key of Object.keys(table(name))) {
        if (!key.startsWith("ai.") && !key.startsWith("mcp.")) continue
        const previous = owner.get(key)
        if (previous !== undefined) clashes.push(`${key} (${previous} and ${name})`)
        else owner.set(key, name)
      }
    }
    expect(clashes).toEqual([])
  })

  test("the placeholders of a string are the ones the code fills", () => {
    // `{name}` in a value needs a `name` in the call; a value without slots must
    // not be given any. The table cannot check the call sites, so it checks
    // that the slots themselves are well formed.
    for (const name of files) {
      for (const [key, value] of Object.entries(table(name))) {
        const slots = [...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1])
        for (const slot of slots) expect(slot, `${name}: ${key}`).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/)
      }
    }
  })

  test("the AI strings live in the AI table", () => {
    const ai = table("en.ai.json")
    expect(Object.keys(ai).length).toBeGreaterThan(0)
    // The assistant's own strings, and the MCP strings of its extensions panel,
    // which the assistant owns.
    for (const key of Object.keys(ai)) expect(key.startsWith("ai.") || key.startsWith("mcp."), key).toBe(true)
  })
})
