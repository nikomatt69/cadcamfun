import { For, Show, createSignal, onMount, type JSX } from "solid-js"
import { cam } from "@cadcamfun/core"
import { useApp } from "../../../../shared/state/context.ts"
import { t } from "../../../../i18n/index.ts"

type Stored = { readonly id: string; readonly name: string; readonly data: unknown }

/**
 * The post of the program as data (spec 54 C1): a definition is JSON the person edits, checks (the sidecar answers with the place of
 * each mistake, or with the standard sample program written by the post), keeps in the library (category "post") and uses for the
 * kernel program. The kernel writes the NC with it in place of the machine's built-in post and replays that NC like any other.
 */
export default function KernelPost(props: {
  readonly current: unknown
  readonly onUse: (definition: unknown | undefined) => void
}): JSX.Element {
  const app = useApp()
  const [text, setText] = createSignal(props.current === undefined ? "" : JSON.stringify(props.current, null, 2))
  const [issues, setIssues] = createSignal<ReadonlyArray<{ readonly path: string; readonly message: string }>>([])
  const [sample, setSample] = createSignal<string>()
  const [checked, setChecked] = createSignal<unknown>()
  const [stored, setStored] = createSignal<ReadonlyArray<Stored>>([])
  const [error, setError] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)

  const refresh = async (): Promise<void> => {
    try {
      const rows = await app.runtime.run(app.client.library.list({ query: { category: "post", type: "definition" } }))
      setStored(rows.map((row) => ({ id: row.id, name: row.name, data: row.data })))
    } catch { setStored([]) }
  }
  onMount(() => { void refresh() })

  const parse = (): { readonly value: unknown } | undefined => {
    try { return { value: JSON.parse(text()) } } catch (cause) {
      setIssues([{ path: "", message: cause instanceof Error ? cause.message : String(cause) }]); setSample(undefined); setChecked(undefined)
      return undefined
    }
  }
  const check = async (): Promise<void> => {
    const parsed = parse()
    if (parsed === undefined) return
    setBusy(true); setError(undefined)
    try {
      const answer = await app.runtime.run(app.client.toolpaths.postCheck({ payload: { definition: parsed.value as never } }))
      setIssues(answer.issues); setSample(answer.sample); setChecked(answer.valid ? parsed.value : undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setBusy(false) }
  }
  const save = async (): Promise<void> => {
    const value = checked() as { readonly name?: string } | undefined
    if (value === undefined) return
    setBusy(true); setError(undefined)
    try {
      await app.runtime.run(app.client.library.create({ payload: { name: value.name ?? "Post", category: "post", type: "definition", data: value as never } }))
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setBusy(false) }
  }
  const start = (id: keyof typeof cam.BUILTIN_DEFINITIONS): void => {
    setText(JSON.stringify(cam.BUILTIN_DEFINITIONS[id], null, 2)); setIssues([]); setSample(undefined); setChecked(undefined)
  }

  return (
    <details class="border-t border-gray-200 dark:border-gray-700 pt-2" data-testid="kernel-post" open={props.current !== undefined}>
      <summary class="cursor-pointer text-sm font-medium">{t("cam.post.title")}{props.current !== undefined ? ` (${t("cam.post.active")})` : ""}</summary>
      <div class="space-y-2 pt-2">
        <p class="text-xs text-gray-500">{t("cam.post.hint")}</p>
        <div class="flex flex-wrap gap-2">
          <For each={Object.keys(cam.BUILTIN_DEFINITIONS) as Array<keyof typeof cam.BUILTIN_DEFINITIONS>}>{(id) => (
            <button type="button" class="ui-btn ui-btn-secondary" onClick={() => start(id)} data-testid={`kernel-post-start-${id}`}>{t("cam.post.startFrom", { post: id })}</button>
          )}</For>
        </div>
        <Show when={stored().length > 0}>
          <label class="block text-xs">{t("cam.post.stored")}
            <select class="w-full rounded border border-gray-300 px-1 py-0.5 text-xs" data-testid="kernel-post-stored"
              onChange={(event) => { const row = stored().find((r) => r.id === event.currentTarget.value); if (row !== undefined) { setText(JSON.stringify(row.data, null, 2)); setIssues([]); setSample(undefined); setChecked(undefined) } event.currentTarget.value = "" }}>
              <option value="">{t("cam.post.choose")}</option>
              <For each={stored()}>{(row) => <option value={row.id}>{row.name}</option>}</For>
            </select>
          </label>
        </Show>
        <textarea class="w-full rounded border border-gray-300 px-1 py-0.5 font-mono text-xs" rows="10" spellcheck={false} value={text()} onInput={(event) => { setText(event.currentTarget.value); setChecked(undefined) }} data-testid="kernel-post-text" />
        <div class="flex flex-wrap gap-2">
          <button type="button" class="ui-btn ui-btn-secondary" disabled={busy() || text().trim() === ""} onClick={() => void check()} data-testid="kernel-post-check">{t("cam.post.check")}</button>
          <button type="button" class="ui-btn ui-btn-secondary" disabled={checked() === undefined} onClick={() => props.onUse(checked())} data-testid="kernel-post-use">{t("cam.post.use")}</button>
          <button type="button" class="ui-btn ui-btn-secondary" disabled={checked() === undefined || busy()} onClick={() => void save()} data-testid="kernel-post-save">{t("cam.post.save")}</button>
          <Show when={props.current !== undefined}><button type="button" class="ui-btn ui-btn-secondary" onClick={() => props.onUse(undefined)} data-testid="kernel-post-clear">{t("cam.post.clear")}</button></Show>
        </div>
        <Show when={error()}>{(message) => <p class="text-xs text-red-700 dark:text-red-300" role="alert" data-testid="kernel-post-error">{message()}</p>}</Show>
        <Show when={issues().length > 0}>
          <ul class="space-y-0.5 text-xs text-red-700 dark:text-red-300" data-testid="kernel-post-issues">
            <For each={issues()}>{(issue) => <li data-path={issue.path}><code>{issue.path === "" ? "(root)" : issue.path}</code>: {issue.message}</li>}</For>
          </ul>
        </Show>
        <Show when={sample()}>{(nc) => <pre class="max-h-48 overflow-auto rounded bg-gray-50 dark:bg-gray-900 p-2 text-[11px]" data-testid="kernel-post-sample">{nc().split("\n").slice(0, 40).join("\n")}</pre>}</Show>
      </div>
    </details>
  )
}
