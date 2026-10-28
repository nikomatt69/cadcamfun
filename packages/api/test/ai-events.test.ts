import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { AiStreamEventSchema } from "../src/ai-events.ts"
import { AiEventSchema } from "../../ai/src/events.ts"
import { SessionStateReply } from "../src/groups/ai.ts"

const events: ReadonlyArray<typeof AiStreamEventSchema.Type> = [
  { type: "turn", sessionId: "s", phase: "recovering", reason: "Provider connection dropped" },
  { type: "session_status", sessionId: "s", status: "busy" },
  { type: "permission_resolved", sessionId: "s", requestId: "p", reply: "reject" },
  { type: "permission_blocked", sessionId: "s", permission: "cad_delete_entities", patterns: ["project:p"], reason: "Denied" },
  { type: "compaction", sessionId: "s", phase: "start" },
  { type: "context_snapshot", sessionId: "s", projectId: "p", source: "workspace", chars: 100 },
  { type: "context_snapshot", sessionId: "s", projectId: "p", source: "workspace", chars: 130, observation: "sent", sections: [
    { id: "project-rules", kind: "requirement", label: "project rules", chars: 100, tokens: 25, placement: "system" },
    { id: "workspace-snapshot", kind: "ui-snapshot", label: "saved editor snapshot", chars: 30, tokens: 8, truncated: true, placement: "message" }
  ] },
  { type: "tool_diagnostic", sessionId: "s", callId: "c", tool: "cad_parametric", kind: "argument", severity: "error", message: "Invalid history", mutationApplied: false },
  { type: "tool_call", sessionId: "s", callId: "c", tool: "cad_parametric", input: {} },
  { type: "tool_result", sessionId: "s", callId: "c", tool: "cad_parametric", ok: false, output: "Invalid history" },
  { type: "done", sessionId: "s", text: "Finished", usage: { inputTokens: 10, outputTokens: 3 }, recovered: true }
]

describe("Effect AI wire contract", () => {
  test("runtime and API accept and roundtrip the same lifecycle and diagnostic events", () => {
    for (const event of events) for (const schema of [AiStreamEventSchema, AiEventSchema]) {
      expect(Schema.encodeSync(schema)(Schema.decodeUnknownSync(schema)(event))).toEqual(event)
    }
  })
  test("rejects missing correlation IDs, invalid phases and corrupt usage", () => {
    for (const value of [
      { type: "tool_diagnostic", sessionId: "s", tool: "cad_parametric", kind: "argument", severity: "error", message: "Failed" },
      { type: "turn", sessionId: "s", phase: "invented" },
      { type: "done", sessionId: "s", text: "", usage: { inputTokens: -1, outputTokens: 0 } }
    ]) expect(() => Schema.decodeUnknownSync(AiStreamEventSchema)(value)).toThrow()
  })
  test("session recovery is backward compatible and carries typed tool evidence", () => {
    expect(Schema.decodeUnknownSync(SessionStateReply)({ busy: false, text: "Old client" })).toEqual({ busy: false, text: "Old client" })
    expect(Schema.decodeUnknownSync(SessionStateReply)({ busy: false, text: "Recovered", events: events.filter((event) => event.type.startsWith("tool_")), usage: { inputTokens: 10, outputTokens: 3 } }).events).toHaveLength(3)
  })
})
