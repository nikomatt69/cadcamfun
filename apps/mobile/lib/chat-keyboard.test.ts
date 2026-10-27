import { describe, expect, test } from "bun:test"
import { chatKeyboardOffset } from "./chat-keyboard.ts"

describe("session chat keyboard coordinates", () => {
  test.each([
    { origin: 0, height: 810, keyboardY: 510 },
    { origin: 62, height: 748, keyboardY: 510 },
    { origin: 106, height: 704, keyboardY: 510 },
    { origin: 24, height: 345, keyboardY: 169 },
  ])("keeps the composer above the keyboard at window origin $origin", ({ origin, height, keyboardY }) => {
    const overlap = Math.max(0, height - (keyboardY - chatKeyboardOffset(origin)))
    expect(origin + height - overlap).toBe(keyboardY)
  })

  test("does not double-count an Android window already resized above the keyboard", () => {
    const origin = 24
    const height = 486
    const keyboardY = 510
    expect(Math.max(0, height - (keyboardY - chatKeyboardOffset(origin)))).toBe(0)
  })

  test("leaves room for the home indicator when the keyboard is closed", () => {
    const origin = 62
    const windowHeight = 844
    const bottomInset = 34
    const height = windowHeight - origin - bottomInset
    expect(Math.max(0, height - (windowHeight - chatKeyboardOffset(origin)))).toBe(0)
    expect(origin + height).toBe(windowHeight - bottomInset)
  })

  test("preserves fractional and negative native origins but rejects invalid measurements", () => {
    expect(chatKeyboardOffset(59.5)).toBe(59.5)
    expect(chatKeyboardOffset(-8)).toBe(-8)
    expect(chatKeyboardOffset(Number.NaN)).toBe(0)
    expect(chatKeyboardOffset(Number.POSITIVE_INFINITY)).toBe(0)
  })
})
