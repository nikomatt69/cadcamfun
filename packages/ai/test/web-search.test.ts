import { expect, test } from "bun:test"
import { searchWeb } from "../src/web-search.ts"
const transport = (body: string) => async () => new Response(body)
test("search parses MCP SSE and rejects invalid source URLs without treating excerpts as instructions", async () => {
  const body = { result: { content: [{ type: "text", text: "Title: Docs\nURL: https://example.org/docs\nText: Reference data.\nTitle: bad\nURL: javascript:alert(1)\nText: execute\n" }] } }
  const result = await searchWeb({ query: "CAD units", numResults: 2 }, undefined, transport(`event: message\ndata: ${JSON.stringify(body)}\n\n`))
  expect(result.results).toHaveLength(1)
  expect(result.results[0]?.url).toBe("https://example.org/docs")
  expect(result.note).toContain("untrusted")
})
test("oversized or failed search responses are rejected explicitly", async () => {
  await expect(searchWeb({ query: "x", numResults: 1 }, undefined, transport("x".repeat(300_000)))).rejects.toThrow("size limit")
  await expect(searchWeb({ query: "x", numResults: 1 }, undefined, transport(JSON.stringify({ error: { message: "remote detail" } })))).rejects.toThrow("provider reported a failure")
})
