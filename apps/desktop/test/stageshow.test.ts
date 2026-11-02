/**
 * Stageshow illustrations (shared/ui/stageshow): the story clock plays through its phases,
 * rests on the poster for reduced motion, and the module previews mount without a layout.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const src = (rel: string) => readFileSync(join(import.meta.dir, "../src", rel), "utf8")

describe("stageshow", () => {
  test("every preview names a poster inside its phase table", () => {
    for (const file of ["previews.tsx", "scenes-account.tsx", "scenes-cad.tsx", "scenes-cam.tsx", "scenes-system.tsx", "scenes-pages.tsx"]) {
      const code = src(`shared/ui/stageshow/${file}`)
      for (const m of code.matchAll(/steps=\{\[([^\]]+)\]\} poster=\{(\d+)\}/g)) {
        const steps = m[1]!.split(",").length
        expect(Number(m[2])).toBeLessThan(steps - 1) // the last phase is the reset beat, never the poster
      }
    }
  })

  test("the stage is decorative and never announced", () => {
    expect(src("shared/ui/stageshow/stage.tsx")).toContain('aria-hidden="true"')
  })

  test("colours come from tokens, not literals, outside the fallback block", () => {
    const css = src("shared/ui/stageshow/stage.css")
    const body = css.slice(css.indexOf(".ss-stage {\n  position"))
    expect(body.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([])
  })

  test("motion is dropped for reduced motion", () => {
    expect(src("shared/ui/stageshow/stage.css")).toContain("prefers-reduced-motion: reduce")
    expect(src("shared/ui/stageshow/story.ts")).toContain("prefers-reduced-motion")
  })
})

describe("stageshow mounted", () => {
  test("playback follows visibility and changes to reduced motion", async () => {
    const { installDom } = await import("./helpers/dom.ts")
    installDom()
    const { createRoot } = await import("solid-js")
    const { createStory } = await import("../src/shared/ui/stageshow/story.ts")
    let visible: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined
    let motionChange: (() => void) | undefined
    const media = { matches: false, addEventListener: (_: string, fn: () => void) => { motionChange = fn }, removeEventListener: () => {} }
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => media })
    const previousObserver = globalThis.IntersectionObserver
    globalThis.IntersectionObserver = class {
      constructor(callback: typeof visible) { visible = callback }
      observe() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver
    let dispose = () => {}
    try {
      const story = createRoot((end) => {
        dispose = end
        const result = createStory({ steps: [10, 100], poster: 1 })
        result.watch(document.createElement("div"))
        return result
      })
      expect(story.phase()).toBe(1)
      visible?.([{ isIntersecting: true }])
      expect(story.phase()).toBe(0)
      media.matches = true
      motionChange?.()
      expect(story.phase()).toBe(1)
      media.matches = false
      motionChange?.()
      expect(story.phase()).toBe(0)
      visible?.([{ isIntersecting: false }])
      expect(story.phase()).toBe(1)
    } finally {
      dispose()
      globalThis.IntersectionObserver = previousObserver
    }
  })

  test("page scenes mount, every one decorative", async () => {
    const { installDom } = await import("./helpers/dom.ts")
    installDom()
    const { render } = await import("solid-js/web")
    const {
      AnalyticsScene, CommitScene, DocumentScene, FlagsScene, PasskeyScene, SessionsScene, TimelineScene
    } = await import("../src/shared/ui/stageshow/index.ts")
    const root = document.createElement("div")
    document.body.replaceChildren(root)
    const dispose = render(() => [
      AnalyticsScene(), CommitScene(), DocumentScene(), FlagsScene(), PasskeyScene(), SessionsScene(), TimelineScene()
    ], root)
    try {
      expect(root.querySelectorAll(".ss-stage").length).toBe(7)
      expect([...root.querySelectorAll(".ss-stage")].every((el) => el.getAttribute("aria-hidden") === "true")).toBe(true)
    } finally { dispose() }
  }, 20_000)

  test("module previews, the empty state and the skeleton render under happy-dom", async () => {
    const { installDom } = await import("./helpers/dom.ts")
    installDom()
    const { render } = await import("solid-js/web")
    const { ModulePreview, LostPreview } = await import("../src/shared/ui/stageshow/index.ts")
    const { StageEmpty, StageLoading } = await import("../src/shared/components/WorkspacePage.tsx")
    const root = document.createElement("div")
    document.body.replaceChildren(root)
    const dispose = render(() => [
      ModulePreview({ module: "cad" }),
      ModulePreview({ module: "cam" }),
      ModulePreview({ module: "projects" }),
      ModulePreview({ module: "lost" }),
      LostPreview({ code: "404" }),
      StageEmpty({ icon: null, title: "Empty", hint: "Nothing yet", preview: "cam" }),
      StageLoading({ label: "Loading things" })
    ], root)
    try {
      expect(root.querySelectorAll(".ss-stage").length).toBe(6)
      expect([...root.querySelectorAll(".ss-stage")].every((el) => el.getAttribute("aria-hidden") === "true")).toBe(true)
      expect(root.querySelector(".workspace-empty__preview .ss-stage")).not.toBeNull()
      expect(root.querySelector(".workspace-empty__icon")).toBeNull()
      expect(root.querySelector("[role=status]")?.textContent).toContain("Loading things")
      expect(root.textContent).toContain("404")
    } finally { dispose() }
  })
})
