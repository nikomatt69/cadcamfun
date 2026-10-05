import { Route, Router } from "@solidjs/router"
import { createSignal, onMount, onCleanup, Show, createEffect } from "solid-js"
import { createAppState, AppProvider, type AppState } from "../state/context.ts"
import { getEndpoint, isTauri, resetEndpoint } from "./sidecar.ts"
import { clientLayer, runtimeForLayer, runtimeForClient, readClient } from "./client.ts"
import { createFakeApi } from "../testing/fake-api.ts"
import { BootScreen } from "../components/boot-screen.tsx"
import type { BootState } from "../state/client.ts"
import { Shell } from "./Shell.tsx"
import { watchSystemTheme } from "../state/settings.ts"
import { routes } from "./routes.tsx"

export default function App() {
  const [state, setState] = createSignal<AppState>()
  const [boot, setBoot] = createSignal<BootState>({ _tag: "starting" })
  let attempt = 0
  let disposed = false
  const start = async () => {
    const current = ++attempt
    setBoot({ _tag: "checking" })
    const runtime = !isTauri() && !import.meta.env.VITE_SIDECAR_URL
      ? runtimeForClient(createFakeApi())
      : undefined
    let active = runtime
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const connect = async () => {
        active ??= runtimeForLayer(clientLayer(await getEndpoint()))
        const client = await readClient(active)
        await active.run(client.health.check())
        return createAppState({ client, runtime: active, sidecar: runtime ? "fake" : "ready" })
      }
      const app = await Promise.race([connect(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Sidecar connection timed out")), 15000) })])
      if (disposed || current !== attempt) { app.dispose(); return }
      setState(app)
    } catch (cause) {
      active?.dispose()
      if (!disposed && current === attempt) setBoot({ _tag: "failed", reason: String(cause), timedOut: false })
    } finally { clearTimeout(timer) }
  }
  const theme = watchSystemTheme()
  createEffect(() => { const app = state(); if (app) theme.apply(app.settings.settings().theme) })
  onMount(() => { void start() })
  onCleanup(() => { disposed = true; attempt++; state()?.dispose(); theme.dispose() })
  return (
    <Show when={state()} fallback={<BootScreen state={boot()} elapsedSeconds={0} onRetry={() => { resetEndpoint(); void start() }} />}>
      {(app) => <AppProvider state={app()}><Router root={(props) => <Shell>{props.children}</Shell>}>
        {routes.map((r) => <Route path={r.path} component={r.component} />)}
      </Router></AppProvider>}
    </Show>
  )
}
