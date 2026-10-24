import { describe, expect, test } from "bun:test"
import { closeGuard } from "../src/features/projects/lib/window-guard.ts"
import { decodeUpdateEvent, installPendingUpdate } from "../src/app/updates.ts"

const harness = (over: { unsaved?: boolean; flush?: () => Promise<void> } = {}) => {
  const log: string[] = []
  const state = { unsaved: over.unsaved ?? true, now: 1_000 }
  const guard = closeGuard(
    { hasUnsavedWork: () => state.unsaved, flush: over.flush ?? (async () => { log.push("flush"); state.unsaved = false }) },
    { destroy: async () => { log.push("destroy") } },
    (message) => log.push(`report:${message}`),
    { timeoutMs: 30, insistMs: 20_000, now: () => state.now }
  )
  const event = () => ({ preventDefault: () => { log.push("hold") } })
  return { log, state, guard, event }
}

describe("closing the window", () => {
  test("nothing unsaved: the close goes through untouched", async () => {
    const h = harness({ unsaved: false })
    await h.guard(h.event())
    expect(h.log).toEqual([])
  })

  test("unsaved work is written first, then the window is destroyed", async () => {
    const h = harness()
    await h.guard(h.event())
    expect(h.log).toEqual(["hold", "flush", "destroy"])
  })

  test("a failed save keeps the window open and says why; a second close shortly after closes anyway", async () => {
    const h = harness({ flush: async () => { throw new Error("disk full") } })
    await h.guard(h.event())
    expect(h.log[0]).toBe("hold")
    expect(h.log[1]).toContain("disk full")
    expect(h.log).not.toContain("destroy")
    h.state.now += 5_000
    await h.guard(h.event())
    expect(h.log.at(-1)).toBe("destroy")
  })

  test("a close insisted on long after the refusal is held again", async () => {
    const h = harness({ flush: async () => { throw new Error("nope") } })
    await h.guard(h.event())
    h.state.now += 60_000
    await h.guard(h.event())
    expect(h.log.filter((entry) => entry === "destroy")).toHaveLength(0)
    expect(h.log.filter((entry) => entry.startsWith("report:"))).toHaveLength(2)
  })

  test("a save that never finishes is given up on after the time limit", async () => {
    const h = harness({ flush: () => new Promise<void>(() => undefined) })
    await h.guard(h.event())
    expect(h.log.some((entry) => entry.startsWith("report:"))).toBe(true)
    expect(h.log).not.toContain("destroy")
  })
})

describe("installing an update", () => {
  test("unsaved work is written first and what is still unsaved is reported to the shell", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> | undefined }> = []
    const invoke = async (command: string, args?: Record<string, unknown>) => { calls.push({ command, args }); return "1.2.3" }
    let unsaved = true
    expect(await installPendingUpdate({ flush: async () => { unsaved = false }, hasUnsavedWork: () => unsaved }, invoke)).toBe("1.2.3")
    expect(calls).toEqual([{ command: "install_update", args: { unsavedWork: false } }])
    calls.length = 0
    await installPendingUpdate({ flush: async () => { throw new Error("offline") }, hasUnsavedWork: () => true }, invoke)
    expect(calls[0]!.args).toEqual({ unsavedWork: true })
  })

  test("only known statuses decode", () => {
    expect(decodeUpdateEvent({ status: "available", version: "1", notes: "", critical: false, dismissible: true })?.status).toBe("available")
    expect(decodeUpdateEvent({ status: "weird" })).toBeUndefined()
    expect(decodeUpdateEvent(null)).toBeUndefined()
  })
})
