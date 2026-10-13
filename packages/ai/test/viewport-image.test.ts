import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Effect, Scope, Stream } from "effect"
import { z } from "zod"
import type { AiEvent } from "../src/events.ts"
import { defaultProviderSpecs, type HostProviderSpec } from "../src/nikcli/config.ts"
import { createHostSession, hostChatStream } from "../src/nikcli/chat.ts"
import { makeNikCliRuntime, type HostToolSpec } from "../src/nikcli/runtime.ts"
import { startFakeAnthropic } from "./helpers/fake-anthropic.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

setDefaultTimeout(90000)

/**
 * The viewport capture, end to end on the Anthropic protocol the application routes natively: a tool returns an image, and the next
 * request to the model must carry it as an image the model can see, not inside the tool result (which the native request lowering
 * refuses: "<provider>/<model> cannot take this request: tool result content "media""). A real host, a fake Anthropic server.
 */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZQAAAABJRU5ErkJggg=="
const capture: HostToolSpec = {
  id: "viewport_probe",
  description: "Capture the viewport and return it as an image.",
  parameters: z.object({ focus: z.string().optional() }),
  execute: async () => JSON.stringify({ ok: true }),
  executeWithFiles: async () => ({ output: JSON.stringify({ ok: true, evidence: "Captured viewport" }), files: [{ type: "file" as const, mime: "image/png", filename: "viewport.png", url: `data:image/png;base64,${PNG}` }] })
}

// One tool call per conversation: once a tool result is in the messages, the model answers.
const answered = (request: { messages: ReadonlyArray<{ content: unknown }> }): boolean => JSON.stringify(request.messages).includes("tool_result")
const fake = startFakeAnthropic((request) => answered(request) ? { text: "I can see a plate with a hole." } : { toolUse: { name: "viewport_probe", input: { focus: "the plate" } } })
const provider = (vision: boolean): HostProviderSpec => ({ id: vision ? "claude-like" : "text-only", name: "Fake Claude", protocol: "anthropic", baseURL: fake.baseUrl, models: [{ id: "fake-claude", name: "Fake Claude", context: 100_000, output: 4096, vision }] })
const scope = Effect.runSync(Scope.make())
const runtime = await Effect.runPromise(makeNikCliRuntime({
  dataDir: sharedDataDir, providers: [...defaultProviderSpecs(), provider(true), provider(false)], systemPrompt: "You are a CAD test assistant.", toolsFor: () => [capture]
}).pipe(Scope.provide(scope)))
await Effect.runPromise(runtime.setProviderKey("claude-like", "sk-fake"))
await Effect.runPromise(runtime.setProviderKey("text-only", "sk-fake"))
afterAll(async () => { await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)); fake.stop() })

const run = async (providerID: string, project: string) => {
  const host = await Effect.runPromise(runtime.host(project))
  const sessionId = await Effect.runPromise(createHostSession(host, "capture"))
  const before = fake.requests.length
  const events = [...await Effect.runPromise(Stream.runCollect(hostChatStream({ host, sessionId, message: "Look at the viewport", model: { providerID, modelID: "fake-claude" }, autoContinues: 0, continues: 0 })))] as AiEvent[]
  return { events, requests: fake.requests.slice(before) }
}
const blocks = (message: { content: unknown } | undefined): Array<Record<string, unknown>> => Array.isArray(message?.content) ? message.content as Array<Record<string, unknown>> : []

describe("a viewport capture on the Anthropic protocol", () => {
  test("a vision model gets the image as an image block of the next message, the tool result stays text, and the turn finishes", async () => {
    const { events, requests } = await run("claude-like", "viewport-vision")
    expect(events.some((event) => event.type === "error"), JSON.stringify(events.filter((event) => event.type === "error"))).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: "done", text: "I can see a plate with a hole." })
    expect(requests).toHaveLength(2)
    // The second request is the one after the tool ran.
    const messages = requests[1]!.messages
    const toolResult = messages.flatMap((message) => blocks(message)).find((block) => block["type"] === "tool_result")!
    expect(toolResult).toBeDefined()
    expect(JSON.stringify(toolResult["content"])).not.toContain("image")
    expect(JSON.stringify(toolResult["content"])).toContain("Captured viewport")
    const images = messages.flatMap((message) => blocks(message)).filter((block) => block["type"] === "image")
    expect(images).toHaveLength(1)
    expect(images[0]!["source"]).toMatchObject({ type: "base64", media_type: "image/png", data: PNG })
    // The image arrives in a user message, after the tool result, with the host's own words about where it came from.
    const carrier = messages.find((message) => blocks(message).some((block) => block["type"] === "image"))!
    expect(carrier.role).toBe("user")
    expect(JSON.stringify(carrier.content)).toContain("from tool result")
  })

  test("a model without vision never receives image data; it is told, in words, that it cannot read the image", async () => {
    const { events, requests } = await run("text-only", "viewport-text")
    expect(events.some((event) => event.type === "error")).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: "done" })
    const sent = JSON.stringify(requests[1]!.messages)
    expect(sent).not.toContain(PNG)
    expect(blocks({ content: requests[1]!.messages.flatMap((message) => blocks(message)) }).some((block) => block["type"] === "image")).toBe(false)
    expect(sent.toLowerCase()).toContain("image")
  })
})
