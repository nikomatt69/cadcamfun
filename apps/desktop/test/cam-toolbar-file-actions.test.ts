import { expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

test("CAM toolbar dispatches file actions and disables saving an empty program", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { createSignal } = await import("solid-js")
  const { MemoryRouter, Route } = await import("@solidjs/router")
  const { createFakeApi } = await import("../src/testing/fake-api.ts")
  const { runtimeForClient } = await import("../src/app/client.ts")
  const { createAppState, AppProvider } = await import("../src/shared/state/context.ts")
  const { t } = await import("../src/i18n/index.ts")
  const { default: CamToolbar } = await import("../src/features/cam/components/CamToolbar.tsx")
  const client = createFakeApi()
  const app = createAppState({ client, runtime: runtimeForClient(client), sidecar: "fake" })
  const actions: string[] = []
  let allowSave: (value: boolean) => void = () => { throw new Error("Toolbar did not mount") }
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => MemoryRouter({ children: Route({ path: "/", component: () => AppProvider({ state: app, get children() {
    const [canSave, setCanSave] = createSignal(false)
    allowSave = setCanSave
    return CamToolbar({
      get canSave() { return canSave() }, isSimulating: false, aiEnhanced: false, showChat: false,
      onSave: () => actions.push("save"), onImport: () => actions.push("import"),
      onExport: () => actions.push("export"), onProjects: () => actions.push("projects"),
      onToggleSimulation() {}, onOpenLibrary() {}, onOpenCosts() {}, onToggleAi() {}, onToggleChat() {}
    })
  } }) }) }), root)
  try {
    const button = (label: string) => [...root.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.getAttribute("aria-label") === label)!
    const save = button(t("cam.saveGcode")), imp = button(t("cam.import")), exp = button(t("cam.batch.export")), projects = button(t("cam.batch.projects"))
    expect(save.disabled).toBe(true)
    expect(exp.disabled).toBe(true)
    imp.click(); projects.click(); save.click(); exp.click()
    expect(actions).toEqual(["import", "projects"])
    allowSave(true)
    expect(save.disabled).toBe(false)
    expect(exp.disabled).toBe(false)
    save.click(); exp.click()
    expect(actions).toEqual(["import", "projects", "save", "export"])
  } finally { dispose(); app.dispose(); root.remove() }
}, 60_000)
