/**
 * Tests for the nikcli-powered AI integration (spec 06-desktop-ui.md §1,
 * spec 08-ai.md §3). Unit tests for the typed-client surface, the SSE stream
 * decoder, the persisted-store helpers, and the proactive-suggestion builder.
 */
import { describe, expect, test } from "bun:test"
import { decodeEvent, dispatch } from "../src/ai/stream.ts"
import { buildSuggestions } from "../src/ai/suggestions.ts"
import { loadPersisted, savePersisted } from "../src/ai/persisted.ts"
import { TOOL_IDS, TOOL_SUMMARIES } from "../src/ai/tools.ts"

describe("AI SSE event decoder", () => {
  test("decodes a delta event", () => {
    const event = decodeEvent(JSON.stringify({ type: "delta", sessionId: "s1", text: "hello" }))
    expect(event).toEqual({ type: "delta", sessionId: "s1", text: "hello" })
  })
  test("decodes a tool_call with input", () => {
    const event = decodeEvent(JSON.stringify({ type: "tool_call", sessionId: "s1", callId: "c1", tool: "cad_add_entities", input: { entities: [] } }))
    expect(event.type).toBe("tool_call")
    if (event.type === "tool_call") expect(event.tool).toBe("cad_add_entities")
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
    expect(TOOL_IDS.length).toBe(22)
    expect(new Set(TOOL_IDS)).toEqual(new Set([
      "cad_add_entities", "cad_add_elements", "cad_modify_entities", "cad_transform_entities", "cad_group_entities", "cad_editor", "cad_delete_entities", "cad_describe_drawing", "cad_check_design", "cad_import_drawing",
      "cam_describe_machine", "cam_create_operation", "cam_list_operations", "cam_update_operation", "cam_suggest_parameters", "cam_generate_gcode", "cam_analyze_gcode", "cam_verify_toolpath",
      "lib_lookup_material", "lib_lookup_tool", "memory_remember", "memory_recall"
    ]))
  })
  test("contains no nikcli shell/file/web tools (locked-down agent rule)", () => {
    expect(TOOL_IDS).not.toContain("bash")
    expect(TOOL_IDS).not.toContain("edit")
    expect(TOOL_IDS).not.toContain("write")
    expect(TOOL_IDS).not.toContain("webfetch")
    expect(TOOL_IDS).not.toContain("apply_patch")
  })
  test("every tool has a human-readable summary", () => {
    expect(TOOL_SUMMARIES.length).toBe(TOOL_IDS.length)
    for (const summary of TOOL_SUMMARIES) {
      expect(summary.title.length).toBeGreaterThan(0)
      expect(summary.description.length).toBeGreaterThan(0)
      expect(["cad", "cam", "library", "memory"]).toContain(summary.category)
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
      tool: "cad_add_entities", input: "not-an-object" as unknown
    }, freshState())
    const rejection = expectResultOf(out)
    expect(rejection.ok).toBe(false)
    expect(rejection.output).toMatch(/called with invalid arguments: input must be a JSON object/)
  })

  test("rejects inputs that violate the per-tool schema with nikcli's wording", () => {
    // cad_add_entities requires entities: array(min 1, max 500). Empty array fails.
    const out = dispatch({
      type: "tool_call", sessionId: "s1", callId: "c3",
      tool: "cad_add_entities", input: { entities: [] }
    }, freshState())
    const rejection = expectResultOf(out)
    expect(rejection.ok).toBe(false)
    expect(rejection.callId).toBe("c3")
    expect(rejection.output).toMatch(/called with invalid arguments/)
    expect(rejection.output).toMatch(/Please rewrite the input so it satisfies the expected schema/)
  })

  test("rejects memory_remember with a bad key pattern", () => {
    // The pattern is /^[A-Za-z0-9_.-]{1,80}$/ — a key with spaces violates it.
    const out = dispatch({
      type: "tool_call", sessionId: "s1", callId: "c4",
      tool: "memory_remember", input: { key: "has spaces", value: "v" }
    }, freshState())
    const rejection = expectResultOf(out)
    expect(rejection.ok).toBe(false)
    expect(rejection.output).toMatch(/memory_remember/)
  })

  test("passes a well-formed tool_call through unchanged", () => {
    const event = {
      type: "tool_call" as const,
      sessionId: "s1",
      callId: "c5",
      tool: "cad_add_entities",
      input: { entities: [{ type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }] }
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
