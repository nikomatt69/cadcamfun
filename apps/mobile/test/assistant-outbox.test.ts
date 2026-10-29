import { expect, test } from "bun:test"
import { deliverOutbox, outboxKey, type OfflineAssistantOp } from "../lib/assistant-outbox"
import { CompanionError, type ChatRequest } from "../lib/client"
import { isOfflineSendError } from "../lib/offline-errors"
import { pairingScope, type Pairing } from "../lib/pairing"

const entry = (id: string): OfflineAssistantOp => ({ id, type: "assistant-message", projectId: "p", text: id, queuedAt: 1, desktopFingerprint: "desktop" })

const harness = (initial: OfflineAssistantOp[]) => {
  const state = { queue: initial, sessionId: undefined as string | undefined }
  const deps = {
    fingerprint: "desktop", active: () => true, unsent: isOfflineSendError,
    session: () => state.sessionId, remember: (_project: string, id: string) => { state.sessionId = id },
    save: async (previous: OfflineAssistantOp, next: OfflineAssistantOp | null) => { state.queue = state.queue.flatMap((op) => outboxKey(op) === outboxKey(previous) ? next ? [next] : [] : [op]) },
  }
  return { state, deps }
}

test("offline delivery checkpoints before posting, keeps order and continues the desktop session", async () => {
  const { state, deps } = harness([entry("first"), entry("second")])
  const posts: ChatRequest[] = []
  const sent = await deliverOutbox([...state.queue], { ...deps, client: { promptSession: async (body) => {
    expect(state.queue.find((op) => op.text === body.message)?.submitted).toBe(true)
    posts.push(body)
    return { sessionId: "ses_native", seq: posts.length }
  } } })
  expect(posts.map((body) => body.message)).toEqual(["first", "second"])
  expect(posts[1]?.sessionId).toBe("ses_native")
  expect(sent).toBe(2)
  expect(state.queue).toEqual([])
})

test("an uncertain delivery is never posted again and holds back the messages after it", async () => {
  const { state, deps } = harness([entry("first"), entry("second")])
  const posts: string[] = []
  const client = { promptSession: async (body: ChatRequest) => { posts.push(body.message ?? ""); throw new CompanionError(502, "Bad gateway") } }
  expect(await deliverOutbox([...state.queue], { ...deps, client })).toBe(0)
  expect(state.queue[0]).toMatchObject({ id: "first", submitted: true })
  expect(posts).toEqual(["first"])
  // Next drain: the uncertain one is dropped (the conversation shows whether it ran), the next one goes out.
  const ok = { promptSession: async (body: ChatRequest) => { posts.push(body.message ?? ""); return { sessionId: "ses", seq: 1 } } }
  expect(await deliverOutbox([...state.queue], { ...deps, client: ok })).toBe(1)
  expect(posts).toEqual(["first", "second"])
  expect(state.queue).toEqual([])
})

test("a request that certainly never left the phone stays queued for the next drain", async () => {
  const { state, deps } = harness([entry("first")])
  const client = { promptSession: async () => { throw new CompanionError(0, "The Internet connection appears to be offline.") } }
  expect(await deliverOutbox([...state.queue], { ...deps, client })).toBe(0)
  expect(state.queue[0]).toMatchObject({ id: "first" })
  expect(state.queue[0]?.submitted).toBeUndefined()
})

test("queued prompts for another paired desktop are never delivered", async () => {
  const sent = await deliverOutbox([entry("private-project")], {
    fingerprint: "another-desktop", active: () => true, session: () => undefined, remember() {}, save: async () => { throw new Error("Must stay queued") },
    client: { promptSession: async () => { throw new Error("Must not send") } },
  })
  expect(sent).toBe(0)
})

test("hosted queued mutations stay with their workspace and account across reconnects", async () => {
  const cloud: Pairing = { baseUrl: "https://cloud.cadcam.fun", mode: "cloud", workspaceId: "workspace-1", name: "Cloud", token: "0123456789abcdef", fingerprint: "" }
  const op = { ...entry("private-cloud-project"), desktopFingerprint: pairingScope(cloud, "owner") }
  for (const scope of [pairingScope(cloud, "another-account"), pairingScope({ ...cloud, workspaceId: "workspace-2" }, "owner"), pairingScope(cloud)]) {
    expect(await deliverOutbox([op], {
      fingerprint: scope, active: () => true, session: () => undefined, remember() {}, save: async () => { throw new Error("Must stay queued") },
      client: { promptSession: async () => { throw new Error("Must not send") } },
    })).toBe(0)
  }
  const { state, deps } = harness([op])
  expect(await deliverOutbox([op], { ...deps, fingerprint: pairingScope({ ...cloud, name: "Renamed after TLS renewal" }, "owner"), client: { promptSession: async () => ({ sessionId: "cloud-session", seq: 1 }) } })).toBe(1)
  expect(state.queue).toEqual([])
})

test("a prompt refused because the session is busy (409) stays queued unsubmitted and holds back later ones", async () => {
  const { state, deps } = harness([entry("first"), entry("second")])
  const posts: string[] = []
  const client = { promptSession: async (body: ChatRequest) => { posts.push(body.message ?? ""); throw new CompanionError(409, "The session is running a turn") } }
  expect(await deliverOutbox([...state.queue], { ...deps, client })).toBe(0)
  expect(posts).toEqual(["first"])
  expect(state.queue.map((op) => [op.id, op.submitted])).toEqual([["first", undefined], ["second", undefined]])
})
