/**
 * Tests for the nikcli-powered AI integration (spec 06-desktop-ui.md §1,
 * spec 08-ai.md §3). Unit tests for the typed-client surface, the SSE stream
 * decoder, the persisted-store helpers, and the proactive-suggestion builder.
 */
import { describe, expect, test } from "bun:test"
import { decodeEvent, dispatch } from "../src/features/ai/lib/stream.ts"
import { buildSuggestions } from "../src/features/ai/lib/suggestions.ts"
import { loadPersisted, savePersisted } from "../src/features/ai/store/persisted.ts"
import { EXTRA_TOOL_SUMMARIES, TOOL_IDS, TOOL_SUMMARIES, VCS_TOOL_IDS } from "../src/features/ai/lib/tools.ts"

describe("AI SSE event decoder", () => {
  test("decodes a delta event", () => {
    const event = decodeEvent(JSON.stringify({ type: "delta", sessionId: "s1", text: "hello" }))
    expect(event).toEqual({ type: "delta", sessionId: "s1", text: "hello" })
  })
  test("decodes a tool_call with input", () => {
    const event = decodeEvent(JSON.stringify({ type: "tool_call", sessionId: "s1", callId: "c1", tool: "cad_edit", input: { action: "add_entities", entities: [] } }))
    expect(event.type).toBe("tool_call")
    if (event.type === "tool_call") expect(event.tool).toBe("cad_edit")
  })
  test("decodes a tool_result with ok=false", () => {
    const event = decodeEvent(JSON.stringify({ type: "tool_result", sessionId: "s1", callId: "c1", tool: "cam_create_operation", ok: false, output: "error" }))
    expect(event.type).toBe("tool_result")
    if (event.type === "tool_result") expect(event.ok).toBe(false)
  })
  test("decodes a permission_request", () => {
    const event = decodeEvent(JSON.stringify({ type: "permission_request", sessionId: "s1", requestId: "p1", permission: "write_file", patterns: ["*.ts"] }))
    expect(event.type).toBe("permission_request")
  })
  test("decodes a done event with usage", () => {
    const event = decodeEvent(JSON.stringify({ type: "done", sessionId: "s1", text: "ok", usage: { inputTokens: 5, outputTokens: 7 } }))
    expect(event.type).toBe("done")
    if (event.type === "done") {
      expect(event.text).toBe("ok")
      expect(event.usage?.inputTokens).toBe(5)
    }
  })
  test("decodes an error event with code=aborted", () => {
    const event = decodeEvent(JSON.stringify({ type: "error", sessionId: "s1", code: "aborted", message: "stopped" }))
    expect(event.type).toBe("error")
    if (event.type === "error") {
      expect(event.code).toBe("aborted")
      expect(event.message).toBe("stopped")
    }
  })
})

describe("AI tool catalogue (spec 08-ai.md §3)", () => {
  test("contains every locked-down tool id", () => {
    // The host registers one tool per capability group (`packages/ai/src/actions/catalogue.ts`), each carrying its
    // actions behind an `action` discriminator. The list below is the desktop's half of that contract: a catalogue
    // tool this list does not name would be rejected by `validateToolCall` as "not allowed", so a tool added
    // without being listed here fails — which is the point.
    expect(new Set(TOOL_IDS)).toEqual(new Set([
      "cad", "cad_edit", "cam", "cam_edit", "library", "parts", "library_edit",
      "memory", "memory_edit", "research", "vcs", "vcs_edit", "agent"
    ]))
    // No tool is registered twice under the same id. (Spread first: the source list is a literal
    // tuple, and comparing its literal length against `Set.size` would only restate the type.)
    const ids = [...TOOL_IDS]
    expect(ids.length).toBe(new Set(ids).size)
  })
  test("contains no nikcli shell/file/web tools (locked-down agent rule)", () => {
    expect(TOOL_IDS).not.toContain("bash")
    expect(TOOL_IDS).not.toContain("edit")
    expect(TOOL_IDS).not.toContain("write")
    expect(TOOL_IDS).not.toContain("webfetch")
    expect(TOOL_IDS).not.toContain("apply_patch")
  })
  test("every tool has a human-readable summary", () => {
    // Version control is described apart (`EXTRA_TOOL_SUMMARIES`), with the host's program runner; the rest is here.
    const vcs: ReadonlyArray<string> = VCS_TOOL_IDS
    const described = TOOL_IDS.filter((id) => !vcs.includes(id))
    expect(TOOL_SUMMARIES.map((summary) => summary.id).sort()).toEqual([...described].sort())
    expect(TOOL_SUMMARIES).toHaveLength(described.length)
    expect(EXTRA_TOOL_SUMMARIES.map((summary) => summary.id).sort()).toEqual(["code_mode", "vcs", "vcs_edit"])
    for (const summary of TOOL_SUMMARIES) {
      expect(summary.title.length).toBeGreaterThan(0)
      expect(summary.description.length).toBeGreaterThan(0)
      expect(["cad", "cam", "library", "memory", "research", "agents"]).toContain(summary.category)
    }
  })
})

describe("AI persisted-store helper", () => {
  test("returns fallback when storage is empty", () => {
    if (typeof localStorage !== "undefined") localStorage.removeItem("cadcamfun/ai/store-v1")
    const value = loadPersisted({ hello: "world" })
    expect(value).toEqual({ hello: "world" })
  })
  test("returns fallback when storage holds invalid JSON", () => {
    if (typeof localStorage === "undefined") return
    localStorage.setItem("cadcamfun/ai/store-v1", "{not-json")
    const value = loadPersisted<{ ok: boolean }>({ ok: false })
    expect(value).toEqual({ ok: false })
  })
  test("persists and reloads structured payloads", () => {
    if (typeof localStorage === "undefined") return
    localStorage.removeItem("cadcamfun/ai/store-v1")
    savePersisted({ model: { provider: "anthropic", model: "claude-sonnet-5-5" }, includeContext: true, sessions: [] })
    const loaded = loadPersisted<{ model: { provider: string } }>({ model: { provider: "openai" } })
    expect(loaded.model.provider).toBe("anthropic")
  })
})

describe("AI proactive suggestions", () => {
  test("suggests bootstrapping shapes for an empty drawing", () => {
    const suggestions = buildSuggestions({ entityCount: 0, selectedCount: 0, activeTool: "select", layers: 1 })
    const prompts = suggestions.map((s) => s.prompt).join(" ")
    expect(prompts).toContain("rectangle")
    expect(prompts).toContain("circle")
  })
  test("suggests CAM operations and a G-code review when entities exist", () => {
    const suggestions = buildSuggestions({ entityCount: 24, selectedCount: 4, activeTool: "select", layers: 2 })
    const prompts = suggestions.map((s) => s.prompt).join(" ")
    expect(prompts.toLowerCase()).toContain("profile")
    expect(prompts.toLowerCase()).toContain("g-code")
    expect(prompts).toContain("drill")
  })
  test("always exposes memory commands", () => {
    const suggestions = buildSuggestions({ entityCount: 5, selectedCount: 0, activeTool: "select", layers: 1 })
    expect(suggestions.some((s) => s.prompt.toLowerCase().includes("millimetres"))).toBe(true)
    expect(suggestions.some((s) => s.prompt.toLowerCase().includes("stock"))).toBe(true)
  })
})

describe("AI tool-call validation (nikcli parity, spec 08-ai.md §3)", () => {
  const freshState = () => ({ started: new Set<string>(), finished: new Set<string>() })

  test("rejects tool names outside the cadcam allow-list with a typed tool_result", () => {
    const event = {
      type: "tool_call" as const,
      sessionId: "s1",
      callId: "c1",
      tool: "bash",
      input: { command: "rm -rf /" }
    }
    const out = dispatch(event, freshState())
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual(event)
    const rejection = expectResultOf(out)
    expect(rejection.callId).toBe("c1")
    expect(rejection.ok).toBe(false)
    expect(rejection.output).toContain("bash")
    expect(rejection.output).toContain("not allowed")
    // The allow-list mirrors nikcli's locked-down cadcam agent: shell/file/web tools must never reach the UI.
    for (const blocked of ["bash", "edit", "write", "webfetch", "apply_patch"]) {
      expect(TOOL_IDS).not.toContain(blocked)
    }
  })

  test("rejects non-object inputs with nikcli's wording", () => {
    const out = dispatch({
      type: "tool_call", sessionId: "s1", callId: "c2",
      tool: "cad_edit", input: "not-an-object" as unknown
    }, freshState())
    const rejection = expectResultOf(out)
    expect(rejection.ok).toBe(false)
    expect(rejection.output).toMatch(/called with invalid arguments: input must be a JSON object/)
  })

  test("an object input is passed on: the host validates it against the action's own schema", () => {
    // The consolidated tools carry their actions behind a discriminator; the host (nikcli) validates each call against the
    // action's zod schema and reports a refusal as a tool result, so the UI does not keep a second copy of 100+ schemas.
    for (const [tool, input] of [["cad_edit", { action: "add_entities", entities: [] }], ["memory_edit", { action: "remember", key: "has spaces", value: "v" }]] as const) {
      const event = { type: "tool_call" as const, sessionId: "s1", callId: `c-${tool}`, tool, input }
      expect(dispatch(event, freshState())).toEqual([event])
    }
  })

  test("passes a well-formed tool_call through unchanged", () => {
    const event = {
      type: "tool_call" as const,
      sessionId: "s1",
      callId: "c5",
      tool: "cad_edit",
      input: { action: "add_entities", entities: [{ type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }] }
    }
    const out = dispatch(event, freshState())
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual(event)
  })

  test("reconciles a tool_result without a preceding tool_call (nikcli event-mapper parity)", () => {
    // Mirrors `mapHostEvent` in `packages/ai/src/nikcli/event-mapper.ts`: when
    // the host batches events, a finished call can land before its start.
    const out = dispatch({
      type: "tool_result", sessionId: "s1", callId: "c6",
      tool: "cam_generate_gcode", ok: true, output: "{}"
    }, freshState())
    expect(out).toHaveLength(2)
    expect(out[0]?.type).toBe("tool_call")
    expect(out[1]?.type).toBe("tool_result")
  })
})

/** Pull the `tool_result` from a dispatch output. Type guards so the caller
 *  reads `output`/`callId`/`ok` without further narrowing. */
const expectResultOf = (
  out: ReadonlyArray<ReturnType<typeof dispatch>[number]>
): Extract<ReturnType<typeof dispatch>[number], { type: "tool_result" }> => {
  expect(out).toHaveLength(2)
  const result = out[1]
  if (result === undefined) throw new Error("dispatch returned fewer than 2 events")
  if (result.type !== "tool_result") throw new Error(`expected tool_result, got ${result.type}`)
  return result
}

 test("native questions decode and tool calls pass through the host-owned controls", () => {
  const question = decodeEvent(JSON.stringify({ type: "question_request", sessionId: "s", requestId: "q", questions: [{ header: "Stock", question: "Choose", options: [{ label: "Aluminium", description: "Stock" }], custom: false }] }))
  expect(question.type).toBe("question_request")
  expect(decodeEvent(JSON.stringify({ type: "question_resolved", sessionId: "s", requestId: "q" })).type).toBe("question_resolved")
  const state = { started: new Set<string>(), finished: new Set<string>() }
  expect(dispatch({ type: "tool_call", sessionId: "s", callId: "q", tool: "question", input: { questions: [] } }, state)[0]?.type).toBe("tool_call")
 })
