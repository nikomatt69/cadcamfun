/**
 * happy-dom must walk siblings the way a browser does.
 *
 * Solid's compiled templates chain `firstChild`/`nextSibling` across the whole template, so a
 * proxied element whose own getters miss its parent's children crashes on mount (this is what
 * took `/drawings/:id` down: a `<select>` in `ViewportControls`). This file pins both the raw
 * DOM behaviour and the component that first exposed it.
 */
import { expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

const templateChildren = (html: string): { first: string; next: string | null } => {
  const template = document.createElement("template")
  template.innerHTML = html
  const root = template.content.firstChild as Element
  const first = root.firstChild as Element
  return { first: first.nodeName, next: first.nextSibling?.nodeName ?? null }
}

test("a <select> followed by a sibling resolves through nextSibling", () => {
  installDom()
  expect(templateChildren("<div><select></select><span></span></div>"))
    .toEqual({ first: "SELECT", next: "SPAN" })
  expect(templateChildren("<div><select></select><select></select><button></button></div>"))
    .toEqual({ first: "SELECT", next: "SELECT" })
})

test("a <form> followed by a sibling resolves through nextSibling", () => {
  installDom()
  expect(templateChildren("<div><form></form><span></span></div>"))
    .toEqual({ first: "FORM", next: "SPAN" })
})

test("ViewportControls mounts over a multi-element template", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { ViewportControls } = await import("../src/viewport/view3d/viewport-controls.tsx")
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const dispose = render(() => ViewportControls({
    preset: "perspective", mode: "shaded", grid: true, axes: true, enabled: false,
    transform: "none", canTransform: false,
    onPreset: () => {}, onMode: () => {}, onGrid: () => {},
    onAxes: () => {}, onFit: () => {}, onFullscreen: () => {}, onTransform: () => {}
  } as never), root)
  const text = root.textContent ?? ""
  const options = root.querySelectorAll("option").length
  dispose()
  expect(text).toContain("Fit to view")
  // 9 view presets + 4 render modes
  expect(options).toBe(13)
})
