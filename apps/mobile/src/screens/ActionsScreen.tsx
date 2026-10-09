/**
 * Actions tab — workflow runs and a "Run workflows" button.
 *
 * The dispatch button is a primary CTA; success is reported by both the haptic and a brief
 * refresh (Apple §13 — multimodal feedback on the same frame).
 */
import { For, Match, Show, Switch, createResource, createSignal, type Component } from "solid-js"
import type { WorkflowRunRow } from "@cadcamfun/api"
import type { CompanionClient } from "../companion/client.ts"
import { Play, Refresh } from "../components/Icon.tsx"
import { Pill } from "../components/Pill.tsx"
import { Spinner } from "../components/Spinner.tsx"
import { short, ago } from "../lib/format.ts"
import { haptic } from "../lib/haptic.ts"
import { errorMessage } from "../lib/error.ts"

export interface ActionsScreenProps {
  readonly client: CompanionClient
  readonly projectId: string
}

const tone = (status: WorkflowRunRow["status"]): "accent" | "success" | "danger" | "warning" | "neutral" => {
  if (status === "running" || status === "queued") return "accent"
  if (status === "success") return "success"
  if (status === "failure") return "danger"
  if (status === "cancelled") return "neutral"
  return "warning"
}

export const ActionsScreen: Component<ActionsScreenProps> = (props) => {
  const [runs, { refetch }] = createResource<WorkflowRunRow[]>(() => props.client.runs(props.projectId))
  const [dispatching, setDispatching] = createSignal(false)
  const [message, setMessage] = createSignal("")

  const dispatch = async () => {
    if (dispatching()) return
    setMessage("")
    setDispatching(true)
    haptic("light")
    try {
      await props.client.dispatch(props.projectId)
      haptic("success")
      await refetch()
    } catch (e) {
      haptic("error")
      setMessage(errorMessage(e))
    } finally {
      setDispatching(false)
    }
  }

  return (
    <div class="screen-pad">
      <div class="card card-elevated">
        <div class="row-between">
          <div>
            <p class="t-headline">Workflows</p>
            <p class="t-footnote text-secondary mt-2">Trigger every workflow registered for this project.</p>
          </div>
          <button class="btn btn-pill" style={{ width: "auto", height: "44px", "padding-inline": "20px" }} onClick={dispatch} disabled={dispatching()}>
            <Show when={dispatching()} fallback={<Play size={18} />}>
              <Spinner onAccent size="sm" />
            </Show>
            <span>{dispatching() ? "Running…" : "Run workflows"}</span>
          </button>
        </div>
        <Show when={message()}>
          <p class="t-footnote mt-3" style={{ color: "var(--red)" }}>{message()}</p>
        </Show>
      </div>

      <Switch>
        <Match when={runs.loading}>
          <div class="empty mt-4"><Spinner size="lg" /><p class="t-subhead text-secondary">Loading runs…</p></div>
        </Match>
        <Match when={runs()}>
          {(list) => (
            <Show when={list().length > 0} fallback={
              <div class="empty mt-4">
                <div class="empty-mark"><Play size={26} /></div>
                <h3>No runs yet</h3>
                <p>Dispatch the workflows above to create the first run.</p>
              </div>
            }>
              <ul class="list list-grouped mt-4" role="list">
                <For each={list()}>{(r, i) => (
                  <li class="row" style={{ "animation-delay": `${Math.min(i(), 6) * 35}ms` }}>
                    <div class="row-icon" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="13 3 5 14 11 14 9 21 19 9 13 9 13 3" />
                      </svg>
                    </div>
                    <div class="row-body">
                      <span class="row-title bold">{r.workflow}</span>
                      <span class="row-sub">{r.event} · <span class="t-mono">{short(r.sha)}</span> · {ago(r.startedAt)}</span>
                    </div>
                    <Pill tone={tone(r.status)} dot>{r.status}</Pill>
                  </li>
                )}</For>
              </ul>
            </Show>
          )}
        </Match>
      </Switch>

      <div class="actions-row mt-4">
        <button class="btn btn-secondary" onClick={() => { haptic("selection"); void refetch() }}>
          <Refresh size={18} /> Refresh
        </button>
      </div>
    </div>
  )
}