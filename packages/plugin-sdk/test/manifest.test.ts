/**
 * Manifest and capability tests (spec 09-plugins.md §5).
 */
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import {
  ALL_CAPABILITIES,
  type Capability,
  CapabilityError,
  decodeManifest,
  effectiveCapabilities,
  encodeManifest,
  hasCapability,
  isDevPlugin,
  isSigned,
  manifestKey,
  missingCapabilities,
  parseManifest,
  requireCapability,
  storageKey,
  storageNamespace,
  testManifest
} from "../src/index.ts"

const valid = {
  id: "com.example.gear-generator",
  name: "Gear Generator",
  version: "1.2.0",
  apiVersion: "1" as const,
  entry: "dist/index.js",
  capabilities: ["drawing:read", "drawing:write", "ui:panel"] as const satisfies ReadonlyArray<Capability>,
  contributes: {
    commands: [{ id: "gear.add", title: "Add gear", keybinding: "Mod+G" }],
    panels: [{ id: "gear.panel", title: "Gears", entry: "panel" }]
  }
}

describe("PluginManifest", () => {
  test("accepts a full manifest and keeps every contribution", () => {
    const manifest = Effect.runSync(decodeManifest(valid))
    expect(manifest.id).toBe("com.example.gear-generator")
    expect(manifest.apiVersion).toBe("1")
    expect(manifest.contributes?.commands?.[0]?.keybinding).toBe("Mod+G")
    expect(manifestKey(manifest)).toBe("com.example.gear-generator@1.2.0")
  })

  test("round-trips through encode/decode", () => {
    const manifest = Effect.runSync(decodeManifest(valid))
    const encoded = Effect.runSync(encodeManifest(manifest))
    expect(encoded).toEqual(valid)
    expect(Effect.runSync(decodeManifest(encoded))).toEqual(manifest)
  })

  test("rejects an id that is not reverse-DNS", () => {
    expect(Effect.runSync(Effect.exit(decodeManifest({ ...valid, id: "GearGen" })))).toMatchObject({
      _tag: "Failure"
    })
    expect(Effect.runSync(Effect.exit(decodeManifest({ ...valid, id: "com..example" })))).toMatchObject({
      _tag: "Failure"
    })
  })

  test("rejects a version that is not semver", () => {
    expect(Effect.runSync(Effect.exit(decodeManifest({ ...valid, version: "1.2" })))).toMatchObject({
      _tag: "Failure"
    })
  })

  test("rejects an unknown apiVersion", () => {
    expect(Effect.runSync(Effect.exit(decodeManifest({ ...valid, apiVersion: "2" })))).toMatchObject({
      _tag: "Failure"
    })
  })

  test("rejects a capability the host does not know", () => {
    expect(Effect.runSync(Effect.exit(decodeManifest({ ...valid, capabilities: ["fs:read"] })))).toMatchObject({
      _tag: "Failure"
    })
  })

  test("drawing:write alone is enough: it implies drawing:read", () => {
    const manifest = Effect.runSync(decodeManifest({ ...valid, capabilities: ["drawing:write"] }))
    expect(effectiveCapabilities(manifest.capabilities)).toEqual(["drawing:read", "drawing:write"])
  })

  test("parseManifest turns invalid JSON into the same error channel", () => {
    expect(Effect.runSync(Effect.exit(parseManifest("{ not json")))).toMatchObject({ _tag: "Failure" })
    expect(Effect.runSync(parseManifest(JSON.stringify(valid))).name).toBe("Gear Generator")
  })

  test("dev and signature flags drive the trust model", () => {
    expect(isDevPlugin(Effect.runSync(decodeManifest({ ...valid, dev: true })))).toBe(true)
    expect(isSigned(Effect.runSync(decodeManifest({ ...valid, signature: "abc" })))).toBe(true)
    expect(isSigned(Effect.runSync(decodeManifest(valid)))).toBe(false)
  })
})

describe("capabilities", () => {
  test("drawing:write implies drawing:read", () => {
    expect(effectiveCapabilities(["drawing:write"])).toEqual(["drawing:read", "drawing:write"])
    expect(hasCapability(["drawing:write"], "drawing:read")).toBe(true)
    expect(hasCapability(["drawing:read"], "drawing:write")).toBe(false)
  })

  test("missingCapabilities reports what the user has not granted", () => {
    expect(missingCapabilities(["storage", "ui:panel"], ["storage"])).toEqual(["ui:panel"])
    expect(missingCapabilities(["drawing:read"], ["drawing:write"])).toEqual([])
  })

  test("every capability has an implication entry", () => {
    const all = [...ALL_CAPABILITIES].sort()
    expect([...effectiveCapabilities(ALL_CAPABILITIES)].sort()).toEqual(all)
  })

  test("storage keys cannot escape the plugin namespace", () => {
    expect(storageKey("com.example.p", "settings")).toBe("plugin:com.example.p:settings")
    expect(() => storageKey("com.example.p", "/etc/passwd")).toThrow(RangeError)
    expect(() => storageKey("com.example.p", "../other")).toThrow(RangeError)
    expect(storageNamespace("com.example.p")).toBe("plugin:com.example.p:")
  })
})

describe("requireCapability", () => {
  test("returns the surface when the capability is granted", () => {
    const manifest = testManifest({ capabilities: ["storage"] })
    const ctx = { pluginId: manifest.id, capabilities: effectiveCapabilities(manifest.capabilities), log: { debug() {}, info() {}, warn() {}, error() {} }, storage: { get: () => undefined, set() {}, delete() {}, keys: () => [] } }
    expect(requireCapability(ctx, "storage", "storage")).toBeDefined()
  })

  test("throws a typed error for a missing surface", () => {
    const ctx = { pluginId: "com.example.p", capabilities: [], log: { debug() {}, info() {}, warn() {}, error() {} } }
    expect(() => requireCapability(ctx, "drawing:write", "drawing")).toThrow(CapabilityError)
    try {
      requireCapability(ctx, "drawing:write", "drawing")
    } catch (error) {
      expect((error as CapabilityError)._tag).toBe("CapabilityDenied")
      expect((error as CapabilityError).capability).toBe("drawing:write")
    }
  })
})

describe("AI tool contributions", () => {
  const tool = { id: "bolt_circle", description: "Lay out N holes on a bolt circle and return their centres.", kind: "read" as const, entry: "boltCircle", parameters: { type: "object", properties: { n: { type: "integer" } }, required: ["n"] } }
  const withTools = (aiTools: ReadonlyArray<unknown>) => ({ ...valid, capabilities: ["ai:tool"], contributes: { aiTools } })

  test("a manifest may contribute tools, and `ai:tool` is a capability of its own", () => {
    const manifest = Effect.runSync(decodeManifest(withTools([tool])))
    expect(manifest.contributes?.aiTools?.[0]).toMatchObject({ id: "bolt_circle", kind: "read", entry: "boltCircle" })
    expect(ALL_CAPABILITIES).toContain("ai:tool")
    // It implies nothing: a plugin that offers tools does not thereby read the drawing.
    expect(effectiveCapabilities(["ai:tool"])).toEqual(["ai:tool"])
    expect(hasCapability(["drawing:write"], "ai:tool")).toBe(false)
  })

  test("the id is a lower-case identifier, the kind is read or write (never destructive), and the description says something", () => {
    for (const bad of [{ ...tool, id: "Bolt-Circle" }, { ...tool, id: "" }, { ...tool, id: "a".repeat(41) }, { ...tool, kind: "destructive" }, { ...tool, description: "short" }, { ...tool, entry: "" }]) {
      expect(() => Effect.runSync(decodeManifest(withTools([bad]))), JSON.stringify(bad).slice(0, 60)).toThrow()
    }
  })
})

describe("mod contributions", () => {
  const mod = { id: "audit", title: "Audit log", description: "Notes every tool call the assistant makes.", entry: "mod.js" }
  const withMods = (mods: ReadonlyArray<unknown>) => ({ ...valid, capabilities: ["ai:mod"], contributes: { mods } })

  test("a manifest may ship mods, and `ai:mod` is a capability of its own", () => {
    const manifest = Effect.runSync(decodeManifest(withMods([mod])))
    expect(manifest.contributes?.mods?.[0]).toMatchObject({ id: "audit", entry: "mod.js" })
    expect(ALL_CAPABILITIES).toContain("ai:mod")
    expect(effectiveCapabilities(["ai:mod"])).toEqual(["ai:mod"])
    expect(hasCapability(["ai:tool"], "ai:mod")).toBe(false)
  })

  test("rejects a mod id, title, description or entry that would not be safe to load", () => {
    for (const bad of [
      { ...mod, id: "Audit" }, { ...mod, id: "" }, { ...mod, title: "" },
      { ...mod, description: "" }, { ...mod, entry: "mod.ts" }, { ...mod, entry: "../escape.js" }, { ...mod, entry: "" }
    ]) {
      expect(() => Effect.runSync(decodeManifest(withMods([bad]))), JSON.stringify(bad).slice(0, 60)).toThrow()
    }
  })
})

describe("mode contributions", () => {
  const mode = { id: "feeds", title: "Feeds and speeds", description: "Reason about cutting parameters.", instructions: "You are focused on feeds and speeds. Quote the material and tool data behind every number." }
  const withModes = (modes: ReadonlyArray<unknown>) => ({ ...valid, capabilities: ["ai:mode"], contributes: { modes } })

  test("a manifest may contribute modes, and `ai:mode` is a capability of its own", () => {
    const manifest = Effect.runSync(decodeManifest(withModes([mode])))
    expect(manifest.contributes?.modes?.[0]).toMatchObject({ id: "feeds", title: "Feeds and speeds" })
    expect(ALL_CAPABILITIES).toContain("ai:mode")
    expect(effectiveCapabilities(["ai:mode"])).toEqual(["ai:mode"])
    expect(hasCapability(["ai:mod"], "ai:mode")).toBe(false)
  })

  test("the instructions are bounded: a mode block rides on every turn", () => {
    for (const bad of [
      { ...mode, id: "Feeds" }, { ...mode, instructions: "" },
      { ...mode, instructions: "x".repeat(4_001) }, { ...mode, description: "" }
    ]) {
      expect(() => Effect.runSync(decodeManifest(withModes([bad]))), JSON.stringify(bad).slice(0, 60)).toThrow()
    }
  })
})
