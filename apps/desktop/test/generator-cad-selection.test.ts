import { afterEach, expect, test } from "bun:test"
import type { cam } from "@cadcamfun/core"
import { installDom } from "./helpers/dom.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useSelectionStore } from "../src/features/cad/store/selectorStore.ts"
import { useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"
import { geometryOf } from "../src/features/cam/lib/job.ts"
import { useJob, type JobView } from "../src/features/cam/hooks/useJob.ts"

afterEach(resetStores)

const parts = () => [
  { id: "plate", type: "cube", name: "Plate", width: 30, height: 20, depth: 5 },
  { id: "group", type: "group", name: "Assembly", childrenIds: ["mesh"] },
  {
    id: "mesh", type: "mesh", name: "Imported part", parentId: "group", visible: false, locked: true,
    x: 12, y: 3, z: 4, rotationY: 45, scaleX: 2, material: "steel",
    vertices: [0, 0, 0, 10, 0, 0, 0, 10, 0], faces: [0, 1, 2],
    metadata: { resource: "original", custom: { finish: "ground" } }
  },
  { id: "stock", type: "workpiece", width: 100, height: 100, depth: 20 },
  { id: "grid", type: "grid" }, { id: "axis", type: "axis" }, { id: "light", type: "light" }
].map((element) => ({ ...element, layerId: "default" }))

const mount = async (machine: cam.MachineKind = "mill") => {
  installDom()
  const { render } = await import("solid-js/web")
  const { OperationSection } = await import("../src/features/cam/components/generator/OperationSection.tsx")
  useGeneratorStore.getState().updateSettings("machineType", machine)
  useGeneratorStore.getState().setGeometryType("selected")
  useGeneratorStore.setState((state) => ({ expanded: { ...state.expanded, operation: true } }))
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  let job!: JobView
  const dispose = render(() => { job = useJob(); return OperationSection() }, root)
  const picker = () => root.querySelector<HTMLSelectElement>('[data-testid="generator-cad-picker"] select')!
  const choose = (id: string) => {
    picker().value = id
    picker().dispatchEvent(new window.Event("change", { bubbles: true }))
  }
  return { root, job, picker, choose, dispose }
}

for (const machine of ["mill", "lathe", "3dprinter"] as const) {
  test(`${machine}: choose any CAD part directly and generate with its complete current data`, async () => {
    resetStores()
    useElementsStore.setState({ elements: parts(), selectedElement: null })
    const view = await mount(machine)
    try {
      expect(view.picker()).not.toBeNull()
      expect([...view.picker().options].map((option) => option.value)).toEqual(["", "plate", "group", "mesh"])
      expect(view.root.textContent).toContain("No element selected.")
      // An existing CAD multi-selection must not win over the new pick.
      useSelectionStore.getState().selectMultiple(["plate", "group"])
      view.choose("mesh")
      expect(useSelectionStore.getState().selectedElementIds).toEqual(["mesh"])
      expect(useElementsStore.getState().selectedElement?.id).toBe("mesh")
      expect(view.job.element()?.["id"]).toBe("mesh")
      expect(view.root.textContent).not.toContain("No element selected.")
      expect(geometryOf(useGeneratorStore.getState(), view.job.sources()).selectedElements).toEqual([parts()[2]!])

      useElementsStore.getState().updateElement("mesh", { x: 99, metadata: { edited: true } })
      expect(geometryOf(useGeneratorStore.getState(), view.job.sources()).selectedElements[0]).toMatchObject({ x: 99, metadata: { edited: true }, rotationY: 45, faces: [0, 1, 2] })

      useSelectionStore.getState().selectMultiple(["plate"])
      useElementsStore.getState().selectElement("plate")
      expect(view.picker().value).toBe("plate")
      view.choose("plate")
      expect(useGeneratorStore.getState().settings.depth).toBe(5)
      view.choose("")
      expect(view.job.selection()).toEqual([])
      expect(useElementsStore.getState().selectedElement).toBeNull()
      expect(view.root.textContent).toContain("No element selected.")
    } finally { view.dispose() }
  }, 30_000)
}

test("the generator picker follows CAD additions, renames and deletion without reopening the panel", async () => {
  resetStores()
  const view = await mount()
  try {
    expect(view.root.textContent).toContain("No CAD parts in this drawing.")
    useElementsStore.setState({ elements: parts() })
    expect(view.picker().options.length).toBe(4)
    expect(view.root.textContent).not.toContain("No CAD parts in this drawing.")
    useElementsStore.getState().updateElement("plate", { name: "Renamed plate" })
    expect(view.picker().options[1]?.textContent).toContain("Renamed plate")
    view.choose("plate")
    useElementsStore.getState().deleteElement("plate")
    expect(view.picker().value).toBe("")
    expect(view.job.selection()).toEqual([])
    expect([...view.picker().options].some((option) => option.value === "plate")).toBe(false)
  } finally { view.dispose() }
})
