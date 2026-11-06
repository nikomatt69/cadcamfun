import { expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

test("CAD toolbar exposes import, save, export and projects actions", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { MemoryRouter, Route } = await import("@solidjs/router")
  const { createFakeApi } = await import("../src/testing/fake-api.ts")
  const { runtimeForClient } = await import("../src/app/client.ts")
  const { createAppState, AppProvider } = await import("../src/shared/state/context.ts")
  const { default: EnhancedToolbar } = await import("../src/features/cad/components/EnhancedToolbar.tsx")
  const client = createFakeApi()
  const app = createAppState({ client, runtime: runtimeForClient(client), sidecar: "fake" })
  const events: string[] = []
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => MemoryRouter({ children: Route({ path: "/", component: () => AppProvider({ state: app, get children() {
    return EnhancedToolbar({
      sidebarOpen: true, setSidebarOpen() {}, handleSaveProject: () => events.push("save"),
      setDialogMode: (mode) => events.push(mode), setShowImportExportDialog: (show) => events.push(`open:${show}`),
      setShowLibraryView() {}, setShowUnifiedLibrary() {}, setShowCustomElements() {}, setShowFloatingToolbar() {},
      showFloatingToolbar: false, selectedLibraryComponent: null, setSelectedLibraryComponent() {}, setIsPlacingComponent() {}
    })
  } }) }) }), root)
  try {
    root.querySelector<HTMLButtonElement>('[data-testid="cad-toolbar-import"]')!.click()
    root.querySelector<HTMLButtonElement>('[data-testid="cad-toolbar-save"]')!.click()
    root.querySelector<HTMLButtonElement>('[data-testid="cad-toolbar-export"]')!.click()
    expect(events).toEqual(["import", "open:true", "save", "export", "open:true"])
    expect(root.querySelector<HTMLAnchorElement>('[data-testid="cad-toolbar-projects"]')?.getAttribute("href")).toBe("/projects")
  } finally { dispose(); app.dispose(); root.remove() }
}, 60_000)
