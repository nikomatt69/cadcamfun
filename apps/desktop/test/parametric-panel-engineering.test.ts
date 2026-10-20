/**
 * The Parametric part panel, mounted for real over the elements store: the engineering shortcuts (fillet, shell, grid), the inline
 * issues under a feature, the Manufacturability section and the Recipes picker. Every edit goes through `elements.updateElement`, so
 * what the tests read back is the stored history and what the panel shows of it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { RECIPES, buildRecipe, historyVolume, plateTemplate, rebuild, type History } from "@cadcamfun/core"
import { installDom } from "./helpers/dom.ts"

type Store = typeof import("../src/features/cad/store/elementsStore.ts")["useElementsStore"]
let useElementsStore: Store
let mountPanel: (history: History) => { readonly id: string; readonly dispose: () => void }
let realConfirm: typeof window.confirm
let confirms: string[] = []
let answer = true

const SLOW = 90_000
const tick = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const q = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector)
const byId = (id: string): HTMLElement | null => q(`[data-testid="${id}"]`)
const text = (id: string): string => byId(id)?.textContent ?? ""
const input = (label: string): HTMLInputElement | HTMLSelectElement => {
  const found = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)
  if (found === null) throw new Error(`No control labelled '${label}'`)
  return found
}
const button = (label: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim() === label)
  if (found === undefined) throw new Error(`No button '${label}'`)
  return found
}
/** Waits until the condition holds (Solid flushes synchronously, but the DFM check runs on a timer). */
const until = async (condition: () => boolean, ms = 30_000): Promise<void> => {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error("Timed out waiting for the panel")
    await tick(20)
  }
}
const change = async (label: string, value: string): Promise<void> => {
  const control = input(label)
  control.value = value
  control.dispatchEvent(new Event("change", { bubbles: true }))
  await tick()
}
const typeInto = async (label: string, value: string): Promise<void> => {
  const control = input(label)
  control.value = value
  control.dispatchEvent(new Event("input", { bubbles: true }))
  await tick()
}
const click = async (label: string): Promise<void> => { button(label).click(); await tick(60) }

const stored = (id: string): History => useElementsStore.getState().elements.find((e) => e.id === id)!["history"] as History
const volume = (id: string): number => historyVolume(rebuild(stored(id)))
const summary = (): string => text("parametric-summary")

/** The starting plate (60 x 40 x 8 with a Ø10 hole) and a rectangular pocket with sharp corners cut into it. */
const pocketed = (): History => {
  const base = plateTemplate()
  return {
    parameters: base.parameters,
    features: [
      ...base.features,
      {
        id: "pk", type: "sketch", plane: "XY", offset: "thick",
        sketch: {
          entities: [
            { id: "a", kind: "point", x: 5, y: 5 }, { id: "b", kind: "point", x: 20, y: 5 }, { id: "c", kind: "point", x: 20, y: 12 }, { id: "d", kind: "point", x: 5, y: 12 },
            { id: "l1", kind: "line", p1: "a", p2: "b" }, { id: "l2", kind: "line", p1: "b", p2: "c" }, { id: "l3", kind: "line", p1: "c", p2: "d" }, { id: "l4", kind: "line", p1: "d", p2: "a" }
          ],
          constraints: [{ type: "fixed", point: "a", x: 5, y: 5 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" }, { type: "length", line: "l1", value: 15 }, { type: "length", line: "l2", value: 7 }]
        }
      },
      { id: "pocket", type: "extrude", sketch: "pk", depth: 3, direction: "down", operation: "subtract" }
    ]
  }
}

beforeAll(async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { createComponent } = await import("solid-js")
  const { default: ParametricPanel } = await import("../src/features/cad/components/ParametricPanel.tsx")
  ;({ useElementsStore } = await import("../src/features/cad/store/elementsStore.ts"))
  mountPanel = (history) => {
    const id = useElementsStore.getState().addElement({ type: "parametric", x: 0, y: 0, z: 0, history })
    const host = document.createElement("div")
    document.body.append(host)
    const dispose = render(() => {
      // Read through the reactive view, as PropertyPanel does, so an edit re-renders the panel.
      const store = useElementsStore()
      return createComponent(ParametricPanel, { get element() { return store.elements.find((e) => e.id === id)! }, locked: false })
    }, host)
    return { id, dispose: () => { dispose(); host.remove() } }
  }
  realConfirm = window.confirm
  window.confirm = (message?: string) => { confirms.push(String(message)); return answer }
})
afterAll(() => { window.confirm = realConfirm })

let mounted: ReturnType<typeof mountPanel> | undefined
beforeEach(() => { confirms = []; answer = true })
const open = async (history: History): Promise<string> => {
  mounted?.dispose()
  mounted = mountPanel(history)
  await tick(50)
  return mounted.id
}
const close = (): void => { mounted?.dispose(); mounted = undefined; useElementsStore.setState({ elements: [], selectedElement: null }) }

describe("the panel shows the part", () => {
  test("the starting plate: one solid, its features with their dimensions, no problems", async () => {
    await open(plateTemplate())
    expect(byId("parametric-panel")).not.toBeNull()
    expect(summary()).toMatch(/^1 solid, /)
    for (const id of ["sketch1", "plate", "hole1"]) expect(byId(`feature-${id}`)).not.toBeNull()
    expect(byId("parametric-issues")).toBeNull()
    expect(byId("dfm-section")).not.toBeNull()
    expect(byId("recipes-section")).not.toBeNull()
    expect(byId("add-feature")).not.toBeNull()
    close()
  }, SLOW)
})

describe("every recipe renders in the panel", () => {
  const defaults = (name: string): Record<string, unknown> => (name === "stepped_shaft" ? { sections: [{ diameter: 20, length: 30 }, { diameter: 30, length: 50 }], keywaySection: 1 } : {})

  test("the picker lists the seven recipes with their titles and a control for each parameter", async () => {
    await open(plateTemplate())
    const options = [...input("Recipe").querySelectorAll("option")].map((o) => o.textContent)
    expect(options).toEqual(RECIPES.map((r) => r.title))
    expect(RECIPES).toHaveLength(7)
    for (const recipe of RECIPES) {
      await change("Recipe", recipe.name)
      for (const param of recipe.params) expect(document.querySelector(`[aria-label="Recipe ${param.name}"]`), `${recipe.name}.${param.name}`).not.toBeNull()
    }
    close()
  }, SLOW)

  test.each(RECIPES.map((r) => r.name))("%s: mounted as the part, every feature is listed and the part is one solid", async (name) => {
    const built = buildRecipe(name, defaults(name))
    await open(built.history)
    expect(byId("parametric-panel")).not.toBeNull()
    for (const feature of built.history.features) expect(byId(`feature-${feature.id}`), `${name}: ${feature.id}`).not.toBeNull()
    expect(summary()).toMatch(/^1 solid, /)
    expect(byId("parametric-issues")).toBeNull()
    for (const parameter of Object.keys(built.history.parameters)) expect(byId(`parameter-${parameter}`), `${name}: parameter ${parameter}`).not.toBeNull()
    close()
  }, SLOW)

  test.each(RECIPES.map((r) => r.name))("%s: chosen in the picker and confirmed, it replaces the history and the result is shown", async (name) => {
    const id = await open(plateTemplate())
    await change("Recipe", name)
    if (name === "stepped_shaft") {
      await typeInto("Recipe sections", JSON.stringify(defaults(name)["sections"]))
      await typeInto("Recipe keywaySection", String(defaults(name)["keywaySection"]))
    }
    await click("Replace with recipe")
    const expected = buildRecipe(name, defaults(name))
    expect(confirms).toHaveLength(1)
    expect(confirms[0]).toContain("recipe")
    expect(stored(id).features.map((f) => f.id)).toEqual(expected.history.features.map((f) => f.id))
    expect(text("recipe-result")).toContain(expected.summary)
    for (const feature of expected.history.features) expect(byId(`feature-${feature.id}`), `${name}: ${feature.id}`).not.toBeNull()
    expect(summary()).toMatch(/^1 solid, /)
    close()
  }, SLOW)
})

describe("the Recipes picker asks before it replaces", () => {
  test("a refused confirmation changes nothing; a confirmed one replaces the history and clears the old report", async () => {
    const id = await open(plateTemplate())
    const before = JSON.stringify(stored(id))
    await change("Recipe", "mounting_plate")
    answer = false
    await click("Replace with recipe")
    expect(confirms).toHaveLength(1)
    expect(confirms[0]).toContain("Mounting plate")
    expect(JSON.stringify(stored(id))).toBe(before)
    expect(byId("recipe-result")).toBeNull()

    await click("Check design rules")
    await until(() => byId("dfm-report") !== null)
    answer = true
    await click("Replace with recipe")
    expect(confirms).toHaveLength(2)
    expect(stored(id).features.map((f) => f.id)).toContain("hole_sw")
    expect(text("recipe-result")).toContain("plate")
    expect(byId("dfm-report")).toBeNull() // the report was of the old history
    close()
  }, SLOW)

  test("a parameter that breaks a design rule is shown as the message of the rule and the part is left alone", async () => {
    const id = await open(plateTemplate())
    const before = JSON.stringify(stored(id))
    await change("Recipe", "mounting_plate")
    await typeInto("Recipe fastener", "M7")
    await click("Replace with recipe")
    expect(q('[role="alert"]')?.textContent ?? "").toContain("Unknown metric thread 'M7'")
    expect(confirms).toEqual([]) // refused before asking
    expect(JSON.stringify(stored(id))).toBe(before)
    await typeInto("Recipe fastener", "M8")
    await typeInto("Recipe edgeDistance", "8")
    await click("Replace with recipe")
    expect(q('[role="alert"]')?.textContent ?? "").toMatch(/edge distance 8 mm is below 1\.5 x the hole diameter/)
    expect(JSON.stringify(stored(id))).toBe(before)
    close()
  }, SLOW)
})

describe("the Add feature shortcuts", () => {
  test("Fillet vertical edges adds a fillet, which rounds the four corners; editing its radius changes the volume as 4 (1 - pi/4) r^2 h", async () => {
    const id = await open(plateTemplate())
    const plain = volume(id)
    await click("Fillet vertical edges")
    expect(byId("fillet-fillet1")).not.toBeNull()
    expect(stored(id).features.at(-1)).toMatchObject({ id: "fillet1", type: "fillet", radius: 1, style: "fillet", edges: { parallel: "z", minLength: 3 } })
    expect(byId("issues-fillet1")).toBeNull()
    const r1 = volume(id)
    expect(plain - r1).toBeGreaterThan(4 * (1 - Math.PI / 4) * 1 * 8 * 0.95)
    expect(plain - r1).toBeLessThan(4 * (1 - Math.PI / 4) * 1 * 8 * 1.05)

    await change("fillet1 fillet radius", "4")
    expect(stored(id).features.at(-1)).toMatchObject({ radius: 4 })
    const removed = plain - volume(id)
    expect(removed).toBeGreaterThan(4 * (1 - Math.PI / 4) * 16 * 8 * 0.98)
    expect(removed).toBeLessThan(4 * (1 - Math.PI / 4) * 16 * 8 * 1.03)
    expect(byId("issues-fillet1")).toBeNull()
    expect(summary()).toMatch(/^1 solid, /)
    close()
  }, SLOW)

  test("the style and edge kind of a fillet are editable: a chamfer of 3 takes exactly 4 x 4.5 x 8", async () => {
    const id = await open(plateTemplate())
    const plain = volume(id)
    await click("Fillet vertical edges")
    await change("fillet1 style", "chamfer")
    await change("fillet1 chamfer size", "3") // the field is labelled by what the style makes of the number
    expect(stored(id).features.at(-1)).toMatchObject({ style: "chamfer", radius: 3 })
    expect(plain - volume(id)).toBeCloseTo(4 * 4.5 * 8, 1)
    close()
  }, SLOW)

  test("Fillet all outside edges on a plate with a round hole selects only the straight edges: it is quick, and the rim of the hole is left alone", async () => {
    const id = await open(plateTemplate())
    const plain = volume(id)
    const started = performance.now()
    await click("Fillet all outside edges")
    const elapsed = performance.now() - started
    expect(elapsed).toBeLessThan(10_000)
    expect(byId("issues-fillet1")).toBeNull()
    // 4 vertical + 8 horizontal outline edges at r 1: about 12 slivers; the hole's rim (a Ø10 polygon of dozens of edges) is untouched.
    const removed = plain - volume(id)
    expect(removed).toBeGreaterThan(0)
    expect(removed).toBeLessThan((1 - Math.PI / 4) * (2 * 60 + 2 * 40) * 8 * 0 + (1 - Math.PI / 4) * (4 * 8 + 4 * 60 + 4 * 40) * 1.15)
    expect(summary()).toMatch(/^1 solid, /)
    close()
  }, SLOW)

  test("a fillet of 400 mm is wider than any face: the issue is shown under the feature, and the part keeps its body unchanged", async () => {
    const id = await open(plateTemplate())
    const plain = volume(id)
    await click("Fillet vertical edges")
    await change("fillet1 fillet radius", "400")
    const issues = byId("issues-fillet1")
    expect(issues).not.toBeNull()
    expect(issues!.textContent).toMatch(/Not blended: edge .* of face on each side|No edge matched/)
    expect(summary()).toMatch(/^1 solid, /)
    expect(volume(id)).toBeCloseTo(plain, 6)
    expect(byId("parametric-issues")).not.toBeNull() // and in the list of problems
    // Back to a sensible radius: the issue goes.
    await change("fillet1 fillet radius", "2")
    expect(byId("issues-fillet1")).toBeNull()
    expect(volume(id)).toBeLessThan(plain)
    close()
  }, SLOW)

  test("Shell, open top hollows the plate; a thickness of 1000 leaves no cavity, is shown under the shell, and the body stays", async () => {
    const id = await open(plateTemplate())
    const plain = volume(id)
    await click("Shell, open top")
    expect(byId("shell-shell1")).not.toBeNull()
    expect(stored(id).features.at(-1)).toMatchObject({ id: "shell1", type: "shell", feature: "plate", thickness: 2, open: "top" })
    expect(byId("issues-shell1")).toBeNull()
    expect(volume(id)).toBeLessThan(plain)

    await change("shell1 shell thickness", "1000")
    expect(byId("issues-shell1")).not.toBeNull()
    expect(text("issues-shell1")).toContain("leaves no cavity")
    expect(summary()).toMatch(/^1 solid, /)
    expect(volume(id)).toBeCloseTo(plain, 6)

    await change("shell1 open face", "both")
    expect(stored(id).features.at(-1)).toMatchObject({ open: "both" })
    close()
  }, SLOW)

  test("Shell, closed leaves an internal void: the volume falls by the cavity", async () => {
    const id = await open(plateTemplate())
    const plain = volume(id)
    await click("Shell, closed")
    expect(stored(id).features.at(-1)).toMatchObject({ type: "shell", open: "none" })
    // 60 x 40 x 8 with a 2 mm wall: the cavity is 56 x 36 x 4 less the hole's own wall; at least 7000 mm3 of it is gone.
    expect(plain - volume(id)).toBeGreaterThan(6000)
    close()
  }, SLOW)

  test("Grid pattern copies the hole 3 x 2 at 10 mm; the count is editable and the copies follow", async () => {
    const id = await open(plateTemplate())
    const plain = volume(id)
    await click("Grid pattern")
    expect(byId("feature-grid1")).not.toBeNull()
    expect(text("feature-grid1")).toContain("grid pattern of hole1")
    expect(stored(id).features.at(-1)).toMatchObject({ id: "grid1", type: "pattern", kind: "grid", feature: "hole1", count: 3, countB: 2, step: [10, 0, 0], stepB: [0, 10, 0] })
    for (const label of ["grid1 count", "grid1 rows", "grid1 step x", "grid1 row step y"]) expect(document.querySelector(`[aria-label="${label}"]`), label).not.toBeNull()
    const three = volume(id)
    expect(three).toBeLessThan(plain)
    await change("grid1 count", "2")
    expect(volume(id)).toBeGreaterThan(three)
    expect(volume(id)).toBeLessThan(plain)
    close()
  }, SLOW)

  test("a shortcut with nothing to act on says so instead of adding a broken feature", async () => {
    const id = await open({ parameters: {}, features: [plateTemplate().features[0]!] })
    await click("Shell, open top")
    expect(q('[role="alert"]')?.textContent ?? "").toContain("A shell needs an extrusion")
    await click("Grid pattern")
    expect(q('[role="alert"]')?.textContent ?? "").toContain("A grid pattern needs a hole")
    await click("Fillet vertical edges")
    expect(q('[role="alert"]')?.textContent ?? "").toContain("no solid to round")
    expect(stored(id).features).toHaveLength(1)
    close()
  }, SLOW)
})

describe("the feature controls for the engineering treatments", () => {
  test("chamfer callouts switch between distances and angle without leaving incompatible fields", async () => {
    const base = plateTemplate()
    const id = await open({ ...base, features: [...base.features, {
      id: "ch", type: "fillet", style: "chamfer", radius: 2, secondDistance: 1,
      edges: { within: { min: [0, 0, 7.5], max: [60, 40, 8.5] } }
    }] })
    expect(byId("issues-ch")).toBeNull()
    expect(input("ch second distance input").value).toBe("1")
    const twoDistances = volume(id)
    await change("ch chamfer angle input", "30")
    expect(stored(id).features.at(-1)).toMatchObject({ angle: 30 })
    expect(stored(id).features.at(-1)).not.toHaveProperty("secondDistance")
    expect(input("ch second distance input").value).toBe("")
    expect(byId("issues-ch")).toBeNull()
    expect(volume(id)).toBeLessThan(twoDistances)
    await change("ch second distance input", "1")
    expect(stored(id).features.at(-1)).toMatchObject({ secondDistance: 1 })
    expect(stored(id).features.at(-1)).not.toHaveProperty("angle")
    expect(volume(id)).toBeCloseTo(twoDistances, 5)
    await change("ch second distance input", "")
    expect(stored(id).features.at(-1)).not.toHaveProperty("secondDistance")
    expect(byId("issues-ch")).toBeNull()
    await change("ch chamfer angle input", "30")
    await change("ch style", "fillet")
    expect(stored(id).features.at(-1)).toMatchObject({ style: "fillet" })
    expect(stored(id).features.at(-1)).not.toHaveProperty("angle")
    expect(stored(id).features.at(-1)).not.toHaveProperty("secondDistance")
    expect(document.querySelector('[aria-label="ch chamfer angle input"]')).toBeNull()
    expect(byId("issues-ch")).toBeNull()
    close()
  }, SLOW)

  test("an extrusion's edge treatment, a hole's kind: choosing them edits the history and the dimension fields appear", async () => {
    const id = await open(plateTemplate())
    const plain = volume(id)
    await change("plate edge treatment", "chamfer")
    expect(stored(id).features[1]).toMatchObject({ edge: { style: "chamfer", size: 1, ends: "both" } })
    expect(document.querySelector('[aria-label="plate edge chamfer size"]')).not.toBeNull()
    expect(volume(id)).toBeLessThan(plain)
    await change("plate edge treatment", "")
    expect(stored(id).features[1]).not.toHaveProperty("edge")
    expect(volume(id)).toBeCloseTo(plain, 6)

    await change("hole1 hole kind", "counterbore")
    expect(stored(id).features[2]).toMatchObject({ kind: "counterbore" })
    expect(volume(id)).toBeLessThan(plain)
    await change("hole1 hole kind", "simple")
    expect(stored(id).features[2]).not.toHaveProperty("kind")
    close()
  }, SLOW)
})

describe("Manufacturability", () => {
  test("Check design rules shows a report for the process, cutter and material chosen; a bad cutter is refused", async () => {
    await open(plateTemplate())
    await typeInto("Cutter diameter", "abc")
    await click("Check design rules")
    expect(q('[role="alert"]')?.textContent ?? "").toContain("cutter diameter must be a positive number")
    expect(byId("dfm-report")).toBeNull()

    await typeInto("Cutter diameter", "6")
    await click("Check design rules")
    await until(() => byId("dfm-report") !== null)
    expect(text("dfm-report")).toMatch(/No errors, \d+ warning\(s\), \d+ note\(s\)/)
    expect(text("dfm-report")).toContain("thinnest wall")
    close()
  }, SLOW)

  test("a sharp pocket against a 6 mm cutter is an INTERNAL_CORNER error with the numbers; rounding the corners and a smaller cutter clear it", async () => {
    const id = await open(pocketed())
    await click("Check design rules")
    await until(() => byId("dfm-report") !== null)
    expect(text("dfm-report")).toMatch(/1 error\(s\)/)
    const corner = byId("dfm-INTERNAL_CORNER")
    expect(corner).not.toBeNull()
    expect(corner!.textContent).toContain("pocket")
    expect(corner!.textContent).toContain("(0 vs 3)")
    expect(corner!.textContent).toContain("Fix:")

    // Round the corners of the pocket (default size 1) and re-run with the same 6 mm cutter: still an error, now at radius 1.
    await change("pocket corner treatment", "fillet")
    expect(stored(id).features.at(-1)).toMatchObject({ corner: { style: "fillet", size: 1 } })
    await click("Check design rules")
    await until(() => (byId("dfm-INTERNAL_CORNER")?.textContent ?? "").includes("vs 3"))
    expect(byId("dfm-INTERNAL_CORNER")!.textContent).toMatch(/\(1(\.\d+)? vs 3\)/)

    // A 2 mm cutter leaves a radius of 1: the rounded pocket is makeable.
    await typeInto("Cutter diameter", "2")
    await click("Check design rules")
    await until(() => byId("dfm-INTERNAL_CORNER") === null)
    expect(text("dfm-report")).toContain("No errors")
    close()
  }, SLOW)

  test("the process changes the rules: a thin shell wall is an error for milling a 0.5 mm wall, and goes when the wall is 3 mm", async () => {
    const id = await open(plateTemplate())
    await click("Shell, open top")
    await change("shell1 shell thickness", "0.5")
    await click("Check design rules")
    await until(() => byId("dfm-report") !== null)
    expect(byId("dfm-THIN_WALL")).not.toBeNull()
    expect(byId("dfm-THIN_WALL")!.textContent).toMatch(/vs 0\.8\)/)
    await change("shell1 shell thickness", "3")
    await click("Check design rules")
    await until(() => byId("dfm-THIN_WALL") === null)
    expect(stored(id).features.at(-1)).toMatchObject({ thickness: 3 })
    close()
  }, SLOW)

  test("holes the grid places too close together are a HOLE_SPACING warning in the report", async () => {
    await open(plateTemplate())
    await click("Grid pattern")
    await click("Check design rules")
    await until(() => byId("dfm-report") !== null)
    expect(byId("dfm-HOLE_SPACING")).not.toBeNull()
    expect(byId("dfm-HOLE_SPACING")!.textContent).toMatch(/\(10 vs 20\)/)
    close()
  }, SLOW)
})

describe("sheet metal in the panel", () => {
  test("a sheet feature shows its flat pattern with a DXF download", async () => {
    await open({
      parameters: {},
      features: [
        {
          id: "profile", type: "sketch", plane: "XY",
          sketch: {
            entities: [
              { id: "a", kind: "point", x: 0, y: 0 }, { id: "b", kind: "point", x: 30, y: 0 }, { id: "c", kind: "point", x: 30, y: 20 },
              { id: "l1", kind: "line", p1: "a", p2: "b" }, { id: "l2", kind: "line", p1: "b", p2: "c" }
            ],
            constraints: [{ type: "fixed", point: "a", x: 0, y: 0 }, { type: "fixed", point: "b", x: 30, y: 0 }, { type: "fixed", point: "c", x: 30, y: 20 }]
          }
        },
        { id: "flange1", type: "sheet", sketch: "profile", thickness: 2, width: 25, bendRadius: 3, operation: "new" }
      ]
    } as History)
    const flat = byId("flat-pattern-flange1")
    expect(flat).not.toBeNull()
    expect(flat!.textContent).toMatch(/flat pattern .* mm, 1 bend/)
    close()
  }, SLOW)
})

describe("what the panel cannot do while the part is locked", () => {
  test("every shortcut and the recipe button are disabled", async () => {
    const { render } = await import("solid-js/web")
    const { createComponent } = await import("solid-js")
    const { default: ParametricPanel } = await import("../src/features/cad/components/ParametricPanel.tsx")
    const id = useElementsStore.getState().addElement({ type: "parametric", x: 0, y: 0, z: 0, history: plateTemplate() })
    const host = document.createElement("div")
    document.body.append(host)
    const dispose = render(() => createComponent(ParametricPanel, { get element() { return useElementsStore.getState().elements.find((e) => e.id === id)! }, locked: true }), host)
    await tick(50)
    for (const label of ["Fillet vertical edges", "Shell, open top", "Grid pattern", "Replace with recipe"]) expect(button(label).disabled, label).toBe(true)
    dispose()
    host.remove()
    useElementsStore.setState({ elements: [], selectedElement: null })
  }, SLOW)
})
