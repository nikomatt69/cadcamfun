import { expect, test } from "bun:test"
import type { ChatRow } from "../lib/chat-log"
import { buildTranscript } from "../lib/transcript-rows"
import { isHydrating, linkNotice, startsTurn, statusLabel, turnEndAnnouncement } from "../lib/assistant-view"

test("the status pill names the most important truth first", () => {
  expect(statusLabel({ stopping: true, link: "reconnecting", activity: "Running edit…" })).toBe("Stopping the desktop turn…")
  expect(statusLabel({ stopping: false, link: "reconnecting", activity: "x" })).toContain("Reconnecting")
  expect(statusLabel({ stopping: false, link: "connecting", activity: "x" })).toBe("Connecting to the desktop…")
  expect(statusLabel({ stopping: false, link: "live", activity: "Running edit…" })).toBe("Running edit… · send to steer")
})

test("offline outranks reconnecting, and reconnecting is silent while the status pill already says it", () => {
  expect(linkNotice({ online: false, link: "reconnecting", busy: false })).toMatchObject({ tone: "offline" })
  expect(linkNotice({ online: true, link: "reconnecting", busy: false })).toMatchObject({ tone: "reconnecting" })
  expect(linkNotice({ online: true, link: "reconnecting", busy: true })).toBeNull()
  expect(linkNotice({ online: true, link: "live", busy: false })).toBeNull()
})

test("a conversation that is still being read shows a skeleton, never the empty hero", () => {
  const base = { opening: false, followed: false, transcriptEmpty: true, link: "idle" as const, syncing: false }
  expect(isHydrating(base)).toBe(false)
  expect(isHydrating({ ...base, opening: true })).toBe(true)
  expect(isHydrating({ ...base, followed: true, link: "connecting" })).toBe(true)
  expect(isHydrating({ ...base, followed: true, syncing: true, link: "live" })).toBe(true)
  expect(isHydrating({ ...base, followed: true, link: "live" })).toBe(false)
  // Offline with a remembered session: nothing is being read, so the hero (and the offline strip) tell the truth.
  expect(isHydrating({ ...base, followed: true, link: "idle" })).toBe(false)
  // Rows already on screen are never replaced by a skeleton.
  expect(isHydrating({ ...base, opening: true, transcriptEmpty: false })).toBe(false)
})

test("turn endings are announced differently", () => {
  expect(turnEndAnnouncement("done")).not.toBe(turnEndAnnouncement("error"))
})

test("a prompt after an answer or a tool run starts a turn; consecutive prompts and the first row do not", () => {
  const rows: ChatRow[] = [
    { kind: "user", text: "a" },
    { kind: "user", text: "steer", queued: true },
    { kind: "assistant", text: "done", sessionId: "s" },
    { kind: "user", text: "b" },
  ]
  const items = buildTranscript(rows)
  expect(items.map((item, index) => startsTurn(item, items[index - 1]))).toEqual([false, false, false, true])
})
