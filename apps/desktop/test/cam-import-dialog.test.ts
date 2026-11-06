import { expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { installDom } from "./helpers/dom.ts"

const inFolder = (file: File, path: string): File => {
  Object.defineProperty(file, "webkitRelativePath", { value: path })
  return file
}

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 15_000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("CAM file scan did not finish")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const snapshot = JSON.stringify({
  format: "cadcamfun-cam", version: 1, gcode: "G0 X3", program: cam.makeProgram("fixture", [], {}),
  settings: cam.generator.DEFAULT_SETTINGS, printer: cam.generator.DEFAULT_PRINTER_EXTRAS,
  stock: { width: 100, height: 60, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }, drawing: {}
})

test("CAM folder import lists separate programs and confirms before replacing the editor", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { default: CamImportDialog } = await import("../src/features/cam/components/CamImportDialog.tsx")
  const first = inFolder(new File(["G0 X1\nM30"], "one.nc"), "job/roughing/one.nc")
  const second = inFolder(new File(["G1 X2\nM30"], "two.tap"), "job/finishing/two.tap")
  const unsupported = inFolder(new File(["not a program"], "notes.pdf"), "job/docs/notes.pdf")
  const saved = inFolder(new File([snapshot], "saved.json"), "job/saved.json")
  const unrelated = inFolder(new File(['{"elements": []}'], "drawing.json"), "job/drawing.json")
  const malformed = inFolder(new File(["{"], "bad.json"), "job/bad.json")
  const empty = inFolder(new File(["   \n"], "empty.nc"), "job/empty.nc")
  let allow = false, confirmations = 0, closed = 0
  const opened: File[] = []
  window.confirm = () => { confirmations++; return allow }
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => CamImportDialog({ open: true, hasProgram: true, onClose: () => { closed++ }, onOpen: (file) => opened.push(file) }), root)
  try {
    const folder = document.querySelector<HTMLInputElement>('input[type="file"][webkitdirectory]')!
    expect(folder.multiple).toBe(true)
    Object.defineProperty(folder, "files", { configurable: true, value: [first, unsupported, second, saved, unrelated, malformed, empty] })
    folder.dispatchEvent(new window.Event("change", { bubbles: true }))
    await waitFor(() => Boolean(document.querySelector('[data-testid="cam-import-programs"]')) && ["job/docs/notes.pdf", "job/drawing.json", "job/bad.json", "job/empty.nc"].every((path) => document.body.textContent?.includes(path)))
    const list = document.querySelector('[data-testid="cam-import-programs"]')!
    const buttons = [...list.querySelectorAll("button")]
    expect(buttons.map((button) => button.textContent)).toEqual(["job/finishing/two.tap", "job/roughing/one.nc", "job/saved.json"])
    expect(document.body.textContent).toContain("job/docs/notes.pdf")
    buttons[1]!.click()
    expect(confirmations).toBe(1)
    expect(opened).toEqual([])
    expect(closed).toBe(0)
    allow = true
    buttons[1]!.click()
    expect(confirmations).toBe(2)
    expect(opened).toEqual([first])
    expect(await opened[0]!.text()).toBe("G0 X1\nM30")
    expect(closed).toBe(1)
  } finally { dispose(); root.remove() }
}, 60_000)

test("closing during a scan discards stale results and a later scan still works", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { createSignal } = await import("solid-js")
  const { default: CamImportDialog } = await import("../src/features/cam/components/CamImportDialog.tsx")
  let started = false
  let resolveRead: (text: string) => void = () => { throw new Error("Read did not start") }
  let setVisible: (value: boolean) => void = () => { throw new Error("Dialog did not mount") }
  const delayed = new File([], "old.nc")
  Object.defineProperty(delayed, "text", { value: () => { started = true; return new Promise<string>((resolve) => { resolveRead = resolve }) } })
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => {
    const [visible, setOpen] = createSignal(true)
    setVisible = setOpen
    return CamImportDialog({ get open() { return visible() }, hasProgram: false, onClose: () => setOpen(false), onOpen() {} })
  }, root)
  try {
    let input = document.querySelector<HTMLInputElement>('input[type="file"][webkitdirectory]')!
    Object.defineProperty(input, "files", { configurable: true, value: [delayed] })
    input.dispatchEvent(new window.Event("change", { bubbles: true }))
    await waitFor(() => started)
    expect(input.disabled).toBe(true)
    setVisible(false)
    resolveRead("G0 X1")
    await new Promise((resolve) => setTimeout(resolve, 20))
    setVisible(true)
    input = document.querySelector<HTMLInputElement>('input[type="file"][webkitdirectory]')!
    expect(input.disabled).toBe(false)
    expect(document.body.textContent).not.toContain("old.nc")
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["G1 X3"], "new.nc")] })
    input.dispatchEvent(new window.Event("change", { bubbles: true }))
    await waitFor(() => document.querySelector('[data-testid="cam-import-programs"]')?.textContent?.includes("new.nc") === true)
    expect(document.body.textContent).not.toContain("old.nc")
  } finally { dispose(); root.remove() }
}, 60_000)
