/**
 * Boot splash rendering (spec 06-desktop-ui.md §1).
 *
 * The splash is the first thing the user sees, so the mark above the status
 * lines is the only "still working" signal: the CADCAMFUN cube pulses, and no
 * spinner sits next to it.
 */
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { installDom } from "./helpers/dom.ts"

test("the splash shows the pulsing CADCAMFUN mark above the sidecar status", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { BootScreen } = await import("../src/shared/components/boot-screen.tsx")
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const dispose = render(() => BootScreen({ state: { _tag: "checking" }, elapsedSeconds: 2, onRetry: () => undefined }), root)
  try {
    // The mark: the CADCAMFUN asset icon, and nothing else above the texts.
    const mark = root.querySelector<HTMLImageElement>("img.boot-mark-image")
    expect(mark).not.toBeNull()
    expect(mark?.getAttribute("src")).toBe("/icon.png")
    expect(mark?.getAttribute("alt")).toBe("")

    // No spinner is left in the splash.
    expect(root.querySelector("svg")).toBeNull()

    // The mark is the first child of the status column, the texts follow.
    const column = root.querySelector(".boot-mark")?.parentElement
    expect(column?.firstElementChild?.className).toContain("boot-mark")
    expect(root.textContent).toContain("Checking the API")
    expect(root.textContent).toContain("Waiting for the sidecar to answer")
    expect(root.textContent).toContain("Waited 2 s")
  } finally { dispose(); root.remove() }
})

test("the mark is animated by the splash stylesheet, and reduced motion stops it", () => {
  const css = readFileSync(join(import.meta.dir, "../src/shared/components/boot-screen.css"), "utf8")
  expect(css).toContain("@keyframes boot-mark-pulse")
  expect(css).toContain(".boot-mark-image")
  expect(css).toContain("prefers-reduced-motion")
})
