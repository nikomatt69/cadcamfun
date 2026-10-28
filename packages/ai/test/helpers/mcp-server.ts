/** Minimal real stdio MCP fixture: no SDK dependency, logs only actual tool execution. */
import { appendFileSync } from "node:fs"
const evidence = process.argv[2]
let pending = ""
const encoder = new TextEncoder()
for await (const bytes of Bun.stdin.stream() as unknown as AsyncIterable<Uint8Array>) {
  pending += new TextDecoder().decode(bytes)
  for (;;) {
    const newline = pending.indexOf("\n")
    if (newline < 0) break
    const line = pending.slice(0, newline)
    pending = pending.slice(newline + 1)
    if (!line.trim()) continue
    const request = JSON.parse(line) as { id?: string | number; method: string; params?: { arguments?: unknown } }
    if (request.id === undefined) continue
    let result: unknown = {}
    if (request.method === "initialize") result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1.0.0" } }
    if (request.method === "tools/list") result = { tools: [{ name: "echo", description: "Echo the supplied text", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } }] }
    if (request.method === "tools/call") {
      if (evidence) appendFileSync(evidence, JSON.stringify(request.params?.arguments) + "\n")
      result = { content: [{ type: "text", text: JSON.stringify(request.params?.arguments) }] }
    }
    await Bun.write(Bun.stdout, encoder.encode(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n"))
  }
}
