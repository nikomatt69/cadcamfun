import { expect, test } from "bun:test"
import { CompanionError } from "../lib/client"
import { isThrottled, readWithBackoff, throttleDelayMs, throttleMessage } from "../lib/throttle"

test("only a 429 from the desktop is a throttle", () => {
  expect(isThrottled(new CompanionError(429, "Too many requests", 2500))).toBe(true)
  expect(isThrottled(new CompanionError(403, "Not available"))).toBe(false)
  expect(isThrottled(new Error("boom"))).toBe(false)
  expect(isThrottled(undefined)).toBe(false)
})

test("the back-off the gateway sent becomes the phone's own delay", () => {
  expect(throttleDelayMs(new CompanionError(429, "Too many requests", 2500))).toBe(2500)
  expect(throttleDelayMs(new CompanionError(429, "Too many requests"))).toBeUndefined()
  expect(throttleDelayMs(new CompanionError(500, "boom"))).toBeUndefined()
})

test("the throttle message tells the user to wait, not that something broke", () => {
  expect(throttleMessage(new CompanionError(429, "Too many requests", 2500))).toContain("3s")
  expect(throttleMessage(new CompanionError(429, "Too many requests"))).toContain("Wait a moment")
})

test("a read waits the gateway's back-off and tries again", async () => {
  let attempts = 0
  const value = await readWithBackoff(async () => {
    attempts += 1
    if (attempts === 1) throw new CompanionError(429, "Too many requests", 1)
    return "projects"
  })
  expect(value).toBe("projects")
  expect(attempts).toBe(2)
})

test("a read that keeps being throttled gives up instead of looping", async () => {
  let attempts = 0
  await expect(readWithBackoff(async () => {
    attempts += 1
    throw new CompanionError(429, "Too many requests", 1)
  }, { attempts: 2 })).rejects.toThrow("Too many requests")
  expect(attempts).toBe(2)
})

test("a read that fails for another reason is not retried", async () => {
  let attempts = 0
  await expect(readWithBackoff(async () => {
    attempts += 1
    throw new CompanionError(500, "boom")
  })).rejects.toThrow("boom")
  expect(attempts).toBe(1)
})
