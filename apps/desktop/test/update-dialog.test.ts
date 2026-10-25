import { describe, expect, test } from "bun:test"
import {
  checkForUpdates, dismissUpdate, formatBytes, initialUpdateView, installFailed, percentOf, reduceUpdate, releaseNotesOf, reopenUpdate,
  restartAfterUpdate, type UpdateEvent, type UpdateView
} from "../src/app/updates.ts"

const available = (patch: Partial<Extract<UpdateEvent, { status: "available" }>> = {}): UpdateEvent =>
  ({ status: "available", version: "1.2.0", current: "1.1.0", notes: "Faster toolpaths", critical: false, dismissible: true, ...patch })
const feed = (events: ReadonlyArray<UpdateEvent>, from: UpdateView = initialUpdateView): UpdateView => events.reduce(reduceUpdate, from)

describe("what the update dialog shows", () => {
  test("a check the person asked for is answered with every outcome", () => {
    expect(feed([{ status: "checking", manual: true }]).dialog?.status).toBe("checking")
    expect(feed([{ status: "checking", manual: true }, { status: "upToDate", version: "1.1.0", manual: true }]).dialog).toMatchObject({ status: "upToDate", version: "1.1.0" })
    expect(feed([{ status: "checking", manual: true }, { status: "failed", message: "offline", manual: true }]).dialog).toMatchObject({ status: "failed", message: "offline" })
    expect(feed([{ status: "checking", manual: true }, available({ manual: true })]).dialog?.status).toBe("available")
  })

  test("a background check is silent unless a release is new", () => {
    expect(feed([{ status: "checking" }, { status: "upToDate", version: "1.1.0" }]).dialog).toBeUndefined()
    expect(feed([{ status: "checking" }, { status: "failed", message: "offline" }]).dialog).toBeUndefined()
    expect(feed([{ status: "checking" }, available()]).dialog?.status).toBe("available")
  })

  test("a release put off stays quiet in background checks, comes back when asked for, and a newer one is shown", () => {
    const putOff = dismissUpdate(feed([available()]))
    expect(putOff.dialog).toBeUndefined()
    expect(reduceUpdate(putOff, available()).dialog).toBeUndefined()
    expect(reduceUpdate(putOff, available({ manual: true })).dialog?.status).toBe("available")
    expect(reduceUpdate(putOff, available({ version: "1.3.0" })).dialog).toMatchObject({ version: "1.3.0" })
  })

  test("a critical release is always shown, even one that was put off", () => {
    const putOff = dismissUpdate(feed([available({ version: "2.0.0" })]))
    expect(reduceUpdate(putOff, available({ version: "2.0.0", critical: true, dismissible: false })).dialog).toMatchObject({ critical: true })
  })

  test("a download or a pending restart shrinks to a chip instead of disappearing, and comes back on a click", () => {
    const downloading = feed([available(), { status: "downloading", downloaded: 10, total: 100 }])
    const hidden = dismissUpdate(downloading)
    expect(hidden).toMatchObject({ minimized: true, dialog: { status: "downloading" } })
    expect(reopenUpdate(hidden).minimized).toBe(false)
    const ready = reduceUpdate(hidden, { status: "ready", version: "1.2.0" })
    expect(ready).toMatchObject({ minimized: false, dialog: { status: "ready" } })
    expect(dismissUpdate(ready)).toMatchObject({ minimized: true, dialog: { status: "ready" } })
  })

  test("another announcement of the release does not replace a download or a pending restart", () => {
    expect(reduceUpdate(feed([{ status: "downloading", downloaded: 1, total: 2 }]), available({ manual: true })).dialog?.status).toBe("downloading")
    expect(reduceUpdate(feed([{ status: "ready", version: "1.2.0" }]), available({ manual: true })).dialog?.status).toBe("ready")
  })

  test("an install that failed puts the release back on offer", () => {
    const failed = installFailed(feed([available(), { status: "downloading", downloaded: 5, total: 50 }]))
    expect(failed.dialog).toMatchObject({ status: "available", version: "1.2.0" })
    expect(installFailed(initialUpdateView).dialog).toBeUndefined()
  })
})

describe("how an update is told", () => {
  test("the shell's critical marker is not shown in the notes", () => {
    expect(releaseNotesOf("[critical] Fixes data loss\n- a\n- b")).toBe("Fixes data loss\n- a\n- b")
    expect(releaseNotesOf("   ")).toBe("")
  })

  test("download progress is a whole percent, or nothing without a total", () => {
    expect(percentOf(50, 200)).toBe(25)
    expect(percentOf(300, 200)).toBe(100)
    expect(percentOf(5, null)).toBeUndefined()
    expect(percentOf(5, 0)).toBeUndefined()
    expect(formatBytes(2048)).toBe("2 KB")
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB")
  })
})

describe("restarting into the update", () => {
  test("whatever was edited since the install is written first, then the shell restarts", async () => {
    const calls: string[] = []
    let unsaved = true
    await restartAfterUpdate({ flush: async () => { unsaved = false }, hasUnsavedWork: () => unsaved }, async (command) => { calls.push(command) })
    expect(calls).toEqual(["restart_app"])
  })

  test("work that cannot be written stops the restart", async () => {
    const calls: string[] = []
    await expect(restartAfterUpdate({ flush: async () => { throw new Error("offline") }, hasUnsavedWork: () => true }, async (command) => { calls.push(command) })).rejects.toMatchObject({ reason: "unsavedWork" })
    expect(calls).toEqual([])
  })

  test("a check from a menu or Settings is the shell's manual check", async () => {
    const calls: string[] = []
    expect(await checkForUpdates(async (command) => { calls.push(command) })).toBe(true)
    expect(calls).toEqual(["check_for_updates"])
  })
})
