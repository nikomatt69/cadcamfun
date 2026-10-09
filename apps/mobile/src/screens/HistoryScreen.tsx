/**
 * History tab — chronological commit log with author and message.
 *
 * Reading the VCS data via `props.client.log(id)` follows the same REST contract the desktop
 * exposes (see spec 13 §4). The list materialises from a single staggered fade-in (Emil: 35ms
 * between items, capped to avoid the staggering ever feeling slow).
 *
 * Tap-on-haptic (Apple §13): every navigation action fires the selection haptic on the same
 * frame the visual change happens — causality + harmony.
 */
import { For, Match, Show, Switch, createResource, type Component } from "solid-js"
import type { CompanionClient } from "../companion/client.ts"
import type { VcsCommit } from "@cadcamfun/api"
import { Spinner } from "../components/Spinner.tsx"
import { Pill } from "../components/Pill.tsx"
import { Refresh } from "../components/Icon.tsx"
import { short, ago } from "../lib/format.ts"
import { haptic } from "../lib/haptic.ts"

export interface HistoryScreenProps {
  readonly client: CompanionClient
  readonly projectId: string
}

export const HistoryScreen: Component<HistoryScreenProps> = (props) => {
  const [commits, { refetch }] = createResource<VcsCommit[]>(
    () => props.client.log(props.projectId),
  )

  return (
    <div class="screen-pad">
      <Switch>
        <Match when={commits.loading}>
          <div class="empty"><Spinner size="lg" /><p class="t-subhead text-secondary">Loading history…</p></div>
        </Match>
        <Match when={commits.error}>
          <div class="card card-elevated">
            <p class="t-headline">Couldn't load history</p>
            <p class="t-footnote text-secondary mt-2">{String(commits.error)}</p>
            <div class="actions-row">
              <button class="btn btn-secondary" onClick={() => { haptic("selection"); void refetch() }}>
                <Refresh size={18} /> Try again
              </button>
            </div>
          </div>
        </Match>
        <Match when={commits()}>
          {(list) => (
            <Show when={list().length > 0} fallback={
              <div class="empty">
                <div class="empty-mark"><Refresh size={26} /></div>
                <h3>No commits yet</h3>
                <p>The first commit on <code>main</code> appears once a person — or the AI assistant — saves a change.</p>
              </div>
            }>
              <ul class="list list-grouped" role="list">
                <For each={list()}>{(c, i) => (
                  <li
                    class="row"
                    style={{ "animation-delay": `${Math.min(i(), 6) * 35}ms` }}
                  >
                    <div class="row-icon" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <line x1="3" y1="12" x2="9" y2="12" />
                        <line x1="15" y1="12" x2="21" y2="12" />
                      </svg>
                    </div>
                    <div class="row-body">
                      <span class="row-title bold t-mono">{short(c.oid)} · {c.message.split("\n")[0]}</span>
                      <span class="row-sub">{c.author.name} · {ago(new Date(c.author.time).toISOString())}</span>
                    </div>
                  </li>
                )}</For>
              </ul>
            </Show>
          )}
        </Match>
      </Switch>
    </div>
  )
}