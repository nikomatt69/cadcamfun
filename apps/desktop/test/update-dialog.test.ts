import { describe, expect, test } from "bun:test"
import {
  checkForUpdates, decodeUpdateEvent, dismissUpdate, formatBytes, initialUpdateView, installFailed, installPendingUpdate, observeUpdates, percentOf, reduceUpdate, releaseNotesOf, reopenUpdate,
  restartAfterUpdate, type UpdateEvent, type UpdateView
} from "../src/app/updates.ts"

const available = (patch: Partial<Extract<UpdateEvent, { status: "available" }>> = {}): UpdateEvent =>
  ({ status: "available", version: "1.2.0", current: "1.1.0", notes: "Faster toolpaths", critical: false, dismissible: true, ...patch })
const feed = (events: ReadonlyArray<UpdateEvent>, from: UpdateView = initialUpdateView): UpdateView => events.reduce(reduceUpdate, from)

describe("what the update dialog shows", () => {
  test("critical releases cannot be dismissed through the state interface", () => {
    const critical = feed([available({ critical: true, dismissible: false })])
    expect(dismissUpdate(critical)).toBe(critical)
    const inconsistent = feed([available({ critical: true, dismissible: true })])
    expect(dismissUpdate(inconsistent)).toBe(inconsistent)
    const downloaded = feed([{ status: "downloaded", version: "1.2.0", critical: true }])
    expect(dismissUpdate(downloaded)).toBe(downloaded)
  })

  test("checks cannot overwrite active download, installation or restart states", () => {
    for (const event of [
      { status: "downloading", downloaded: 1, total: 100 },
      { status: "downloaded", version: "1.2.0" },
      { status: "installing", version: "1.2.0" },
      { status: "ready", version: "1.2.0" }
    ] satisfies UpdateEvent[]) {
      const active = feed([available(), event])
      for (const check of [{ status: "checking", manual: true }, { status: "upToDate", version: "1.1.0", manual: true }, { status: "failed", message: "offline", manual: true }] satisfies UpdateEvent[]) {
        expect(reduceUpdate(active, check)).toBe(active)
      }
      expect(reduceUpdate(active, available({ manual: true })).dialog).toEqual(event)
    }
  })
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

describe("native update event boundary", () => {
  test("rejects incomplete and malformed payloads", () => {
    for (const payload of [null, [], { status: "available" }, { status: "available", version: "1", notes: 3, critical: false, dismissible: true },
      { status: "ready", version: 1 }, { status: "checking", manual: "true" }, { status: "failed" },
      { status: "downloading", downloaded: -1 }, { status: "downloading", downloaded: NaN }, { status: "downloading", downloaded: 1, total: "10" }]) {
      expect(decodeUpdateEvent(payload)).toBeUndefined()
    }
  })

  const subscription = async () => {
    const received: UpdateEvent[] = []
    let event!: (payload: unknown) => void, snapshot!: (payload: unknown) => void
    let stopped = false
    const stop = await observeUpdates((value) => received.push(value), async (receive) => { event = receive; return () => { stopped = true } },
      async () => new Promise((resolve) => { snapshot = resolve }))
    return { received, event: (payload: unknown) => event(payload), snapshot: async (payload: unknown) => { snapshot(payload); await Promise.resolve(); await Promise.resolve() }, stop, stopped: () => stopped }
  }

  test("recovers the launch check after the webview starts listening", async () => {
    const s = await subscription()
    await s.snapshot(available())
    expect(s.received).toEqual([available()])
    s.stop()
    expect(s.stopped()).toBe(true)
  })

  test("a late snapshot cannot replace newer live progress", async () => {
    const s = await subscription()
    s.event({ status: "downloading", downloaded: 50, total: 100 })
    await s.snapshot(available())
    expect(s.received).toEqual([{ status: "downloading", downloaded: 50, total: 100 }])
    s.stop()
  })

  test("unmounted listeners ignore snapshots and queued events", async () => {
    const s = await subscription()
    s.stop()
    await s.snapshot(available())
    s.event(available())
    expect(s.received).toEqual([])
  })
})

describe("saving around the download", () => {
  test("edits made during download are written before the native installer can exit", async () => {
    const calls: string[] = []
    let dirty = true
    await installPendingUpdate({ flush: async () => { calls.push("save"); dirty = false }, hasUnsavedWork: () => dirty }, async (command, args) => {
      calls.push(command)
      expect(args?.unsavedWork).toBe(false)
      if (command === "install_update") dirty = true
      return "1.2.0"
    })
    expect(calls).toEqual(["save", "install_update", "save", "apply_update"])
  })

  test("a failed second save refuses application and keeps the downloaded package for retry", async () => {
    let saves = 0
    const calls: string[] = []
    await expect(installPendingUpdate({ flush: async () => { if (++saves === 2) throw Error("disk full") }, hasUnsavedWork: () => saves === 2 }, async (command, args) => {
      calls.push(command)
      if (args?.unsavedWork) throw { reason: "unsavedWork" }
      return "1.2.0"
    })).rejects.toMatchObject({ reason: "unsavedWork" })
    expect(calls).toEqual(["install_update", "apply_update"])
    const staged = feed([{ status: "downloaded", version: "1.2.0" }])
    expect(installFailed(staged)).toBe(staged)
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
