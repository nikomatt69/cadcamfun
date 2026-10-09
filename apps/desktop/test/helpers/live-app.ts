/**
 * Mounts the whole UI (`AppRoutes`) over the *real* sidecar handlers: the generated typed
 * client talks to the in-process HTTP handler backed by an in-memory SQLite database, and
 * the DOM is happy-dom. No browser, no network, no fake API.
 */
import { clientLayer, readClient, runtimeForLayer } from "../../src/app/client.ts"
import { makeApp } from "../../../sidecar/test/helpers.ts"
import { installDom } from "./dom.ts"
import { resetStores } from "./reset-stores.ts"

export async function bootLiveApp() {
  const sidecar = await makeApp()
  installDom("http://localhost/")
  // The Zustand stores are module-level singletons that survive a new DOM window, so wipe
  // them here: a previous test file in this process may have left elements, projects or a
  // remembered document in `useElementsStore` / `useDocumentStore`, and the next file's first
  // `prepareWorkspace` would otherwise see that stale state.
  resetStores()
  const { render } = await import("solid-js/web")
  const { AppRoutes } = await import("../../src/app/App.tsx")
  const { createAppState } = await import("../../src/state/context.ts")
  const runtime = runtimeForLayer(clientLayer({ baseUrl: "http://sidecar.test", token: "test-token" }, sidecar.transport))
  const client = await readClient(runtime)
  const state = createAppState({ client, runtime, sidecar: "ready" })

  const wait = async <T>(read: () => T | null | undefined | false, timeoutMs = 4000): Promise<T> => {
    const until = Date.now() + timeoutMs
    for (;;) {
      const value = read()
      if (value) return value
      if (Date.now() > until) throw new Error(`timed out; page text: ${document.body.textContent?.slice(0, 300)}`)
      await new Promise((r) => setTimeout(r, 10))
    }
  }
  /** Navigates to `path` and mounts a fresh copy of the app there; returns its container. */
  const visit = (path: string) => {
    window.history.pushState({}, "", path)
    const root = document.createElement("div")
    document.body.replaceChildren(root)
    const dispose = render(() => AppRoutes({ state }), root)
    return { root, dispose }
  }
  const dispose = async () => { state.dispose(); await sidecar.dispose() }
  return { sidecar, client, state, visit, wait, dispose }
}
