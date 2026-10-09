/**
 * App shell — the top-level orchestrator.
 *
 * Responsibilities
 *  - Resolve the native bridge (iOS Tauri webview) vs. plain browser.
 *  - On launch: prefer a `--pair-link` argument, then a stored pairing, then show the Pair screen.
 *  - Drive navigation between Pair → Projects → Project → PR detail.
 *  - Surface connection errors as readable strings (the previous code swallowed Tauri error
 *    objects as `[object Object]`; see `lib/error.ts`).
 *
 * Loading indicator
 *  - Apple HIG progressive indicator (Spinner). Faster than the browser default rotation
 *    (720ms vs 1000ms), which makes the perceived load shorter even when the actual request
 *    takes the same time (Emil: perceived performance is half the battle).
 */
import { Show, createResource, createSignal, type Component } from "solid-js"
import { CompanionClient } from "./companion/client.ts"
import { keychainStore, launchPairLink, pinnedFetch, tauriBridge, type NativeBridge } from "./companion/native.ts"
import { browserStore, type SecretStore } from "./companion/store.ts"
import { parsePairingLink, type Pairing } from "./companion/pairing.ts"
import { errorMessage } from "./lib/error.ts"
import { haptic } from "./lib/haptic.ts"
import { Alert } from "./components/Icon.tsx"
import { Spinner } from "./components/Spinner.tsx"
import { PairScreen } from "./screens/PairScreen.tsx"
import { ProjectsScreen } from "./screens/ProjectsScreen.tsx"
import { ProjectScreen } from "./screens/ProjectScreen.tsx"
import { PRDetailSheet } from "./screens/PRDetailScreen.tsx"
import type { ProjectSummary } from "./companion/client.ts"

interface Environment {
  readonly bridge: NativeBridge | undefined
  readonly store: SecretStore
  readonly connect: (p: Pairing) => CompanionClient
}

const makeEnvironment = (bridge: NativeBridge | undefined): Environment => ({
  bridge,
  store: bridge ? keychainStore(bridge) : browserStore,
  connect: (p) => new CompanionClient(p, bridge ? pinnedFetch(bridge, p.fingerprint) : fetch),
})

export const App: Component = () => {
  const [env] = createResource<Environment>(async () => makeEnvironment(await tauriBridge()))
  const [bootError, setBootError] = createSignal("")
  const [client, setClient] = createSignal<CompanionClient | undefined>()
  const [project, setProject] = createSignal<ProjectSummary | undefined>()
  const [openPr, setOpenPr] = createSignal<number | undefined>()

  /** Launch-time + stored-pairing bootstrap. Returns true once a client is set (or none was found). */
  const [saved] = createResource<boolean, Environment>(env, async (e) => {
    setBootError("")
    // 1. `--pair-link` argument (CI, deep links)
    const launched = await launchPairLink(e.bridge).catch(() => undefined)
    if (launched) {
      try {
        const pairing = parsePairingLink(launched)
        const c = e.connect(pairing)
        await c.health()
        await e.store.save(pairing).catch(() => undefined)
        setClient(c)
        return true
      } catch (err) {
        // Fall through to a stored pairing or the Pair screen; report the error so the user
        // knows the link didn't work rather than wondering why the app is blank.
        setBootError(errorMessage(err))
      }
    }
    // 2. A previously stored pairing (Keychain on iOS, localStorage in a browser)
    const stored = await e.store.load().catch(() => undefined)
    if (stored) {
      try {
        const c = e.connect(stored)
        await c.health()
        setClient(c)
      } catch {
        // The stored token is no longer valid (server restarted, cert rotated). Wipe and
        // force the user to re-pair so we don't loop forever on a broken session.
        await e.store.clear().catch(() => undefined)
      }
    }
    return true
  })

  const onPaired = (c: CompanionClient) => {
    haptic("success")
    setClient(c)
  }

  const onUnpair = () => {
    setClient(undefined)
    setProject(undefined)
    setOpenPr(undefined)
  }

  return (
    <Show when={env() && saved()} fallback={
      <main class="screen screen-pad-tight">
        <div class="empty">
          <Spinner size="lg" />
          <p class="t-subhead text-secondary">Loading…</p>
        </div>
      </main>
    }>
      {/* Boot error banner — only when there is a launch-link failure AND no client yet */}
      {(() => {
        const err = bootError()
        if (!err || client()) return null
        return (
          <div class="pair-error" role="alert" style={{ "margin-top": "var(--s-4)" }}>
            <Alert size={18} />
            <span>{err}</span>
          </div>
        )
      })()}

      <Show when={client()} fallback={<PairScreen env={env()!} onPaired={onPaired} />}>
        {(c) => (
          <Show when={project()} fallback={
            <ProjectsScreen
              client={c()}
              store={env()!.store}
              onOpen={(p) => { haptic("selection"); setProject(p) }}
              onUnpair={onUnpair}
            />
          }>
            {(p) => (
              <ProjectScreen
                client={c()}
                project={p()}
                onBack={() => { haptic("selection"); setProject(undefined) }}
                onOpenPr={(n) => { haptic("selection"); setOpenPr(n) }}
              />
            )}
          </Show>
        )}
      </Show>

      <Show when={project() && client() && openPr()}>
        {(n) => (
          <PRDetailSheet
            open={true}
            client={client()!}
            projectId={project()!.id}
            number={n()}
            onClose={() => setOpenPr(undefined)}
            onChanged={() => { /* parent re-reads on next resource fetch */ }}
          />
        )}
      </Show>
    </Show>
  )
}