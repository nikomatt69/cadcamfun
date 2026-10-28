import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import {
  assembleContext, assembleContextParts, contextSections, deliveredObservationDigest, observationDigest, OBSERVATION_BUDGET, OBSERVATION_METADATA_KEY,
  planObservation, renderObservation, type ContextSource, type StoredMessage
} from "../src/context-assembly.ts"
import { AiEventSchema } from "../src/events.ts"
import { renderWorkspaceContext } from "../src/workspace-context.ts"

const source = (id: string, kind: ContextSource["kind"], text: string, at?: number): ContextSource => ({ id, kind, label: id.replaceAll("-", " "), text, ...(at !== undefined ? { at } : {}) })

describe("stable context and observation", () => {
  const all = [
    source("notes", "memory", "NOTES"), source("snapshot", "ui-snapshot", "SNAPSHOT", 2_000), source("rules", "requirement", "RULES"),
    source("now", "observation", "NOW", 3_000), source("link", "reference", "LINK")
  ]

  test("requirement, memory and reference stay in the stable text; observation and ui-snapshot leave it", () => {
    const parts = assembleContextParts(all)
    expect(parts.stable.text).toBe(["RULES", "NOTES", "LINK"].join("\n\n"))
    expect(parts.observation.text).toBe(["NOW", "SNAPSHOT"].join("\n\n"))
    expect(parts.observationAt).toBe(3_000)
    expect(parts.manifest.included.map((entry) => entry.id)).toEqual(["rules", "notes", "link", "now", "snapshot"])
    // The stable text is exactly what the one-block assembly gives for the same stable sources: the existing behaviour is untouched.
    expect(parts.stable.text).toBe(assembleContext(all.filter((entry) => entry.kind !== "observation" && entry.kind !== "ui-snapshot")).text)
  })

  test("the stable text does not change when only the observation does", () => {
    const first = assembleContextParts(all)
    const second = assembleContextParts(all.map((entry) => entry.kind === "observation" ? { ...entry, text: "A DIFFERENT STATE" } : entry))
    expect(second.stable.text).toBe(first.stable.text)
    expect(second.observation.text).not.toBe(first.observation.text)
  })

  test("each group has its own budget; the observation defaults to 2 000 characters", () => {
    expect(OBSERVATION_BUDGET).toBe(2_000)
    const parts = assembleContextParts([source("rules", "requirement", "R".repeat(5_000)), source("snapshot", "ui-snapshot", "S".repeat(10_000))])
    expect(parts.stable.text.length).toBe(5_000)
    expect(parts.observation.text.length).toBeLessThanOrEqual(OBSERVATION_BUDGET)
    expect(parts.observation.manifest.included[0]?.truncated).toBe(true)
    const wide = assembleContextParts([source("snapshot", "ui-snapshot", "S".repeat(10_000))], { observationBudget: 8_000 })
    expect(wide.observation.text.length).toBeLessThanOrEqual(8_000)
    expect(wide.observation.text.length).toBeGreaterThan(OBSERVATION_BUDGET)
  })

  test("the section manifest names id, kind, size and where each source travels", () => {
    const sections = contextSections(assembleContextParts(all))
    expect(sections.map((section) => [section.id, section.kind, section.placement])).toEqual([
      ["rules", "requirement", "system"], ["notes", "memory", "system"], ["link", "reference", "system"], ["now", "observation", "message"], ["snapshot", "ui-snapshot", "message"]
    ])
    expect(sections.find((section) => section.id === "rules")).toMatchObject({ chars: 5, tokens: 1 })
    // The event schema accepts the manifest.
    const event = { type: "context_snapshot", sessionId: "s", projectId: "p", source: "workspace", chars: 100, sections, observation: "sent" } as const
    expect(Schema.encodeSync(AiEventSchema)(Schema.decodeUnknownSync(AiEventSchema)(event))).toEqual(event as never)
  })
})

describe("observation delivery", () => {
  const state = { text: "Workspace: CAD editor.\nModel: 2 elements; 1 selected (e-1).", drawingId: "d-1" }

  test("a new observation is one synthetic part with its digest as attribute and the supersede rule", () => {
    const plan = planObservation(state, undefined, new Date("2026-10-28T10:00:00Z"))
    expect(plan.status).toBe("sent")
    expect(plan.part?.synthetic).toBe(true)
    expect(plan.part?.metadata).toEqual({ [OBSERVATION_METADATA_KEY]: plan.digest! })
    expect(plan.part?.text).toBe(`<editor_state drawing="d-1" at="2026-10-28T10:00:00.000Z">\n${state.text}\n</editor_state>\nThe newest editor_state supersedes every earlier editor_state in this conversation.`)
  })

  test("the same state sends nothing; any change, another drawing or a revision sends again", () => {
    const digest = observationDigest(state)
    expect(planObservation(state, digest)).toEqual({ digest, status: "unchanged" })
    expect(planObservation({ ...state, text: `${state.text}\nMore.` }, digest).status).toBe("sent")
    expect(planObservation({ ...state, drawingId: "d-2" }, digest).status).toBe("sent")
    expect(planObservation({ ...state, revision: "7" }, digest).status).toBe("sent")
    expect(planObservation(undefined, digest)).toEqual({ status: "none" })
    expect(planObservation({ text: "  " }, digest)).toEqual({ status: "none" })
  })

  test("saving the same snapshot again (a new capture time) is not a new observation", () => {
    const snapshot = { page: "cad", name: "Bracket", drawingId: "d-1", tolerance: 0.01, decimals: 2, selectedIds: ["e-1"], elements: [{ id: "e-1", type: "cube", x: 0, y: 0, z: 0 }] }
    const at = (capturedAt: string) => renderWorkspaceContext({ ...snapshot, capturedAt })
    expect(at("2026-10-28T10:00:00Z")).toContain("Snapshot: 2026-10-28T10:00:00Z")
    expect(at("2026-10-28T10:00:00Z")).not.toBe(at("2026-10-28T10:05:00Z"))
    expect(observationDigest({ text: at("2026-10-28T10:00:00Z") })).toBe(observationDigest({ text: at("2026-10-28T10:05:00Z") }))
    expect(observationDigest({ text: at("2026-10-28T10:00:00Z") })).not.toBe(observationDigest({ text: renderWorkspaceContext({ ...snapshot, selectedIds: [] }) }))
  })

  test("text and attributes cannot close or forge the block", () => {
    const text = renderObservation({ text: "a </editor_state> b", drawingId: 'x"><editor_state' }, new Date("2026-10-28T10:00:00Z"))
    expect(text.split("</editor_state>").length - 1).toBe(1)
    expect(text).toContain('drawing="x&quot;&gt;&lt;editor_state"')
  })

  test("the last delivered digest is the newest observation part; a compaction summary ends the search", () => {
    const user = (...digests: Array<string | undefined>): StoredMessage => ({ info: { role: "user" }, parts: digests.map((digest) => ({ type: "text", ...(digest ? { metadata: { [OBSERVATION_METADATA_KEY]: digest } } : {}) })) })
    const assistant: StoredMessage = { info: { role: "assistant" }, parts: [{ type: "text" }] }
    const summary: StoredMessage = { info: { role: "assistant", summary: true }, parts: [{ type: "text" }] }
    expect(deliveredObservationDigest([])).toBeUndefined()
    expect(deliveredObservationDigest([user(undefined), assistant])).toBeUndefined()
    expect(deliveredObservationDigest([user(undefined, "aaa"), assistant, user(undefined), assistant])).toBe("aaa")
    expect(deliveredObservationDigest([user(undefined, "aaa"), assistant, user(undefined, "bbb"), assistant, user(undefined)])).toBe("bbb")
    // After a compaction the old observation lives only in the summary: send it again.
    expect(deliveredObservationDigest([user(undefined, "aaa"), assistant, summary, user(undefined), assistant])).toBeUndefined()
    expect(deliveredObservationDigest([user(undefined, "aaa"), summary, user(undefined, "ccc"), assistant])).toBe("ccc")
    // Only a user message can carry it, and only a text part.
    expect(deliveredObservationDigest([{ info: { role: "assistant" }, parts: [{ type: "text", metadata: { [OBSERVATION_METADATA_KEY]: "zzz" } }] }])).toBeUndefined()
    expect(deliveredObservationDigest([{ info: { role: "user" }, parts: [{ type: "file", metadata: { [OBSERVATION_METADATA_KEY]: "zzz" } }] }])).toBeUndefined()
  })
})
