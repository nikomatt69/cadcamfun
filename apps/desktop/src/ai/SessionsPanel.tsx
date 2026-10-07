/**
 * The conversations of the assistant: open one, rename it, delete it, start a new one. The newest comes first and the
 * open one is marked. Titles start as the first words of the first message and can be renamed in place.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import Check from "lucide-solid/icons/check"
import Pencil from "lucide-solid/icons/pencil"
import Plus from "lucide-solid/icons/plus"
import Trash2 from "lucide-solid/icons/trash-2"
import { t } from "../i18n/index.ts"
import { useAiStore } from "./context.tsx"

const when = (iso: string): string => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function SessionsPanel(): JSX.Element {
  const ai = useAiStore()
  const [editing, setEditing] = createSignal<string | undefined>()
  const [title, setTitle] = createSignal("")
  const [confirming, setConfirming] = createSignal<string | undefined>()

  const commit = (id: string): void => {
    ai.renameSession(id, title())
    setEditing(undefined)
  }

  return (
    <section class="border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800" data-testid="ai-sessions">
      <div class="mb-1 flex items-center justify-between">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{t("ai.sessions.title")} ({ai.sessions().length})</p>
        <button type="button" class="btn btn-outline text-[11px]" onClick={() => ai.newSession()} data-testid="ai-session-new">
          <Plus size={11} aria-hidden="true" />
          {t("ai.sessions.new")}
        </button>
      </div>
      <Show when={ai.sessions().length > 0} fallback={<p class="text-xs text-gray-500">{t("ai.sessions.empty")}</p>}>
        <ul class="max-h-48 space-y-1 overflow-y-auto">
          <For each={ai.sessions()}>{(session) => (
            <li
              class="assistant-session-row flex items-center gap-2 rounded border px-2 py-1 text-xs"
              classList={{
                "border-blue-400 bg-blue-50 dark:bg-blue-950/30": session.id === ai.sessionId(),
                "border-gray-200 dark:border-gray-700": session.id !== ai.sessionId()
              }}
              data-testid={`ai-session-${session.id}`}
            >
              <Show
                when={editing() === session.id}
                fallback={
                  <button type="button" class="min-w-0 flex-1 text-left" onClick={() => ai.openSession(session.id)} data-testid="ai-session-open">
                    <span class="block truncate font-medium">{session.title}</span>
                    <span class="text-[10px] text-gray-500">{when(session.updatedAt)} · {t("ai.sessions.exchanges", { count: session.exchanges })}</span>
                  </button>
                }
              >
                <input
                  class="min-w-0 flex-1 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-900"
                  value={title()}
                  maxLength={80}
                  aria-label={t("ai.sessions.rename")}
                  data-testid="ai-session-title"
                  onInput={(event) => setTitle(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commit(session.id)
                    if (event.key === "Escape") setEditing(undefined)
                  }}
                  ref={(el) => queueMicrotask(() => el.focus())}
                />
                <button type="button" class="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700" aria-label={t("ai.sessions.save")} onClick={() => commit(session.id)}>
                  <Check size={12} aria-hidden="true" />
                </button>
              </Show>
              <Show when={editing() !== session.id}>
                <button type="button" class="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700" aria-label={t("ai.sessions.rename")} data-testid="ai-session-rename"
                  onClick={() => { setTitle(session.title); setEditing(session.id) }}>
                  <Pencil size={12} aria-hidden="true" />
                </button>
                <Show
                  when={confirming() === session.id}
                  fallback={
                    <button type="button" class="rounded p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" aria-label={t("ai.sessions.delete")} data-testid="ai-session-delete" onClick={() => setConfirming(session.id)}>
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  }
                >
                  <button type="button" class="rounded bg-red-600 px-1.5 py-0.5 text-[10px] text-white" data-testid="ai-session-confirm-delete"
                    onClick={() => { setConfirming(undefined); ai.deleteSession(session.id) }}>
                    {t("ai.sessions.confirmDelete")}
                  </button>
                </Show>
              </Show>
            </li>
          )}</For>
        </ul>
      </Show>
    </section>
  )
}
