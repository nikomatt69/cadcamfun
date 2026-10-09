import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { prepareDirectCall } from "../src/direct-model.ts"
import { defineTool, toSpec, ToolMediaResult } from "../src/tools/define.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"
const file = { type: "file" as const, mime: "image/png", filename: "cad.png", url: "data:image/png;base64,iVBORw0KGgo=" }
describe("vision transport", () => {
  test("host tool images remain file parts, with project scope bound outside model arguments", async () => {
    const tool = toSpec(defineTool("vision_probe", { description: "test", parameters: z.object({}), execute: async (_input, context) => new ToolMediaResult({ ok: true, projectId: context.projectId }, [file]) }), { projectId: "bound", handlers: {} as ToolHandlersShape })
    const call = { sessionId: "s", projectId: "foreign", signal: new AbortController().signal }
    const result = await tool.executeWithFiles!({}, call)
    expect(JSON.parse(result.output).projectId).toBe("bound")
    expect(result.files).toEqual([file])
    expect(result.output).not.toContain("base64")
    const aborted = new AbortController(); aborted.abort()
    expect(JSON.parse(await tool.execute({}, { ...call, signal: aborted.signal })).ok).toBe(false)
  })
  test("direct fallback includes actual images and documents in the provider messages", () => {
    const call = prepareDirectCall({ provider: "openai", modelId: "gpt-5", viaGateway: false }, { prompt: "Inspect", files: [file] })
    expect(JSON.stringify(call.messages)).toContain(file.url)
    expect(JSON.stringify(call.messages)).toContain('"type":"image"')
  })
})
