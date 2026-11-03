/**
 * Legacy route files that are deliberately **not** in the v6 contract, each with the reason. `bun run coverage` counts them
 * separately from the open gaps, and `--strict` fails only on a route that is neither covered nor listed here. An entry is
 * a decision, not a to-do: remove it (and port the route) only when the reason stops being true.
 */
export interface AcceptedGap { readonly route: string; readonly reason: string }

const providerCalls = "Model calls go through `AiService` with the user's own credentials; a raw proxy would be an endpoint that forwards a key (spec 27)."
const noMcpDispatch = "MCP is not a dispatch path in v6 (spec 27 rejected it); the kept `mcp` group serves what the desktop uses."
const noMl = "Fine-tuning and evaluation need an OpenAI key in the server environment and have no consumer in v6."
const webOnly = "Web-site or test endpoint of the legacy Next.js app; no desktop, mobile or assistant consumer."
const implemented = "Implemented; the legacy inventory row has no method list, so the route cannot be counted as verified."

export const ACCEPTED_GAPS: readonly AcceptedGap[] = [
  ...[
    "/api/ai/anthropic-proxy", "/api/ai/anthropic-stream", "/api/ai/openai-proxy", "/api/ai/openai-vision-proxy", "/api/openai/completion",
    "/api/ai/websearch", "/api/ai/code-interpreter", "/api/ai/code-interpreter/containers", "/api/ai/code-interpreter/containers/:id",
    "/api/ai/code-interpreter/containers/:id/files", "/api/ai/code-interpreter/files", "/api/ai/code-interpreter/files/:id",
    "/api/ai/code-interpreter/files/upload", "/api/ai/continuous-agent", "/api/ai/mcp", "/api/ai/mcp-test"
  ].map((route) => ({ route, reason: providerCalls })),
  ...[
    "/api/mcp", "/api/mcp-agent", "/api/mcp-protocol", "/api/mcp/generate-assembly", "/api/mcp/resource", "/api/mcp/session", "/api/mcp/sessions",
    "/api/mcp/specialized-tools", "/api/mcp/stdio-cleanup", "/api/mcp/stdio-server-status", "/api/mcp/tool", "/api/mcp/utilities", "/api/mcp/websearch"
  ].map((route) => ({ route, reason: noMcpDispatch })),
  ...["/api/ml/evaluate", "/api/ml/feedback", "/api/ml/train"].map((route) => ({ route, reason: noMl })),
  { route: "/api/websocket", reason: "Live updates use server-sent events (`/api/events`); there is no websocket transport." },
  ...["/api", "/api/og", "/api/og-image/*slug", "/api/route", "/api/graphql-playground", "/api/test-webauthn"].map((route) => ({ route, reason: webOnly })),
  { route: "/api/analytics/log-view", reason: implemented },
  { route: "/api/plugins/bootstrap.js", reason: implemented }
]
