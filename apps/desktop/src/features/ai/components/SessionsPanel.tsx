/**
 * The conversations of the assistant: open one, rename it, delete it, start a new one. The newest comes first and the
 * open one is marked. Titles start as the first words of the first message and can be renamed in place.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import Check from "lucide-solid/icons/check"
import Pencil from "lucide-solid/icons/pencil"
import Plus from "lucide-solid/icons/plus"
import Trash2 from "lucide-solid/icons/trash-2"
import { t } from "../../../i18n/index.ts"
import { useAiStore } from "../store/context.tsx"

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
    <section class="assistant-sessions-panel" data-testid="ai-sessions">
      <div class="assistant-panel-header">
        <p class="assistant-section-label mb-0">{t("ai.sessions.title")} ({ai.sessions().length})</p>
        <button type="button" class="assistant-btn assistant-btn-secondary" onClick={() => ai.newSession()} data-testid="ai-session-new">
          <Plus size={11} aria-hidden="true" />
          {t("ai.sessions.new")}
        </button>
      </div>
      <Show when={ai.sessions().length > 0} fallback={<p class="assistant-meta-text">{t("ai.sessions.empty")}</p>}>
        <ul class="assistant-sessions-list">
          <For each={ai.sessions()}>{(session) => (
            <li
              class="assistant-session-row"
              classList={{
                "is-active": session.id === ai.sessionId()
              }}
              data-testid={`ai-session-${session.id}`}
            >
              <Show
                when={editing() === session.id}
                fallback={
                  <button type="button" class="assistant-session-open" onClick={() => ai.openSession(session.id)} data-testid="ai-session-open">
                    <span class="assistant-session-title">{session.title}</span>
                    <span class="assistant-session-meta">{when(session.updatedAt)} · {t("ai.sessions.exchanges", { count: session.exchanges })}</span>
                  </button>
                }
              >
                <input
                  class="assistant-field flex-1"
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
                <button type="button" class="assistant-icon-action" aria-label={t("ai.sessions.save")} onClick={() => commit(session.id)}>
                  <Check size={12} aria-hidden="true" />
                </button>
              </Show>
              <Show when={editing() !== session.id}>
                <button type="button" class="assistant-icon-action" aria-label={t("ai.sessions.rename")} data-testid="ai-session-rename"
                  onClick={() => { setTitle(session.title); setEditing(session.id) }}>
                  <Pencil size={12} aria-hidden="true" />
                </button>
                <Show
                  when={confirming() === session.id}
                  fallback={
                    <button type="button" class="assistant-icon-action is-danger" aria-label={t("ai.sessions.delete")} data-testid="ai-session-delete" onClick={() => setConfirming(session.id)}>
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  }
                >
                  <button type="button" class="assistant-btn-xs is-danger" data-testid="ai-session-confirm-delete"
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
