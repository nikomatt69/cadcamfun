import { describe, expect, test } from "bun:test"
import { CompanionError } from "../lib/client"
import { isOfflineSendError } from "../lib/offline-errors"
import { countQueuedUserMessages, getPendingAssistantIndex } from "../lib/transcript-rows"

describe("isOfflineSendError", () => {
  test("status-0 transport failures are offline", () => {
    expect(isOfflineSendError(new CompanionError(0, "The desktop did not respond"))).toBe(true)
  })
  test("HTTP/business errors are not offline", () => {
    expect(isOfflineSendError(new CompanionError(403, "Forbidden"))).toBe(false)
    expect(isOfflineSendError(new CompanionError(500, "Crash"))).toBe(false)
  })
  test("network TypeErrors are offline", () => {
    expect(isOfflineSendError(new TypeError("Network request failed"))).toBe(true)
    expect(isOfflineSendError(new Error("Cannot reach the desktop"))).toBe(true)
  })
  test("empty values are not offline", () => {
    expect(isOfflineSendError(null)).toBe(false)
    expect(isOfflineSendError(undefined)).toBe(false)
  })
})

describe("transcript pending detection", () => {
  test("an assistant bubble with no user after it is pending", () => {
    const rows = [
      { kind: "user", text: "hi" },
      { kind: "assistant", text: "working", sessionId: "s1" },
    ] as const
    expect(getPendingAssistantIndex(rows)).toBe(1)
    expect(countQueuedUserMessages(rows, 1)).toBe(0)
  })
  test("user messages after the pending bubble count as queued", () => {
    const rows = [
      { kind: "user", text: "a" },
      { kind: "assistant", text: "w", sessionId: "s1" },
      { kind: "user", text: "b" },
      { kind: "user", text: "c" },
    ] as const
    expect(getPendingAssistantIndex(rows)).toBe(1)
    expect(countQueuedUserMessages(rows, 1)).toBe(2)
  })
  test("no assistant bubble means nothing pending", () => {
    expect(getPendingAssistantIndex([])).toBeNull()
    expect(countQueuedUserMessages([], null)).toBe(0)
  })
})
