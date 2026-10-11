/**
 * What a project holds when the editor saves one (spec 03 §2): the drawing with its geometry, layers
 * and settings, plus the components saved on this machine. The two save paths share the module, so
 * these cases cover both "Save" and "Save as Project".
 */
import { beforeEach, describe, expect, test } from "bun:test"
import { createProjectWithContents, drawingPayload, syncProjectContents } from "../src/cad/lib/projectSnapshot.ts"
import type { AppState } from "../src/state/context.ts"
import { useElementsStore } from "../src/cad/store/elementsStore.ts"
import { useLayerStore } from "../src/cad/store/layerStore.ts"
import { useLocalComponentsLibraryStore, type LocalComponent } from "../src/cad/store/localComponentsLibraryStore.ts"
import { useCADStore } from "../src/cad/store/cadStore.ts"
import type { ComponentClient } from "../src/cad/lib/projectSnapshot.ts"

const now = "2026-01-01T00:00:00.000Z"

/** A minimal client that records calls and answers with predictable rows. */
function fakeClient(): ComponentClient & { readonly rows: Array<{ name: string; payload: unknown }> } {
  const rows: Array<{ name: string; payload: unknown }> = []
  const stored: Array<{ id: string; name: string }> = []
  let sequence = 0
  const client = {
    projects: {
      create: async (input: { payload: unknown }) => { rows.push({ name: "projects.create", payload: input.payload }); return { id: `p${++sequence}` } }
    },
    drawings: {
      createForProject: async (input: { payload: { name?: string; description?: string | null; data?: unknown } }) => {
        rows.push({ name: "drawings.createForProject", payload: input.payload })
        return { id: `d${sequence}`, name: input.payload.name ?? "" }
      },
      update: async (input: { params: { id: string }; payload: { data?: unknown } }) => {
        rows.push({ name: "drawings.update", payload: input.payload })
        return { id: input.params.id }
      }
    },
    components: {
      listForProject: async () => stored.map((row) => ({ ...row })),
      createForProject: async (input: { payload: { name: string } }) => {
        rows.push({ name: "components.createForProject", payload: input.payload })
        const row = { id: `c${++sequence}`, name: input.payload.name }
        stored.push(row)
        return row
      }
    }
  }
  return Object.assign(client, { rows })
}

/**
 * The module's `Run`. The fake client's methods are async functions, so the "effect" the module
 * hands over is the promise they already returned; a real client answers with an Effect, which the
 * app runtime runs. Either way this awaits the result.
 */
const runApp = async <A,>(effect: unknown): Promise<A> => await (effect as Promise<A>)

const settings = { settings: () => ({ units: "mm", theme: "system", locale: "en", decimals: 3, postProcessor: "grbl", snapEnabled: true, tolerance: 0.01, glass: false }) }
const app = (client: ComponentClient): Pick<AppState, "client" | "runtime" | "settings"> =>
  ({ client, runtime: { run: runApp }, settings }) as never

const cube = { id: "e1", type: "cube", layerId: "layer-a", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 }
const component = (id: string, name: string, type = "mechanical"): LocalComponent => ({
  id, name, description: `${name} description`, type, data: { elements: [] }, tags: [], createdAt: now, updatedAt: now
})

beforeEach(() => {
  useElementsStore.setState({ elements: [], selectedElement: null, selectedElements: [] })
  useLayerStore.setState({ layers: [{ id: "layer-a", name: "Structural", visible: true, locked: false, color: "#ff0000" }], activeLayer: "layer-a" })
  useLocalComponentsLibraryStore.setState({ components: [], error: null })
  useCADStore.getState().setTolerance(0.01)
})

describe("the drawing a project stores", () => {
  test("carries the geometry, the layers and the measuring settings", () => {
    useElementsStore.setState({ elements: [cube], selectedElement: null, selectedElements: [] })
    const payload = drawingPayload(app(fakeClient()))
    expect(payload["layers"]).toEqual([{ id: "layer-a", name: "Structural", visible: true, locked: false, color: "#ff0000" }])
    expect((payload["elements"] as ReadonlyArray<{ id: string }>).map((element) => element.id)).toEqual(["e1"])
    expect(payload["settings"]).toMatchObject({ units: "mm", tolerance: 0.01 })
    expect(payload["version"]).toBe("1.0")
  })

})

describe("save as project", () => {
  test("creates the project, its drawing and every component saved on this machine", async () => {
    useElementsStore.setState({ elements: [cube], selectedElement: null, selectedElements: [] })
    useLocalComponentsLibraryStore.setState({ components: [component("k1", "Bracket"), component("k2", "Spacer", "geometric")], error: null })
    const fake = fakeClient()
    const result = await createProjectWithContents(app(fake), { name: "Gearbox", description: "Housing", isPublic: false })
    expect(result.projectId).toBe("p1")
    expect(result.drawingId).toBe("d1")
    expect(result.componentIds.length).toBe(2)
    expect(fake.rows.filter((call) => call.name === "components.createForProject").length).toBe(2)
    expect(fake.rows.some((call) => call.name === "drawings.createForProject")).toBe(true)
    // The drawing stored with the project carries the layers, not only the geometry.
    const drawing = fake.rows.find((call) => call.name === "drawings.createForProject")
    expect((drawing?.payload as { data?: { layers?: ReadonlyArray<{ id: string }> } }).data?.layers?.map((l) => l.id)).toEqual(["layer-a"])
  })
})

describe("save", () => {
  test("updates the drawing and adds only the components the project is missing", async () => {
    useElementsStore.setState({ elements: [cube], selectedElement: null, selectedElements: [] })
    useLocalComponentsLibraryStore.setState({ components: [component("k1", "Bracket")], error: null })
    const fake = fakeClient()
    const created = await createProjectWithContents(app(fake), { name: "Gearbox" })
    const before = fake.rows.filter((call) => call.name === "components.createForProject").length
    const result = await syncProjectContents(app(fake), created.projectId, created.drawingId, runApp)
    expect(result.componentIds.length).toBe(0)
    expect(fake.rows.filter((call) => call.name === "components.createForProject").length).toBe(before)
    expect(fake.rows.some((call) => call.name === "drawings.update")).toBe(true)
  })

  test("adds a component that appeared after the project was created", async () => {
    useElementsStore.setState({ elements: [cube], selectedElement: null, selectedElements: [] })
    useLocalComponentsLibraryStore.setState({ components: [component("k1", "Bracket")], error: null })
    const fake = fakeClient()
    const created = await createProjectWithContents(app(fake), { name: "Gearbox" })
    useLocalComponentsLibraryStore.setState({ components: [component("k1", "Bracket"), component("k2", "Plate")], error: null })
    const result = await syncProjectContents(app(fake), created.projectId, created.drawingId, runApp)
    expect(result.componentIds.length).toBe(1)
    const payloads = fake.rows.filter((call) => call.name === "components.createForProject").map((call) => call.payload as { name: string })
    expect(payloads.map((payload) => payload.name)).toEqual(["Bracket", "Plate"])
  })

  test("rejects a save for a document that belongs to no project", async () => {
    await expect(syncProjectContents(app(fakeClient()), "", "d1", runApp)).rejects.toThrow()
  })
})
