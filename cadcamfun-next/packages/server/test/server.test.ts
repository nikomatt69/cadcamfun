import { afterAll, describe, expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { AiModel, CadAgent } from "@cadcamfun/ai"
import { TestLLM } from "@cadcamfun/llm/testing"
import type { ChatEvent, GcodeResult, Project, ProjectSummary } from "../src/api"
import { makeApp } from "../src/server"

const llm = TestLLM.make()
const app = makeApp({
  agent: CadAgent.layerNoDeps.pipe(Layer.provide(Layer.mergeAll(AiModel.layer(TestLLM.model()), llm.layer))),
  sql: SqliteClient.layer({ filename: ":memory:" }),
})
const { handler, dispose } = HttpRouter.toWebHandler(app.pipe(Layer.provide(HttpServer.layerServices)), {
  disableLogger: true,
})
afterAll(() => dispose())

const call = (method: string, path: string, body?: unknown) =>
  handler(
    new Request(`http://test${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
  )

describe("HTTP API", () => {
  test("health and OpenAPI", async () => {
    expect(await (await call("GET", "/api/health")).json()).toEqual({ status: "ok" })
    const spec = (await (await call("GET", "/api/openapi.json")).json()) as { paths: Record<string, unknown> }
    expect(Object.keys(spec.paths)).toContain("/api/projects")
  })

  test("project lifecycle", async () => {
    const created = (await (await call("POST", "/api/projects", { name: "Bracket" })).json()) as Project
    expect(created.document.elements).toEqual([])
    const rect = {
      _tag: "Rectangle",
      id: "r1",
      layerId: created.document.activeLayerId,
      origin: { x: 0, y: 0 },
      width: 50,
      height: 30,
    }
    const saved = await call("PUT", `/api/projects/${created.id}`, {
      document: { ...created.document, elements: [rect] },
      setup: created.setup,
    })
    expect(saved.status).toBe(200)
    const list = (await (await call("GET", "/api/projects")).json()) as Array<ProjectSummary>
    expect(list).toMatchObject([{ id: created.id, name: "Bracket", elements: 1 }])
    expect((await call("GET", "/api/projects/missing")).status).toBe(404)
    expect((await call("DELETE", `/api/projects/${created.id}`)).status).toBe(204)
    expect((await call("GET", `/api/projects/${created.id}`)).status).toBe(404)
  })

  test("invalid documents are rejected by the schema", async () => {
    const created = (await (await call("POST", "/api/projects", { name: "X" })).json()) as Project
    const bad = {
      ...created.document,
      elements: [{ _tag: "Circle", id: "c", layerId: "l", center: { x: 0, y: 0 }, radius: -1 }],
    }
    expect((await call("PUT", `/api/projects/${created.id}`, { document: bad, setup: created.setup })).status).toBe(400)
  })

  test("G-code endpoint", async () => {
    const created = (await (await call("POST", "/api/projects", { name: "Plate" })).json()) as Project
    const document = {
      ...created.document,
      elements: [{ _tag: "Point", id: "p1", layerId: created.document.activeLayerId, position: { x: 10, y: 10 } }],
    }
    const setup = {
      ...created.setup,
      operations: [{ _tag: "Drill", id: "d", toolId: "dr-5", elementIds: ["p1"], depth: 5, peck: 0 }],
    }
    const res = (await (
      await call("POST", "/api/cam/gcode", { document, setup, controller: "fanuc" })
    ).json()) as GcodeResult
    expect(res.gcode).toContain("O1000")
    expect(res.stats.moves).toBeGreaterThan(0)
    const failed = await call("POST", "/api/cam/gcode", { document, setup: { ...setup, machineId: "nope" } })
    expect(failed.status).toBe(422)
  })

  test("AI chat streams events and returns the edited document", async () => {
    const created = (await (await call("POST", "/api/projects", { name: "AI" })).json()) as Project
    llm.push(TestLLM.toolCall("add_shapes", { shapes: [{ _tag: "Circle", center: { x: 0, y: 0 }, radius: 10 }] }))
    llm.push(TestLLM.text("Added a Ø20 circle."))
    const res = await call("POST", "/api/ai/chat", {
      document: created.document,
      setup: created.setup,
      messages: [{ role: "user", content: "draw a circle" }],
    })
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    const events = (await res.text())
      .split("\n\n")
      .filter((chunk) => chunk.startsWith("data: "))
      .map((chunk) => JSON.parse(chunk.slice(6)) as ChatEvent)
    expect(events.map((e) => e.type)).toEqual(["tool-call", "tool-result", "text", "state", "done"])
    const state = events.find((e) => e.type === "state")
    expect(state?.type === "state" && state.document.elements).toHaveLength(1)
  })

  test("library CRUD, read-only presets, clone, import/export", async () => {
    type Entry = { item: { id: string; name: string }; builtin: boolean }
    const list = (await (await call("GET", "/api/library/tools")).json()) as Array<Entry>
    expect(list.length).toBeGreaterThan(0)
    const preset = list[0]!
    expect(preset.builtin).toBe(true)
    expect((await call("PUT", `/api/library/tools/${preset.item.id}`, preset.item)).status).toBe(403)
    expect((await call("DELETE", `/api/library/tools/${preset.item.id}`)).status).toBe(403)

    const clone = (await (await call("POST", `/api/library/tools/${preset.item.id}/clone`)).json()) as Entry
    expect(clone.builtin).toBe(false)
    expect(clone.item.id).not.toBe(preset.item.id)
    expect(clone.item.name).toBe(`${preset.item.name} (copy)`)
    const renamed = await call("PUT", `/api/library/tools/${clone.item.id}`, { ...clone.item, name: "Mine" })
    expect(((await renamed.json()) as Entry).item.name).toBe("Mine")

    const exported = (await (await call("GET", "/api/library/tools/export")).json()) as {
      kind: string
      items: Array<Entry["item"]>
    }
    expect(exported.kind).toBe("tools")
    expect(exported.items).toHaveLength(list.length + 1)
    const imported = await call("POST", "/api/library/tools/import", { items: [clone.item] })
    expect(await imported.json()).toEqual({ imported: 1 })
    expect((await (await call("GET", "/api/library/tools")).json()) as Array<Entry>).toHaveLength(list.length + 2)

    expect((await call("DELETE", `/api/library/tools/${clone.item.id}`)).status).toBe(204)
    expect((await call("GET", `/api/library/tools/${clone.item.id}`)).status).toBe(404)
    expect((await call("POST", "/api/library/materials", { id: "x", name: "bad" })).status).toBe(400)
  })

  test("custom machine is used by CAM", async () => {
    type Entry = { item: { id: string } }
    const machines = (await (await call("GET", "/api/library/machines")).json()) as Array<Entry>
    const custom = (await (await call("POST", `/api/library/machines/${machines[0]!.item.id}/clone`)).json()) as Entry
    const created = (await (await call("POST", "/api/projects", { name: "M" })).json()) as Project
    const document = {
      ...created.document,
      elements: [{ _tag: "Point", id: "p1", layerId: created.document.activeLayerId, position: { x: 10, y: 10 } }],
    }
    const setup = {
      ...created.setup,
      machineId: custom.item.id,
      operations: [{ _tag: "Drill", id: "d", toolId: "dr-5", elementIds: ["p1"], depth: 5, peck: 0 }],
    }
    expect((await call("POST", "/api/cam/gcode", { document, setup })).status).toBe(200)
  })

  test("saved toolpaths: versions, restore, comments", async () => {
    type Saved = { id: string; gcode: string; versions: number; name: string }
    const project = (await (await call("POST", "/api/projects", { name: "TP" })).json()) as Project
    const stats = { moves: 2, cutDistance: 10, rapidDistance: 5, estimatedSeconds: 3 }
    const input = { name: "Contour", controller: "grbl", gcode: "G0 X0 Y0\nG1 X10 F500", stats }
    expect((await call("POST", "/api/projects/missing/toolpaths", input)).status).toBe(404)
    const saved = (await (await call("POST", `/api/projects/${project.id}/toolpaths`, input)).json()) as Saved
    expect(saved.versions).toBe(0)

    const edited = (await (
      await call("PUT", `/api/toolpaths/${saved.id}`, { gcode: "G0 X0 Y0\nG1 X20 F500", message: "longer" })
    ).json()) as Saved
    expect(edited.versions).toBe(1)
    expect(edited.gcode).toContain("X20")

    const versions = (await (await call("GET", `/api/toolpaths/${saved.id}/versions`)).json()) as Array<{
      id: string
      gcode: string
      message?: string
    }>
    expect(versions).toMatchObject([{ gcode: input.gcode, message: "longer" }])
    const restored = (await (
      await call("POST", `/api/toolpaths/${saved.id}/versions/${versions[0]!.id}/restore`)
    ).json()) as Saved
    expect(restored.gcode).toBe(input.gcode)
    expect(restored.versions).toBe(2)

    const list = (await (await call("GET", `/api/projects/${project.id}/toolpaths`)).json()) as Array<Saved>
    expect(list).toMatchObject([{ id: saved.id, name: "Contour", versions: 2 }])
    expect(list[0]).not.toHaveProperty("gcode")

    const comment = (await (
      await call("POST", `/api/toolpaths/${saved.id}/comments`, { content: "Check the feed" })
    ).json()) as { id: string; author: string }
    expect(comment.author).toBe("me")
    expect(await (await call("GET", `/api/toolpaths/${saved.id}/comments`)).json()).toHaveLength(1)
    expect((await call("DELETE", `/api/toolpaths/${saved.id}/comments/${comment.id}`)).status).toBe(204)
    expect((await call("DELETE", `/api/toolpaths/${saved.id}`)).status).toBe(204)
    expect((await call("GET", `/api/toolpaths/${saved.id}`)).status).toBe(404)
  })
})
