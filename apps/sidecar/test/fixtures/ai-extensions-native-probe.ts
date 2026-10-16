import { makeApp } from "../helpers.ts"
const app = await makeApp({ aiHost: "nikcli", aiOffline: true })
try {
  const status = await app.call("/api/ai/status")
  if (status.status !== 200 || status.body.host !== "nikcli") throw new Error("Native host did not boot")
  const project = await app.call("/api/projects", { method: "POST", json: { name: "Native extension test" } })
  const projectId = project.body.id
  const saved = await app.call("/api/ai/extensions/mcp", { method: "PUT", json: { projectId, name: "disabled-fixture", config: { type: "local", command: ["not-executed"], enabled: false } } })
  if (saved.status !== 200 || saved.body.servers[0]?.status !== "disabled") throw new Error(`MCP save: ${JSON.stringify(saved.body)}`)
  const removed = await app.call(`/api/ai/extensions/mcp/disabled-fixture?projectId=${projectId}`, { method: "DELETE" })
  if (removed.status !== 200 || removed.body.servers.length !== 0) throw new Error("MCP removal failed")
  console.log("NATIVE_EXTENSIONS_PASS")
} finally { await app.dispose() }
