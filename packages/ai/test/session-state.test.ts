import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import type { HostClient, HostMessageInfo, HostPart } from "@nikcli-ai/sdk-next"
import { readHostSessionState } from "../src/nikcli/chat.ts"
import type { ProjectHost } from "../src/nikcli/runtime.ts"

type Message = Awaited<ReturnType<HostClient["session"]["messages"]>>[number]

const message = (role: string, text: string, info: Partial<HostMessageInfo> = {}, parts?: ReadonlyArray<HostPart>): Message => ({
  info: { id: "message", role, ...info },
  parts: parts ?? [{ id: "text", type: "text", text }]
})

const stubHost = (messages: HostClient["session"]["messages"]): ProjectHost =>
  ({ client: { session: { messages } } }) as unknown as ProjectHost

const read = (messages: ReadonlyArray<Message>) => Effect.runPromise(readHostSessionState(stubHost(async (input) => {
  expect(input).toEqual({ sessionID: "ses-test", limit: 40 })
  return messages
}), "ses-test"))

describe("recovered host session state", () => {
  test("recovers tool errors and completed-step usage without executing tools", async () => {
    const state = await read([
      message("user", "Model"),
      message("assistant", "Partial", { finish: "stop", tokens: { input: 12, output: 4 } }, [
        { id: "tool", type: "tool", callID: "c", tool: "cad_add_elements", state: { status: "completed", input: { elements: [] }, output: JSON.stringify({ ok: false, error: "Rebuild failed", problems: ["features[1].depth: missing"] }) } }
      ])
    ])
    expect(state.events?.map((event) => event.type)).toEqual(["tool_call", "tool_result", "tool_diagnostic"])
    expect(state.events?.find((event) => event.type === "tool_result")).toMatchObject({ ok: false })
    expect(state.events?.at(-1)).toMatchObject({ type: "tool_diagnostic", message: "Rebuild failed; features[1].depth: missing" })
    expect(state.usage).toEqual({ inputTokens: 12, outputTokens: 4 })
  })
  test("joins multi-step answer text only from the latest user turn", async () => {
    expect(await read([
      message("user", "Old request"),
      message("assistant", "Old answer", { finish: "stop" }),
      message("user", "New request"),
      message("assistant", "Working. ", { finish: "tool-calls" }),
      message("assistant", "Done.", { finish: "stop" }, [
        { id: "reasoning", type: "reasoning", text: "Private reasoning" },
        { id: "tool", type: "tool", state: { status: "completed", output: "Tool output" } },
        { id: "text", type: "text", text: "Done." }
      ])
    ])).toEqual({ busy: false, text: "Working. Done." })
  })

  test("excludes summaries identified by either flag or agent", async () => {
    expect(await read([
      message("user", "Request"),
      message("assistant", "Before. ", { finish: "tool-calls" }),
      message("assistant", "Internal summary", { summary: true, finish: "stop" }),
      message("assistant", "Other summary", { agent: "compaction", finish: "stop" }),
      message("assistant", "After.", { finish: "stop" })
    ])).toEqual({ busy: false, text: "Before. After." })
  })

  test("synthetic continuation does not discard earlier answer steps", async () => {
    const syntheticPart = { id: "continue", type: "text", text: "Continue", synthetic: true }
    expect(await read([
      message("user", "Old request"),
      message("assistant", "Old answer", { finish: "stop" }),
      message("user", "Request"),
      message("assistant", "Before. ", { finish: "tool-calls" }),
      message("assistant", "Summary", { summary: true, finish: "stop" }),
      message("user", "", {}, [syntheticPart]),
      message("assistant", "After.", { finish: "stop" })
    ])).toEqual({ busy: false, text: "Before. After." })
  })

  test("a trailing internal compaction error does not replace a finished answer", async () => {
    expect(await read([
      message("user", "Request"),
      message("assistant", "Done.", { finish: "stop" }),
      message("assistant", "Internal", { agent: "compaction", error: { data: { message: "Summary failed" } } })
    ])).toEqual({ busy: false, text: "Done." })
  })

  test("a real user message with synthetic context starts a new turn", async () => {
    const syntheticPart = { id: "context", type: "text", text: "Context", synthetic: true }
    expect(await read([
      message("user", "Old request"),
      message("assistant", "Old answer", { finish: "stop" }),
      message("user", "", {}, [{ id: "request", type: "text", text: "Request" }, syntheticPart])
    ])).toEqual({ busy: true, text: "" })
  })

  for (const finish of [undefined, "tool-calls", "tool_calls"]) {
    test(`unfinished/tool step remains busy (${finish ?? "no finish"})`, async () => {
      expect(await read([
        message("user", "Request"),
        message("assistant", "Working", { finish }),
        message("assistant", "Summary", { summary: true, finish: "stop" })
      ])).toEqual({ busy: true, text: "Working" })
    })
  }

  test("pending synthetic continuation remains busy and preserves text", async () => {
    const syntheticPart = { id: "continue", type: "text", text: "Continue", synthetic: true }
    expect(await read([
      message("user", "Request"),
      message("assistant", "Working", { finish: "tool-calls" }),
      message("user", "", {}, [syntheticPart])
    ])).toEqual({ busy: true, text: "Working" })
  })

  test("empty and summary-only histories have no recovered answer", async () => {
    expect(await read([])).toEqual({ busy: false, text: "" })
    expect(await read([message("assistant", "Summary", { summary: true, finish: "stop" })])).toEqual({ busy: false, text: "" })
  })

  test("stored errors finish the turn and retain partial answer text", async () => {
    expect(await read([
      message("user", "Request"),
      message("assistant", "Partial", { finish: "tool-calls", error: { name: "ProviderError", data: { message: "Unavailable" } } })
    ])).toEqual({ busy: false, text: "Partial", error: "Unavailable" })
    expect(await read([
      message("assistant", "", { error: { name: "MessageAbortedError" } })
    ])).toEqual({ busy: false, text: "", error: "MessageAbortedError" })
  })

  test("host read failures surface as configuration errors", async () => {
    const host = stubHost(async () => { throw new Error("Host unavailable") })
    await expect(Effect.runPromise(readHostSessionState(host, "ses-test"))).rejects.toThrow("Failed to read the session: Host unavailable")
  })
})
