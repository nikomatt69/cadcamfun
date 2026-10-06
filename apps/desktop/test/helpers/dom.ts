/** A happy-dom window installed as the global DOM; `fetch`, `Request` and friends stay Bun's own. */
import { Window } from "happy-dom"

/**
 * happy-dom 18 wraps form-associated elements (`<form>`, `<select>`) in a `Proxy` (for
 * `form.elements` style lookups), but the node's own getters then run on the unwrapped
 * target, so `select.nextSibling` can never find itself among its parent's children and
 * returns `null`. Solid's compiled templates walk the DOM with `firstChild`/`nextSibling`,
 * so any proxied element followed by a sibling would crash on mount. Browsers have no such
 * proxy; here those elements are simply left unwrapped.
 */
const PROXIED = new Set(["HTMLFormElement", "HTMLSelectElement"])
let proxiesUnwrapped = false
const unwrapElementProxies = (): void => {
  if (proxiesUnwrapped) return
  proxiesUnwrapped = true
  const NativeProxy = Proxy
  globalThis.Proxy = new NativeProxy(NativeProxy, {
    construct: (target, args: [object, ProxyHandler<object>]) =>
      PROXIED.has((args[0] as { constructor?: { name?: string } }).constructor?.name ?? "")
        ? args[0]
        : Reflect.construct(target, args)
  })
}

export function installDom(url = "http://localhost/"): Window {
  unwrapElementProxies()
  const win = new Window({ url })
  const g = globalThis as Record<string, unknown>
  for (const key of [
    "window", "document", "navigator", "location", "history", "localStorage", "sessionStorage", "HTMLElement", "HTMLInputElement",
    "HTMLTextAreaElement", "HTMLSelectElement", "HTMLFormElement", "HTMLAnchorElement", "HTMLButtonElement", "Node", "Element",
    "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "InputEvent", "FocusEvent", "SubmitEvent", "PointerEvent",
    "MutationObserver", "ResizeObserver", "IntersectionObserver", "DOMParser", "getComputedStyle", "matchMedia",
    "requestAnimationFrame", "cancelAnimationFrame", "CSS", "Image", "SVGElement", "DocumentFragment", "ShadowRoot", "customElements"
  ] as const) {
    const value = (win as unknown as Record<string, unknown>)[key]
    if (value === undefined) continue
    try { Object.defineProperty(g, key, { value, configurable: true, writable: true }) } catch { /* read-only on some runtimes */ }
  }
  g["self"] = g["window"] ?? win
  return win
}
