import type { EntityChange, PullRequestRow, VcsCommit, WorkflowRunRow } from "@cadcamfun/api"
import { createResource, createSignal, For, Match, Show, Switch, type Component } from "solid-js"
import { CompanionClient, type PullRequestDetail } from "./companion/client.ts"
import { parsePairingLink } from "./companion/pairing.ts"
import { browserStore } from "./companion/store.ts"
import type { ChatEvent } from "./companion/sse.ts"

type Tab = "history" | "pulls" | "actions" | "assistant"
const TABS: ReadonlyArray<readonly [Tab, string]> = [["history", "History"], ["pulls", "Pull requests"], ["actions", "Actions"], ["assistant", "Assistant"]]

const ago = (iso: string) => new Date(iso).toLocaleString()
const short = (oid: string) => oid.slice(0, 7)

const Pair: Component<{ onPaired: (c: CompanionClient) => void }> = (props) => {
  const [link, setLink] = createSignal("")
  const [error, setError] = createSignal("")
  const connect = async () => {
    try {
      const pairing = parsePairingLink(link())
      const client = new CompanionClient(pairing)
      await client.health()
      await browserStore.save(pairing)
      props.onPaired(client)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <main class="screen">
      <h1>Pair with your desktop</h1>
      <p class="muted">On the desktop open Settings → Companion and scan the QR code, or paste the pairing link.</p>
      <textarea rows="4" placeholder="cadcamfun://pair?…" value={link()} onInput={(e) => setLink(e.currentTarget.value)} />
      <Show when={error()}><p class="error">{error()}</p></Show>
      <button class="primary" onClick={connect}>Connect</button>
    </main>
  )
}

const ChangeView: Component<{ change: EntityChange }> = (props) => (
  <li class="change">
    <strong>{props.change.name ?? props.change.path}</strong> <span class={`pill ${props.change.status}`}>{props.change.status}</span>
    <ul>
      <For each={props.change.changes.slice(0, 12)}>
        {(c) => <li><code>{c.pointer}</code> {c.before !== undefined && <del>{JSON.stringify(c.before)}</del>} {c.after !== undefined && <ins>{JSON.stringify(c.after)}</ins>}</li>}
      </For>
    </ul>
  </li>
)

const PullRequestView: Component<{ client: CompanionClient; projectId: string; number: number; onBack: () => void }> = (props) => {
  const [detail, { refetch }] = createResource<PullRequestDetail>(() => props.client.pullRequest(props.projectId, props.number))
  const [message, setMessage] = createSignal("")
  const act = async (run: () => Promise<unknown>) => {
    try {
      setMessage("")
      await run()
      await refetch()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <section>
      <button onClick={props.onBack}>‹ Back</button>
      <Show when={detail()} fallback={<p class="muted">Loading…</p>}>
        {(d) => (
          <>
            <h2>#{d().pullRequest.number} {d().pullRequest.title} <span class={`pill ${d().pullRequest.state}`}>{d().pullRequest.state}</span></h2>
            <p class="muted">{d().pullRequest.authorKind === "ai" ? "Proposed by the AI assistant" : "Opened by a person"} · {d().pullRequest.head} → {d().pullRequest.base}</p>
            <Show when={d().pullRequest.body}><p>{d().pullRequest.body}</p></Show>
            <h3>Changes</h3>
            <ul class="list"><For each={d().changes}>{(c) => <ChangeView change={c} />}</For></ul>
            <h3>Reviews</h3>
            <ul class="list"><For each={d().reviews}>{(r) => <li><span class={`pill ${r.verdict}`}>{r.verdict}</span> {r.body}</li>}</For></ul>
            <Show when={d().pullRequest.state === "open"}>
              <div class="actions">
                <button onClick={() => act(() => props.client.review(props.projectId, props.number, "request-changes", "Needs changes"))}>Request changes</button>
                <button onClick={() => act(() => props.client.review(props.projectId, props.number, "approve"))}>Approve</button>
                <button class="primary" onClick={() => act(() => props.client.merge(props.projectId, props.number))}>Merge</button>
              </div>
            </Show>
            <Show when={message()}><p class="error">{message()}</p></Show>
          </>
        )}
      </Show>
    </section>
  )
}

const Assistant: Component<{ client: CompanionClient; projectId: string }> = (props) => {
  const [input, setInput] = createSignal("")
  const [log, setLog] = createSignal<ChatEvent[]>([])
  const [busy, setBusy] = createSignal(false)
  let sessionId: string | undefined
  const send = async () => {
    const text = input().trim()
    if (!text || busy()) return
    setInput("")
    setBusy(true)
    setLog((l) => [...l, { type: "user", text }])
    try {
      for await (const e of props.client.chat(props.projectId, text, sessionId)) {
        if ("sessionId" in e && typeof e.sessionId === "string") sessionId = e.sessionId
        setLog((l) => [...l, e])
      }
    } catch (e) {
      setLog((l) => [...l, { type: "error", sessionId: sessionId ?? "", code: "internal", message: e instanceof Error ? e.message : String(e) }])
    } finally {
      setBusy(false)
    }
  }
  return (
    <section class="chat">
      <p class="muted">Ask for a change. The assistant works on its own branch and opens a pull request for you to review: it cannot touch main.</p>
      <For each={log()}>
        {(e) => (
          <Switch>
            <Match when={e.type === "user"}><p class="bubble me">{(e as { text: string }).text}</p></Match>
            <Match when={e.type === "delta"}><span>{(e as { text: string }).text}</span></Match>
            <Match when={e.type === "tool_call"}><p class="tool">⚙ {(e as { tool: string }).tool}</p></Match>
            <Match when={e.type === "error"}><p class="error">{(e as { message: string }).message}</p></Match>
          </Switch>
        )}
      </For>
      <form onSubmit={(ev) => { ev.preventDefault(); void send() }}>
        <input value={input()} onInput={(e) => setInput(e.currentTarget.value)} placeholder="Make the plate 20 mm wider…" />
        <button class="primary" disabled={busy()}>Send</button>
      </form>
    </section>
  )
}

const ProjectView: Component<{ client: CompanionClient; projectId: string; name: string; onBack: () => void }> = (props) => {
  const [tab, setTab] = createSignal<Tab>("pulls")
  const [openPr, setOpenPr] = createSignal<number>()
  const [commits] = createResource<VcsCommit[]>(() => props.client.log(props.projectId))
  const [pulls] = createResource<PullRequestRow[]>(() => props.client.pullRequests(props.projectId))
  const [runs, { refetch: refetchRuns }] = createResource<WorkflowRunRow[]>(() => props.client.runs(props.projectId))
  return (
    <main class="screen">
      <header><button onClick={props.onBack}>‹</button><h1>{props.name}</h1></header>
      <Show when={openPr() === undefined} fallback={<PullRequestView client={props.client} projectId={props.projectId} number={openPr()!} onBack={() => setOpenPr(undefined)} />}>
        <Switch>
          <Match when={tab() === "history"}>
            <ul class="list"><For each={commits()}>{(c) => <li><code>{short(c.oid)}</code> {c.message.split("\n")[0]}<br /><span class="muted">{c.author.name}</span></li>}</For></ul>
          </Match>
          <Match when={tab() === "pulls"}>
            <ul class="list">
              <For each={pulls()} fallback={<li class="muted">No pull requests yet.</li>}>
                {(p) => <li onClick={() => setOpenPr(p.number)}>#{p.number} {p.title} <span class={`pill ${p.state}`}>{p.state}</span>{p.authorKind === "ai" && <span class="pill ai">AI</span>}<br /><span class="muted">{ago(p.createdAt)}</span></li>}
              </For>
            </ul>
          </Match>
          <Match when={tab() === "actions"}>
            <button onClick={async () => { await props.client.dispatch(props.projectId); await refetchRuns() }}>Run workflows</button>
            <ul class="list"><For each={runs()} fallback={<li class="muted">No runs yet.</li>}>{(r) => <li>{r.workflow} <span class={`pill ${r.status}`}>{r.status}</span><br /><span class="muted">{r.event} · {short(r.sha)}</span></li>}</For></ul>
          </Match>
          <Match when={tab() === "assistant"}><Assistant client={props.client} projectId={props.projectId} /></Match>
        </Switch>
      </Show>
      <nav class="tabs"><For each={TABS}>{([id, label]) => <button classList={{ active: tab() === id }} onClick={() => { setOpenPr(undefined); setTab(id) }}>{label}</button>}</For></nav>
    </main>
  )
}

export const App: Component = () => {
  const [client, setClient] = createSignal<CompanionClient>()
  const [project, setProject] = createSignal<{ id: string; name: string }>()
  void browserStore.load().then((p) => p && setClient(new CompanionClient(p)))
  const [projects] = createResource(client, (c) => c.projects())
  return (
    <Show when={client()} fallback={<Pair onPaired={setClient} />}>
      {(c) => (
        <Show when={project()} fallback={
          <main class="screen">
            <h1>Projects</h1>
            <ul class="list"><For each={projects()}>{(p) => <li onClick={() => setProject({ id: p.id, name: p.name })}>{p.name}<br /><span class="muted">{ago(p.updatedAt)}</span></li>}</For></ul>
            <button onClick={async () => { await browserStore.clear(); setClient(undefined) }}>Unpair</button>
          </main>
        }>
          {(p) => <ProjectView client={c()} projectId={p().id} name={p().name} onBack={() => setProject(undefined)} />}
        </Show>
      )}
    </Show>
  )
}
