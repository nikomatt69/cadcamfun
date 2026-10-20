/**
 * Step 0 gate of AI-11: every action of the catalogue has an identified execution path, every action is named by its tool's
 * prompt, and the committed inventory (`specs/ai/11-harness-inventory.md`) is what the catalogue says today.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { ACTION_CATALOGUE } from "../src/actions/catalogue.ts"
import { actionInventory, hasExecutionPath, INVENTORY_PATH, renderInventory } from "./helpers/harness-inventory.ts"

/**
 * Optional handlers the actions call that no host implements, so the action silently runs without them. Recorded rather
 * than hidden: removing an entry requires the implementation, adding one requires a decision.
 * Empty: the sidecar implements the `machine` handler, so every route resolves.
 */
const KNOWN_MISSING: ReadonlyArray<string> = []

describe("harness inventory", () => {
  const inventory = actionInventory()

  test("covers the whole catalogue", () => {
    expect(inventory.map((entry) => entry.id)).toEqual(ACTION_CATALOGUE.map((spec) => spec.id))
  })

  test("every action reaches an implementation, apart from the recorded optional-handler gaps", () => {
    for (const entry of inventory) expect(entry.routes.length).toBeGreaterThan(0)
    const missing = inventory.flatMap((entry) =>
      entry.routes.filter((route) => route.at.length === 0).map((route) => `${entry.id} → ${route.kind} ${route.name}`))
    expect(missing).toEqual([...KNOWN_MISSING])
    // Every action reaches every route it declares; the optional-handler gaps above are closed.
    expect(inventory.filter((entry) => !hasExecutionPath(entry)).map((entry) => entry.id)).toEqual([])
  })

  test("every action is named in its tool prompt", () => {
    expect(inventory.filter((entry) => !entry.prompt).map((entry) => entry.id)).toEqual([])
  })

  test("the committed inventory is current", () => {
    expect(readFileSync(INVENTORY_PATH, "utf8")).toBe(renderInventory())
  })
})
