import { expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

const drawing = (name: string, id: string) => new File([JSON.stringify({ elements: [{ id, layerId: "foreign-layer", type: "line", name, x1: 0, y1: 0, x2: 10, y2: 0 }] })], `${name}.json`)
const obj = (name: string) => new File(["o Triangle\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"], `${name}.obj`)
const inFolder = (file: File, path: string): File => {
  Object.defineProperty(file, "webkitRelativePath", { value: path })
  return file
}

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const end = Date.now() + 15_000
  while (!predicate()) {
    if (Date.now() > end) throw new Error("Import dialog did not finish")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

test("CAD import accepts multiple files as one undoable batch and reports failures", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { MemoryRouter, Route } = await import("@solidjs/router")
  const { createFakeApi } = await import("../src/testing/fake-api.ts")
  const { runtimeForClient } = await import("../src/app/client.ts")
  const { createAppState, AppProvider } = await import("../src/shared/state/context.ts")
  const { useElementsStore } = await import("../src/features/cad/store/elementsStore.ts")
  const { default: ImportExportDialog } = await import("../src/features/cad/components/ImportExportDialog.tsx")
  useElementsStore.setState({ elements: [], selectedElement: null, selectedElements: [], history: [[]], currentHistoryIndex: 0 })
  useElementsStore.getState().addElement({ type: "line", name: "Existing drawing", x1: 0, y1: 0, x2: 5, y2: 0 })
  const before = useElementsStore.getState().elements[0]!
  const client = createFakeApi()
  const app = createAppState({ client, runtime: runtimeForClient(client), sidecar: "fake" })
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => MemoryRouter({ children: Route({ path: "/", component: () => AppProvider({ state: app, get children() { return ImportExportDialog({ isOpen: true, mode: "import", onClose() {} }) } }) }) }), root)
  try {
    const input = document.querySelector<HTMLInputElement>('[data-testid="cad-import-files"]')!
    expect(input.multiple).toBe(true)
    Object.defineProperty(input, "files", { configurable: true, value: [drawing("one", "same-id"), obj("two"), new File(["{"], "broken.json"), new File(["native"], "part.SLDPRT")] })
    input.dispatchEvent(new window.Event("change", { bubbles: true }))
    await waitFor(() => document.querySelector('[data-testid="cad-import-report"]') !== null)
    const state = useElementsStore.getState()
    expect(state.elements).toHaveLength(3)
    expect(state.elements[0]?.id).toBe(before.id)
    expect(state.elements.some((element) => element.type === "mesh")).toBe(true)
    const report = document.querySelector('[data-testid="cad-import-report"]')!.textContent ?? ""
    expect(report).toContain("broken.json")
    expect(report).toContain("part.SLDPRT")
    state.undo()
    expect(useElementsStore.getState().elements.map((element) => element.id)).toEqual([before.id])
  } finally { dispose(); app.dispose(); root.remove() }
}, 60_000)

test("CAD import selects a recursive folder and keeps nested paths in the report", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { MemoryRouter, Route } = await import("@solidjs/router")
  const { createFakeApi } = await import("../src/testing/fake-api.ts")
  const { runtimeForClient } = await import("../src/app/client.ts")
  const { createAppState, AppProvider } = await import("../src/shared/state/context.ts")
  const { useElementsStore } = await import("../src/features/cad/store/elementsStore.ts")
  const { default: ImportExportDialog } = await import("../src/features/cad/components/ImportExportDialog.tsx")
  useElementsStore.setState({ elements: [], selectedElement: null, selectedElements: [], history: [[]], currentHistoryIndex: 0 })
  const client = createFakeApi()
  const app = createAppState({ client, runtime: runtimeForClient(client), sidecar: "fake" })
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => MemoryRouter({ children: Route({ path: "/", component: () => AppProvider({ state: app, get children() { return ImportExportDialog({ isOpen: true, mode: "import", onClose() {} }) } }) }) }), root)
  try {
    const input = document.querySelector<HTMLInputElement>('[data-testid="cad-import-folder"]')!
    expect(input.multiple).toBe(true)
    expect(input.hasAttribute("webkitdirectory")).toBe(true)
    Object.defineProperty(input, "files", { configurable: true, value: [
      inFolder(obj("part"), "assembly/sub/part.obj"),
      inFolder(new File(["bad"], "broken.obj"), "assembly/other/broken.obj"),
      inFolder(new File(["native"], "assy.SLDASM"), "assembly/assy.SLDASM")
    ] })
    input.dispatchEvent(new window.Event("change", { bubbles: true }))
    await waitFor(() => document.querySelector('[data-testid="cad-import-report"]') !== null)
    expect(useElementsStore.getState().elements).toHaveLength(1)
    const report = document.querySelector('[data-testid="cad-import-report"]')!.textContent ?? ""
    expect(report).toContain("assembly/other/broken.obj")
    expect(report).toContain("assembly/assy.SLDASM")
    useElementsStore.getState().undo()
    expect(useElementsStore.getState().elements).toHaveLength(0)
  } finally { dispose(); app.dispose(); root.remove() }
}, 60_000)

test("closing the dialog while a file is being read cannot add a stale batch", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { createSignal } = await import("solid-js")
  const { MemoryRouter, Route } = await import("@solidjs/router")
  const { createFakeApi } = await import("../src/testing/fake-api.ts")
  const { runtimeForClient } = await import("../src/app/client.ts")
  const { createAppState, AppProvider } = await import("../src/shared/state/context.ts")
  const { useElementsStore } = await import("../src/features/cad/store/elementsStore.ts")
  const { default: ImportExportDialog } = await import("../src/features/cad/components/ImportExportDialog.tsx")
  useElementsStore.setState({ elements: [], selectedElement: null, selectedElements: [], history: [[]], currentHistoryIndex: 0 })
  const client = createFakeApi()
  const app = createAppState({ client, runtime: runtimeForClient(client), sidecar: "fake" })
  const root = document.createElement("div")
  document.body.append(root)
  let close = () => {}
  let resolveRead: (text: string) => void = () => { throw new Error("Read did not start") }
  let started = false
  const file = new File([], "delayed.json")
  Object.defineProperty(file, "text", { value: () => { started = true; return new Promise<string>((resolve) => { resolveRead = resolve }) } })
  const dispose = render(() => MemoryRouter({ children: Route({ path: "/", component: () => AppProvider({ state: app, get children() {
    const [open, setOpen] = createSignal(true)
    close = () => setOpen(false)
    return ImportExportDialog({ get isOpen() { return open() }, mode: "import", onClose: close })
  } }) }) }), root)
  try {
    const input = document.querySelector<HTMLInputElement>('[data-testid="cad-import-files"]')!
    Object.defineProperty(input, "files", { configurable: true, value: [file] })
    input.dispatchEvent(new window.Event("change", { bubbles: true }))
    await waitFor(() => started)
    close()
    resolveRead(JSON.stringify({ elements: [{ type: "line", x1: 0, y1: 0, x2: 1, y2: 1 }] }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(useElementsStore.getState().elements).toEqual([])
    expect(useElementsStore.getState().history).toEqual([[]])
  } finally { dispose(); app.dispose(); root.remove() }
}, 60_000)

test("a batch being read is not added to a different drawing after navigation", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { MemoryRouter, Route } = await import("@solidjs/router")
  const { createFakeApi } = await import("../src/testing/fake-api.ts")
  const { runtimeForClient } = await import("../src/app/client.ts")
  const { createAppState, AppProvider } = await import("../src/shared/state/context.ts")
  const { useElementsStore } = await import("../src/features/cad/store/elementsStore.ts")
  const { useDocumentStore } = await import("../src/features/cad/store/documentStore.ts")
  const { default: ImportExportDialog } = await import("../src/features/cad/components/ImportExportDialog.tsx")
  useElementsStore.setState({ elements: [], selectedElement: null, selectedElements: [], history: [[]], currentHistoryIndex: 0 })
  useDocumentStore.getState().setDocument({ projectId: "old-project", drawingId: "old-drawing" })
  const client = createFakeApi()
  const app = createAppState({ client, runtime: runtimeForClient(client), sidecar: "fake" })
  const root = document.createElement("div")
  document.body.append(root)
  let resolveRead: (text: string) => void = () => { throw new Error("Read did not start") }
  let started = false
  const file = new File([], "delayed.json")
  Object.defineProperty(file, "text", { value: () => { started = true; return new Promise<string>((resolve) => { resolveRead = resolve }) } })
  const dispose = render(() => MemoryRouter({ children: Route({ path: "/", component: () => AppProvider({ state: app, get children() {
    return ImportExportDialog({ isOpen: true, mode: "import", onClose() {} })
  } }) }) }), root)
  try {
    const input = document.querySelector<HTMLInputElement>('[data-testid="cad-import-files"]')!
    Object.defineProperty(input, "files", { configurable: true, value: [file] })
    input.dispatchEvent(new window.Event("change", { bubbles: true }))
    await waitFor(() => started)
    expect(input.disabled).toBe(true)
    useDocumentStore.getState().setDocument({ projectId: "new-project", drawingId: "new-drawing" })
    useElementsStore.getState().addElement({ type: "line", name: "New drawing", x1: 0, y1: 0, x2: 4, y2: 0 })
    const newElementId = useElementsStore.getState().elements[0]!.id
    const historyIndex = useElementsStore.getState().currentHistoryIndex
    resolveRead(JSON.stringify({ elements: [{ type: "line", name: "Old file", x1: 0, y1: 0, x2: 1, y2: 1 }] }))
    await waitFor(() => !input.disabled)
    expect(useElementsStore.getState().elements.map((element) => element.id)).toEqual([newElementId])
    expect(useElementsStore.getState().currentHistoryIndex).toBe(historyIndex)
    expect(document.querySelector('[data-testid="cad-import-report"]')).toBeNull()
  } finally { dispose(); app.dispose(); useDocumentStore.getState().clear(); root.remove() }
}, 60_000)
