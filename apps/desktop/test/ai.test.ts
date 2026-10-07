/**
 * Tests for the nikcli-powered AI integration (spec 06-desktop-ui.md §1,
 * spec 08-ai.md §3). Unit tests for the typed-client surface, the SSE stream
 * decoder, the persisted-store helpers, and the proactive-suggestion builder.
 */
import { describe, expect, test } from "bun:test"
import { decodeEvent } from "../src/ai/stream.ts"
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
    expect(TOOL_IDS.length).toBe(17)
    expect(new Set(TOOL_IDS)).toEqual(new Set([
      "cad_add_entities", "cad_add_elements", "cad_modify_entities", "cad_delete_entities", "cad_describe_drawing",
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