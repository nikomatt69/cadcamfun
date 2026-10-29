/**
 * Version control of one project: the CADCAMFUN counterpart of `git` + GitHub's pull requests and Actions.
 * Changes (commit), History (commit list with property-level diffs and restore), Branches, Pull requests (review, merge),
 * Actions (workflow runs) and the GitHub mirror (push / pull). Everything goes through the sidecar's `vcs` API group.
 *
 * Reads use `useQuery` (so the cache and refresh signal follow the rest of the desktop), writes use `useMutation`
 * and invalidate the prefixes they affect. The path-filtered log re-keys on `path` and the tabs swap without
 * re-fetching what they don't need.
 */
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onMount, type JSX } from "solid-js"
import { useParams, useSearchParams } from "@solidjs/router"
import { Effect } from "effect"
import { invalidatePrefix } from "../../../shared/state/query-cache.ts"
import { useMutation, useQuery } from "../../../app/screen-queries.ts"
import { useApp } from "../../../shared/state/context.ts"
import { t } from "../../../i18n/index.ts"
import { readGithubToken, saveGithubToken } from "../../../app/github-token.ts"
import { WorkspaceDetail } from "../../../shared/components/WorkspacePage.tsx"

type Tab = "changes" | "history" | "branches" | "pulls" | "actions" | "github"
const TABS: ReadonlyArray<readonly [Tab, Parameters<typeof t>[0]]> = [
  ["changes", "vcs.tab.changes"], ["history", "vcs.tab.history"], ["branches", "vcs.tab.branches"],
  ["pulls", "vcs.tab.pulls"], ["actions", "vcs.tab.actions"], ["github", "vcs.tab.github"],
]

interface Commit { readonly oid: string; readonly parents: ReadonlyArray<string>; readonly message: string; readonly author: { readonly name: string; readonly time: number } }
interface Change { readonly path: string; readonly name?: string | undefined; readonly status: string; readonly changes: ReadonlyArray<{ readonly pointer: string; readonly before?: unknown; readonly after?: unknown }> }
interface Pull { readonly number: number; readonly title: string; readonly body: string; readonly head: string; readonly base: string; readonly state: string; readonly authorKind: string; readonly createdAt: string }
interface Review { readonly id: string; readonly verdict: string; readonly body: string }
interface Run { readonly id: string; readonly workflow: string; readonly event: string; readonly sha: string; readonly status: string; readonly startedAt: string; readonly events?: ReadonlyArray<RunEvent> }
/** One frame of a run's progress, as `WorkflowRunner` streams it. */
type RunEvent =
  | { readonly type: "job-start"; readonly job: string }
  | { readonly type: "step"; readonly job: string; readonly index: number; readonly uses: string; readonly status: "success" | "failure" | "skipped"; readonly message?: string }
  | { readonly type: "job-end"; readonly job: string; readonly status: string }
  | { readonly type: "invalid"; readonly message: string }

interface VcsStatus { readonly branch: string; readonly head: string | null; readonly dirty: ReadonlyArray<string> }
interface VcsBranches { readonly current: string; readonly branches: Readonly<Record<string, string>> }
interface PullDetail { readonly pullRequest: Pull; readonly reviews: ReadonlyArray<Review>; readonly changes: ReadonlyArray<Change> }

const BTN = "px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm hover:bg-slate-50 dark:hover:bg-gray-700 disabled:opacity-50"
const PRIMARY = "px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
const CARD = "ui-card ui-card-default !p-4"
const INPUT = "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-sm"
const PILL = (state: string): string => `ml-2 rounded-full border px-2 py-0.5 text-xs ${state === "open" || state === "running" ? "text-blue-600" : state === "merged" || state === "success" || state === "approve" ? "text-green-600" : "text-red-600"}`

const short = (oid: string): string => oid.slice(0, 7)
const show = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v))
const describeError = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null && "message" in cause) {
    const m = (cause as { message: unknown }).message
    if (typeof m === "string") return m
  }
  return String(cause)
}

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

const VCS = "vcs"

interface WorkflowFile { readonly name: string; readonly path: string; readonly content: string; readonly problem?: string }

/** A workflow that verifies and replays the programs of a commit — the shape to start from. */
const STARTER = `name: Validate
on:
  push:
    branches: ["**"]
    paths: ["toolpaths/**"]
  pullRequest:
    branches: ["main"]
  manual: {}
jobs:
  check:
    steps:
      - id: validate
        uses: project/validate
      - uses: cam/gcode
      - uses: cam/verify
`

/** Glyph + colour for one step's verdict, so a failed run is readable without reading its message. */
const STEP_MARK: Record<"success" | "failure" | "skipped", string> = {
  success: "text-green-600",
  failure: "text-red-600",
  skipped: "text-slate-400",
}

/**
 * The step timeline of one run, straight from the event stream the runner persisted. A run's verdict is
 * otherwise unexplainable: `status: failure` says nothing about *which* step refused, and that message
 * is the whole point of running the workflow.
 */
function RunTimeline(props: { readonly run: Run }): JSX.Element {
  const events = () => props.run.events ?? []
  return (
    <div class="mt-2 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
      <Show when={events().length > 0} fallback={<p class="text-xs text-slate-500">{t("vcs.actions.noEvents")}</p>}>
        <ul class="space-y-1 text-xs">
          <For each={events()}>
            {(e) => (
              <li>
                <Switch fallback={<span class="text-slate-500">{(e as { type: string }).type}</span>}>
                  <Match when={e.type === "invalid"}>
                    <span class="text-red-600">{(e as { message: string }).message}</span>
                  </Match>
                  <Match when={e.type === "job-start"}>
                    <span class="font-medium">{(e as { job: string }).job}</span>
                  </Match>
                  <Match when={e.type === "step"}>
                    <span class={`font-mono ${STEP_MARK[(e as { status: "success" | "failure" | "skipped" }).status]}`}>
                      {(e as { uses: string }).uses}
                    </span>
                    <Show when={(e as { message?: string }).message}>
                      <span class="text-slate-500"> {t("dashboard.metric.unavailable")} {(e as { message: string }).message}</span>
                    </Show>
                    <Show when={(e as { status: string }).status === "skipped"}>
                      <span class="text-slate-400"> ({t("vcs.actions.skipped")})</span>
                    </Show>
                  </Match>
                  <Match when={e.type === "job-end"}>
                    <span class="text-slate-500">{(e as { job: string }).job} · {(e as { status: string }).status}</span>
                  </Match>
                </Switch>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  )
}

export function ProjectHistoryScreen(): JSX.Element {
  const app = useApp()
  const params = useParams<{ id: string }>()
  const [search, setSearch] = useSearchParams<{ path?: string }>()
  /** When set, History shows only the commits that touched this file (a drawing, component, toolpath, material…). */
  const path = () => (typeof search.path === "string" && search.path !== "" ? search.path : undefined)
  const id = () => params.id
  const [tab, setTab] = createSignal<Tab>(typeof new URLSearchParams(window.location.search).get("path") === "string" ? "history" : "changes")
  const [token, setToken] = createSignal("")
  const [remoteValue, setRemote] = createSignal("")
  const [message, setMessage] = createSignal("")
  const [newBranch, setNewBranch] = createSignal("")
  const [prTitle, setPrTitle] = createSignal("")
  const [prHead, setPrHead] = createSignal("")
  const [prBase, setPrBase] = createSignal("main")
  const [selected, setSelected] = createSignal<Commit>()
  /** Which run's step timeline is expanded in the Actions tab; one at a time keeps the list scannable. */
  const [openRun, setOpenRun] = createSignal<string | undefined>(undefined)
  const [openPull, setOpenPull] = createSignal<{ pull: Pull; reviews: ReadonlyArray<Review>; changes: ReadonlyArray<Change> }>()
  const [reviewNote, setReviewNote] = createSignal("")
  const [notice, setNotice] = createSignal("")
  const [problem, setProblem] = createSignal("")

  const runtime = { run: app.runtime.run, cache: app.cache }
  const projectId = (): string => id()
  const projectKey = (): { id: string } => ({ id: projectId() })
  const logKey = (): { id: string; path?: string } => ({ id: projectId(), ...(path() ? { path: path()! } : {}) })

  // ── reads ────────────────────────────────────────────────────────────────
  const statusQ = useQuery<VcsStatus>(`${VCS}/status`, projectKey(), (client) => client.vcs.status({ params: projectKey() }), runtime, { cache: app.cache })
  const branchesQ = useQuery<VcsBranches>(`${VCS}/branches`, projectKey(), (client) => client.vcs.branches({ params: projectKey() }), runtime, { cache: app.cache })
  const logQ = useQuery<ReadonlyArray<Commit>>(
    `${VCS}/log`,
    logKey(),
    (client) => client.vcs.log({ params: { id: projectId() }, query: { limit: 100, ...(path() ? { path: path()! } : {}) } }),
    runtime,
    { cache: app.cache }
  )
  const pullsQ = useQuery<ReadonlyArray<Pull>>(`${VCS}/pulls`, projectKey(), (client) => client.vcs.listPullRequests({ params: projectKey(), query: {} }), runtime, { cache: app.cache })
  // The wire contract types `events` as `unknown[]`; the runner is what defines the frame shape, so the
// narrowing happens here rather than being pushed into every consumer.
const runsQ = useQuery<ReadonlyArray<Run>>(
    `${VCS}/runs`,
    projectKey(),
    (client) => client.vcs.runs({ params: projectKey() }).pipe(Effect.map((rows) => rows.map((r) => ({ ...r, events: (r.events ?? []) as ReadonlyArray<RunEvent> })))),
    runtime,
    { cache: app.cache }
  )
  const remoteQ = useQuery<{ readonly remote: string | null }>(`${VCS}/remote`, projectKey(), (client) => client.vcs.remote({ params: projectKey() }), runtime, { cache: app.cache })
  const diffQ = useQuery<ReadonlyArray<Change>>(
    `${VCS}/diff`,
    selected() ? { oid: selected()!.oid } : undefined,
    (client) => {
      const c = selected()
      if (!c) return Effect.succeed([] as ReadonlyArray<Change>)
      return client.vcs.diff({ params: { id: projectId() }, query: { ...(c.parents[0] ? { from: c.parents[0] } : {}), to: c.oid } })
    },
    runtime,
    { cache: app.cache, enabled: selected() !== undefined }
  )
  const pullQ = useQuery<PullDetail>(
    `${VCS}/pull`,
    openPull() ? { number: openPull()!.pull.number } : undefined,
    (client) => {
      const current = openPull()
      if (!current) return Effect.succeed({ pullRequest: {} as Pull, reviews: [], changes: [] })
      return client.vcs.pullRequest({ params: { id: projectId(), number: current.pull.number } })
    },
    runtime,
    { cache: app.cache, enabled: openPull() !== undefined }
  )

  // ── writes ───────────────────────────────────────────────────────────────
  const invalidatesAll = [`${VCS}/status`, `${VCS}/branches`, `${VCS}/log`, `${VCS}/runs`, `${VCS}/pulls`]
  const commitM = useMutation((client, m: string) => client.vcs.commit({ params: { id: id() }, payload: { message: m } }), runtime, invalidatesAll, app.cache)
  const restoreM = useMutation((client, rev: string, restorePath: string | undefined) => client.vcs.restore({ params: { id: id() }, payload: { rev, ...(restorePath ? { paths: [restorePath] } : {}) } }), runtime, invalidatesAll, app.cache)
  const createBranchM = useMutation((client, name: string) => client.vcs.createBranch({ params: { id: id() }, payload: { name } }), runtime, [`${VCS}/branches`, `${VCS}/status`], app.cache)
  const checkoutM = useMutation((client, branch: string) => client.vcs.checkout({ params: { id: id() }, payload: { branch } }), runtime, [`${VCS}/status`, `${VCS}/branches`, `${VCS}/log`], app.cache)
  const openPullRequestM = useMutation((client, title: string, head: string, base: string) => client.vcs.openPullRequest({ params: { id: id() }, payload: { title, head, base } }), runtime, [`${VCS}/pulls`], app.cache)
  const reviewM = useMutation((client, number: number, verdict: "approve" | "request-changes", body: string | undefined) => client.vcs.review({ params: { id: id(), number }, payload: { verdict, ...(body ? { body } : {}) } }), runtime, [`${VCS}/pull`], app.cache)
  const mergePullM = useMutation((client, number: number) => client.vcs.mergePullRequest({ params: { id: id(), number } }), runtime, [`${VCS}/pulls`, ...invalidatesAll.filter((p) => p !== `${VCS}/pulls`)], app.cache)
  const closePullM = useMutation((client, number: number) => client.vcs.closePullRequest({ params: { id: id(), number } }), runtime, [`${VCS}/pulls`], app.cache)
  const dispatchM = useMutation((client) => client.vcs.dispatch({ params: { id: id() }, payload: {} }), runtime, [`${VCS}/runs`], app.cache)
  const setRemoteM = useMutation((client, remote: string | null) => client.vcs.setRemote({ params: { id: id() }, payload: { remote } }), runtime, [`${VCS}/remote`], app.cache)
  const syncM = useMutation((client, kind: "push" | "pull", githubToken: string, branch: string | undefined): Effect.Effect<{ readonly oid: string }, unknown, never> => {
    const args = { params: { id: projectId() }, headers: { "x-github-token": githubToken }, payload: branch ? { branch } : {} }
    if (kind === "push") {
      return client.vcs.push(args) as unknown as Effect.Effect<{ readonly oid: string }, unknown, never>
    }
    return client.vcs.pull(args) as unknown as Effect.Effect<{ readonly oid: string }, unknown, never>
  }, runtime, [`${VCS}/status`, `${VCS}/branches`, `${VCS}/log`], app.cache)

  // Default PR head to a non-main branch when we first see the branch list.
  createEffect(() => {
    if (prHead() !== "") return
    const first = Object.keys(branchesQ.data()?.branches ?? {}).find((b) => b !== "main")
    if (first !== undefined) setPrHead(first)
  })
  // The diff and pull-detail reads are event-driven: re-fetch when the selection changes.
  createEffect(() => { selected(); diffQ.refetch() })
  createEffect(() => { openPull(); pullQ.refetch() })

  // The notice/clear on a fresh write.
  const flashProblem = (cause: unknown): void => { setProblem(t("vcs.error", { message: describeError(cause) })) }
  const flashNotice = (text: string): void => { setNotice(text); setProblem("") }

  const branch = (): string => statusQ.data()?.branch ?? "main"
  const head = (): string | null => statusQ.data()?.head ?? null
  const dirty = (): ReadonlyArray<string> => statusQ.data()?.dirty ?? []
  const branches = (): Readonly<Record<string, string>> => branchesQ.data()?.branches ?? {}
  const commits = (): ReadonlyArray<Commit> => logQ.data() ?? []
  const pulls = (): ReadonlyArray<Pull> => pullsQ.data() ?? []
  const runs = (): ReadonlyArray<Run> => runsQ.data() ?? []
  const remote = (): string => {
    const v = remoteValue()
    if (v !== "") return v
    return remoteQ.data()?.remote ?? ""
  }
  const selectedChanges = (): ReadonlyArray<Change> => diffQ.data() ?? []
  const loadedPull = (): { pullRequest: Pull; reviews: ReadonlyArray<Review>; changes: ReadonlyArray<Change> } | undefined => pullQ.data()

  const labels = createMemo(() => {
    const map = new Map<string, string[]>()
    for (const [name, oid] of Object.entries(branches())) map.set(oid, [...(map.get(oid) ?? []), name])
    return map
  })

  const firstError = (): unknown => [commitM.error(), restoreM.error(), createBranchM.error(), checkoutM.error(), openPullRequestM.error(), reviewM.error(), mergePullM.error(), closePullM.error(), dispatchM.error(), setRemoteM.error(), syncM.error()].find((e) => e !== undefined) ?? statusQ.error() ?? branchesQ.error() ?? logQ.error() ?? pullsQ.error() ?? runsQ.error() ?? remoteQ.error()
  const busy = (): boolean => commitM.pending() || restoreM.pending() || createBranchM.pending() || checkoutM.pending() || openPullRequestM.pending() || reviewM.pending() || mergePullM.pending() || closePullM.pending() || dispatchM.pending() || setRemoteM.pending() || syncM.pending()

  const refresh = (): void => { for (const p of invalidatesAll) invalidatePrefix(app.cache, p) }
  // The diff and pull-detail reads are event-driven; refresh them with the rest.
  const refreshDetail = (): void => { invalidatePrefix(app.cache, `${VCS}/diff`); invalidatePrefix(app.cache, `${VCS}/pull`) }

  onMount(() => { void readGithubToken().then((saved) => saved && setToken(saved)).catch(() => undefined) })

  const act = async (work: () => Promise<unknown>, okNotice?: string): Promise<void> => {
    try {
      await work()
      if (okNotice) flashNotice(okNotice)
      else refresh()
    } catch (cause) { flashProblem(cause) }
  }

  const commit = (): void => { void act(async () => { await commitM.mutate(message().trim()); setMessage("") }, undefined).then(() => refresh()) }
  const selectCommit = (c: Commit): void => { setSelected(c); diffQ.refetch() }
  const restore = (c: Commit): void => {
    if (!window.confirm(t("vcs.history.restoreConfirm", { id: short(c.oid) }))) return
    void act(async () => { await restoreM.mutate(c.oid, path()) }).then(() => { refresh(); refreshDetail() })
  }
  const createBranch = (): void => { const n = newBranch().trim(); if (!n) return; void act(async () => { await createBranchM.mutate(n); setNewBranch("") }) }
  const checkout = (name: string): void => { void act(async () => { await checkoutM.mutate(name) }).then(() => { refresh(); refreshDetail() }) }
  const openPullRequest = (): void => { const t1 = prTitle().trim(); if (!t1) return; void act(async () => { await openPullRequestM.mutate(t1, prHead(), prBase()); setPrTitle("") }) }
  const loadPull = (p: Pull): void => { setOpenPull({ pull: p, reviews: [], changes: [] }); pullQ.refetch() }
  const review = (verdict: "approve" | "request-changes"): void => {
    const current = openPull()
    if (!current) return
    const body = reviewNote().trim() || undefined
    void act(async () => { await reviewM.mutate(current.pull.number, verdict, body); setReviewNote("") }).then(refreshDetail)
  }
  const settle = (kind: "merge" | "close"): void => {
    const current = openPull()
    if (!current) return
    void act(async () => {
      if (kind === "merge") await mergePullM.mutate(current.pull.number)
      else await closePullM.mutate(current.pull.number)
      setOpenPull(undefined)
    }).then(() => { refresh(); refreshDetail() })
  }
  const dispatch = (): void => { void act(async () => { await dispatchM.mutate() }) }
  const saveRemote = (): void => { void act(async () => { await setRemoteM.mutate(remote().trim() || null); const t1 = token().trim(); if (t1) await saveGithubToken(t1) }) }
  const sync = (kind: "push" | "pull"): void => {
    const t1 = token().trim()
    if (t1) void saveGithubToken(t1)
    void act(async () => {
      const result = (await syncM.mutate(kind, t1, undefined)) as { readonly oid: string }
      flashNotice(t("vcs.github.done", { detail: short(result.oid) }))
    })
  }

  /**
   * The workflow files of the checked-out branch, with a small YAML editor. Saving is a commit like any
   * other, so CI changes travel through the same reviewable history as a change to the model — and the
   * file shown is the one in the tree, so what you edit is what a run would execute.
   */
  function WorkflowEditor(): JSX.Element {
    const [open, setOpen] = createSignal<string | undefined>(undefined)
    const [draft, setDraft] = createSignal("")
    const [newName, setNewName] = createSignal("build.yml")
    const [editing, setEditing] = createSignal(false)
    const [commitMessage, setCommitMessage] = createSignal("")

    const filesQ = useQuery<ReadonlyArray<WorkflowFile>>(
      `${VCS}/workflows`,
      projectKey(),
      (client) => client.vcs.listWorkflows({ params: projectKey(), query: {} }),
      runtime,
      { cache: app.cache }
    )
    const saveM = useMutation(
      (client, path: string, content: string, message: string) =>
        client.vcs.commit({ params: { id: projectId() }, payload: { message, files: { [path]: content } } }),
      runtime,
      [`${VCS}/workflows`, `${VCS}/log`],
      app.cache
    )

    const files = (): ReadonlyArray<WorkflowFile> => filesQ.data() ?? []
    const shown = (): WorkflowFile | undefined => files().find((f) => f.name === open())
    const select = (name: string): void => {
      setOpen(name)
      setEditing(false)
      setDraft(files().find((f) => f.name === name)?.content ?? "")
    }
    const startNew = (): void => {
      const name = newName().trim()
      if (!name) return
      const file = name.endsWith(".yml") || name.endsWith(".yaml") ? name : `${name}.yml`
      if (files().some((f) => f.name === file)) return select(file)
      setOpen(file)
      setEditing(true)
      setDraft(STARTER)
    }
    const save = (): void => {
      const file = shown()
      if (!file) return
      const message = commitMessage().trim()
      if (!message) return
      void act(async () => {
        await saveM.mutate(file.path, draft(), message)
        setCommitMessage("")
        setEditing(false)
        flashNotice(t("vcs.workflows.saved"))
      })
    }

    return (
      <section class={`${CARD} space-y-3`}>
        <h3 class="font-medium">{t("vcs.workflows.title")}</h3>
        <Show when={filesQ.error()}><p role="alert" class="text-sm text-red-600">{describeError(filesQ.error())}</p></Show>
        <Show when={files().length === 0} fallback={
          <ul class="space-y-1 text-sm">
            <For each={files()}>
              {(f) => (
                <li>
                  <button
                    class={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-left ${open() === f.name ? "bg-blue-50 dark:bg-blue-950" : "hover:bg-slate-50 dark:hover:bg-gray-800"}`}
                    aria-expanded={open() === f.name}
                    onClick={() => select(f.name)}
                  >
                    <span class="font-mono">{f.name}</span>
                    <Show when={f.problem}><span class="text-xs text-red-600">{t("vcs.workflows.invalid")}</span></Show>
                  </button>
                </li>
              )}
            </For>
          </ul>
        }>
          <p class="text-sm text-slate-500">{t("vcs.workflows.empty")}</p>
        </Show>

        <div class="flex gap-2">
          <input class={INPUT} placeholder={t("vcs.workflows.name")} value={newName()} onInput={(e) => setNewName(e.currentTarget.value)} />
          <button class={BTN} onClick={startNew}>{t("vcs.workflows.create")}</button>
        </div>

        <Show when={shown()}>
          {(file) => (
            <div class="space-y-2">
              <Show when={file().problem}>
                {(problem) => <p class="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950">{problem()}</p>}
              </Show>
              <Show
                when={editing()}
                fallback={<pre class="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 font-mono text-xs dark:bg-slate-900">{file().content}</pre>}
              >
                <textarea
                  class={`${INPUT} min-h-48 font-mono text-xs`}
                  aria-label={`${t("vcs.workflows.title")} ${file().name}`}
                  value={draft()}
                  onInput={(e) => setDraft(e.currentTarget.value)}
                />
                <p class="text-xs text-slate-500">{t("vcs.workflows.stepsHint")}</p>
                <div class="flex gap-2">
                  <input class={INPUT} placeholder={t("vcs.workflows.savePrompt")} value={commitMessage()} onInput={(e) => setCommitMessage(e.currentTarget.value)} />
                  <button class={PRIMARY} disabled={busy() || !commitMessage().trim()} onClick={save}>{t("vcs.workflows.save")}</button>
                  <button class={BTN} onClick={() => { setEditing(false); setDraft(file().content) }}>{t("projects.cancel")}</button>
                </div>
              </Show>
              <Show when={!editing()}>
                <button class={BTN} onClick={() => { setDraft(file().content); setEditing(true) }}>{t("cad.ribbon.edit")}</button>
              </Show>
            </div>
          )}
        </Show>
      </section>
    )
  }

  return (
    <WorkspaceDetail
      testId="project-history"
      title={t("vcs.title")}
      subtitle={`${t("vcs.branch")}: ${branch()}${head() ? ` · ${short(head()!)}` : ""}`}
      backHref={`/projects/${id()}`}
      backLabel={t("vcs.back")}
    >
    <div class="mx-auto w-full max-w-5xl space-y-4">
      <Show when={firstError()}>
        <p role="alert" class="text-red-600">{t("vcs.error", { message: describeError(firstError()) })}</p>
      </Show>
      <Show when={notice()}><p role="status" class="text-green-600">{notice()}</p></Show>

      <nav class="flex gap-2 border-b border-slate-200 dark:border-slate-700" role="tablist">
        <For each={TABS}>
          {([key, label]) => (
            <button role="tab" aria-selected={tab() === key} class={`px-3 py-2 text-sm ${tab() === key ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500"}`} onClick={() => setTab(key)}>{t(label)}</button>
          )}
        </For>
      </nav>

      <Show when={tab() === "changes"}>
        <section class={`${CARD} space-y-3`}>
          <p>{dirty().length === 0 ? t("vcs.changes.clean") : t("vcs.changes.dirty", { count: String(dirty().length) })}</p>
          <ul class="font-mono text-xs"><For each={dirty()}>{(p) => <li>{p}</li>}</For></ul>
          <input class={INPUT} placeholder={t("vcs.changes.message")} value={message()} onInput={(e) => setMessage(e.currentTarget.value)} />
          <button class={PRIMARY} disabled={busy() || !message().trim() || (dirty().length === 0 && head() !== null)} onClick={commit}>{t("vcs.changes.commit")}</button>
        </section>
      </Show>

      <Show when={tab() === "history"}>
        <Show when={path()}>
          <p class="flex items-center gap-2 text-sm">{t("vcs.history.file")}: <code>{path()}</code><button class={BTN} onClick={() => { setSearch({ path: undefined }); logQ.refetch() }}>{t("vcs.history.all")}</button></p>
        </Show>
        <section class="grid gap-4 md:grid-cols-2">
          <ul class={`${CARD} space-y-2`}>
            <Show when={commits().length === 0}><li class="text-sm text-slate-500">{t("vcs.history.empty")}</li></Show>
            <For each={commits()}>
              {(c) => (
                <li class="cursor-pointer text-sm" onClick={() => selectCommit(c)}>
                  <code>{short(c.oid)}</code> {c.message.split("\n")[0]}
                  <For each={labels().get(c.oid) ?? []}>{(b) => <span class="ml-2 rounded bg-blue-100 px-1 text-xs text-blue-700">{b}</span>}</For>
                  <Show when={c.parents.length > 1}><span class="ml-2 text-xs text-slate-500">{t("vcs.history.merge")}</span></Show>
                  <div class="text-xs text-slate-500">{c.author.name} · {new Date(c.author.time * 1000).toLocaleString()}</div>
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
                  <span><strong>{name}</strong> <code class="text-slate-500">{short(oid)}</code><Show when={name === branch()}><span class={PILL("open")}>{t("vcs.branches.current")}</span></Show></span>
                  <Show when={name !== branch()}><button class={BTN} onClick={() => checkout(name)}>{t("vcs.branches.checkout")}</button></Show>
                </li>
              )}
            </For>
          </ul>
          <div class="flex gap-2">
            <input class={INPUT} placeholder={t("vcs.branches.name")} value={newBranch()} onInput={(e) => setNewBranch(e.currentTarget.value)} />
            <button class={PRIMARY} disabled={busy() || !newBranch().trim() || head() === null} onClick={createBranch}>{t("vcs.branches.create")}</button>
          </div>
        </section>
      </Show>

      <Show when={tab() === "pulls"}>
        <section class="space-y-4">
          <Show when={!openPull()} fallback={
            <div class={`${CARD} space-y-3`}>
              <button class={BTN} onClick={() => setOpenPull(undefined)}>←</button>
              <h2 class="text-lg font-medium">#{(loadedPull()?.pullRequest ?? openPull()!.pull).number} {(loadedPull()?.pullRequest ?? openPull()!.pull).title}<span class={PILL((loadedPull()?.pullRequest ?? openPull()!.pull).state)}>{(loadedPull()?.pullRequest ?? openPull()!.pull).state}</span><Show when={(loadedPull()?.pullRequest ?? openPull()!.pull).authorKind === "ai"}><span class={PILL("open")}>{t("vcs.pulls.ai")}</span></Show></h2>
              <p class="text-sm text-slate-500">{(loadedPull()?.pullRequest ?? openPull()!.pull).head} → {(loadedPull()?.pullRequest ?? openPull()!.pull).base}</p>
              <Show when={(loadedPull()?.pullRequest ?? openPull()!.pull).body}><p class="text-sm">{(loadedPull()?.pullRequest ?? openPull()!.pull).body}</p></Show>
              <h3 class="font-medium">{t("vcs.pulls.files")}</h3>
              <ChangeList changes={loadedPull()?.changes ?? []} />
              <h3 class="font-medium">{t("vcs.pulls.reviews")}</h3>
              <ul class="text-sm"><For each={loadedPull()?.reviews ?? []}>{(r) => <li><span class={PILL(r.verdict)}>{r.verdict}</span> {r.body}</li>}</For></ul>
              <Show when={(loadedPull()?.pullRequest ?? openPull()!.pull).state === "open"}>
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
              <Show when={pulls().length === 0}><li class="text-sm text-slate-500">{t("vcs.pulls.empty")}</li></Show>
              <For each={pulls()}>
                {(p) => <li class="cursor-pointer text-sm" onClick={() => loadPull(p)}>#{p.number} {p.title}<span class={PILL(p.state)}>{p.state}</span><Show when={p.authorKind === "ai"}><span class={PILL("open")}>{t("vcs.pulls.ai")}</span></Show><div class="text-xs text-slate-500">{p.head} → {p.base}</div></li>}
              </For>
            </ul>
            <div class={`${CARD} space-y-2`}>
              <h3 class="font-medium">{t("vcs.pulls.open")}</h3>
              <input class={INPUT} placeholder={t("vcs.pulls.title")} value={prTitle()} onInput={(e) => setPrTitle(e.currentTarget.value)} />
              <div class="flex gap-2">
                <select class={INPUT} aria-label={t("vcs.pulls.head")} value={prHead()} onChange={(e) => setPrHead(e.currentTarget.value)}><For each={Object.keys(branches())}>{(b) => <option value={b}>{b}</option>}</For></select>
                <select class={INPUT} aria-label={t("vcs.pulls.base")} value={prBase()} onChange={(e) => setPrBase(e.currentTarget.value)}><For each={Object.keys(branches())}>{(b) => <option value={b}>{b}</option>}</For></select>
              </div>
              <button class={PRIMARY} disabled={busy() || !prTitle().trim() || !prHead()} onClick={openPullRequest}>{t("vcs.pulls.open")}</button>
            </div>
          </Show>
        </section>
      </Show>

      <Show when={tab() === "actions"}>
        <section class={`${CARD} space-y-3`}>
          <button class={PRIMARY} disabled={busy()} onClick={dispatch}>{t("vcs.actions.run")}</button>
          <WorkflowEditor />
          <ul class="space-y-2 text-sm">
            <Show when={runs().length === 0}><li class="text-slate-500">{t("vcs.actions.empty")}</li></Show>
            <For each={runs()}>
              {(r) => (
                <li>
                  <button
                    class="flex w-full items-center justify-between text-left"
                    aria-expanded={openRun() === r.id}
                    onClick={() => setOpenRun(openRun() === r.id ? undefined : r.id)}
                  >
                    <span>{r.workflow}<span class={PILL(r.status)}>{r.status}</span></span>
                    <span class="text-xs text-slate-500">{r.event} · <code>{short(r.sha)}</code> · {new Date(r.startedAt).toLocaleString()}</span>
                  </button>
                  <Show when={openRun() === r.id}><RunTimeline run={r} /></Show>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <Show when={tab() === "github"}>
        <section class={`${CARD} space-y-3`}>
          <label class="block text-sm">{t("vcs.github.remote")}<input class={`${INPUT} mt-1`} placeholder="owner/repo" value={remote()} onInput={(e) => setRemote(e.currentTarget.value)} /></label>
          <label class="block text-sm">{t("vcs.github.token")}<input type="password" autocomplete="off" class={`${INPUT} mt-1`} value={token()} onInput={(e) => setToken(e.currentTarget.value)} /></label>
          <p class="text-xs text-slate-500">{t("vcs.github.tokenHint")}</p>
          <div class="flex gap-2">
            <button class={BTN} disabled={busy()} onClick={saveRemote}>{t("vcs.github.save")}</button>
            <button class={PRIMARY} disabled={busy() || !remote().trim() || !token().trim()} onClick={() => sync("push")}>{t("vcs.github.push")}</button>
            <button class={BTN} disabled={busy() || !remote().trim() || !token().trim()} onClick={() => sync("pull")}>{t("vcs.github.pull")}</button>
          </div>
        </section>
      </Show>
    </div>
    </WorkspaceDetail>
  )
}
