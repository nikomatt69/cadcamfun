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
})
