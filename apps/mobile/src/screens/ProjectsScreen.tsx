/**
 * Projects list — the home of a paired phone.
 *
 * Composition rules (Apple §12 + Emil perf):
 *  - The list container is one `list-grouped` glass surface; rows are the only painted children.
 *  - Each row uses scale(0.97) on `:active` via the shared `.row` rule — instant feedback.
 *  - The header is its own `glass` sheet above the content; content scrolls under it.
 *  - Loading state is a centred spinner with a status line so perceived performance stays high.
 *
 * Wayfinding (Apple §16):
 *  - Title is "Projects" — specific, not "Home" (Emil: specificity creates predictability).
 *  - The chevron on each row tells the user where the tap will go.
 *  - Unpair is in the trailing edge of the nav as a text button — recoverable by re-pairing,
 *    so no confirmation sheet (Apple §16: don't over-confirm non-destructive actions).
 */
import { For, Match, Show, Switch, createResource, createSignal, type Component } from "solid-js"
import type { CompanionClient, ProjectSummary } from "../companion/client.ts"
import { ChevronRight, Refresh, Unpair } from "../components/Icon.tsx"
import { Spinner } from "../components/Spinner.tsx"
import { ago } from "../lib/format.ts"
import { haptic } from "../lib/haptic.ts"

export interface ProjectsScreenProps {
  readonly client: CompanionClient
  readonly store: { readonly clear: () => Promise<void> }
  readonly onOpen: (project: ProjectSummary) => void
  readonly onUnpair: () => void
}

export const ProjectsScreen: Component<ProjectsScreenProps> = (props) => {
  const [projects, { refetch }] = createResource<ReadonlyArray<ProjectSummary>>(() => props.client.projects())
  const [unpairing, setUnpairing] = createSignal(false)

  const unpair = async () => {
    if (unpairing()) return
    haptic("warning")
    setUnpairing(true)
    try {
      await props.store.clear()
      haptic("success")
      props.onUnpair()
    } catch {
      haptic("error")
    } finally {
      setUnpairing(false)
    }
  }

  return (
    <main class="screen has-tabs">
      <header class="nav nav-large nav-edge">
        <div class="nav-actions">
          <button
            class="btn-icon"
            onClick={() => { haptic("selection"); void refetch() }}
            aria-label="Refresh"
          >
            <Refresh size={20} />
          </button>
        </div>
        <div class="nav-title-row">
          <h1 class="nav-title-large">Projects</h1>
          <button class="btn-ghost" onClick={unpair} disabled={unpairing()}>
            <Show when={unpairing()} fallback={<><Unpair size={18} /> Unpair</>}>
              <Spinner size="sm" />
            </Show>
          </button>
        </div>
      </header>

      <div class="screen-pad">
        <Switch>
          <Match when={projects.loading}>
            <div class="empty">
              <Spinner size="lg" />
              <p class="t-subhead text-secondary">Loading projects…</p>
            </div>
          </Match>

          <Match when={projects.error}>
            <div class="card card-elevated">
              <p class="t-headline">Couldn't load projects</p>
              <p class="t-footnote text-secondary mt-2">{String(projects.error)}</p>
              <div class="actions-row">
                <button class="btn btn-secondary" onClick={() => void refetch()}>
                  <Refresh size={18} /> Try again
                </button>
              </div>
            </div>
          </Match>

          <Match when={projects()}>
            {(list) => (
              <Show
                when={list().length > 0}
                fallback={
                  <div class="empty">
                    <div class="empty-mark"><Refresh size={26} /></div>
                    <h3>No projects yet</h3>
                    <p>Create a project on your desktop, then pull to refresh.</p>
                  </div>
                }
              >
                <ul class="list list-grouped" role="list">
                  <For each={list()}>{(p, i) => (
                    <li
                      class="row"
                      role="button"
                      tabIndex={0}
                      style={{ "animation-delay": `${Math.min(i(), 6) * 35}ms` }}
                      onClick={() => { haptic("selection"); props.onOpen(p) }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          haptic("selection")
                          props.onOpen(p)
                        }
                      }}
                    >
                      <div class="row-icon" aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="4" y="3" width="16" height="18" rx="2" />
                          <line x1="8" y1="8" x2="16" y2="8" />
                          <line x1="8" y1="12" x2="14" y2="12" />
                          <line x1="8" y1="16" x2="12" y2="16" />
                        </svg>
                      </div>
                      <div class="row-body">
                        <span class="row-title bold">{p.name}</span>
                        <Show
                          when={p.description}
                          fallback={<span class="row-sub">{ago(p.updatedAt)}</span>}
                        >
                          <span class="row-sub">{p.description}</span>
                          <span class="row-sub t-tertiary">{ago(p.updatedAt)}</span>
                        </Show>
                      </div>
                      <span class="row-trailing"><ChevronRight class="chev" size={18} /></span>
                    </li>
                  )}</For>
                </ul>
              </Show>
            )}
          </Match>
        </Switch>
      </div>
    </main>
  )
}