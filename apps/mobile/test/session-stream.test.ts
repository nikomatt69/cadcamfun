import { expect, test } from "bun:test"
import type { SessionStreamFrame } from "@cadcamfun/api"
import { CompanionError } from "../lib/client"
import { followSession, reconnectDelay } from "../lib/session-stream"

const hello = (seq: number, extra: Partial<Extract<SessionStreamFrame, { type: "server.connected" }>> = {}): SessionStreamFrame => ({ type: "server.connected", sessionId: "ses", busy: true, seq, ...extra })
const event = (seq: number, text: string): SessionStreamFrame => ({ type: "event", seq, event: { type: "delta", sessionId: "ses", text } })

test("a dropped stream reconnects from the last cursor and reports the second greeting as a reconnection", async () => {
  const opened: Array<number | undefined> = []
  const connections: SessionStreamFrame[][] = [[hello(4), event(5, "Hel")], [hello(5), event(6, "lo")]]
  const controller = new AbortController()
  const texts: string[] = []
  const greetings: boolean[] = []
  await followSession({
    after: 4, signal: controller.signal, sleep: async () => {},
    async *open(after) {
      opened.push(after)
      const frames = connections.shift()
      if (!frames) { controller.abort(); return }
      yield* frames
      throw new Error("The network connection was lost")
    },
    onEvent: (frame) => { texts.push(String((frame as { text: string }).text)) },
    onConnected: (_frame, reconnected) => { greetings.push(reconnected) },
  })
  expect(opened).toEqual([4, 5, 6])
  expect(texts.join("")).toBe("Hello")
  expect(greetings).toEqual([false, true])
})

test("a reset greeting moves the cursor to the live edge and asks the screen to re-read", async () => {
  const controller = new AbortController()
  const opened: Array<number | undefined> = []
  const resets: boolean[] = []
  let calls = 0
  await followSession({
    after: 2, signal: controller.signal, sleep: async () => {},
    async *open(after) {
      opened.push(after)
      if (++calls === 1) { yield hello(90, { reset: true }); return }
      controller.abort()
    },
    onEvent() {},
    onConnected: (frame) => { resets.push(Boolean(frame.reset)) },
  })
  expect(resets).toEqual([true])
  expect(opened).toEqual([2, 90])
})

test("a silent connection is abandoned by the watchdog and reopened", async () => {
  const controller = new AbortController()
  let opens = 0
  const drops: string[] = []
  await followSession({
    signal: controller.signal, staleMs: 20, sleep: async () => {},
    async *open(_after, signal) {
      if (++opens > 1) { controller.abort(); return }
      yield hello(1)
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
    },
    onEvent() {},
    onConnected() {},
    onDisconnected: (error) => { drops.push(error instanceof Error ? error.message : String(error)) },
  })
  expect(opens).toBe(2)
  expect(drops).toEqual(["The desktop stopped answering"])
})

test("a refused session stops following instead of retrying forever", async () => {
  let opens = 0
  await followSession({
    signal: new AbortController().signal, sleep: async () => {},
    async *open() { opens += 1; throw new CompanionError(400, "Session not found or inaccessible") },
    onEvent() {},
    onConnected() {},
  })
  expect(opens).toBe(1)
})

test("reconnect pauses double from one second and stay capped", () => {
  expect([0, 1, 2, 3, 10].map(reconnectDelay)).toEqual([1_000, 2_000, 4_000, 8_000, 15_000])
})
