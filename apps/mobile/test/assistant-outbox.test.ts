import { expect, test } from "bun:test"
import { deliverOutbox, outboxKey, type OfflineAssistantOp } from "../lib/assistant-outbox"

const entry = (id: string): OfflineAssistantOp => ({ id, type: "assistant-message", projectId: "p", text: id, queuedAt: 1, desktopFingerprint: "desktop" })

test("offline delivery checkpoints before sending and preserves conversation order", async () => {
  let queue = [entry("first"), entry("second")]
  let sessionId: string | undefined
  const messages: string[] = []
  const sent = await deliverOutbox([...queue], {
    fingerprint: "desktop", active: () => true,
    session: () => sessionId, remember: (_project, id) => { sessionId = id },
    save: async (previous, next) => { queue = queue.flatMap((op) => outboxKey(op) === outboxKey(previous) ? next ? [next] : [] : [op]) },
    client: {
      async *chat(body) {
        expect(queue.find((op) => op.text === body.message)?.submitted).toBe(true)
        if (messages.length) expect(body.sessionId).toBe("ses_native")
        messages.push(body.message ?? "")
        yield { type: "done", sessionId: "ses_native", text: "Finished" }
      },
      async *resumeChat() { throw new Error("No recovery expected") },
    },
  })
  expect(messages).toEqual(["first", "second"])
  expect(sent).toBe(2)
  expect(queue).toEqual([])
})

test("ambiguous offline delivery recovers once without executing the message again", async () => {
  let queue = [entry("first"), entry("second")]
  const posts: string[] = []
  const deps = {
    fingerprint: "desktop", active: () => true,
    session: () => undefined, remember() {},
    save: async (previous: OfflineAssistantOp, next: OfflineAssistantOp | null) => { queue = queue.flatMap((op) => outboxKey(op) === outboxKey(previous) ? next ? [next] : [] : [op]) },
    client: {
      async *chat(body: { message?: string }) {
        posts.push(body.message ?? "")
        yield { type: "turn", phase: "start", sessionId: "ses_native" }
        throw new Error("Connection lost")
      },
      async *resumeChat(id: string) {
        expect(id).toBe("ses_native")
        yield { type: "done", sessionId: id, text: "Finished" }
      },
    },
  }
  expect(await deliverOutbox([...queue], deps)).toBe(0)
  expect(queue[0]).toMatchObject({ submitted: true, sessionId: "ses_native" })
  expect(posts).toEqual(["first"])
  expect(await deliverOutbox(queue.slice(0, 1), deps)).toBe(1)
  expect(posts).toEqual(["first"])
  expect(queue.map((op) => op.id)).toEqual(["second"])
})

test("queued prompts for another paired desktop are never delivered", async () => {
  const sent = await deliverOutbox([entry("private-project")], {
    fingerprint: "another-desktop", active: () => true, session: () => undefined, remember() {}, save: async () => { throw new Error("Must stay queued") },
    client: { async *chat() { throw new Error("Must not send") }, async *resumeChat() { throw new Error("Must not recover") } },
  })
  expect(sent).toBe(0)
})
