/**
 * Custom elements: the geometry script sandbox, the shipped templates and the editor's store.
 *
 * The templates are the strongest guard: every geometry body is executed, so a port that broke a
 * snippet fails here instead of in someone's dialog.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import * as THREE from "three"
import { compileGeometryCode, evaluateCustomElement, interpolateMaterialProperties, triangleCount } from "./customElements/evaluate.ts"
import { createDefinitionFromTemplate, customElementTemplates, getTemplateCategories } from "./customElements/templates.ts"
import { useCustomElementsStore } from "../store/customElementsStore.ts"
import { createThreeObject } from "./createThreeObject.ts"
import { customElementOf, type CustomElementDefinition } from "../types/customElements.ts"

// A DOM is installed before the store module is touched: it persists to localStorage, and its
// initializer reads what a previous session left there.
beforeAll(async () => {
  const { installDom } = await import("../../../../test/helpers/dom.ts")
  installDom()
})

/** A definition as the store would hold it: a template with its bookkeeping fields filled in. */
const definition = (key: string): CustomElementDefinition => {
  const base = createDefinitionFromTemplate(key)
  if (!base) throw new Error(`no template named ${key}`)
  return { ...base, id: `def-${key}`, created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z" }
}

const parametersOf = (source: CustomElementDefinition): Record<string, unknown> =>
  Object.fromEntries(Object.entries(source.parameters).map(([name, parameter]) => [name, parameter.default]))

describe("custom element scripts", () => {
  test("a geometry body builds a mesh with the material the definition describes", () => {
    const object = evaluateCustomElement(definition("basicBox"), { width: 40, height: 20, depth: 10, color: "#ff0000", wireframe: true })
    expect(object).toBeInstanceOf(THREE.Mesh)
    const mesh = object as THREE.Mesh
    expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry)
    expect(mesh.geometry.boundingBox).toBeDefined()
    mesh.geometry.computeBoundingBox()
    expect(mesh.geometry.boundingBox?.getSize(new THREE.Vector3()).toArray()).toEqual([40, 20, 10])
    const material = mesh.material as THREE.MeshStandardMaterial
    expect(material.color.getHexString()).toBe("ff0000")
    expect(material.wireframe).toBe(true)
  })

  test("a body that returns an object is used as it is", () => {
    const object = evaluateCustomElement(definition("lBracket"), parametersOf(definition("lBracket")))
    expect(object).toBeInstanceOf(THREE.Group)
    expect(object.children.length).toBe(2)
  })

  test("the built object carries which element it came from", () => {
    const source = definition("basicBox")
    const object = evaluateCustomElement(source, parametersOf(source))
    expect(object.userData["isCustomElement"]).toBe(true)
    expect(object.userData["customElementId"]).toBe("def-basicBox")
    expect(object.userData["customElementName"]).toBe("Parametric Box")
  })

  test("a body that returns nothing, or the wrong kind, is reported", () => {
    expect(() => evaluateCustomElement({ ...definition("basicBox"), geometryCode: "return 42" }, {})).toThrow(/must return/)
    expect(() => evaluateCustomElement({ ...definition("basicBox"), geometryCode: "return null" }, {})).toThrow(/null or undefined/)
    expect(() => evaluateCustomElement({ ...definition("basicBox"), geometryCode: "const a = (" }, {})).toThrow()
  })

  test("a syntax error is caught by compiling, which is what validation uses", () => {
    expect(() => compileGeometryCode("this is not javascript(")).toThrow()
  })

  test("material properties resolve a parameter reference and leave plain values alone", () => {
    const resolved = interpolateMaterialProperties({ color: "parameters.tint", metalness: 0.4 }, { tint: "#00ff00" })
    expect(resolved).toEqual({ color: "#00ff00", metalness: 0.4 })
  })

  test("a custom material body supplies its own material", () => {
    const source = definition("basicBox")
    const object = evaluateCustomElement({
      ...source,
      materialConfig: { type: "custom", properties: {}, customCode: "return new THREE.MeshBasicMaterial({ color: parameters.color })" },
    }, { width: 1, height: 1, depth: 1, color: "#123456", wireframe: false })
    const material = (object as THREE.Mesh).material
    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial)
    expect((material as THREE.MeshBasicMaterial).color.getHexString()).toBe("123456")
  })

  test("the preview counts the triangles a script built", () => {
    expect(triangleCount(evaluateCustomElement(definition("basicBox"), parametersOf(definition("basicBox"))))).toBe(12)
    expect(triangleCount(new THREE.Group())).toBeUndefined()
  })
})

describe("custom element templates", () => {
  test("every template builds a Three object at its own default parameters", () => {
    for (const [key, template] of Object.entries(customElementTemplates)) {
      const built = evaluateCustomElement(definition(key), parametersOf(definition(key)))
      expect(built, `${key} (${template.name}) builds an object`).toBeInstanceOf(THREE.Object3D)
    }
  })

  test("every template passes validation", () => {
    const store = useCustomElementsStore.getState()
    for (const key of Object.keys(customElementTemplates)) {
      expect(store.validateDefinition(definition(key)).valid, `${key} is valid`).toBe(true)
    }
  })

  test("templates are grouped by category and start from a copy, not the original", () => {
    const categories = getTemplateCategories()
    expect(categories.length).toBeGreaterThan(1)
    for (const category of categories) expect(customElementTemplates).toBeDefined()
    const built = createDefinitionFromTemplate("basicBox", "Renamed")
    expect(built?.name).toBe("Renamed")
    expect(built?.parameters).not.toBe(customElementTemplates.basicBox?.parameters)
    expect(createDefinitionFromTemplate("nope")).toBeNull()
  })
})

describe("custom elements store", () => {
  test("a definition is created, edited and deleted, and survives an export/import round trip", () => {
    const store = useCustomElementsStore.getState()
    const source = definition("basicBox")
    const { id: _id, created: _created, modified: _modified, ...input } = source
    const id = store.createDefinition(input)
    expect(Object.keys(useCustomElementsStore.getState().definitions)).toContain(id)

    useCustomElementsStore.getState().updateDefinition(id, { name: "Renamed box" })
    expect(useCustomElementsStore.getState().definitions[id]?.name).toBe("Renamed box")
    expect(useCustomElementsStore.getState().definitions[id]?.modified).not.toBe(source.modified)

    const json = useCustomElementsStore.getState().exportDefinition(id)
    expect(json).toContain("Renamed box")
    const restored = useCustomElementsStore.getState().importDefinition(json ?? "")
    expect(useCustomElementsStore.getState().definitions[restored ?? ""]?.name).toBe("Renamed box")

    useCustomElementsStore.getState().deleteDefinition(id)
    useCustomElementsStore.getState().deleteDefinition(restored ?? "")
    expect(Object.keys(useCustomElementsStore.getState().definitions)).not.toContain(id)
  })

  test("a duplicate is a copy under a new name and id", () => {
    const source = definition("spiralSpring")
    const { id: _id, created: _created, modified: _modified, ...input } = source
    const id = useCustomElementsStore.getState().createDefinition(input)
    const copyId = useCustomElementsStore.getState().duplicateDefinition(id, "Spring copy")
    expect(copyId).not.toBe(id)
    const copy = useCustomElementsStore.getState().definitions[copyId]
    expect(copy?.name).toBe("Spring copy")
    expect(copy?.geometryCode).toBe(source.geometryCode)
  })

  test("search matches name, description and tags", () => {
    const { id: _id, created: _created, modified: _modified, ...input } = definition("parametricGear")
    useCustomElementsStore.getState().createDefinition(input)
    const store = useCustomElementsStore.getState()
    expect(store.searchDefinitions("gear").length).toBeGreaterThan(0)
    expect(store.searchDefinitions("mechanical").length).toBeGreaterThan(0)
    expect(store.searchDefinitions("teeth").length).toBeGreaterThan(0)
    expect(store.searchDefinitions("no such thing")).toEqual([])
    expect(store.getDefinitionsByCategory("Mechanical").length).toBeGreaterThan(0)
    expect(store.getDefinitionsByCategory("Nothing").length).toBe(0)
  })

  test("the editor follows the saved definition after a first save", () => {
    const store = useCustomElementsStore.getState()
    const { id: _id, created: _created, modified: _modified, ...input } = definition("basicBox")
    const id = store.createDefinition(input)
    useCustomElementsStore.getState().followSavedDefinition(id)
    const open = useCustomElementsStore.getState()
    expect(open.editorMode).toBe("edit")
    expect(open.activeDefinition?.id).toBe(id)
  })

  test("opening the editor seeds a fresh definition and its default parameter values", () => {
    const store = useCustomElementsStore.getState()
    store.openEditor("create")
    const open = useCustomElementsStore.getState()
    expect(open.isEditorOpen).toBe(true)
    expect(open.editorMode).toBe("create")
    expect(open.activeDefinition?.name).toBe("New Custom Element")
    expect(open.previewParameters).toEqual({ size: 1, color: "#1e88e5" })
    store.closeEditor()
    const closed = useCustomElementsStore.getState()
    expect(closed.isEditorOpen).toBe(false)
    expect(closed.activeDefinition).toBeNull()
  })

  test("opening a saved definition in edit mode carries its own parameter values", () => {
    const { id: _id, created: _created, modified: _modified, ...input } = definition("customText3D")
    const id = useCustomElementsStore.getState().createDefinition(input)
    useCustomElementsStore.getState().openEditor("edit", id)
    const open = useCustomElementsStore.getState()
    expect(open.editorMode).toBe("edit")
    expect(open.activeDefinition?.id).toBe(id)
    expect(open.previewParameters).toEqual({ text: "HELLO", size: 20, depth: 5, font: "helvetiker", color: "#4285f4" })
    useCustomElementsStore.getState().closeEditor()
  })

  test("validation rejects an empty name, missing code, bad parameter names and broken code", () => {
    const store = useCustomElementsStore.getState()
    const source = definition("basicBox")
    const broken = {
      ...source,
      name: "  ",
      geometryCode: "",
      parameters: { ...source.parameters, "not a name": { type: "number" as const, default: 1 }, backwards: { type: "number" as const, default: 1, min: 5, max: 1 } },
    }
    const result = store.validateDefinition(broken)
    expect(result.valid).toBe(false)
    expect(result.errors.join(" ")).toContain("Name is required")
    expect(result.errors.join(" ")).toContain("Geometry code is required")
    expect(result.errors.join(" ")).toContain("invalid name")
    expect(result.errors.join(" ")).toContain("min value must be less than max value")
    expect(store.validateDefinition({ ...source, geometryCode: "const a = (" }).valid).toBe(false)
  })

  test("an import that fails validation is refused rather than stored", () => {
    const store = useCustomElementsStore.getState()
    const before = Object.keys(useCustomElementsStore.getState().definitions).length
    expect(store.importDefinition("{}")).toBeNull()
    expect(store.importDefinition("not json")).toBeNull()
    expect(store.importDefinitions("[{},{}]")).toEqual([])
    expect(Object.keys(useCustomElementsStore.getState().definitions).length).toBe(before)
  })

  test("definitions are persisted for the next session", () => {
    const { id: _id, created: _created, modified: _modified, ...input } = definition("basicBox")
    useCustomElementsStore.getState().createDefinition(input)
    const stored = window.localStorage.getItem("custom-elements-storage")
    expect(stored).toContain("Parametric Box")
  })
})

test("an element reads back as a placed custom instance, and anything else reads as nothing", () => {
  const instance = customElementOf({ id: "el-1", type: "custom", definitionId: "d1", parameters: { size: 2 }, x: 3, y: 4, z: 5 })
  expect(instance).toEqual({ id: "el-1", definitionId: "d1", parameters: { size: 2 }, position: { x: 3, y: 4, z: 5 }, rotation: undefined, scale: undefined })
  expect(customElementOf({ id: "el-2", type: "cube" })).toBeNull()
  expect(customElementOf({ id: "el-3", type: "custom" })).toBeNull()
})

describe("custom elements on the canvas", () => {
  test("a placed custom element is drawn at the element's origin, tagged as that element", () => {
    const { id: _id, created: _created, modified: _modified, ...input } = definition("basicBox")
    const id = useCustomElementsStore.getState().createDefinition(input)
    const object = createThreeObject({
      id: "el-1", type: "custom", x: 5, y: 6, z: 7, definitionId: id,
      parameters: { width: 10, height: 20, depth: 30, color: "#ff0000", wireframe: false },
    })
    expect(object).toBeInstanceOf(THREE.Mesh)
    expect(object?.position.toArray()).toEqual([5, 6, 7])
    expect(object?.userData["elementId"]).toBe("el-1")
    expect(object?.userData["isCustomElement"]).toBe(true)
  })

  test("an element whose definition is gone draws nothing, and does not break the drawing", () => {
    expect(createThreeObject({ id: "el-2", type: "custom", definitionId: "missing" })).toBeNull()
    expect(createThreeObject({ id: "el-3", type: "custom" })).toBeNull()
  })
})
