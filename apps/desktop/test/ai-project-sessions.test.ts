import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { bootLiveApp } from "./helpers/live-app.ts"
import { useDocumentStore } from "../src/features/cad/store/documentStore.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import type { AiStore } from "../src/features/ai/store/store.ts"
import { pushLiveDrawing } from "../src/features/ai/lib/drawing-context.ts"
import { drawingPayload } from "../src/features/cad/lib/projectSnapshot.ts"
import { useLayerStore } from "../src/features/cad/store/layerStore.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const mount = async () => {
  const { render } = await import("solid-js/web")
  const { AppProvider } = await import("../src/shared/state/context.ts")
  const { createAiStore } = await import("../src/features/ai/store/store.ts")
  let store!: AiStore
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const dispose = render(() => AppProvider({ state: app.state, get children() { store = createAiStore(); return null } }), root)
  return { store, dispose }
}
const createDocument = async (name: string) => {
  const project = await app.sidecar.call("/api/projects", { method: "POST", json: { name } })
  const drawing = await app.sidecar.call(`/api/projects/${project.body.id}/drawings`, { method: "POST", json: { name, data: { elements: [] } } })
  return { projectId: String(project.body.id), drawingId: String(drawing.body.id), name }
}
const eventStream = (values: object[]) => Stream.fromIterable(values.map((event) => JSON.stringify(event)))
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((release) => { resolve = release })
  return { promise, resolve }
}

describe("project-scoped assistant workspace", () => {
  test("navigation to another drawing in the same project invalidates pending preparation before stream admission", async () => {
    localStorage.clear()
    const a = await createDocument("Pending drawing")
    const second = await app.sidecar.call(`/api/projects/${a.projectId}/drawings`, { method: "POST", json: { name: "Other drawing", data: { elements: [] } } })
    const b = { ...a, drawingId: String(second.body.id), name: "Other drawing" }
    useDocumentStore.getState().setDocument(a)
    const drawings = app.state.client.drawings, client = app.state.client.ai
    const originalGet = drawings.get, originalStream = client.chatStream
    const entered = deferred<void>(), release = deferred<void>()
    let admitted = 0
    Object.assign(drawings, { get: (input: Parameters<typeof originalGet>[0]) => Effect.promise(async () => {
      entered.resolve(undefined)
      await release.promise
      return app.state.runtime.run(originalGet(input))
    }) })
    Object.assign(client, { chatStream: () => { admitted++; return Effect.succeed(eventStream([{ type: "done", sessionId: "ses_wrong_drawing", text: "Wrong drawing" }])) } })
    const { store, dispose } = await mount()
    let sending: Promise<void> | undefined
    try {
      sending = store.send("Prepare the first drawing")
      await entered.promise
      expect(store.status()).toBe("connecting")
      useDocumentStore.getState().setDocument(b)
      const targetMessages = store.messages()
      release.resolve(undefined)
      await sending
      expect(admitted).toBe(0)
      expect(useDocumentStore.getState()).toMatchObject(b)
      expect(store.status()).toBe("idle")
      expect(store.error()).toBeUndefined()
      expect(store.messages()).toEqual(targetMessages)
      expect(store.messages().some((message) => message.text === "Wrong drawing")).toBe(false)
    } finally {
      release.resolve(undefined)
      await sending
      Object.assign(drawings, { get: originalGet }); Object.assign(client, { chatStream: originalStream }); dispose()
    }
  })

  test("real navigation during unscoped project creation restores the target conversation and admits no stale stream", async () => {
    localStorage.clear()
    const target = await createDocument("Existing target conversation")
    useDocumentStore.getState().setDocument(target)
    const client = app.state.client.ai, projects = app.state.client.projects
    const originalStream = client.chatStream, originalCreate = projects.create
    let admitted = 0
    Object.assign(client, { chatStream: () => { admitted++; return Effect.succeed(eventStream([{ type: "done", sessionId: "ses_navigation_target", text: "Saved target answer" }])) } })
    const { store, dispose } = await mount()
    const entered = deferred<void>(), release = deferred<void>()
    let sending: Promise<void> | undefined
    try {
      await store.send("Remember this conversation")
      await app.wait(() => store.status() === "idle")
      const targetMessages = store.messages()
      for (const recent of app.state.recents()) app.state.forgetProject(recent.id)
      useDocumentStore.getState().clear()
      expect(store.projectId()).toBeUndefined()
      Object.assign(projects, { create: (input: Parameters<typeof originalCreate>[0]) => Effect.promise(async () => {
        entered.resolve(undefined)
        await release.promise
        return app.state.runtime.run(originalCreate(input))
      }) })
      sending = store.send("Create an unscoped workspace")
      await entered.promise
      expect(store.status()).toBe("connecting")
      useDocumentStore.getState().setDocument(target)
      expect(store.sessionId()).toBe("ses_navigation_target")
      expect(store.messages()).toEqual(targetMessages)
      release.resolve(undefined)
      await sending
      expect(admitted).toBe(1)
      expect(useDocumentStore.getState()).toMatchObject(target)
      expect(store.sessionId()).toBe("ses_navigation_target")
      expect(store.messages()).toEqual(targetMessages)
      expect(store.sessions().map((session) => session.id)).toEqual(["ses_navigation_target"])
      expect(store.status()).toBe("idle")
      expect(store.error()).toBeUndefined()
    } finally {
      release.resolve(undefined)
      await sending
      Object.assign(projects, { create: originalCreate }); Object.assign(client, { chatStream: originalStream }); dispose()
    }
  })

  test("deferred recovery filters unrelated sessions and accepts native plus client-alias completion only once", async () => {
    localStorage.clear()
    const doc = await createDocument("Recovered native session")
    useDocumentStore.getState().setDocument(doc)
    const client = app.state.client.ai
    const originalStream = client.chatStream, originalState = client.sessionState
    const entered = deferred<void>()
    const recovered = deferred<Effect.Success<ReturnType<typeof originalState>>>()
    const payloads: Parameters<typeof originalStream>[0]["payload"][] = []
    const requests: Parameters<typeof originalState>[0]["payload"][] = []
    Object.assign(client, {
      chatStream: (input: Parameters<typeof originalStream>[0]) => {
        payloads.push(input.payload)
        return Effect.succeed(eventStream([{ type: "delta", sessionId: "ses_native_recovered", text: "Partial answer" }]))
      },
      sessionState: (input: Parameters<typeof originalState>[0]) => Effect.promise(async () => {
        requests.push(input.payload)
        entered.resolve(undefined)
        return recovered.promise
      })
    })
    let mounted = await mount()
    try {
      await mounted.store.send("Recover the answer")
      await entered.promise
      await app.wait(() => mounted.store.sessionId() === "ses_native_recovered")
      const alias = payloads[0]?.sessionId
      expect(alias).toBeDefined()
      expect(alias).not.toBe("ses_native_recovered")
      expect(requests).toEqual([{ sessionId: "ses_native_recovered", projectId: doc.projectId }])
      expect(mounted.store.messages().at(-1)?.text).toBe("Partial answer")
      recovered.resolve({ busy: false, text: "Recovered answer", events: [
        { type: "tool_call", sessionId: "ses_native_recovered", callId: "recovered-check", tool: "cad_check_design", input: {} },
        { type: "tool_result", sessionId: "ses_native_recovered", callId: "recovered-check", tool: "cad_check_design", ok: true, output: '{"ok":true,"issues":[]}' },
        { type: "tool_call", sessionId: "ses_unrelated_recovery", callId: "unrelated-check", tool: "cad_check_design", input: {} },
        { type: "delta", sessionId: "ses_unrelated_recovery", text: "Unrelated answer" },
        { type: "done", sessionId: "ses_native_recovered", text: "Recovered answer" }
      ] })
      await app.wait(() => mounted.store.status() === "idle")
      expect(mounted.store.error()).toBeUndefined()
      expect(mounted.store.sessionId()).toBe("ses_native_recovered")
      expect(mounted.store.sessions()).toMatchObject([{ id: "ses_native_recovered", exchanges: 1 }])
      expect(mounted.store.stats().exchanges).toBe(1)
      expect(mounted.store.stats().toolCalls).toBe(1)
      expect(mounted.store.toolCalls()["recovered-check"]).toMatchObject({ status: "ok", sessionId: "ses_native_recovered" })
      expect(mounted.store.toolCalls()["unrelated-check"]).toBeUndefined()
      expect(mounted.store.messages().filter((message) => message.role === "assistant")).toHaveLength(1)
      expect(mounted.store.messages().at(-1)).toMatchObject({ text: "Recovered answer", status: "done" })
      expect(mounted.store.messages().flatMap((message) => message.events).some((event) => event.sessionId === "ses_unrelated_recovery")).toBe(false)
      mounted.dispose()
      mounted = await mount()
      expect(mounted.store.sessionId()).toBe("ses_native_recovered")
      expect(mounted.store.messages().at(-1)?.text).toBe("Recovered answer")
      Object.assign(client, { chatStream: (input: Parameters<typeof originalStream>[0]) => {
        payloads.push(input.payload)
        return Effect.succeed(eventStream([{ type: "done", sessionId: "ses_native_recovered", text: "Continued answer" }]))
      } })
      await mounted.store.send("Continue after recovery")
      await app.wait(() => mounted.store.status() === "idle")
      expect(payloads[1]).toMatchObject({ sessionId: "ses_native_recovered", projectId: doc.projectId })
      expect(mounted.store.sessions().some((session) => session.id === alias)).toBe(false)
    } finally {
      recovered.resolve({ busy: false, text: "Recovered answer", events: [] })
      Object.assign(client, { chatStream: originalStream, sessionState: originalState }); mounted.dispose()
    }
  })

  test("pushLiveDrawing captures geometry, layers and settings before a deferred read and writes only its original drawing", async () => {
    const a = await createDocument("Captured snapshot"), b = await createDocument("Navigation snapshot")
    const elementsBefore = useElementsStore.getState().elements
    const layersBefore = useLayerStore.getState().layers
    const settingsBefore = app.state.settings.settings()
    const drawings = app.state.client.drawings, originalGet = drawings.get, originalUpdate = drawings.update
    const entered = deferred<void>(), release = deferred<void>()
    const writes: Parameters<typeof originalUpdate>[0][] = []
    let pushing: Promise<void> | undefined
    try {
      useDocumentStore.getState().setDocument(a)
      useElementsStore.getState().clearElements()
      useElementsStore.getState().addElement({ type: "cube", name: "Original geometry", x: 1, y: 2, z: 3, width: 10, height: 20, depth: 30 })
      useLayerStore.setState({ layers: [{ id: "captured-layer", name: "Original layer", visible: true, locked: false, color: "#123456" }] })
      app.state.settings.update({ units: "mm", decimals: 2, tolerance: 0.02 })
      const captured = drawingPayload(app.state)
      const targetBefore = await app.state.runtime.run(originalGet({ params: { id: b.drawingId } }))
      Object.assign(drawings, {
        get: (input: Parameters<typeof originalGet>[0]) => Effect.promise(async () => {
          entered.resolve(undefined)
          await release.promise
          return app.state.runtime.run(originalGet(input))
        }),
        update: (input: Parameters<typeof originalUpdate>[0]) => Effect.promise(async () => {
          writes.push(input)
          return app.state.runtime.run(originalUpdate(input))
        })
      })
      pushing = pushLiveDrawing(app.state, a.drawingId)
      await entered.promise
      expect(writes).toEqual([])
      useDocumentStore.getState().setDocument(b)
      useElementsStore.getState().clearElements()
      useElementsStore.getState().addElement({ type: "sphere", name: "Target geometry", x: 9, y: 8, z: 7, radius: 4 })
      useLayerStore.setState({ layers: [{ id: "target-layer", name: "Target layer", visible: false, locked: true, color: "#654321" }] })
      app.state.settings.update({ units: "inch", decimals: 5, tolerance: 0.05 })
      const targetLive = drawingPayload(app.state)
      release.resolve(undefined)
      await pushing
      expect(writes).toHaveLength(1)
      expect(writes[0]).toMatchObject({ params: { id: a.drawingId }, payload: { data: captured } })
      expect((await app.state.runtime.run(originalGet({ params: { id: a.drawingId } }))).data).toMatchObject(captured)
      expect((await app.state.runtime.run(originalGet({ params: { id: b.drawingId } }))).data).toEqual(targetBefore.data)
      expect(useDocumentStore.getState()).toMatchObject(b)
      expect(drawingPayload(app.state)).toEqual(targetLive)
    } finally {
      release.resolve(undefined)
      await pushing
      Object.assign(drawings, { get: originalGet, update: originalUpdate })
      useElementsStore.setState({ elements: elementsBefore })
      useLayerStore.setState({ layers: layersBefore })
      app.state.settings.update(settingsBefore)
    }
  })

  test("switching projects detaches without stopping the host and ignores late old mutations", async () => {
    localStorage.clear()
    const a = await createDocument("Part A"), b = await createDocument("Part B")
    useDocumentStore.getState().setDocument(a)
    const client = app.state.client.ai
    const originalStream = client.chatStream, originalAbort = client.chatAbort
    let release!: (value: string) => void
    const late = new Promise<string>((resolve) => { release = resolve })
    let aborted = 0
    Object.assign(client, { chatAbort: () => { aborted++; return Effect.succeed({ message: "Aborted" }) },
      chatStream: () => Effect.succeed(Stream.concat(eventStream([{ type: "delta", sessionId: "ses_workspace_a", text: "Building A" }]), Stream.fromEffect(Effect.promise(() => late)))) })
    const { store, dispose } = await mount()
    try {
      await store.send("Build A")
      await app.wait(() => store.sessionId() === "ses_workspace_a")
      useDocumentStore.getState().setDocument(b)
      expect(store.messages()).toEqual([])
      expect(store.sessions()).toEqual([])
      store.openSession("ses_workspace_a")
      expect(store.sessionId()).toBeUndefined()
      release(JSON.stringify({ type: "tool_result", sessionId: "ses_workspace_a", callId: "late", tool: "cad_add_elements", ok: true, output: JSON.stringify({ elements: [{ id: "wrong-part", type: "cube", width: 10, height: 10, depth: 10 }] }) }))
      await new Promise((resolve) => setTimeout(resolve, 40))
      expect(useElementsStore.getState().elements.some((element) => element.id === "wrong-part")).toBe(false)
      expect(aborted).toBe(0)
      useDocumentStore.getState().setDocument(a)
      expect(store.sessionId()).toBe("ses_workspace_a")
      expect(store.messages().some((message) => message.text === "Building A")).toBe(true)
    } finally { Object.assign(client, { chatStream: originalStream, chatAbort: originalAbort }); dispose() }
  })

  test("native IDs and tool evidence survive remount, context opt-out reaches the wire, and restoration does not edit", async () => {
    localStorage.clear()
    const doc = await createDocument("Persistent bracket")
    useDocumentStore.getState().setDocument(doc)
    const client = app.state.client.ai, original = client.chatStream
    const payloads: unknown[] = []
    Object.assign(client, { chatStream: (input: Parameters<typeof original>[0]) => {
      payloads.push(input.payload)
      return Effect.succeed(eventStream([
        { type: "tool_call", sessionId: "ses_workspace_persist", callId: "check", tool: "cad_check_design", input: {} },
        { type: "tool_result", sessionId: "ses_workspace_persist", callId: "check", tool: "cad_check_design", ok: true, output: '{"ok":true,"issues":[]}' },
        { type: "done", sessionId: "ses_workspace_persist", text: "## Bracket\n\nChecked the saved part." }
      ]))
    } })
    let mounted = await mount()
    try {
      mounted.store.setIncludeContext(false)
      await mounted.store.send("Check the bracket")
      await app.wait(() => mounted.store.status() === "idle")
      expect(payloads[0]).toMatchObject({ projectId: doc.projectId, includeContext: false })
      expect(mounted.store.sessionId()).toBe("ses_workspace_persist")
      mounted.dispose()
      const before = useElementsStore.getState().elements
      mounted = await mount()
      expect(mounted.store.sessionId()).toBe("ses_workspace_persist")
      expect(mounted.store.toolCalls().check).toMatchObject({ status: "ok", tool: "cad_check_design" })
      expect(mounted.store.messages().at(-1)?.events.map((event) => event.type)).toEqual(["tool_call", "tool_result"])
      expect(useElementsStore.getState().elements).toBe(before)
      await mounted.store.send("Continue checking")
      await app.wait(() => mounted.store.status() === "idle")
      expect(payloads[1]).toMatchObject({ sessionId: "ses_workspace_persist", projectId: doc.projectId })
    } finally { Object.assign(client, { chatStream: original }); mounted.dispose() }
  })
})
