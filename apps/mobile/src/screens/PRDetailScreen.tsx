/**
 * PR detail — content rendered inside a glass sheet.
 *
 * The diff is presented as a "changes" list (entity + property pointer + before/after) because
 * the CAD-aware diff (`describeDiff`) already returns structured pointers — perfect for a
 * compact mobile view. We render a row per change with the pointer monospaced, the before/after
 * shown with `<ins>` / `<del>` so the eye reads them as a diff (Apple §16: hierarchy via colour
 * + weight).
 *
 * Actions: the assistant's pull requests carry an AI pill; humans can `approve`, `request
 * changes`, or `merge`. The merge action is the only destructive one and is gated by an
 * explicit "Merge" button (Emil: reserve confirmation for genuinely destructive actions).
 */
import { For, Match, Show, Switch, createResource, createSignal, type Component } from "solid-js"
import type { EntityChange, PullRequestRow, ReviewRow } from "@cadcamfun/api"
import type { CompanionClient, PullRequestDetail } from "../companion/client.ts"
import { Sheet } from "../components/Sheet.tsx"
import { Pill } from "../components/Pill.tsx"
import { Spinner } from "../components/Spinner.tsx"
import { Check, X, Merge, Robot, Person, Shield } from "../components/Icon.tsx"
import { ago, authorOf } from "../lib/format.ts"
import { errorMessage } from "../lib/error.ts"
import { haptic } from "../lib/haptic.ts"

export interface PRDetailSheetProps {
  readonly open: boolean
  readonly client: CompanionClient
  readonly projectId: string
  readonly number: number
  readonly onClose: () => void
  readonly onChanged: () => void
}

const stateTone = (state: PullRequestRow["state"]): "accent" | "success" | "danger" | "neutral" =>
  state === "open" ? "accent" : state === "merged" ? "success" : state === "closed" ? "danger" : "neutral"

const verdictTone = (v: ReviewRow["verdict"]): "success" | "danger" | "neutral" =>
  v === "approve" ? "success" : v === "request-changes" ? "danger" : "neutral"

const verdictLabel = (v: ReviewRow["verdict"]): string =>
  v === "approve" ? "Approved" : v === "request-changes" ? "Changes requested" : "Commented"

export const PRDetailSheet: Component<PRDetailSheetProps> = (props) => {
  const [detail, { refetch }] = createResource<PullRequestDetail, number>(
    () => props.number,
    (n) => props.client.pullRequest(props.projectId, n),
  )
  const [busy, setBusy] = createSignal<"" | "approve" | "request" | "merge" | "close">("")
  const [error, setError] = createSignal("")

  const act = async (kind: "approve" | "request" | "merge" | "close", run: () => Promise<unknown>) => {
    if (busy()) return
    setBusy(kind)
    setError("")
    haptic("light")
    try {
      await run()
      haptic("success")
      await refetch()
      props.onChanged()
    } catch (e) {
      haptic("error")
      setError(errorMessage(e))
    } finally {
      setBusy("")
    }
  }

  return (
    <Sheet open={props.open} onClose={props.onClose} title="Pull request">
      <Switch>
        <Match when={detail.loading}>
          <div class="empty"><Spinner size="lg" /><p class="t-subhead text-secondary">Loading…</p></div>
        </Match>
        <Match when={detail.error}>
          <div class="card card-elevated">
            <p class="t-headline">Couldn't load this pull request</p>
            <p class="t-footnote text-secondary mt-2">{errorMessage(detail.error)}</p>
          </div>
        </Match>
        <Match when={detail()}>
          {(d) => (
            <>
              <header class="stack mb-3">
                <div class="row-between">
                  <h3 class="t-title-2">#{d().pullRequest.number} {d().pullRequest.title}</h3>
                  <Pill tone={stateTone(d().pullRequest.state)} dot>{d().pullRequest.state}</Pill>
                </div>
                <p class="t-footnote text-secondary">
                  <Show when={d().pullRequest.authorKind === "ai"} fallback={<Person size={14} />}>
                    <Robot size={14} />
                  </Show>
                  {authorOf(d().pullRequest.authorKind, d().pullRequest.authorId)} ·
                  {" "}{d().pullRequest.head} → {d().pullRequest.base} · {ago(d().pullRequest.createdAt)}
                </p>
                <Show when={d().pullRequest.body}>
                  <p class="t-subhead mt-2" style={{ "white-space": "pre-wrap" }}>{d().pullRequest.body}</p>
                </Show>
              </header>

              <Show when={d().changes.length > 0}>
                <h4 class="section-header" style={{ "padding-left": "0", "padding-top": "0" }}>Changes</h4>
                <ul class="changes">
                  <For each={d().changes}>{(c: EntityChange) => (
                    <li class="change">
                      <h4>{c.name ?? c.path}</h4>
                      <ul>
                        <For each={c.changes.slice(0, 12)}>{(prop) => (
                          <li>
                            <code>{prop.pointer}</code>
                            <Show when={prop.before !== undefined}> <del>{JSON.stringify(prop.before)}</del></Show>
                            <Show when={prop.after !== undefined}> <ins>{JSON.stringify(prop.after)}</ins></Show>
                          </li>
                        )}</For>
                      </ul>
                    </li>
                  )}</For>
                </ul>
              </Show>

              <h4 class="section-header" style={{ "padding-left": "0" }}>Reviews</h4>
              <Show when={d().reviews.length > 0} fallback={
                <p class="t-footnote text-tertiary">No reviews yet.</p>
              }>
                <ul class="list list-grouped">
                  <For each={d().reviews}>{(r) => (
                    <li class="row" style={{ cursor: "default" }}>
                      <div class="row-icon" classList={{
                        success: r.verdict === "approve",
                        danger: r.verdict === "request-changes",
                      }} aria-hidden="true">
                        <Show when={r.verdict === "approve"} fallback={<X size={18} />}>
                          <Check size={18} />
                        </Show>
                      </div>
                      <div class="row-body">
                        <span class="row-title bold">{verdictLabel(r.verdict)}</span>
                        <Show when={r.body}><span class="row-sub">{r.body}</span></Show>
                      </div>
                      <Pill tone={verdictTone(r.verdict)}>{r.verdict}</Pill>
                    </li>
                  )}</For>
                </ul>
              </Show>

              <Show when={d().pullRequest.state === "open"}>
                <div class="card card-elevated mt-4">
                  <div class="row-between mb-3">
                    <div>
                      <p class="t-headline">Review & merge</p>
                      <p class="t-footnote text-secondary mt-2">
                        You are reviewing this PR on the phone. Every change still lands on <code>main</code> only after a person approves and merges.
                      </p>
                    </div>
                    <div class="row-icon" aria-hidden="true" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                      <Shield size={18} />
                    </div>
                  </div>
                  <Show when={error()}>
                    <p class="t-footnote mb-3" style={{ color: "var(--red)" }}>{error()}</p>
                  </Show>
                  <div class="actions-row">
                    <button
                      class="btn btn-secondary"
                      onClick={() => act("request", () => props.client.review(props.projectId, props.number, "request-changes", "Needs changes"))}
                      disabled={!!busy()}
                    >
                      <Show when={busy() === "request"} fallback={<X size={18} />}><Spinner onAccent size="sm" /></Show>
                      <span>Request changes</span>
                    </button>
                    <button
                      class="btn btn-secondary"
                      onClick={() => act("approve", () => props.client.review(props.projectId, props.number, "approve", ""))}
                      disabled={!!busy()}
                    >
                      <Show when={busy() === "approve"} fallback={<Check size={18} />}><Spinner onAccent size="sm" /></Show>
                      <span>Approve</span>
                    </button>
                    <button
                      class="btn"
                      onClick={() => act("merge", () => props.client.merge(props.projectId, props.number))}
                      disabled={!!busy()}
                    >
                      <Show when={busy() === "merge"} fallback={<Merge size={18} />}><Spinner onAccent size="sm" /></Show>
                      <span>Merge</span>
                    </button>
                  </div>
                </div>
              </Show>
            </>
          )}
        </Match>
      </Switch>
    </Sheet>
  )
}