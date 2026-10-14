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
 * - `machine`: `cam.analyze` analyses without the project's machine and `cam.cutting_data` clamps to the default machine.
 */
const KNOWN_MISSING: ReadonlyArray<string> = ["cam.analyze → handler machine", "cam.cutting_data → handler machine"]

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
    // The gaps are optional handlers: the action still has a path for everything else it does.
    expect(inventory.filter((entry) => !hasExecutionPath(entry)).map((entry) => entry.id)).toEqual(["cam.analyze", "cam.cutting_data"])
  })

  test("every action is named in its tool prompt", () => {
    expect(inventory.filter((entry) => !entry.prompt).map((entry) => entry.id)).toEqual([])
  })

  test("the committed inventory is current", () => {
    expect(readFileSync(INVENTORY_PATH, "utf8")).toBe(renderInventory())
  })
})
