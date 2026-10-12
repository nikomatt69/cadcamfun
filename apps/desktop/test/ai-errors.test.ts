/**
 * Tests for `sanitizeError` (apps/desktop/src/features/ai/lib/errors.ts).
 *
 * Locks the security contract: provider error text must not leak auth
 * header names, request ids, URLs, or raw JSON envelopes into the UI
 * transcript. Every test below should fail if any of those leak through.
 */
import { describe, expect, test } from "bun:test"
import { sanitizeError } from "../src/features/ai/lib/errors.ts"

const FORBIDDEN = [
  "X-Api-Key",
  "Authorization",
  "api secret key",
  "request_id",
  "trace_id",
  "correlation_id",
  "https://"
]

describe("sanitizeError", () => {
  test("strips X-Api-Key header name from authentication errors", () => {
    const raw = "Please carry the API secret key in the 'X-Api-Key' field of the request header"
    const out = sanitizeError(raw)
    expect(out).not.toContain("X-Api-Key")
    expect(out).not.toMatch(/api secret key/i)
  })

  test("parses raw provider JSON envelopes and uses the inner message", () => {
    const raw = JSON.stringify({
      type: "error",
      error: { type: "authentication_error", message: "login fail: bad API key" },
      request_id: "bb56d6c4b2fae044db5fd6b84ca3"
    })
    const out = sanitizeError(raw)
    expect(out).not.toContain("request_id")
    expect(out).not.toContain("bb56d6")
    expect(out.toLowerCase()).toMatch(/authentication|login/)
  })

  test("maps rate limit errors to a friendly message", () => {
    const out = sanitizeError("HTTP 429: rate limit exceeded")
    expect(out.toLowerCase()).toContain("rate limit")
  })

  test("every provider's overflow wording gets the context-window advice, including the host's own overflow message", () => {
    for (const raw of [
      "prompt is too long: 250000 tokens > 200000 maximum",
      "context_length_exceeded",
      "Your input exceeds the context window of this model",
      "The conversation has exceeded the model's context limit.\nConsider:\n  - Starting a new conversation"
    ]) {
      expect(sanitizeError(raw)).toContain("context window")
    }
  })

  test("maps context length errors to a friendly message", () => {
    const out = sanitizeError("maximum context length is 4096 tokens")
    expect(out.toLowerCase()).toContain("context")
  })

  test("maps network errors to a friendly message", () => {
    const out = sanitizeError("fetch failed: ECONNREFUSED")
    expect(out.toLowerCase()).toMatch(/network|connection|unreachable/)
  })

  test("strips URLs from the residual message", () => {
    const out = sanitizeError("See https://api.example.com/v1/docs for details")
    expect(out).not.toContain("https://")
  })

  test("returns a generic line when the input is empty", () => {
    const out = sanitizeError("")
    expect(out.length).toBeGreaterThan(0)
  })

  test("returns a generic line when the input is only sensitive fragments", () => {
    const out = sanitizeError("X-Api-Key: abc123 request_id=bb56d6")
    expect(out).not.toContain("X-Api-Key")
    expect(out).not.toContain("bb56d6")
    expect(out).not.toContain("request_id")
  })

  test("forbidden substrings never appear in the output", () => {
    const fixtures = [
      "Please carry the API secret key in the 'X-Api-Key' field of the request header",
      JSON.stringify({ error: { message: "Authorization header missing" }, request_id: "abc123" }),
      "Bad token: see https://docs.example.com/errors/bad-token for help",
      "Trace_id=trace-xyz-7890 due to upstream timeout"
    ]
    for (const raw of fixtures) {
      const out = sanitizeError(raw)
      for (const needle of FORBIDDEN) {
        expect(out.toLowerCase()).not.toContain(needle.toLowerCase())
      }
    }
  })
})