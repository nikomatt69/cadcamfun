/**
 * The custom element editor is reachable from the CAD toolbar.
 */
import { expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

test("the custom element editor mounts with its code tab and live preview", async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { default: CustomElementsEditor } = await import("../src/cad/components/custom-elements/CustomElementsEditor.tsx")
  const { useCustomElementsStore } = await import("../src/cad/store/customElementsStore.ts")

  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(() => CustomElementsEditor({ isOpen: true, onClose: () => undefined }), host)
  await new Promise((resolve) => setTimeout(resolve, 300))

  const text = () => document.body.textContent ?? ""
  expect(text()).toContain("Create Custom Element")
  expect(text()).toContain("Code")
  expect(text()).toContain("Parameters")
  expect(text()).toContain("Live Preview")
  expect(text()).toContain("Valid")
  // Opening the dialog seeded a fresh definition with its default parameters.
  expect(useCustomElementsStore.getState().activeDefinition?.name).toBe("New Custom Element")

  // Its preview builds a mesh from the default geometry body.
  const generated = await new Promise<boolean>((resolve) => {
    const started = Date.now()
    const poll = (): void => {
      if (useCustomElementsStore.getState().previewObject !== null) resolve(true)
      else if (Date.now() - started > 2000) resolve(false)
      else setTimeout(poll, 50)
    }
    poll()
  })
  expect(generated).toBe(true)

  dispose()
  useCustomElementsStore.getState().closeEditor()
  expect(useCustomElementsStore.getState().activeDefinition).toBeNull()
})
