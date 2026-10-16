import { afterAll, expect, test } from "bun:test"
import { Effect } from "effect"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runAction } from "../src/actions/catalogue.ts"
import { isolatedPaths } from "../src/nikcli/isolation.ts"
import { modToolContributions } from "../src/nikcli/mod-tools.ts"
import { modSpec, readModIndex, saveMod } from "../src/nikcli/mods.ts"
import type { ToolContext } from "../src/tools/define.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"

const root = mkdtempSync(join(tmpdir(), "cadcam-mod-tools-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const source = "export const register = () => {}"
const context: ToolContext = { projectId: "project", sessionId: "session", handlers: {} as ToolHandlersShape }

test("a mod save cancelled while queued never writes after the earlier reload finishes", async () => {
  const paths = isolatedPaths(join(root, "cancelled"))
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let reloads = 0
  const contributions = modToolContributions({
    paths,
    loadedMods: () => Effect.succeed([]),
    reloadMods: () => Effect.promise(async () => {
      if (++reloads === 1) { entered.resolve(); await release.promise }
    })
  })
  const first = runAction("mods_edit.save", { id: "first", description: "First", source }, { ...context, contributions })
  await entered.promise
  const queued = Promise.withResolvers<void>()
  const controller = new AbortController()
  const second = runAction("mods_edit.save", { id: "cancelled", description: "Cancelled", source }, {
    ...context, signal: controller.signal,
    contributions: {
      ...contributions,
      "mods_edit.save": (input, ctx) => {
        const pending = contributions["mods_edit.save"]!(input, ctx)
        queued.resolve()
        return pending
      }
    }
  })
  await queued.promise
  controller.abort()
  try { expect(await second).toMatchObject({ ok: false }) } finally { release.resolve() }
  await first
  // A third mutation drains the same queue, proving the cancelled call cannot write later.
  await runAction("mods_edit.save", { id: "last", description: "Last", source }, { ...context, contributions })
  expect(readModIndex(paths).map((record) => record.id)).toEqual(["first", "last"])
})

test("a failed live reload preserves an enabled mod for the next host start", async () => {
  const paths = isolatedPaths(join(root, "reload-failure"))
  const contributions = modToolContributions({
    paths,
    loadedMods: () => Effect.succeed([]),
    reloadMods: () => Effect.fail(new Error("Host is temporarily unavailable"))
  })
  const result = await runAction("mods_edit.save", { id: "pending", description: "Pending reload", source, enable: true }, { ...context, contributions })
  expect(result).toMatchObject({ ok: true, id: "pending", enabled: true, reloaded: false })
  expect(readModIndex(paths)[0]?.enabled).toBe(true)
})

test("a successful reload that refuses the module still disables it", async () => {
  const paths = isolatedPaths(join(root, "refused-module"))
  const contributions = modToolContributions({
    paths,
    loadedMods: () => Effect.succeed([]),
    reloadMods: () => Effect.void
  })
  const result = await runAction("mods_edit.save", { id: "refused", description: "Refused by host", source, enable: true }, { ...context, contributions })
  expect(result).toMatchObject({ ok: false, id: "refused", enabled: false })
  expect(readModIndex(paths)[0]?.enabled).toBe(false)
})

test("a mod inspection failure preserves enabled consent and explains the unverified live state", async () => {
  const paths = isolatedPaths(join(root, "inspection-failure"))
  const contributions = modToolContributions({
    paths,
    loadedMods: () => Effect.fail(new Error("Temporary mod inspection failure")),
    reloadMods: () => Effect.void
  })
  const result = await runAction("mods_edit.save", { id: "pending", description: "Pending inspection", source, enable: true }, { ...context, contributions })
  expect(result).toMatchObject({ ok: true, enabled: true, reloaded: true, note: expect.stringContaining("could not be read") })
  expect(readModIndex(paths)[0]?.enabled).toBe(true)
})

test("arming a mod uses one post-reload inspection snapshot", async () => {
  const paths = isolatedPaths(join(root, "inspection-snapshot"))
  let reads = 0
  const contributions = modToolContributions({
    paths,
    loadedMods: () => Effect.sync(() => ++reads === 1 ? [{ id: modSpec(paths, "armed"), name: "Armed", tier: "user", rank: 0, events: ["prompt.submit"], tools: [], commands: [] }] : []),
    reloadMods: () => Effect.void
  })
  const result = await runAction("mods_edit.save", { id: "armed", description: "Armed", source, enable: true }, { ...context, contributions })
  expect(result).toMatchObject({ ok: true, enabled: true, events: ["prompt.submit"] })
  expect(reads).toBe(1)
  expect(readModIndex(paths)[0]?.enabled).toBe(true)
})

test("failed live inspection refuses mod reads instead of reporting an empty live state", async () => {
  const paths = isolatedPaths(join(root, "inspection-reads"))
  saveMod(paths, { id: "stored", description: "Stored mod", source })
  const contributions = modToolContributions({
    paths,
    loadedMods: () => Effect.fail(new Error("Temporary mod inspection failure")),
    reloadMods: () => Effect.void
  })
  for (const [action, input] of [["mods.list", {}], ["mods.read", { id: "stored" }]] as const) {
    expect(await runAction(action, input, { ...context, contributions })).toMatchObject({ ok: false, error: expect.stringContaining("Temporary mod inspection failure") })
  }
  expect(readModIndex(paths)).toHaveLength(1)
})
