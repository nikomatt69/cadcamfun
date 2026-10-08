/**
 * Version control of one project: the CADCAMFUN counterpart of `git` + GitHub's pull requests and Actions.
 * Changes (commit), History (commit list with property-level diffs and restore), Branches, Pull requests (review, merge),
 * Actions (workflow runs) and the GitHub mirror (push / pull). Everything goes through the sidecar's `vcs` API group.
 */
import { For, Show, createMemo, createSignal, onMount, type JSX } from "solid-js"
import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { useApp } from "../state/context.ts"
import { t } from "../i18n/index.ts"
import { readGithubToken, saveGithubToken } from "../app/github-token.ts"

type Tab = "changes" | "history" | "branches" | "pulls" | "actions" | "github"
const TABS: ReadonlyArray<readonly [Tab, Parameters<typeof t>[0]]> = [
  ["changes", "vcs.tab.changes"], ["history", "vcs.tab.history"], ["branches", "vcs.tab.branches"],
  ["pulls", "vcs.tab.pulls"], ["actions", "vcs.tab.actions"], ["github", "vcs.tab.github"],
]

interface Commit { readonly oid: string; readonly parents: ReadonlyArray<string>; readonly message: string; readonly author: { readonly name: string; readonly time: number } }
interface Change { readonly path: string; readonly name?: string | undefined; readonly status: string; readonly changes: ReadonlyArray<{ readonly pointer: string; readonly before?: unknown; readonly after?: unknown }> }
interface Pull { readonly number: number; readonly title: string; readonly body: string; readonly head: string; readonly base: string; readonly state: string; readonly authorKind: string; readonly createdAt: string }
interface Review { readonly id: string; readonly verdict: string; readonly body: string }
interface Run { readonly id: string; readonly workflow: string; readonly event: string; readonly sha: string; readonly status: string; readonly startedAt: string }

const BTN = "px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
const PRIMARY = "px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
const CARD = "rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4"
const INPUT = "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 text-sm"
const PILL = (state: string): string => `ml-2 rounded-full border px-2 py-0.5 text-xs ${state === "open" || state === "running" ? "text-blue-600" : state === "merged" || state === "success" || state === "approve" ? "text-green-600" : "text-red-600"}`

const short = (oid: string): string => oid.slice(0, 7)
const show = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v))

function ChangeList(props: { readonly changes: ReadonlyArray<Change> }): JSX.Element {
  return (
    <ul class="space-y-2">
      <For each={props.changes}>
        {(c) => (
          <li class="text-sm">
            <strong>{c.name ?? c.path}</strong><span class={PILL(c.status === "added" ? "success" : c.status === "deleted" ? "failure" : "open")}>{c.status}</span>
            <ul class="ml-4 mt-1 font-mono text-xs">
              <For each={c.changes.slice(0, 30)}>
                {(p) => <li>{p.pointer} <Show when={p.before !== undefined}><del class="text-red-600">{show(p.before)}</del></Show> <Show when={p.after !== undefined}><ins class="text-green-600 no-underline">{show(p.after)}</ins></Show></li>}
              </For>
            </ul>
          </li>
        )}
      </For>
    </ul>
  )
}

export function ProjectHistoryScreen(): JSX.Element {
  const app = useApp()
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams<{ path?: string }>()
  /** When set, History shows only the commits that touched this file (a drawing, component, toolpath, material…). */
  const path = () => (typeof search.path === "string" && search.path !== "" ? search.path : undefined)
  const id = () => params.id
  const [tab, setTab] = createSignal<Tab>(typeof new URLSearchParams(window.location.search).get("path") === "string" ? "history" : "changes")
  const [branch, setBranch] = createSignal("main")
  const [head, setHead] = createSignal<string | null>(null)
  const [dirty, setDirty] = createSignal<ReadonlyArray<string>>([])
  const [commits, setCommits] = createSignal<ReadonlyArray<Commit>>([])
  const [branches, setBranches] = createSignal<Readonly<Record<string, string>>>({})
  const [pulls, setPulls] = createSignal<ReadonlyArray<Pull>>([])
  const [runs, setRuns] = createSignal<ReadonlyArray<Run>>([])
  const [remote, setRemote] = createSignal("")
  const [token, setToken] = createSignal("")
  const [message, setMessage] = createSignal("")
  const [newBranch, setNewBranch] = createSignal("")
  const [prTitle, setPrTitle] = createSignal("")
  const [prHead, setPrHead] = createSignal("")
  const [prBase, setPrBase] = createSignal("main")
  const [selected, setSelected] = createSignal<Commit>()
  const [selectedChanges, setSelectedChanges] = createSignal<ReadonlyArray<Change>>([])
  const [openPull, setOpenPull] = createSignal<{ pull: Pull; reviews: ReadonlyArray<Review>; changes: ReadonlyArray<Change> }>()
  const [reviewNote, setReviewNote] = createSignal("")
  const [notice, setNotice] = createSignal("")
  const [problem, setProblem] = createSignal("")

  const run = app.runtime.run as <A>(effect: unknown) => Promise<A>
  const labels = createMemo(() => {
    const map = new Map<string, string[]>()
    for (const [name, oid] of Object.entries(branches())) map.set(oid, [...(map.get(oid) ?? []), name])
    return map
  })

  const attempt = async (work: () => Promise<unknown>): Promise<void> => {
    setProblem(""); setNotice("")
    try { await work() } catch (cause) {
      const text = typeof cause === "object" && cause !== null && "message" in cause ? String((cause as { message: unknown }).message) : String(cause)
      setProblem(t("vcs.error", { message: text }))
    }
  }

  const refresh = async (): Promise<void> => {
    const pid = { params: { id: id() } }
    const [status, brs, log, prs, rs, rm] = await Promise.all([
      run<{ branch: string; head: string | null; dirty: ReadonlyArray<string> }>(app.client.vcs.status(pid)),
      run<{ current: string; branches: Record<string, string> }>(app.client.vcs.branches(pid)),
      run<ReadonlyArray<Commit>>(app.client.vcs.log({ ...pid, query: { limit: 100, ...(path() ? { path: path()! } : {}) } })).catch(() => []),
      run<ReadonlyArray<Pull>>(app.client.vcs.listPullRequests({ ...pid, query: {} })),
      run<ReadonlyArray<Run>>(app.client.vcs.runs(pid)),
      run<{ remote: string | null }>(app.client.vcs.remote(pid)),
    ])
    setBranch(status.branch); setHead(status.head); setDirty(status.dirty); setBranches(brs.branches); setCommits(log)
    setPulls(prs); setRuns(rs); setRemote(rm.remote ?? "")
    if (!prHead()) setPrHead(Object.keys(brs.branches).find((b) => b !== "main") ?? "")
  }
  onMount(() => {
    void attempt(refresh)
    void readGithubToken().then((saved) => saved && setToken(saved)).catch(() => undefined)
  })

  const act = (work: () => Promise<unknown>) => attempt(async () => { await work(); await refresh() })

  const commit = () => act(async () => {
    await run(app.client.vcs.commit({ params: { id: id() }, payload: { message: message().trim() } }))
    setMessage("")
  })
  const selectCommit = (c: Commit) => attempt(async () => {
    setSelected(c)
    setSelectedChanges(await run<ReadonlyArray<Change>>(app.client.vcs.diff({ params: { id: id() }, query: { ...(c.parents[0] ? { from: c.parents[0] } : {}), to: c.oid } })))
  })
  const restore = (c: Commit) => {
    if (!window.confirm(t("vcs.history.restoreConfirm", { id: short(c.oid) }))) return
    void act(() => run(app.client.vcs.restore({ params: { id: id() }, payload: { rev: c.oid, ...(path() ? { paths: [path()!] } : {}) } })))
  }
  const createBranch = () => act(async () => {
    await run(app.client.vcs.createBranch({ params: { id: id() }, payload: { name: newBranch().trim() } }))
    setNewBranch("")
  })
  const checkout = (name: string) => act(() => run(app.client.vcs.checkout({ params: { id: id() }, payload: { branch: name } })))
  const openPullRequest = () => act(async () => {
    await run(app.client.vcs.openPullRequest({ params: { id: id() }, payload: { title: prTitle().trim(), head: prHead(), base: prBase() } }))
    setPrTitle("")
  })
  const loadPull = (p: Pull) => attempt(async () => {
    const d = await run<{ pullRequest: Pull; reviews: ReadonlyArray<Review>; changes: ReadonlyArray<Change> }>(app.client.vcs.pullRequest({ params: { id: id(), number: p.number } }))
    setOpenPull({ pull: d.pullRequest, reviews: d.reviews, changes: d.changes })
  })
  const review = (verdict: "approve" | "request-changes") => {
    const current = openPull()
    if (!current) return
    void attempt(async () => {
      await run(app.client.vcs.review({ params: { id: id(), number: current.pull.number }, payload: { verdict, ...(reviewNote().trim() ? { body: reviewNote().trim() } : {}) } }))
      setReviewNote("")
      await loadPull(current.pull)
    })
  }
  const settle = (kind: "merge" | "close") => {
    const current = openPull()
    if (!current) return
    void act(async () => {
      const args = { params: { id: id(), number: current.pull.number } }
      await run(kind === "merge" ? app.client.vcs.mergePullRequest(args) : app.client.vcs.closePullRequest(args))
      setOpenPull(undefined)
    })
  }
  const dispatch = () => act(() => run(app.client.vcs.dispatch({ params: { id: id() }, payload: {} })))
  const saveRemote = () => act(async () => {
    await run(app.client.vcs.setRemote({ params: { id: id() }, payload: { remote: remote().trim() || null } }))
    if (token().trim()) await saveGithubToken(token().trim())
  })
  const sync = (kind: "push" | "pull") => act(async () => {
    if (token().trim()) await saveGithubToken(token().trim())
    const args = { params: { id: id() }, headers: { "x-github-token": token().trim() }, payload: {} }
    const result = await run<{ oid: string }>(kind === "push" ? app.client.vcs.push(args) : app.client.vcs.pull(args))
    setNotice(t("vcs.github.done", { detail: short(result.oid) }))
  })

  return (
    <main class="mx-auto max-w-5xl space-y-4 p-6" data-testid="project-history">
      <header class="flex items-center justify-between">
        <div>
          <button class={BTN} onClick={() => navigate(`/projects/${id()}`, { state: {} })}>{t("vcs.back")}</button>
          <h1 class="mt-3 text-2xl font-semibold">{t("vcs.title")}</h1>
          <p class="text-sm text-gray-500">{t("vcs.branch")}: <strong>{branch()}</strong> <Show when={head()}>· <code>{short(head()!)}</code></Show></p>
        </div>
      </header>

      <Show when={problem()}><p role="alert" class="text-red-600">{problem()}</p></Show>
      <Show when={notice()}><p role="status" class="text-green-600">{notice()}</p></Show>

      <nav class="flex gap-2 border-b border-gray-200 dark:border-gray-700" role="tablist">
        <For each={TABS}>
          {([key, label]) => (
            <button role="tab" aria-selected={tab() === key} class={`px-3 py-2 text-sm ${tab() === key ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`} onClick={() => setTab(key)}>{t(label)}</button>
          )}
        </For>
      </nav>

      <Show when={tab() === "changes"}>
        <section class={`${CARD} space-y-3`}>
          <p>{dirty().length === 0 ? t("vcs.changes.clean") : t("vcs.changes.dirty", { count: String(dirty().length) })}</p>
          <ul class="font-mono text-xs"><For each={dirty()}>{(p) => <li>{p}</li>}</For></ul>
          <input class={INPUT} placeholder={t("vcs.changes.message")} value={message()} onInput={(e) => setMessage(e.currentTarget.value)} />
          <button class={PRIMARY} disabled={!message().trim() || (dirty().length === 0 && head() !== null)} onClick={commit}>{t("vcs.changes.commit")}</button>
        </section>
      </Show>

      <Show when={tab() === "history"}>
        <Show when={path()}>
          <p class="flex items-center gap-2 text-sm">{t("vcs.history.file")}: <code>{path()}</code><button class={BTN} onClick={() => { setSearch({ path: undefined }); void attempt(refresh) }}>{t("vcs.history.all")}</button></p>
        </Show>
        <section class="grid gap-4 md:grid-cols-2">
          <ul class={`${CARD} space-y-2`}>
            <Show when={commits().length === 0}><li class="text-sm text-gray-500">{t("vcs.history.empty")}</li></Show>
            <For each={commits()}>
              {(c) => (
                <li class="cursor-pointer text-sm" onClick={() => void selectCommit(c)}>
                  <code>{short(c.oid)}</code> {c.message.split("\n")[0]}
                  <For each={labels().get(c.oid) ?? []}>{(b) => <span class="ml-2 rounded bg-blue-100 px-1 text-xs text-blue-700">{b}</span>}</For>
                  <Show when={c.parents.length > 1}><span class="ml-2 text-xs text-gray-500">{t("vcs.history.merge")}</span></Show>
                  <div class="text-xs text-gray-500">{c.author.name} · {new Date(c.author.time * 1000).toLocaleString()}</div>
                </li>
              )}
            </For>
          </ul>
          <Show when={selected()}>
            {(c) => (
              <div class={`${CARD} space-y-3`}>
                <h3 class="font-medium">{t("vcs.history.changes")} <code>{short(c().oid)}</code></h3>
                <ChangeList changes={selectedChanges()} />
                <button class={BTN} onClick={() => restore(c())}>{path() ? t("vcs.history.restoreFile") : t("vcs.history.restore")}</button>
              </div>
            )}
          </Show>
        </section>
      </Show>

      <Show when={tab() === "branches"}>
        <section class={`${CARD} space-y-3`}>
          <ul class="space-y-2">
            <For each={Object.entries(branches())}>
              {([name, oid]) => (
                <li class="flex items-center justify-between text-sm">
                  <span><strong>{name}</strong> <code class="text-gray-500">{short(oid)}</code><Show when={name === branch()}><span class={PILL("open")}>{t("vcs.branches.current")}</span></Show></span>
                  <Show when={name !== branch()}><button class={BTN} onClick={() => void checkout(name)}>{t("vcs.branches.checkout")}</button></Show>
                </li>
              )}
            </For>
          </ul>
          <div class="flex gap-2">
            <input class={INPUT} placeholder={t("vcs.branches.name")} value={newBranch()} onInput={(e) => setNewBranch(e.currentTarget.value)} />
            <button class={PRIMARY} disabled={!newBranch().trim() || head() === null} onClick={createBranch}>{t("vcs.branches.create")}</button>
          </div>
        </section>
      </Show>

      <Show when={tab() === "pulls"}>
        <section class="space-y-4">
          <Show when={!openPull()} fallback={
            <div class={`${CARD} space-y-3`}>
              <button class={BTN} onClick={() => setOpenPull(undefined)}>←</button>
              <h2 class="text-lg font-medium">#{openPull()!.pull.number} {openPull()!.pull.title}<span class={PILL(openPull()!.pull.state)}>{openPull()!.pull.state}</span><Show when={openPull()!.pull.authorKind === "ai"}><span class={PILL("open")}>{t("vcs.pulls.ai")}</span></Show></h2>
              <p class="text-sm text-gray-500">{openPull()!.pull.head} → {openPull()!.pull.base}</p>
              <Show when={openPull()!.pull.body}><p class="text-sm">{openPull()!.pull.body}</p></Show>
              <h3 class="font-medium">{t("vcs.pulls.files")}</h3>
              <ChangeList changes={openPull()!.changes} />
              <h3 class="font-medium">{t("vcs.pulls.reviews")}</h3>
              <ul class="text-sm"><For each={openPull()!.reviews}>{(r) => <li><span class={PILL(r.verdict)}>{r.verdict}</span> {r.body}</li>}</For></ul>
              <Show when={openPull()!.pull.state === "open"}>
                <input class={INPUT} placeholder={t("vcs.pulls.reviewNote")} value={reviewNote()} onInput={(e) => setReviewNote(e.currentTarget.value)} />
                <div class="flex flex-wrap gap-2">
                  <button class={BTN} onClick={() => review("request-changes")}>{t("vcs.pulls.requestChanges")}</button>
                  <button class={BTN} onClick={() => review("approve")}>{t("vcs.pulls.approve")}</button>
                  <button class={PRIMARY} onClick={() => settle("merge")}>{t("vcs.pulls.merge")}</button>
                  <button class={BTN} onClick={() => settle("close")}>{t("vcs.pulls.close")}</button>
                </div>
              </Show>
            </div>
          }>
            <ul class={`${CARD} space-y-2`}>
              <Show when={pulls().length === 0}><li class="text-sm text-gray-500">{t("vcs.pulls.empty")}</li></Show>
              <For each={pulls()}>
                {(p) => <li class="cursor-pointer text-sm" onClick={() => void loadPull(p)}>#{p.number} {p.title}<span class={PILL(p.state)}>{p.state}</span><Show when={p.authorKind === "ai"}><span class={PILL("open")}>{t("vcs.pulls.ai")}</span></Show><div class="text-xs text-gray-500">{p.head} → {p.base}</div></li>}
              </For>
            </ul>
            <div class={`${CARD} space-y-2`}>
              <h3 class="font-medium">{t("vcs.pulls.open")}</h3>
              <input class={INPUT} placeholder={t("vcs.pulls.title")} value={prTitle()} onInput={(e) => setPrTitle(e.currentTarget.value)} />
              <div class="flex gap-2">
                <select class={INPUT} aria-label={t("vcs.pulls.head")} value={prHead()} onChange={(e) => setPrHead(e.currentTarget.value)}><For each={Object.keys(branches())}>{(b) => <option value={b}>{b}</option>}</For></select>
                <select class={INPUT} aria-label={t("vcs.pulls.base")} value={prBase()} onChange={(e) => setPrBase(e.currentTarget.value)}><For each={Object.keys(branches())}>{(b) => <option value={b}>{b}</option>}</For></select>
              </div>
              <button class={PRIMARY} disabled={!prTitle().trim() || !prHead()} onClick={openPullRequest}>{t("vcs.pulls.open")}</button>
            </div>
          </Show>
        </section>
      </Show>

      <Show when={tab() === "actions"}>
        <section class={`${CARD} space-y-3`}>
          <button class={PRIMARY} onClick={dispatch}>{t("vcs.actions.run")}</button>
          <ul class="space-y-2 text-sm">
            <Show when={runs().length === 0}><li class="text-gray-500">{t("vcs.actions.empty")}</li></Show>
            <For each={runs()}>{(r) => <li>{r.workflow}<span class={PILL(r.status)}>{r.status}</span><div class="text-xs text-gray-500">{r.event} · <code>{short(r.sha)}</code> · {new Date(r.startedAt).toLocaleString()}</div></li>}</For>
          </ul>
        </section>
      </Show>

      <Show when={tab() === "github"}>
        <section class={`${CARD} space-y-3`}>
          <label class="block text-sm">{t("vcs.github.remote")}<input class={`${INPUT} mt-1`} placeholder="owner/repo" value={remote()} onInput={(e) => setRemote(e.currentTarget.value)} /></label>
          <label class="block text-sm">{t("vcs.github.token")}<input type="password" autocomplete="off" class={`${INPUT} mt-1`} value={token()} onInput={(e) => setToken(e.currentTarget.value)} /></label>
          <p class="text-xs text-gray-500">{t("vcs.github.tokenHint")}</p>
          <div class="flex gap-2">
            <button class={BTN} onClick={saveRemote}>{t("vcs.github.save")}</button>
            <button class={PRIMARY} disabled={!remote().trim() || !token().trim()} onClick={() => sync("push")}>{t("vcs.github.push")}</button>
            <button class={BTN} disabled={!remote().trim() || !token().trim()} onClick={() => sync("pull")}>{t("vcs.github.pull")}</button>
          </div>
        </section>
      </Show>
    </main>
  )
}
