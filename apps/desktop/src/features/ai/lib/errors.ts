/**
 * Sanitise provider error messages before they reach the UI transcript.
 *
 * The host streams raw error text from the underlying provider (Anthropic,
 * OpenAI, gateway). That text frequently contains:
 *   - JSON envelopes with provider-internal error codes
 *   - References to the auth header name (`X-Api-Key`, `Authorization`)
 *   - Request ids that fingerprint the session
 *
 * None of that belongs in a UI transcript; a user sees "the AI is
 * unavailable" and the developer sees the structured cause in the console.
 */

const AUTH_PATTERNS: ReadonlyArray<RegExp> = [
  /['"`]?X-Api-Key['"`]?/gi,
  /['"`]?Authorization['"`]?/gi,
  /\b(api\s+secret\s+key|api\s+key|secret\s+key|bearer\s+token)\b/gi,
  /\b(please\s+carry\s+the\s+api[^.]*\.)/gi
]

const REQUEST_ID_PATTERN = /\b(request[_-]?id|trace[_-]?id|correlation[_-]?id)\s*['":=]\s*['"]?[a-zA-Z0-9_-]+/gi
const URL_PATTERN = /\bhttps?:\/\/[^\s)]+/gi
const JSON_ENVELOPE_PATTERN = /^\{.*\}$/s

/** True when the message looks like a raw provider JSON envelope. */
const isRawJson = (text: string): boolean => JSON_ENVELOPE_PATTERN.test(text.trim())

/** Map a known error code to a clean, user-facing line. */
const FRIENDLY: ReadonlyArray<readonly [RegExp, string]> = [
  [/authentication|login\s+fail|invalid\s+api\s+key|unauthor/i, "Authentication failed. Check the API key in Settings → AI."],
  [/rate\s*limit|too\s+many\s+requests|429/i, "Rate limit reached. Try again in a moment."],
  [/model\s+not\s+found|unknown\s+model/i, "This model is not available for your account."],
  // nikcli's overflow wordings (`provider/error.ts`): the window is full, which a pause does not cure.
  [/context[\s_]*(?:length|window|limit)|too\s+long|maximum\s+(?:context|prompt)|exceeds?\s+the\s+(?:available\s+context|limit\s+of)|token\s+limit|reduce\s+the\s+length/i, "The conversation no longer fits the model's context window. The assistant summarises it on its own as it fills; if this keeps happening, start a new conversation or pick a model with a larger window."],
  [/timeout|timed\s+out|deadline/i, "The provider timed out. Try again."],
  // A body that stops before the stream ended: the connection was closed while the model was still working.
  [/decode\s+error|body\s+(?:was\s+)?(?:terminated|closed)|connection\s+(?:closed|reset)|socket\s+(?:closed|hang)|\bterminated\b|stream\s+ended\s+unexpectedly/i, "The connection to the assistant was interrupted while it was working. Ask again; for something big (many parts) ask for it in smaller steps."],
  [/abort|cancel/i, "The request was cancelled."],
  [/network|fetch\s+failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i, "The provider is unreachable. Check your connection and try again."]
]

/**
 * Turn a raw provider error into a single clean sentence. The structured
 * cause stays in the console; the UI never sees the JSON dump, header name,
 * or request id. Falls back to a generic line when nothing matches.
 */
export const sanitizeError = (raw: string): string => {
  const text = raw.trim()
  if (text.length === 0) return "The AI provider returned an error."

  // 1. Recognised JSON envelopes: try to pull the inner message.
  if (isRawJson(text)) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      const inner = pickMessage(parsed)
      if (inner !== undefined) return sanitizeError(inner)
    } catch { /* not real JSON, fall through */ }
  }

  // 2. Best-effort match against a friendly cause table.
  for (const [pattern, friendly] of FRIENDLY) {
    if (pattern.test(text)) return friendly
  }

  // 3. Strip sensitive fragments and trim — the residual is safe to show.
  const stripped = text
    .replace(AUTH_PATTERNS[0]!, "[auth]")
    .replace(AUTH_PATTERNS[1]!, "[auth]")
    .replace(AUTH_PATTERNS[2]!, "credentials")
    .replace(AUTH_PATTERNS[3]!, "")
    .replace(REQUEST_ID_PATTERN, "")
    .replace(URL_PATTERN, "[url]")
  const single = stripped.replace(/\s+/g, " ").trim()
  return single.length === 0 ? "The AI provider returned an error." : single
}

const pickMessage = (node: unknown): string | undefined => {
  if (typeof node === "string") return node
  if (typeof node !== "object" || node === null) return undefined
  const record = node as Record<string, unknown>
  for (const key of ["message", "error", "detail", "reason"]) {
    const value = record[key]
    if (typeof value === "string" && value.length > 0) return value
    const nested = pickMessage(value)
    if (nested !== undefined) return nested
  }
  return undefined
}