import { describe, expect, test } from "bun:test"
import { activeMessage } from "../lib/active-message"
import { bubbleImageWidth, clampAspect, imageGrid, userBubbleMaxWidth } from "../lib/chat-geometry"

describe("user bubble geometry", () => {
  test("82% of the row, the whole row at large type", () => {
    expect(userBubbleMaxWidth(390, 1)).toBe(Math.round(358 * 0.82))
    expect(userBubbleMaxWidth(390, 1.3)).toBe(Math.round(358 * 0.82))
    expect(userBubbleMaxWidth(390, 1.5)).toBe(358)
  })

  test("a picture card fits inside the bubble's padding and never grows past 320", () => {
    expect(bubbleImageWidth(390, 1)).toBe(Math.round(358 * 0.82) - 32)
    expect(bubbleImageWidth(1024, 1)).toBe(320)
    expect(bubbleImageWidth(100, 1)).toBe(120)
  })

  test("several pictures are squares, two per row", () => {
    expect(imageGrid(1, 262)).toEqual({ columns: 1, tile: 262 })
    expect(imageGrid(2, 262)).toEqual({ columns: 2, tile: 128 })
    expect(imageGrid(4, 262, 6).tile * 2 + 6).toBeLessThanOrEqual(262)
  })

  test("aspect ratios stay within what a bubble can show", () => {
    expect(clampAspect(4000, 3000)).toBeCloseTo(4 / 3)
    expect(clampAspect(10000, 100)).toBe(2.4)
    expect(clampAspect(100, 10000)).toBe(0.6)
    expect(clampAspect(0, 0)).toBe(4 / 3)
  })
})

describe("the open action chips", () => {
  test("only one message owns them, and a row that unmounts cannot close another's", () => {
    let calls = 0
    const stop = activeMessage.subscribe(() => { calls++ })
    activeMessage.set("a")
    activeMessage.set("a")
    expect(calls).toBe(1)
    activeMessage.set("b")
    expect(activeMessage.get()).toBe("b")
    activeMessage.release("a")
    expect(activeMessage.get()).toBe("b")
    activeMessage.release("b")
    expect(activeMessage.get()).toBeNull()
    stop()
    activeMessage.set("c")
    // "a", "b" and the release of "b" notified; nothing after unsubscribing.
    expect(calls).toBe(3)
    activeMessage.set(null)
  })
})
