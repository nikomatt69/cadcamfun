/**
 * Pull requests tab — list of every PR for a project, filterable by state.
 *
 * Each row is a glass cell that opens a sheet for the full PR (changes + reviews + actions).
 * The AI pill is reserved for assistant-authored PRs so a person can tell at a glance which
 * branches are waiting for human review (Apple §16 — direct, specific labels beat generic ones).
 */
import { For, Match, Show, Switch, createResource, createSignal, type Accessor, type Component } from "solid-js"
import type { PullRequestRow } from "@cadcamfun/api"
import type { CompanionClient } from "../companion/client.ts"
import { ChevronRight } from "../components/Icon.tsx"
import { Pill } from "../components/Pill.tsx"
import { Spinner } from "../components/Spinner.tsx"
import { ago } from "../lib/format.ts"
import { haptic } from "../lib/haptic.ts"

export interface PullsScreenProps {
  readonly client: CompanionClient
  readonly projectId: string
  /** Bumped by the project screen when a live pull-request or commit frame arrives. */
  readonly refreshKey: Accessor<number>
  readonly onOpen: (number: number) => void
}

type StateFilter = "open" | "all" | "merged" | "closed"

/** The API accepts no filter for "everything"; `undefined` means exactly that. */
const serverState = (filter: StateFilter): PullRequestRow["state"] | undefined =>
  filter === "all" ? undefined : filter

const tone = (state: PullRequestRow["state"]): "accent" | "success" | "danger" | "neutral" =>
  state === "open" ? "accent" : state === "merged" ? "success" : state === "closed" ? "danger" : "neutral"

export const PullsScreen: Component<PullsScreenProps> = (props) => {
  const [filter, setFilter] = createSignal<StateFilter>("open")
  // The filter and the live refresh key are the resource's *sources*, so either changing refetches
  // with the right state while the previous list stays on screen (no spinner flash).
  const [pulls, { refetch }] = createResource<ReadonlyArray<PullRequestRow>, readonly [StateFilter, number]>(
    () => [filter(), props.refreshKey()] as const,
    ([f]) => props.client.pullRequests(props.projectId, serverState(f)),
  )

  return (
    <div class="screen-pad">
      <div class="filter-row" role="tablist" aria-label="Filter pull requests">
        <For each={["open", "merged", "closed", "all"] as const}>{(f) => (
          <button
            role="tab"
            aria-selected={filter() === f}
            classList={{ active: filter() === f }}
            onClick={() => { haptic("selection"); setFilter(f) }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        )}</For>
      </div>

      <Switch>
        <Match when={pulls.loading}>
          <div class="empty"><Spinner size="lg" /><p class="t-subhead text-secondary">Loading pull requests…</p></div>
        </Match>
        <Match when={pulls.error}>
          <div class="card card-elevated">
            <p class="t-headline">Couldn't load pull requests</p>
            <p class="t-footnote text-secondary mt-2">{String(pulls.error)}</p>
            <div class="actions-row">
              <button class="btn btn-secondary" onClick={() => { haptic("selection"); void refetch() }}>Try again</button>
            </div>
          </div>
        </Match>
        <Match when={pulls()}>
          {(list) => (
            <Show when={list().length > 0} fallback={
              <div class="empty">
                <div class="empty-mark"><ChevronRight size={26} /></div>
                <h3>No pull requests</h3>
                <p>When a person or the assistant opens a PR, it will appear here for review.</p>
              </div>
            }>
              <ul class="list list-grouped" role="list">
                <For each={list()}>{(p, i) => (
                  <li
                    class="row"
                    role="button"
                    tabIndex={0}
                    style={{ "animation-delay": `${Math.min(i(), 6) * 35}ms` }}
                    onClick={() => { haptic("selection"); props.onOpen(p.number) }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); haptic("selection"); props.onOpen(p.number) } }}
                  >
                    <div class="row-icon" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="12" r="2" />
                        <path d="M6 8 v8" /><path d="M8 6 h6 a4 4 0 0 1 4 4 v0 a4 4 0 0 1 -4 4 h-2" />
                      </svg>
                    </div>
                    <div class="row-body">
                      <span class="row-title bold">#{p.number} {p.title}</span>
                      <span class="row-sub">{p.head} → {p.base} · {ago(p.createdAt)}</span>
                    </div>
                    <span class="row-trailing">
                      <Show when={p.authorKind === "ai"}><Pill tone="ai">AI</Pill></Show>
                      <Pill tone={tone(p.state)} dot>{p.state}</Pill>
                      <ChevronRight class="chev" size={18} />
                    </span>
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