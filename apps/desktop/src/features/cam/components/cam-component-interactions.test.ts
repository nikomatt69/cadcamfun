import { expect, test } from "bun:test"
import { installDom } from "../../../../test/helpers/dom.ts"

test("the strategy palette follows upstream operation and family changes", async () => {
  installDom()
  const { createSignal } = await import("solid-js")
  const { render } = await import("solid-js/web")
  const { default: StrategyPalette } = await import("./generator/StrategyPalette.tsx")
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  let changeOperation!: (value: string) => void
  let changeFamily!: (value: "mill" | "lathe") => void
  const dispose = render(() => {
    const [operation, setOperation] = createSignal("contour")
    const [family, setFamily] = createSignal<"mill" | "lathe">("mill")
    changeOperation = setOperation
    changeFamily = setFamily
    return StrategyPalette({ get family() { return family() }, get activeOperation() { return operation() } })
  }, root)
  const selected = (id: string) => root.querySelector(`[data-palette-id="${id}"]`)?.getAttribute("aria-pressed")
  try {
    expect(selected("contour")).toBe("true")
    changeOperation("pocket")
    await Promise.resolve()
    expect(selected("contour")).toBe("false")
    expect(selected("pocket")).toBe("true")
    changeFamily("lathe")
    changeOperation("facing")
    await Promise.resolve()
    expect(selected("facing")).toBe("true")
    expect(selected("pocket")).toBeUndefined()
  } finally { dispose() }
}, 120_000)

test("saved operations expose independent selection and deletion controls", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { default: OperationsList } = await import("./OperationsList.tsx")
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  let selected: string | undefined
  let deleted: string | undefined
  window.confirm = () => true
  const dispose = render(() => OperationsList({
    toolpaths: [{ id: "one", name: "Pocket roughing", toolId: "T1", moves: 12 }],
    selectedId: "one", onSelect: (id) => { selected = id }, onDelete: (id) => { deleted = id }
  }), root)
  try {
    const row = root.querySelector('[role="listitem"]')!
    const buttons = row.querySelectorAll<HTMLButtonElement>("button")
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true")
    expect(buttons[1]!.getAttribute("aria-label")).toContain("Pocket roughing")
    buttons[0]!.click()
    expect(selected).toBe("one")
    selected = undefined
    buttons[1]!.click()
    expect(deleted).toBe("one")
    expect(selected).toBeUndefined()
  } finally { dispose() }
}, 120_000)
