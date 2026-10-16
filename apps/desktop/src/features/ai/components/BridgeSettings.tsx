/**
 * Standalone nikcli (Settings → AI, RM-11): scoped, revocable tokens that let a nikcli outside the application — a terminal, another
 * machine, CI — drive one project through `@nikoemme_/cadcamfun-nikcli-plugin`. A token is for the open project, read-only or read-write, and
 * opens only the action bridge; it is shown once, here, and can be revoked at any time. Deleting or replacing work is never
 * reachable from outside: the application asks a person first, and only it can.
 */
import { For, Show, createSignal, onMount, type JSX } from "solid-js"
import Trash2 from "lucide-solid/icons/trash-2"
import { t } from "../../../i18n/index.ts"
import { toast } from "../../../shared/ui/toast.tsx"
import { useApp } from "../../../shared/state/context.ts"
import { useDocumentStore } from "../../cad/store/documentStore.ts"

interface TokenInfo {
  readonly id: string
  readonly name: string
  readonly projectId: string
  readonly mode: "read" | "write"
  readonly expiresAt: string
}

const FIELD = "assistant-field"

export function BridgeSettings(): JSX.Element {
  const app = useApp()
  const [tokens, setTokens] = createSignal<ReadonlyArray<TokenInfo>>([])
  const [mode, setMode] = createSignal<"read" | "write">("write")
  const [name, setName] = createSignal("")
  const [fresh, setFresh] = createSignal<string | undefined>()
  const [busy, setBusy] = createSignal(false)
  const [problem, setProblem] = createSignal<string | undefined>()
  const project = (): string | null => useDocumentStore.getState().projectId

  const load = async (): Promise<void> => {
    try { setTokens(await app.runtime.run(app.client.ai.bridgeTokens()) as ReadonlyArray<TokenInfo>) }
    catch (cause) { setProblem(cause instanceof Error ? cause.message : t("ai.bridge.failed")) }
  }
  onMount(() => { void load() })

  const issue = async (): Promise<void> => {
    const projectId = project()
    if (projectId === null) { setProblem(t("ai.bridge.noProject")); return }
    setBusy(true)
    setProblem(undefined)
    try {
      const out = await app.runtime.run(app.client.ai.issueBridgeToken({ payload: { name: name(), projectId, mode: mode() } }))
      setFresh(out.token)
      setName("")
      await load()
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : t("ai.bridge.failed"))
    } finally { setBusy(false) }
  }

  const revoke = async (id: string): Promise<void> => {
    setBusy(true)
    setProblem(undefined)
    try {
      await app.runtime.run(app.client.ai.revokeBridgeToken({ params: { id } }))
      toast.success(t("ai.bridge.revoked"))
      await load()
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : t("ai.bridge.failed"))
    } finally { setBusy(false) }
  }

  return (
    <div class="space-y-2" data-testid="ai-bridge">
      <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">{t("ai.bridge.title")}</h3>
      <p class="text-xs text-gray-500">{t("ai.bridge.hint")}</p>

      <ul class="space-y-1.5" data-testid="ai-bridge-list">
        <For each={tokens()}>{(token) => (
          <li class="assistant-list-card" data-testid="ai-bridge-token" data-mode={token.mode}>
            <div class="min-w-0 flex-1">
              <span class="font-medium">{token.name}</span>
              <span class="ml-2 assistant-pill">{t(token.mode === "read" ? "ai.bridge.read" : "ai.bridge.write")}</span>
              <p class="truncate font-mono assistant-meta-text mt-0.5" title={token.projectId}>{token.projectId} · {t("ai.bridge.expires", { date: token.expiresAt.slice(0, 10) })}</p>
            </div>
            <button type="button" class="assistant-icon-action is-danger" aria-label={t("ai.bridge.revoke", { name: token.name })} disabled={busy()} data-testid="ai-bridge-revoke" onClick={() => void revoke(token.id)}>
              <Trash2 size={12} aria-hidden="true" />
            </button>
          </li>
        )}</For>
      </ul>

      <div class="flex flex-wrap items-center gap-2">
        <input class={`${FIELD} flex-1 min-w-[160px]`} placeholder={t("ai.bridge.name")} value={name()} onInput={(event) => setName(event.currentTarget.value)} data-testid="ai-bridge-name" />
        <select class={`${FIELD} w-auto`} value={mode()} onChange={(event) => setMode(event.currentTarget.value === "read" ? "read" : "write")} data-testid="ai-bridge-mode">
          <option value="write">{t("ai.bridge.write")}</option>
          <option value="read">{t("ai.bridge.read")}</option>
        </select>
        <button type="button" class="assistant-btn assistant-btn-primary" disabled={busy()} data-testid="ai-bridge-issue" onClick={() => void issue()}>{t("ai.bridge.issue")}</button>
      </div>

      <Show when={fresh()}>
        {(token) => (
          <div class="assistant-enterprise-card p-3 space-y-2" data-testid="ai-bridge-fresh">
            <p class="text-xs">{t("ai.bridge.once")}</p>
            <input class={`${FIELD} w-full font-mono`} readOnly value={token()} onFocus={(event) => event.currentTarget.select()} data-testid="ai-bridge-secret" />
            <button type="button" class="assistant-btn assistant-btn-secondary" onClick={() => setFresh(undefined)}>{t("ai.bridge.done")}</button>
          </div>
        )}
      </Show>
      <Show when={problem()}>
        <p role="alert" class="assistant-status-error text-xs" data-testid="ai-bridge-problem">{problem()}</p>
      </Show>
    </div>
  )
}
