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
})
