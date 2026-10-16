/**
 * The chat shows everything the agent hands out and does: the specialist agents' jobs (in the turn and in the background),
 * every tool call with who ran it and its exact input and output, and the version-control and workflow tools with their facts.
 * Events come from a scripted stream in place of the sidecar's, through the real client, store and panel.
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

const task = { id: "11111111-1111-4111-8111-111111111111", agent: "editor", description: "Make the hole 8 mm", status: "completed", background: false, text: "Done: hole-1 radius 3 -> 4." }
const research = { id: "22222222-2222-4222-8222-222222222222", agent: "researcher", description: "Find the right feed", status: "running", background: true }

const script = [
  { type: "tool_call", sessionId: "s", callId: "t1", tool: "vcs_edit", input: { action: "start_change", topic: "bigger hole" } },
  { type: "tool_result", sessionId: "s", callId: "t1", tool: "vcs_edit", ok: true, output: JSON.stringify({ ok: true, value: { branch: "ai/bigger-hole" } }) },
  { type: "tool_call", sessionId: "s", callId: "t2", tool: "agent", input: { action: "start", description: task.description, prompt: "x", agent: "editor" } },
  { type: "tool_call", sessionId: "s", agent: "editor", callId: "child:c1", tool: "cad", input: { action: "describe",} },
  { type: "tool_result", sessionId: "s", agent: "editor", callId: "child:c1", tool: "cad", ok: true, output: JSON.stringify({ ok: true, count: 1 }) },
  { type: "tool_result", sessionId: "s", callId: "t2", tool: "agent", ok: true, output: JSON.stringify(task) },
  { type: "tool_call", sessionId: "s", callId: "t3", tool: "agent", input: { action: "start", description: research.description, prompt: "y", agent: "researcher" } },
  { type: "tool_result", sessionId: "s", callId: "t3", tool: "agent", ok: true, output: JSON.stringify(research) },
  { type: "tool_call", sessionId: "s", callId: "t4", tool: "vcs_edit", input: { action: "open_pull_request", title: "Bigger hole", body: "" } },
  { type: "tool_result", sessionId: "s", callId: "t4", tool: "vcs_edit", ok: true, output: JSON.stringify({ ok: true, value: { number: 3, head: "ai/bigger-hole", base: "main" } }) },
  { type: "tool_call", sessionId: "s", callId: "t5", tool: "vcs_edit", input: { action: "run_workflows",} },
  { type: "tool_result", sessionId: "s", callId: "t5", tool: "vcs_edit", ok: true, output: JSON.stringify({ ok: true, value: [{ workflow: "verify", status: "success" }] }) },
  { type: "done", sessionId: "s", text: "Hole is 8 mm; PR #3 is open." }
]

describe("the chat shows tasks, tools, version control and workflows together", () => {
  test("a specialist's job, its own tool calls, the PR and the workflow are on screen", async () => {
    const client = app.state.client as unknown as { ai: { chatStream: unknown; sessionState: unknown } }
    client.ai.chatStream = () => Effect.succeed(Stream.fromIterable(script.map((e) => JSON.stringify(e))))
    // The host knows the background job as still running.
    client.ai.sessionState = () => Effect.succeed({ busy: false, text: "", tasks: [task, research] })
    const { dispose } = app.visit("/cad")
    try {
      ;(await app.wait(() => q<HTMLButtonElement>('button[title="Show CAD Assistant"]'), 30000)).click()
      await flush(50)
      const input = await app.wait(() => q<HTMLTextAreaElement>("textarea.assistant-prompt"), 30000)
      input.value = "Make the hole 8 mm and open a PR"
      input.dispatchEvent(new window.Event("input", { bubbles: true }))
      await flush()
      q<HTMLElement>("button.assistant-send")!.click()

      await app.wait(() => (qa('[data-testid="ai-task"]').length === 2 ? true : undefined), 10000)
      const tasks = qa('[data-testid="ai-task"]')
      expect(tasks[0]!.getAttribute("data-agent")).toBe("editor")
      expect(tasks[0]!.textContent).toContain("Make the hole 8 mm")
      expect(tasks[0]!.textContent).toContain("in this turn")
      expect(tasks[0]!.textContent).toContain("Done: hole-1 radius 3 -> 4.")
      expect(tasks[1]!.getAttribute("data-status")).toBe("running")
      expect(tasks[1]!.textContent).toContain("background")

      // Each delegation is a card inside the message that started it, driven by the host's record of the task.
      await app.wait(() => (qa('[data-testid="ai-task-card"]').length === 2 ? true : undefined), 10000)
      const cards = qa('[data-testid="ai-task-card"]')
      expect(cards[0]!.getAttribute("data-status")).toBe("completed")
      expect(cards[0]!.getAttribute("data-background")).toBe("false")
      expect(cards[0]!.querySelector('[data-testid="ai-task-agent"]')?.textContent).toBe("Editor")
      expect(cards[0]!.querySelector('[data-testid="ai-task-report"]')?.textContent).toContain("hole-1 radius 3 -> 4.")
      expect(cards[0]!.querySelector('[data-testid="ai-task-cancel"]')).toBeNull()
      expect(cards[1]!.getAttribute("data-status")).toBe("running")
      expect(cards[1]!.getAttribute("data-background")).toBe("true")
      expect(cards[1]!.querySelector('[data-testid="ai-task-status"]')?.textContent).toBe("working")
      expect(cards[1]!.querySelector('[data-testid="ai-task-cancel"]')).not.toBeNull()
      expect(cards[1]!.querySelector('[data-testid="ai-task-report"]')).toBeNull()

      await app.wait(() => (qa('[data-testid="tool-call"]').length >= 4 ? true : undefined), 10000)
      const rows = qa('[data-testid="tool-call"]')
      const child = rows.find((r) => r.getAttribute("data-tool") === "cad")!
      expect(child.getAttribute("data-agent")).toBe("editor")
      expect(child.querySelector('[data-testid="tool-agent"]')?.textContent).toBe("Editor")
      const pr = rows.find((r) => r.querySelector('[data-testid="tool-facts"]')?.textContent?.includes("pull request #3"))!
      expect(pr.querySelector('[data-testid="tool-facts"]')?.textContent).toContain("pull request #3 ai/bigger-hole → main")
      const workflow = rows.find((r) => r.querySelector('[data-testid="tool-facts"]')?.textContent?.includes("verify: success"))!
      expect(workflow.querySelector('[data-testid="tool-facts"]')?.textContent).toContain("verify: success")
      // Nothing the sidecar added is reported as refused.
      expect(document.body.textContent).not.toContain("is not allowed")
      expect(rows.every((r) => !r.textContent!.includes("Tool failed"))).toBe(true)
      // The exact input and output are one click away.
      expect(pr.querySelector("pre")).toBeNull()
      const raw = pr.querySelector<HTMLDetailsElement>('[data-testid="tool-raw"]')!
      raw.open = true
      raw.dispatchEvent(new window.Event("toggle"))
      await app.wait(() => pr.querySelector("pre"))
      expect(pr.querySelector("pre")?.textContent).toContain("Bigger hole")
    } finally {
      dispose()
    }
  }, 30000)
})
