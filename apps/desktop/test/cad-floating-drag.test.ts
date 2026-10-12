import { expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

test("floating tools remain visible when dragging beyond the canvas and resizing", async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { default: FloatingToolbar } = await import("../src/features/cad/components/FloatingToolbar.tsx")
  const host = document.createElement("div")
  document.body.append(host)
  let width = 600
  let height = 400
  Object.defineProperties(host, { clientWidth: { get: () => width }, clientHeight: { get: () => height } })
  host.getBoundingClientRect = () => ({ left: 200, top: 100, width: width * .5, height: height * .5 }) as DOMRect
  let canvasInputs = 0
  host.addEventListener("pointerdown", () => canvasInputs++)
  const dispose = render(() => FloatingToolbar({ initialPosition: { x: 100, y: 100 } }), host)
  try {
    const toolbar = host.querySelector<HTMLElement>('[data-testid="cad-floating-toolbar"]')!
    Object.defineProperties(toolbar, { offsetWidth: { value: 340 }, offsetHeight: { value: 250 } })
    const header = host.querySelector<HTMLElement>(".cad-floating-header")!
    Object.assign(header, { setPointerCapture: () => {}, hasPointerCapture: () => true, releasePointerCapture: () => {} })
    header.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, button: 0, clientX: 300, clientY: 180 }))
    header.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 1000, clientY: 900 }))
    header.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }))
    expect(canvasInputs).toBe(0)
    expect(toolbar.style.left).toBe("260px")
    expect(toolbar.style.top).toBe("150px")
    expect(toolbar.isConnected).toBe(true)
    header.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowLeft" }))
    expect(toolbar.style.left).toBe("250px")
    width = 400; height = 300
    window.dispatchEvent(new Event("resize"))
    expect(toolbar.style.left).toBe("60px")
    expect(toolbar.style.top).toBe("50px")
    header.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 2, button: 0, clientX: 300, clientY: 180 }))
    header.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 2, clientX: -100, clientY: -100 }))
    header.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 2 }))
    expect(toolbar.style.left).toBe("0px")
    expect(toolbar.style.top).toBe("0px")
    expect(header.className).toContain("cursor-grab")
    expect(header.className).not.toContain("cursor-grabbing")
  } finally { dispose(); host.remove() }
}, 60000)
