/**
 * Reference plugin (spec 09-plugins.md §6): registers a command, a declarative
 * panel and a G-code post-processor, and uses only the capabilities its manifest
 * asks for.
 */
import { cam } from "@cadcamfun/core"
import { requireCapability, definePlugin } from "@cadcamfun/plugin-sdk"
import { regularPolygon, baseEntity, type Entity } from "@cadcamfun/core"

/** A gear-ish placeholder: a regular polygon with a hole-free hub circle. */
const gearEntity = (id: string): Entity => ({
  ...baseEntity(id),
  _tag: "Polyline",
  points: regularPolygon({ x: 0, y: 0 }, 10, 24),
  closed: true
})

/** Wraps any program's G-code with a plugin comment banner. */
const helloPost = (program: cam.Program): string => {
  const header = `(hello-gear: ${program.name})`
  return program.toolpaths.length === 0
    ? `${header}\n`
    : `${header}\n(; replace this block with a real dialect)\nM30\n`
}

export default definePlugin({
  manifest: {
    id: "com.example.hello-gear",
    name: "Hello Gear",
    version: "1.0.0",
    apiVersion: "1",
    entry: "index.js",
    capabilities: ["drawing:write", "toolpath:read", "storage", "ui:panel"],
    contributes: {
      commands: [{ id: "hello-gear.add", title: "Add a gear" }],
      panels: [{ id: "hello-gear.panel", title: "Gear generator", entry: "panel" }],
      postProcessors: [{ id: "hello-gear.header", title: "Hello Gear header", entry: "post" }]
    },
    dev: true
  },
  activate(ctx) {
    const drawing = requireCapability(ctx, "drawing:write", "drawing")
    const storage = requireCapability(ctx, "storage", "storage")
    const ui = requireCapability(ctx, "ui:panel", "ui")

    ui.registerCommand({ id: "hello-gear.add", title: "Add a gear" })
    ui.registerPanel({ id: "hello-gear.panel", title: "Gear generator", entry: "panel" })
    // `drawing:write` implies `drawing:read`, so the read surface is there too.
    ctx.drawing?.read()
    storage.set("installedAt", "2026-01-01T00:00:00.000Z")

    return () => {
      drawing.patch({ _tag: "RemoveEntity", id: "gear-demo" })
      storage.delete("installedAt")
    }
  }
})

export { gearEntity, helloPost }
