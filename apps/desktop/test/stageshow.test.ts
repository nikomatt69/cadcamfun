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
    const code = src("shared/ui/stageshow/previews.tsx")
    for (const m of code.matchAll(/steps=\{\[([^\]]+)\]\} poster=\{(\d+)\}/g)) {
      const steps = m[1]!.split(",").length
      expect(Number(m[2])).toBeLessThan(steps - 0)
      expect(Number(m[2])).toBeLessThan(steps - 1) // the last phase is the reset beat, never the poster
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
      LostPreview({ code: "404" }),
      StageEmpty({ icon: null, title: "Empty", hint: "Nothing yet", preview: "cam" }),
      StageLoading({ label: "Loading things" })
    ], root)
    try {
      expect(root.querySelectorAll(".ss-stage").length).toBe(5)
      expect([...root.querySelectorAll(".ss-stage")].every((el) => el.getAttribute("aria-hidden") === "true")).toBe(true)
      expect(root.querySelector(".workspace-empty__preview .ss-stage")).not.toBeNull()
      expect(root.querySelector(".workspace-empty__icon")).toBeNull()
      expect(root.querySelector("[role=status]")?.textContent).toContain("Loading things")
      expect(root.textContent).toContain("404")
    } finally { dispose() }
  })
})
