import { Effect } from "effect"
import { Route, Router } from "@solidjs/router"
import { createSignal, onMount, onCleanup, Show, createEffect } from "solid-js"
import { createAppState, AppProvider, type AppState } from "../state/context.ts"
import { getEndpoint, isTauri, resetEndpoint } from "./sidecar.ts"
import { clientLayer, runtimeForLayer, runtimeForClient, readClient } from "./client.ts"
import { createFakeApi } from "../testing/fake-api.ts"
import { BootScreen } from "../components/boot-screen.tsx"
import { messageOf, type BootState } from "../state/client.ts"
import { Shell } from "./Shell.tsx"
import { watchSystemTheme } from "../state/settings.ts"
import { routes } from "./routes.tsx"
import { AiProvider } from "../ai/context.tsx"
import { applyGlass, removeGlass, tauriGlassHost, type GlassHost } from "./glass.ts"

/** The provider, router and shell for a booted app state; `App` renders it once the sidecar answers. */
export function AppRoutes(props: { readonly state: AppState }) {
  return <AppProvider state={props.state}><AiProvider><Router root={(p) => <Shell>{p.children}</Shell>}>
    {routes.map((r) => <Route path={r.path} component={r.component} />)}
  </Router></AiProvider></AppProvider>
}

/** Longest the splash keeps trying before it offers Retry: the sidecar loads a large AI host on a loaded machine. */
const CONNECT_BUDGET_MS = 150_000
const RETRY_PAUSE_MS = 750

export default function App() {
  const [state, setState] = createSignal<AppState>()
  const [boot, setBoot] = createSignal<BootState>({ _tag: "starting" })
  const [elapsed, setElapsed] = createSignal(0)
  let attempt = 0
  let disposed = false
  let connecting: AbortController | undefined
  const start = async () => {
    connecting?.abort()
    const current = ++attempt
    const began = Date.now()
    setElapsed(0)
    setBoot({ _tag: "checking" })
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - began) / 1000)), 1000)
    const live = () => !disposed && current === attempt
    const fake = !isTauri() && !import.meta.env.VITE_SIDECAR_URL
    try {
      // The connection is made, not given up on: while the sidecar is still starting (or restarting on a new port) every
      // failed try re-resolves the endpoint and tries again, until the budget runs out.
      for (;;) {
        const controller = new AbortController()
        connecting = controller
        let active = fake ? runtimeForClient(createFakeApi()) : undefined
        const release = () => { void active?.dispose() }
        controller.signal.addEventListener("abort", release, { once: true })
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          const connect = async () => {
            if (!active) {
              const endpoint = await getEndpoint()
              controller.signal.throwIfAborted()
              active = runtimeForLayer(clientLayer(endpoint))
            }
            const client = await readClient(active)
            controller.signal.throwIfAborted()
            await active.run(client.health.check().pipe(Effect.timeout("30 seconds")))
            controller.signal.throwIfAborted()
            return createAppState({ client, runtime: active, sidecar: fake ? "fake" : "ready" })
          }
          const app = await Promise.race([connect(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("The sidecar did not answer in time")), 30_000) })])
          if (!live()) { app.dispose(); return }
          setState(app)
          return
        } catch (cause) {
          controller.abort()
          active?.dispose()
          if (!live()) return
          if (Date.now() - began >= CONNECT_BUDGET_MS) { setBoot({ _tag: "failed", reason: messageOf(cause), timedOut: true }); return }
          resetEndpoint()
          await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS))
          if (!live()) return
        } finally { controller.signal.removeEventListener("abort", release); clearTimeout(timer); if (connecting === controller) connecting = undefined }
      }
    } finally { clearInterval(tick) }
  }
  // Liquid Glass behind the transparent window (macOS, inside Tauri; a no-op anywhere else), following the setting. Both the
  // host and the app state are signals: the effect has to run again whichever of the two arrives last.
  const [glassHost, setGlassHost] = createSignal<GlassHost>()
  createEffect(() => {
    const host = glassHost()
    const app = state()
    // Before the app state exists the setting is unknown, but the default is on: the window should not flash opaque.
    const wanted = app === undefined ? true : app.settings.settings().glass
    if (host !== undefined) void (wanted ? applyGlass(host).then((mode) => console.info(`Liquid Glass: ${mode ?? "off"}`)) : removeGlass(host))
  })
  const theme = watchSystemTheme()
  createEffect(() => { const app = state(); if (app) theme.apply(app.settings.settings().theme) })
  onMount(() => {
    void start()
    if (isTauri()) void tauriGlassHost().then(setGlassHost).catch(() => undefined)
  })
  onCleanup(() => { disposed = true; connecting?.abort(); attempt++; state()?.dispose(); theme.dispose() })
  return (
    <Show when={state()} fallback={<BootScreen state={boot()} elapsedSeconds={elapsed()} onRetry={() => { resetEndpoint(); void start() }} />}>
      {(app) => <AppRoutes state={app()} />}
    </Show>
  )
}
