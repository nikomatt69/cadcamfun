import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { describeHostFailure, sessionExists } from "../src/nikcli/chat.ts"
import type { ProjectHost } from "../src/nikcli/runtime.ts"

/** The generated client throws `ClientError(reason, { cause: { status } })`. */
const clientError = (reason: string, status?: number): unknown => ({ reason, cause: { status } })

describe("host failure messages", () => {
  test("a session the host does not know reports the status, never `UnexpectedStatus`", () => {
    const message = describeHostFailure(clientError("UnexpectedStatus", 404))
    expect(message).toContain("404")
    expect(message).not.toContain("UnexpectedStatus")
  })

  test("400, 409 and 429 say what the caller should do", () => {
    expect(describeHostFailure(clientError("UnexpectedStatus", 400))).toContain("400")
    expect(describeHostFailure(clientError("UnexpectedStatus", 409))).toContain("busy")
    expect(describeHostFailure(clientError("UnexpectedStatus", 429))).toContain("429")
  })

  test("provider and native errors keep their own message", () => {
    expect(describeHostFailure(new Error("Provider request failed with HTTP 401: nope"))).toContain("401")
    expect(describeHostFailure("boom")).toBe("boom")
    expect(describeHostFailure(null)).toBe("null")
  })

  test("sessionExists answers false for an id the host never created", async () => {
    const host = {
      client: { session: { get: async () => { throw clientError("UnexpectedStatus", 404) } } }
    } as unknown as ProjectHost
    expect(await Effect.runPromise(sessionExists(host, "s-client-generated"))).toBe(false)
  })
})
