import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"
import { OBSERVATION_BUDGET } from "@cadcamfun/ai"
import { makeAiContext } from "../src/services/ai-context.ts"

/** Spec 64 Phase 1: the sidecar splits stable context from the observation and renders the stored snapshot inside the observation budget. */
const snapshot = {
  page: "cad", name: "Bracket", drawingId: "d-1", tolerance: 0.01, decimals: 2, capturedAt: "2026-10-28T10:00:00Z", selectedIds: ["e-1"],
  elements: Array.from({ length: 200 }, (_, index) => ({ id: `element-${index}`, type: "cube", name: `Block number ${index}`, x: index, y: 0, z: 0, width: 10, height: 10, depth: 10 }))
}
const kv = {
  get: (key: string) => Effect.succeed(key === "ai.context.p1" ? { value: snapshot, updatedAt: "2026-10-28T10:00:00Z" } : undefined),
  list: () => Effect.succeed([])
}
const projects = { find: () => Effect.succeed({ id: "p1" }) }
const context = makeAiContext({ kv: kv as never, projects: projects as never, host: Option.none() })
const request = { actorId: "u", projectId: "p1", includeContext: true } as const

describe("assembleParts", () => {
  test("the saved snapshot is an observation inside 2 000 characters; the project rules stay stable", async () => {
    const parts = await Effect.runPromise(context.assembleParts({ ...request, explicit: "Selected: 2 holes" }))
    expect(parts.observation.text).toContain("Selected: 2 holes")
    expect(parts.observation.text).toContain("drawing \"Bracket\"")
    expect(parts.observation.text.length).toBeLessThanOrEqual(OBSERVATION_BUDGET)
    expect(parts.stable.text).not.toContain("Bracket")
    expect(parts.stable.text).not.toContain("Selected: 2 holes")
    expect(parts.observationAt).toBe(Date.parse("2026-10-28T10:00:00Z"))
  })

  test("the one-block assembly keeps its old behaviour: the whole snapshot at its own render budget", async () => {
    const whole = await Effect.runPromise(context.assemble({ ...request }))
    expect(whole.text.length).toBeGreaterThan(OBSERVATION_BUDGET)
  })

  test("context off: only what the client sent this turn, as an observation", async () => {
    const parts = await Effect.runPromise(context.assembleParts({ actorId: "u", includeContext: false, explicit: "EXPLICIT" }))
    expect(parts.stable.text).toBe("")
    expect(parts.observation.text).toBe("EXPLICIT")
  })

  test("sessions sharing a project receive only their bound drawing's observation", async () => {
    const reads: string[] = []
    const scoped = makeAiContext({ kv: kv as never, projects: projects as never, host: Option.none(), drawings: {
      find: (actorId: string, id: string) => {
        reads.push(`${actorId}:${id}`)
        return Effect.succeed({ project: { id: "p1" }, id, name: "Other drawing", updatedAt: "2026-11-02T10:00:00Z", data: { elements: [{ id: "other-body", type: "cube", name: "Other body", width: 20, height: 30, depth: 40 }] } })
      }
    } as never })
    const first = await Effect.runPromise(scoped.assembleParts({ ...request, sessionId: "session-1", drawingId: "d-1" }))
    const second = await Effect.runPromise(scoped.assembleParts({ ...request, sessionId: "session-2", drawingId: "d-2" }))
    expect(first.observation.text).toContain('drawing "Bracket"')
    expect(second.observation.text).toContain('drawing "Other drawing"')
    expect(second.observation.text).not.toContain("Bracket")
    expect(second.observation.text).not.toContain("element-0")
    expect(second.manifest.included.some((source) => source.id === "stored-drawing")).toBe(true)
    expect(second.observation.text).toContain("live selection unavailable")
    expect(reads).toEqual(["u:d-2"])
    expect(first.stable.text).toBe(second.stable.text)
  })

  test("a mismatched project snapshot and a foreign saved drawing are never injected", async () => {
    const scoped = makeAiContext({
      kv: { ...kv, get: (key: string) => Effect.succeed(key === "ai.context.p1" ? { value: { ...snapshot, projectId: "foreign" }, updatedAt: "2026-10-28T10:00:00Z" } : undefined) } as never,
      projects: projects as never, host: Option.none(), drawings: {
        find: () => Effect.succeed({ project: { id: "foreign" }, id: "d-1", name: "Private drawing", data: snapshot })
      } as never
    })
    const parts = await Effect.runPromise(scoped.assembleParts({ ...request, drawingId: "d-1" }))
    expect(parts.observation.text).not.toContain("Bracket")
    expect(parts.observation.text).not.toContain("Private drawing")
    expect(parts.observation.text).toBe("")
  })

  test("context off performs no project, snapshot, memory or drawing reads", async () => {
    const calls: string[] = []
    const read = () => { calls.push("unexpected read"); return Effect.succeed(undefined) }
    const scoped = makeAiContext({ kv: { get: read, list: read } as never, projects: { find: read } as never, drawings: { find: read } as never, host: Option.none() })
    const parts = await Effect.runPromise(scoped.assembleParts({ ...request, sessionId: "s", drawingId: "d-2", includeContext: false, explicit: "Only this turn" }))
    expect(parts.observation.text).toBe("Only this turn")
    expect(calls).toEqual([])
  })
})
