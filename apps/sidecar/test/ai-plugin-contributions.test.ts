/**
 * What enabled plugins contribute beyond tools (spec 09-plugins.md assistant extensions): the mods they ship — declared to
 * the embedded host next to the app-owned store's — and the assistant modes they offer to the picker. Pure readers over
 * `<data dir>/plugins`, so the tests build the folder on disk and read it back.
 */
import { afterAll, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { parseManifest } from "@cadcamfun/plugin-sdk"
import { contributionProblems, pluginModList, pluginModSpecs, pluginModes } from "../src/services/ai-plugins.ts"

const root = mkdtempSync(join(tmpdir(), "cadcamfun-plugin-contrib-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const writePlugin = (id: string, manifest: Record<string, unknown>, files: Record<string, string> = {}): void => {
  mkdirSync(join(root, id), { recursive: true })
  writeFileSync(join(root, id, "plugin.json"), JSON.stringify({ id, name: `Plugin ${id}`, version: "1.0.0", apiVersion: "1", entry: "index.js", ...manifest }))
  writeFileSync(join(root, id, "index.js"), "export const aiTools = {}")
  for (const [name, source] of Object.entries(files)) writeFileSync(join(root, id, name), source)
}

const setEnabled = (ids: ReadonlyArray<string>): void => writeFileSync(join(root, "enabled.json"), JSON.stringify(ids))

const MOD = { id: "audit", title: "Audit log", description: "Notes every tool call the assistant makes.", entry: "mod.js" }
const MODE = { id: "feeds", title: "Feeds and speeds", description: "Reason about cutting parameters.", instructions: "You are focused on feeds and speeds. Quote the material and tool data behind every number, in metric." }

writePlugin("com.example.shipping", { capabilities: ["ai:mod", "ai:mode"], contributes: { mods: [MOD], modes: [MODE] } }, { "mod.js": "export const register = () => {}" })
writePlugin("com.example.missing", { capabilities: ["ai:mod"], contributes: { mods: [{ ...MOD, id: "gone", entry: "gone.js" }] } })

test("the specs are the mod files enabled plugins ship — and only those", () => {
  setEnabled([])
  expect(pluginModSpecs(root)).toEqual([])
  setEnabled(["com.example.shipping"])
  const expected = pathToFileURL(realpathSync(join(root, "com.example.shipping", "mod.js"))).href
  expect(pluginModSpecs(root)).toEqual([expected])
  // An enabled plugin whose manifest declares a mod file that is not on disk contributes nothing for it.
  setEnabled(["com.example.shipping", "com.example.missing"])
  expect(pluginModSpecs(root)).toEqual([expected])
})

test("the panel's list carries what people need to read before enabling anything", () => {
  setEnabled(["com.example.shipping", "com.example.missing"])
  // The missing plugin also declares a mod, but its module is not on disk: it is neither listed nor loaded.
  expect(pluginModList(root)).toEqual([
    { id: "com.example.shipping.audit", title: "Audit log", description: MOD.description, pluginId: "com.example.shipping", pluginName: "Plugin com.example.shipping", entry: "mod.js" }
  ])
  setEnabled([])
  expect(pluginModList(root)).toEqual([])
})

test("contributed modes are namespaced, carry their block, and follow `enabled.json`", () => {
  setEnabled(["com.example.shipping"])
  expect(pluginModes(root)).toEqual([
    { id: "com.example.shipping:feeds", title: "Feeds and speeds", description: MODE.description, instructions: MODE.instructions, pluginId: "com.example.shipping", pluginName: "Plugin com.example.shipping" }
  ])
  setEnabled(["com.example.missing"])
  expect(pluginModes(root)).toEqual([])
})

test("a manifest the loader refuses cannot contribute mods or modes", () => {
  writePlugin("com.example.unsupported", {
    capabilities: ["ai:mod", "ai:mode", "drawing:write"], contributes: { mods: [MOD], modes: [MODE] }
  }, { "mod.js": "export const register = () => {}" })
  setEnabled(["com.example.unsupported"])
  expect(pluginModList(root)).toEqual([])
  expect(pluginModSpecs(root)).toEqual([])
  expect(pluginModes(root)).toEqual([])
})

describe("contribution coherence (the capability is the grant)", () => {
  const of = (over: Record<string, unknown>) => Effect.runPromise(parseManifest(JSON.stringify({
    id: "com.example.coherence", name: "Coherence", version: "1.0.0", apiVersion: "1", entry: "index.js", capabilities: ["ai:tool"], ...over
  })))

  test("each contribution demands its own capability", async () => {
    expect(contributionProblems(await of({ capabilities: ["ai:tool"], contributes: { mods: [MOD] } }))).toEqual(["contributes.mods requires the ai:mod capability"])
    expect(contributionProblems(await of({ capabilities: ["ai:mod"], contributes: { modes: [MODE] } }))).toEqual(["contributes.modes requires the ai:mode capability"])
    expect(contributionProblems(await of({ capabilities: ["ai:mod"], contributes: { aiTools: [{ id: "area", description: "Compute circle area.", kind: "read", entry: "area", parameters: { type: "object", properties: {} } }] } }))).toEqual(["contributes.aiTools requires the ai:tool capability"])
  })

  test("a mod cannot be the plugin's own module, and matching grants are clean", async () => {
    expect(contributionProblems(await of({ capabilities: ["ai:mod"], contributes: { mods: [{ ...MOD, entry: "index.js" }] } }))).toEqual(["a mod entry cannot be the plugin module itself"])
    expect(contributionProblems(await of({ capabilities: ["ai:tool", "ai:mod", "ai:mode"], contributes: { aiTools: [{ id: "area", description: "Compute circle area.", kind: "read", entry: "area", parameters: { type: "object", properties: {} } }], mods: [MOD], modes: [MODE] } }))).toEqual([])
  })
})
