import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { cam, emptyDrawing } from "@cadcamfun/core"
import { createFakeApi } from "./fake-api.ts"
import { runtimeForClient, readClient } from "../app/client.ts"
import { decodeForm } from "../components/schema-form.ts"

describe("core desktop flows", () => {
  test("managed runtime uses the typed fake API for project lifecycle", async () => {
    const api = createFakeApi()
    const runtime = runtimeForClient(api)
    try {
      expect(await readClient(runtime)).toBe(api)
      const created = await runtime.run(api.projects.create({ payload: { name: "Bracket" } }))
      expect((await runtime.run(api.projects.list()))[0]?.name).toBe("Bracket")
      const drawing = emptyDrawing("test-drawing", "Outline")
      const saved = await runtime.run(api.drawings.createForProject({ params: { id: created.id }, payload: { name: drawing.name, data: drawing } }))
      expect((await runtime.run(api.drawings.listForProject({ params: { id: created.id } })))[0]?.data).toEqual(drawing)
      await runtime.run(api.drawings.update({ params: { id: saved.id }, payload: { name: "New outline" } }))
      expect((await runtime.run(api.drawings.get({ params: { id: saved.id } }))).name).toBe("New outline")
      await runtime.run(api.projects.update({ params: { id: created.id }, payload: { name: "Renamed" } }))
      expect((await runtime.run(api.projects.get({ params: { id: created.id } }))).name).toBe("Renamed")
      await runtime.run(api.projects.remove({ params: { id: created.id } }))
      expect(await runtime.run(api.projects.list())).toEqual([])
      expect(api.store.drawings).toEqual([])
    } finally { runtime.dispose() }
  })

  test("failed mutations do not modify the store and can be retried", async () => {
    const api = createFakeApi()
    api.failNext("projects")
    await expect(Effect.runPromise(api.projects.create({ payload: { name: "Part" } }))).rejects.toBeDefined()
    expect(api.store.projects).toEqual([])
    const created = await Effect.runPromise(api.projects.create({ payload: { name: "Part" } }))
    expect(created.name).toBe("Part")
  })

  test("library creates and lists schema-decoded catalogue records", async () => {
    const api = createFakeApi()
    const material = await Effect.runPromise(api.materials.create({ payload: { name: "Birch", properties: { density: 680 } } }))
    expect(material.properties).toEqual({ density: 680 })
    const tool = await Effect.runPromise(api.tools.create({ payload: { name: "Drill", type: "drill", diameter: 3, material: "HSS" } }))
    expect((await Effect.runPromise(api.tools.list({ query: {} }))).find((row) => row.id === tool.id)?.diameter).toBe(3)
    const machine = await Effect.runPromise(api.machineConfigs.create({ payload: { name: "Mill", type: "mill", config: { workVolume: { x: 100, y: 100, z: 50 }, maxSpindleSpeed: 12000, maxFeedRate: 1000 } } }))
    expect(machine.success).toBe(true)
    expect((await Effect.runPromise(api.machineConfigs.list({ query: {} }))).success).toBe(true)
  })

  test("schema form converts numeric inputs and rejects zero cut depth", () => {
    const decoded = decodeForm(cam.ProfileParams, { totalDepth: "3", stepdown: "1", feed: "800" })
    expect(decoded._tag).toBe("Valid")
    if (decoded._tag === "Valid") expect(decoded.value.totalDepth).toBe(3)
    expect(decodeForm(cam.ProfileParams, { totalDepth: "0", stepdown: "1" })._tag).toBe("Invalid")
  })

  test("profile generation emits and persists real G-code", async () => {
    const api = createFakeApi()
    const project = await Effect.runPromise(api.projects.create({ payload: { name: "Rectangle" } }))
    const params = new cam.ProfileParams({ totalDepth: 3, stepdown: 1 })
    const tool = Schema.decodeUnknownSync(cam.ToolSchema)({ id: "endmill", name: "6 mm", kind: "endmill", diameter: 6, flutes: 3, maxRpm: 18000 })
    const path = cam.generateProfile(params, [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 40 }, { x: 10, y: 40 }, { x: 10, y: 10 }], tool, { x: 100, y: 80, z: 10, origin: { x: 0, y: 0, z: 0 }, material: "Aluminium" })
    const program = cam.makeProgram("Rectangle", [path])
    const gcode = cam.grblPost.emit(program)
    expect(gcode).toContain("G21")
    expect(gcode).toContain("Z-3.000")
    const row = await Effect.runPromise(api.toolpaths.create({ payload: { projectId: project.id, name: "Profile", gcode, data: program, operationType: "profile" } }))
    const rows = await Effect.runPromise(api.toolpaths.list({ query: { projectId: project.id } }))
    expect(rows[0]?.id).toBe(row.id)
    expect(rows[0]?.gcode).toBe(gcode)
    expect(Schema.decodeUnknownSync(cam.ProgramSchema)(rows[0]?.data)).toEqual(program)
  })
})
