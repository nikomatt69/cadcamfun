/**
 * Every tool has its own view in the chat, as in nikcli's session route: a one-line row, or a block with a body (what was built,
 * the findings of a check, the G-code with line numbers, the program a code run executed), with a state for a call still being
 * written, running, finished, failed or refused. Events come from a scripted stream through the real client, store and panel.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const q = <T extends Element = HTMLElement>(selector: string): T | null => document.querySelector<T>(selector)
const qa = (selector: string): Element[] => [...document.querySelectorAll(selector)]
const flush = (ms = 80): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const call = (id: string, tool: string, input: unknown, output: unknown, ok = true) => [
  { type: "tool_call", sessionId: "s", callId: id, tool, input },
  { type: "tool_result", sessionId: "s", callId: id, tool, ok, output: typeof output === "string" ? output : JSON.stringify(output) }
]
const row = (tool: string, action = ""): Element => qa('[data-testid="tool-call"]').find((r) => r.getAttribute("data-tool") === tool && r.getAttribute("data-action") === action)!

const script = [
  ...call("a1", "cad_edit", { action: "add", elements: [{ type: "cube", name: "Plate" }, { type: "cylinder", name: "Hole" }, { type: "cylinder" }] },
    { ok: true, ids: ["1", "2", "3"], elements: [{ id: "1", type: "cube", name: "Plate" }, { id: "2", type: "cylinder", name: "Hole" }, { id: "3", type: "cylinder" }], skipped: [{ index: 3, error: "radius must be positive" }] }),
  ...call("a2", "cad_edit", { action: "modify", changes: [{ id: "1", changes: { width: 70, color: "#fff" } }] }, { ok: true, modified: 1, elements: [] }),
  ...call("a3", "cad", { action: "check" }, { ok: false, issues: [{ severity: "error", code: "NON_POSITIVE_SIZE", elementId: "3", message: "radius is 0" }, { severity: "warning", code: "FLOATING", message: "touches nothing" }] }),
  ...call("a4", "cam_edit", { action: "generate", operationId: "op" }, { stats: { lines: 120, cutLength: 842.5, rapidLength: 100, minZ: -5, maxZ: 5, estimatedSeconds: 180 }, preview: Array.from({ length: 20 }, (_, i) => `G1 X${i} Y0 F800`) }),
  ...call("a5", "cam_edit", { action: "verify", operationId: "op" }, { ok: false, issues: [{ code: "RapidInMaterial", severity: "error", message: "rapid enters the stock", line: 14 }], stats: { removedVolume: 1200 }, modelled: { holder: true, fixtures: false } }),
  ...call("a6", "code_mode", { code: "for (let i = 0; i < 3; i++) { await tools.cad_edit({ action: \"add\", elements: [] }) }" }, "{\"made\": 3}"),
  ...call("a7", "cam_edit", { action: "create", type: "pocket", params: { toolDiameter: 6, depth: 4, feedrate: 800, material: "aluminum" } }, { ok: true, operationId: "op-1" }),
  ...call("a8", "cad_edit", { action: "delete", ids: ["1"], confirm: true }, { ok: false, error: "Unknown element ids: 9" }),
  { type: "tool_progress", sessionId: "s", callId: "p1", tool: "cad_edit", chars: 1500 },
  { type: "tool_call", sessionId: "s", callId: "r1", tool: "cam", input: { action: "analyze", gcode: "G0" } },
  { type: "done", sessionId: "s", text: "Done." }
]

describe("a view for each tool", () => {
  test("blocks show what happened, inline rows show state, failures are red, and nothing blanks", async () => {
    const client = app.state.client as unknown as { ai: { chatStream: unknown } }
    client.ai.chatStream = () => Effect.succeed(Stream.fromIterable(script.map((e) => JSON.stringify(e))))
    const { dispose } = app.visit("/cad")
    try {
      const button = await app.wait(() => q<HTMLButtonElement>('button[title="Show CAD Assistant"]') ?? q("textarea.assistant-prompt"), 30000)
      if (button instanceof window.HTMLButtonElement) button.click()
      const input = await app.wait(() => q<HTMLTextAreaElement>("textarea.assistant-prompt"), 30000)
      input.value = "build and machine a plate"
      input.dispatchEvent(new window.Event("input", { bubbles: true }))
      await flush()
      q<HTMLElement>("button.assistant-send")!.click()
      await app.wait(() => (qa('[data-testid="tool-call"]').length >= 9 ? true : undefined), 15000)

      const built = row("cad_edit", "add")
      expect(built.getAttribute("data-shape")).toBe("block")
      expect(built.textContent).toContain("Built 3 elements, 1 skipped")
      expect(built.querySelector('[data-testid="tool-detail"]')!.textContent).toContain("cylinder ×2")
      expect(built.querySelector('[data-testid="tool-detail"]')!.textContent).toContain("#3: radius must be positive")

      expect(row("cad_edit", "modify").textContent).toContain("Modified 1 entity")
      expect(row("cad_edit", "modify").querySelector('[data-testid="tool-detail"]')!.textContent).toContain("1: width, color")

      const check = row("cad", "check")
      expect(check.textContent).toContain("Design check: 1 error, 1 warning")
      expect(check.querySelectorAll('[data-testid="tool-issues"] li').length).toBe(2)

      const gcode = row("cam_edit", "generate")
      expect(gcode.textContent).toContain("G-code: 120 lines")
      expect(gcode.querySelector('[data-testid="tool-code"]')!.textContent).toContain("G1 X0 Y0 F800")
      // 12 lines are shown; the rest is one click away.
      expect(gcode.querySelectorAll('[data-testid="tool-code"] div').length).toBe(12)
      expect(gcode.textContent).toContain("Show 8 more lines")

      const verify = row("cam_edit", "verify")
      expect(verify.textContent).toContain("Simulation: 1 error")
      expect(verify.textContent).toContain("RapidInMaterial")
      expect(verify.textContent).toContain("line 14")

      expect(row("code_mode").querySelector('[data-testid="tool-code"]')!.textContent).toContain("tools.cad_edit")
      expect(row("cam_edit", "create").querySelector('[data-testid="tool-detail"]')!.textContent).toContain("Ø6 mm")

      // A call the tool refused is red and says why, though the host called it a success.
      const refused = row("cad_edit", "delete")
      expect(refused.getAttribute("data-shape")).toBe("inline")
      expect(refused.querySelector('[data-testid="tool-error"]')!.textContent).toContain("Unknown element ids: 9")

      // A call still running reads "~ ..." and a call still being written says how much it has written.
      const running = row("cam", "analyze")
      expect(running.getAttribute("data-status")).toBe("running")
      expect(running.textContent).toContain("~ Analysing G-code...")
    } finally {
      dispose()
    }
  }, 60000)
})
