import { expect, test } from "bun:test"
import type { ChatRow } from "../lib/chat-log"
import { buildTranscript } from "../lib/transcript-rows"
import {
  approvalAnnouncement, approvalEyebrow, approvalMore, approvalPosition, currentApproval, decisionAccessibilityLabel,
  dockVisible, itemIndex, pendingApprovals, permissionTitle, stepApproval, type PendingPermission,
} from "../lib/approval-dock"

const request = (requestId: string, permission: string, patterns: string[] = [], answered = false): ChatRow =>
  ({ kind: "request", sessionId: "s", requestId, permission, patterns, answered })
const question = (requestId: string, questions: Extract<ChatRow, { kind: "question" }>["questions"], answered = false): ChatRow =>
  ({ kind: "question", sessionId: "s", requestId, questions, answered })
const tool = (callId: string, ok: boolean | null = true): ChatRow => ({ kind: "tool", tool: "cad edit", callId, ok })

test("only unanswered requests and questions are pending, oldest first, tied to their transcript item", () => {
  const items = buildTranscript([
    { kind: "user", text: "Mill the pocket" },
    request("r1", "cam_generate_toolpath", ["/projects/bracket/**"]),
    request("r2", "edit", ["a.step"], true),
    question("q1", [{ header: "Stock", question: "Which material?", options: [{ label: "6061" }] }] as never),
    question("q2", [{ question: "Done?", options: [] }] as never, true),
  ])
  const pending = pendingApprovals(items)
  expect(pending.map((item) => item.requestId)).toEqual(["r1", "q1"])
  expect(pending[0]).toMatchObject({ kind: "permission", title: "Cam generate toolpath", target: "/projects/bracket/**", moreTargets: 0, itemId: "request:r1" })
  expect(pending[1]).toMatchObject({ kind: "question", title: "Stock", prompt: "Which material?", questions: 1, itemId: "question:q1" })
})

test("item ids from the dock match the rows the list renders, even after a run of tools collapses", () => {
  const items = buildTranscript([tool("a"), tool("b"), tool("c"), tool("d"), request("r1", "edit")])
  const [pending] = pendingApprovals(items)
  expect(pending).toBeDefined()
  expect(itemIndex(items, pending!.itemId)).toBe(items.length - 1)
  expect(itemIndex(items, "request:missing")).toBe(-1)
})

test("a question without a header is titled by its text, and an empty request still reads as an action", () => {
  const [asked] = pendingApprovals(buildTranscript([question("q", [{ question: "  Use the 6 mm cutter?  ", options: [] }] as never)]))
  expect(asked).toMatchObject({ title: "Use the 6 mm cutter?" })
  expect(asked && "prompt" in asked).toBe(false)
  const [empty] = pendingApprovals(buildTranscript([request("r", "")]))
  expect(empty).toMatchObject({ title: "Action", moreTargets: 0 })
  expect(permissionTitle("plan_exit")).toBe("Plan exit")
  expect(permissionTitle("fs.write:tmp")).toBe("Fs write tmp")
})

test("extra patterns and extra questions are counted, not listed", () => {
  const [permission, asked] = pendingApprovals(buildTranscript([
    request("r", "bash", ["", "make", "make check", "make clean"]),
    question("q", [{ question: "A?", options: [] }, { question: "B?", options: [] }] as never),
  ]))
  expect(permission).toMatchObject({ target: "make", moreTargets: 2 })
  expect(approvalMore(permission!)).toBe("+2 more paths")
  expect(approvalMore(asked!)).toBe("2 questions")
  expect(approvalMore({ ...(permission as PendingPermission), moreTargets: 1 })).toBe("+1 more path")
  expect(approvalMore({ ...(permission as PendingPermission), moreTargets: 0 })).toBe("")
})

test("the dock shows only while the desktop holds a turn it can still be answered on", () => {
  expect(dockVisible({ busy: true, online: true, pending: 1 })).toBe(true)
  expect(dockVisible({ busy: false, online: true, pending: 1 })).toBe(false)
  expect(dockVisible({ busy: true, online: false, pending: 1 })).toBe(false)
  expect(dockVisible({ busy: true, online: true, pending: 0 })).toBe(false)
})

test("the pager keeps the chosen request while it is pending and falls back to the oldest", () => {
  const pending = pendingApprovals(buildTranscript([request("r1", "edit"), request("r2", "bash"), question("q1", [{ question: "?", options: [] }] as never)]))
  expect(currentApproval(pending, "r2")).toMatchObject({ index: 1, approval: { requestId: "r2" } })
  expect(currentApproval(pending, "gone")).toMatchObject({ index: 0 })
  expect(currentApproval(pending, undefined)).toMatchObject({ index: 0 })
  expect(currentApproval([], "r1")).toBeUndefined()
  expect(stepApproval(pending, 2, 1)).toBe("r1")
  expect(stepApproval(pending, 0, -1)).toBe("q1")
  expect(stepApproval([], 0, 1)).toBeUndefined()
  expect(approvalPosition(1, 3)).toBe("2 of 3")
  expect(approvalPosition(0, 1)).toBe("")
})

test("wording names the request, for the eye and for VoiceOver", () => {
  const [permission, asked] = pendingApprovals(buildTranscript([request("r", "edit", ["part.step"]), question("q", [{ header: "Stock", question: "Which?", options: [] }] as never)]))
  expect(approvalEyebrow(permission!)).toBe("Permission required")
  expect(approvalEyebrow(asked!)).toBe("Your input is needed")
  expect(decisionAccessibilityLabel("once", permission as PendingPermission)).toBe("Allow once: Edit")
  expect(decisionAccessibilityLabel("always", permission as PendingPermission)).toBe("Allow for this session: Edit")
  expect(decisionAccessibilityLabel("reject", permission as PendingPermission)).toBe("Deny Edit")
  expect(approvalAnnouncement(permission!, 2)).toBe("Permission required: Edit. Allow once, allow for this session, or deny. 2 requests are waiting.")
  expect(approvalAnnouncement(asked!, 1)).toBe("The assistant needs your input: Stock.")
})
