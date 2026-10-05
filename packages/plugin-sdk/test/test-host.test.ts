/**
 * `createTestHost` tests: capability enforcement, storage namespacing and the
 * end-to-end round trip of the reference plugin (spec 09-plugins.md §5-§6).
 */
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { cam, cad } from "@cadcamfun/core"
import { createTestHost, definePlugin, parseManifest, testManifest } from "../src/index.ts"
import helloGear, { helloPost } from "../examples/hello-gear/index.ts"

const manifestJson = await Bun.file(new URL("../examples/hello-gear/plugin.json", import.meta.url)).text()

describe("createTestHost", () => {
  test("the manifest on disk and the one in the module agree", () => {
    const parsed = Effect.runSync(parseManifest(manifestJson))
    expect(parsed.id).toBe(helloGear.manifest.id)
    expect(parsed.version).toBe(helloGear.manifest.version)
    expect([...parsed.capabilities].sort()).toEqual([...helloGear.manifest.capabilities].sort())
  })

  test("only granted capabilities materialise on the context", () => {
    const host = createTestHost({ manifest: testManifest({ capabilities: ["storage"] }), granted: ["storage"] })
    expect(host.context.storage).toBeDefined()
    expect(host.context.drawing).toBeUndefined()
    expect(host.context.toolpath).toBeUndefined()
    expect(host.context.ui).toBeUndefined()
  })

  test("drawing:write grants both drawing surfaces", () => {
    const host = createTestHost({ granted: ["drawing:write"] })
    expect(host.context.drawing).toBeDefined()
    expect(host.capabilities).toEqual(["drawing:read", "drawing:write"])
  })

  test("a revoked capability is absent even when the manifest asked for it", () => {
    const host = createTestHost({
      manifest: testManifest({ capabilities: ["storage", "drawing:write"] }),
      granted: []
    })
    expect(host.context.storage).toBeUndefined()
    expect(host.context.drawing).toBeUndefined()
  })

  test("storage is scoped to the plugin namespace", () => {
    const host = createTestHost({ granted: ["storage"] })
    host.context.storage!.set("count", "3")
    expect(host.context.storage!.get("count")).toBe("3")
    expect(host.context.storage!.keys()).toEqual(["count"])
    host.context.storage!.delete("count")
    expect(host.context.storage!.get("count")).toBeUndefined()
  })

  test("commands and panels are collected declaratively", () => {
    const host = createTestHost({ granted: ["ui:panel"] })
    host.context.ui!.registerCommand({ id: "a", title: "A" })
    host.context.ui!.registerPanel({ id: "p", title: "P", entry: "panel" })
    expect(host.ui.commands).toHaveLength(1)
    expect(host.ui.panels[0]?.entry).toBe("panel")
  })

  test("invoking an unregistered command is refused", () => {
    const host = createTestHost({ granted: ["ui:panel"] })
    expect(() => host.invoke("nope")).toThrow()
  })

  test("drawing patches bump the revision and change the drawing", () => {
    const drawing = cad.emptyDrawing("d", "Part")
    const host = createTestHost({ granted: ["drawing:write"], drawing })
    const entity: cad.Entity = {
      ...cad.baseEntity("gear"),
      _tag: "Circle",
      center: { x: 0, y: 0 },
      radius: 5
    }
    const revision = host.context.drawing!.patch({ _tag: "AddEntity", entity })
    expect(revision).toBe(1)
    expect(host.drawing()!.entities).toHaveLength(1)
    host.context.drawing!.patch({ _tag: "RemoveEntity", id: "gear" })
    expect(host.drawing()!.entities).toHaveLength(0)
  })
})

describe("hello-gear end to end", () => {
  test("activate registers the command, writes storage and patches the drawing", async () => {
    const host = createTestHost({
      manifest: helloGear.manifest,
      granted: helloGear.manifest.capabilities,
      drawing: cad.emptyDrawing("d", "Part")
    })
    const teardown = await host.activate(helloGear)
    expect(host.ui.commands.map((c) => c.id)).toContain("hello-gear.add")
    expect(host.ui.panels).toHaveLength(1)
    expect(host.context.storage!.get("installedAt")).toBe("2026-01-01T00:00:00.000Z")

    host.on("hello-gear.add", () => helloGear.manifest.id)
    expect(host.invoke("hello-gear.add")).toBe("com.example.hello-gear")

    await teardown()
    expect(host.context.storage!.get("installedAt")).toBeUndefined()
  })

  test("a plugin that uses a capability it never declared cannot do anything", async () => {
    const greedy = definePlugin({
      manifest: testManifest({ capabilities: [] }),
      activate(ctx) {
        // Not granted: the surface simply does not exist.
        expect(ctx.drawing).toBeUndefined()
        ctx.drawing?.patch({ _tag: "AddEntity", entity: { ...cad.baseEntity("x"), _tag: "Circle", center: { x: 0, y: 0 }, radius: 1 } })
        expect(ctx.storage).toBeUndefined()
      }
    })
    const host = createTestHost({ manifest: greedy.manifest, granted: [] })
    const teardown = await host.activate(greedy)
    expect(host.drawing()).toBeUndefined()
    await teardown()
  })

  test("the contributed post-processor turns a Program into text", () => {
    const program = cam.makeProgram("demo", [
      {
        id: "tp",
        name: "Profile",
        toolId: "tool-1",
        spindleRpm: 12000,
        coolant: "flood",
        moves: [
          { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } },
          { _tag: "Linear", to: { x: 0, y: 0, z: -1 }, feed: 300 }
        ]
      }
    ])
    const gcode = helloPost(program)
    expect(gcode).toStartWith("(hello-gear: demo)")
    expect(gcode).toEndWith("M30\n")
    expect(helloPost(cam.makeProgram("empty", []))).toBe("(hello-gear: empty)\n")
  })
})
