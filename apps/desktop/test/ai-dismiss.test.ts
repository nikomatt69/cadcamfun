/**
 * The rule every menu in the assistant follows: it closes when the user clicks
 * outside it or presses Escape.
 *
 * It used to be written out three times — the model menu, the run-control menus
 * and the drawing scope menu each installed their own listeners. The three copies
 * were the same code, so the rule is now one module, and this is its test.
 */
import { describe, expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"
import { createRoot, createSignal } from "solid-js"

installDom("http://localhost/ai")

const { createDismissable } = await import("../src/features/ai/lib/dismiss.ts")

interface Fixture {
  readonly closed: () => number
  readonly open: (next: boolean) => void
  readonly dispose: () => void
}

const fixture = (): Fixture => {
  const root = document.createElement("div")
  root.innerHTML = '<div class="menu-root"><button class="inside">inside</button></div><button class="outside">outside</button>'
  document.body.append(root)
  let closes = 0
  let open = true
  const dispose = createRoot((disposeRoot) => {
    const [openSignal, setOpen] = createSignal(true)
    createDismissable({ open: openSignal, root: ".menu-root", onDismiss: () => { closes += 1; setOpen(false) } })
    return () => { disposeRoot(); root.remove() }
  })
  return { closed: () => closes, open: (next) => { open = next }, dispose }
}

const pointerDown = (selector: string): void => {
  const element = document.querySelector(selector)
  if (element === null) throw new Error(`No element for ${selector}`)
  element.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }))
}

const escape = (): void => {
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
}

describe("a menu that closes itself", () => {
  test("a click inside it leaves it open", () => {
    const menu = fixture()
    try {
      pointerDown(".inside")
      expect(menu.closed()).toBe(0)
    } finally { menu.dispose() }
  })

  test("a click outside it closes it", () => {
    const menu = fixture()
    try {
      pointerDown(".outside")
      expect(menu.closed()).toBe(1)
    } finally { menu.dispose() }
  })

  test("Escape closes it", () => {
    const menu = fixture()
    try {
      escape()
      expect(menu.closed()).toBe(1)
    } finally { menu.dispose() }
  })

  test("a menu that is not open has no listeners, so nothing closes it twice", async () => {
    const menu = fixture()
    try {
      // Closed: the effect that installs the listeners is not running.
      const closed = createRoot((disposeRoot) => {
        const [open, setOpen] = createSignal(false)
        let closes = 0
        createDismissable({ open, root: ".menu-root", onDismiss: () => { closes += 1; setOpen(false) } })
        setOpen(false)
        queueMicrotask(() => disposeRoot())
        return { closes: () => closes }
      })
      await new Promise((resolve) => setTimeout(resolve, 10))
      pointerDown(".outside")
      expect(closed.closes()).toBe(0)
    } finally { menu.dispose() }
  })

  test("the listeners are gone once the menu is disposed", () => {
    const menu = fixture()
    const before = menu.closed()
    menu.dispose()
    // The fixture is gone; the document must not have kept a listener that
    // would reach a menu that no longer exists.
    const outside = document.createElement("button")
    outside.className = "outside"
    document.body.append(outside)
    outside.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }))
    outside.remove()
    expect(menu.closed()).toBe(before)
  })
})
