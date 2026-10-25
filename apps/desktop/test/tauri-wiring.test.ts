/**
 * The desktop-shell wiring, run through Tauri's real JavaScript API over a mocked IPC (`@tauri-apps/api/mocks`): the close
 * request, the window destroy call and the updater event are the same calls the packaged app makes, only the Rust side is
 * replaced by a recorder.
 */
import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { createRoot } from "solid-js"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { applyStoredDrawing } from "../src/features/cad/lib/open-drawing.ts"

setDefaultTimeout(120_000)
let app: Awaited<ReturnType<typeof bootLiveApp>>
let projectSession: typeof import("../src/features/projects/lib/project-session.ts").projectSession
let mocks: typeof import("@tauri-apps/api/mocks")
let clearMocks: () => void
beforeAll(async () => {
  app = await bootLiveApp()
  projectSession = (await import("../src/features/projects/lib/project-session.ts")).projectSession
  mocks = await import("@tauri-apps/api/mocks")
})
afterAll(async () => { await app.dispose() })
afterEach(() => { clearMocks?.(); resetStores() })

const run = <A,>(effect: unknown) => app.state.runtime.run(effect as never) as Promise<A>
const box = (id: string, x: number) => ({ id, type: "cube", layerId: "default", x, y: 0, z: 0, width: 10, height: 10, depth: 10 })

/** Opens a stored drawing and starts the session with the Tauri bridge present. */
const startDesktop = async () => {
  const calls: string[] = []
  mocks.mockWindows("main")
  mocks.mockIPC((command) => { calls.push(command); return undefined }, { shouldMockEvents: true })
  clearMocks = mocks.clearMocks
  const project = await run<{ id: string }>(app.client.projects.create({ payload: { name: "Desktop" } }))
  const drawing = await run<{ id: string }>(app.client.drawings.createForProject({ params: { id: project.id }, payload: { name: "Main", data: { elements: [box("a", 0)], version: "1.0" } } }))
  const session = projectSession(app.state)
  let stop!: () => void, dispose!: () => void
  createRoot((rootDispose) => { dispose = rootDispose; stop = session.start() })
  applyStoredDrawing(app.state, await run(app.client.drawings.get({ params: { id: drawing.id } })))
  await session.document.baseline()
  return { session, calls, drawingId: drawing.id, stop: () => { stop(); dispose() } }
}
const settle = () => new Promise((r) => setTimeout(r, 600))
const until = async (check: () => boolean, ms = 5_000) => { const end = Date.now() + ms; while (!check()) { if (Date.now() > end) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 20)) } }

test("a close request with unsaved work is held, the work is written, then the window is destroyed", async () => {
  const desktop = await startDesktop()
  try {
    // The session registers its close-request listener through the real API (event commands are handled inside the mock).
    await settle()
    useElementsStore.setState({ elements: [box("a", 33)] })
    await new Promise((r) => setTimeout(r, 450))
    expect(desktop.session.hasUnsavedWork()).toBe(true)
    const { emit } = await import("@tauri-apps/api/event")
    await emit("tauri://close-requested")
    await until(() => desktop.calls.includes("plugin:window|destroy"))
    const stored = await run<{ data: { elements: Array<{ x: number }> } }>(app.client.drawings.get({ params: { id: desktop.drawingId } }))
    expect(stored.data.elements[0]!.x).toBe(33)
    expect(desktop.session.hasUnsavedWork()).toBe(false)
  } finally { desktop.stop() }
})

test("a close request with nothing unsaved goes straight through (the default destroy), without a save", async () => {
  const desktop = await startDesktop()
  try {
    await settle()
    const writes = () => desktop.calls.filter((call) => call.includes("drawings")).length
    const { emit } = await import("@tauri-apps/api/event")
    await emit("tauri://close-requested")
    await until(() => desktop.calls.includes("plugin:window|destroy"))
    expect(writes()).toBe(0)
  } finally { desktop.stop() }
})

test("the update dialog appears on the shell's update://status event and installing writes unsaved work first", async () => {
  const desktop = await startDesktop()
  const view = app.visit("/projects")
  try {
    const { emit } = await import("@tauri-apps/api/event")
    await settle()
    await emit("update://status", { status: "available", version: "9.9.9", notes: "", critical: false, dismissible: true })
    const banner = await app.wait(() => document.querySelector("[data-testid='update-prompt']"), 10_000)
    expect(banner.textContent).toContain("9.9.9")
    useElementsStore.setState({ elements: [box("a", 44)] })
    await new Promise((r) => setTimeout(r, 450))
    const install = [...document.querySelectorAll("button")].find((button) => button.textContent === "Install update")!
    install.click()
    await until(() => desktop.calls.includes("install_update"))
    const stored = await run<{ data: { elements: Array<{ x: number }> } }>(app.client.drawings.get({ params: { id: desktop.drawingId } }))
    expect(stored.data.elements[0]!.x).toBe(44)
  } finally { view.dispose(); desktop.stop() }
})

test("a check from the menu bar is answered, a background one is not, and a finished install ends in a restart", async () => {
  const desktop = await startDesktop()
  const view = app.visit("/projects")
  try {
    const { emit } = await import("@tauri-apps/api/event")
    await settle()
    const dialog = () => document.querySelector("[data-testid='update-prompt']")
    await emit("update://status", { status: "upToDate", version: "9.9.8", dismissible: true, manual: false })
    await settle()
    expect(dialog()).toBeNull()
    await emit("update://status", { status: "checking", dismissible: true, manual: true })
    expect((await app.wait(() => dialog(), 10_000)).textContent).toContain("Looking for")
    await emit("update://status", { status: "upToDate", version: "9.9.8", dismissible: true, manual: true })
    await app.wait(() => dialog()?.textContent?.includes("9.9.8") ? dialog() : null, 10_000)
    await emit("update://status", { status: "ready", version: "9.9.9", dismissible: false })
    const restart = await app.wait(() => [...document.querySelectorAll("button")].find((button) => button.textContent === "Restart now") ?? null, 10_000)
    restart.click()
    await until(() => desktop.calls.includes("restart_app"))
  } finally { view.dispose(); desktop.stop() }
})

test("the shell's menu events reach the app: Check for Updates asks the shell, Show Logs Folder opens the logs, Save writes the work", async () => {
  const desktop = await startDesktop()
  const view = app.visit("/projects")
  try {
    const { emit } = await import("@tauri-apps/api/event")
    await settle()
    await emit("menu", "help.check_updates")
    await until(() => desktop.calls.includes("check_for_updates"))
    await emit("menu", "help.release_notes")
    await until(() => desktop.calls.includes("open_release_notes"))
    await emit("menu", "help.open_logs")
    await until(() => desktop.calls.includes("get_logs_dir") && desktop.calls.includes("open_path"))
    useElementsStore.setState({ elements: [box("a", 55)] })
    await new Promise((r) => setTimeout(r, 450))
    await emit("menu", "file.save")
    await until(() => !desktop.session.hasUnsavedWork())
    const stored = await run<{ data: { elements: Array<{ x: number }> } }>(app.client.drawings.get({ params: { id: desktop.drawingId } }))
    expect(stored.data.elements[0]!.x).toBe(55)
  } finally { view.dispose(); desktop.stop() }
})
