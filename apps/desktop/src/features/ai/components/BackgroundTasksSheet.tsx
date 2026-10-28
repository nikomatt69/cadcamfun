/**
 * The background-processes sheet (nikcli's delegation view): every subagent the primary launched in this
 * conversation, live — who is running, on what, for how long — with per-task cancel and the finished reports.
 *
 * The data is the store's task list, which the watcher polls from the host while anything runs, so the sheet
 * keeps moving after the turn that launched the tasks has ended. The transcript keeps its per-call task cards;
 * this sheet is the one place that answers "what is still running in the background?".
 */
import { For, Show, createEffect, createSignal, onCleanup, type JSX } from "solid-js"
import Check from "lucide-solid/icons/check"
import Clock from "lucide-solid/icons/clock"
import Layers from "lucide-solid/icons/layers"
import LoaderCircle from "lucide-solid/icons/loader-circle"
import X from "lucide-solid/icons/x"
import { t } from "../../../i18n/index.ts"
import { formatElapsed } from "../lib/task-card.ts"
import { renderAssistantMarkdown } from "../lib/markdown.ts"
import type { AiTask } from "../lib/types.ts"
import { useAiStore } from "../store/context.tsx"
import { isActiveTask } from "../store/tasks.ts"
import { agentLabel } from "./ToolRow.tsx"

const taskIcon = (task: AiTask): JSX.Element =>
  task.status === "completed" ? <Check size={13} aria-hidden="true" class="assistant-status-ok" />
    : task.status === "running" ? <LoaderCircle size={13} aria-hidden="true" class="animate-spin assistant-status-active" />
      : task.status === "queued" ? <Clock size={13} aria-hidden="true" class="assistant-status-active" />
        : <X size={13} aria-hidden="true" class={task.status === "error" ? "assistant-status-error" : "assistant-status-muted"} />

export function BackgroundTasksSheet(): JSX.Element {
  const ai = useAiStore()
  const [open, setOpen] = createSignal(false)
  const [now, setNow] = createSignal(Date.now())
  let panel: HTMLElement | undefined
  const active = (): ReadonlyArray<AiTask> => ai.tasks().filter(isActiveTask)
  const elapsed = (task: AiTask): string | undefined => {
    const from = task.startedAt ?? (task.status === "queued" ? undefined : task.createdAt)
    return from === undefined ? undefined : formatElapsed((task.finishedAt ?? now()) - from)
  }

  createEffect(() => {
    if (!open() || active().length === 0) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })
  // Entering: focus moves into the sheet (so Esc reaches its own key handler, not a window listener) and goes back to the
  // trigger on close.
  createEffect(() => {
    if (!open()) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    queueMicrotask(() => panel?.focus())
    onCleanup(() => { if (previous !== undefined && previous.isConnected) previous.focus() })
  })

  return (
    <>
      <Show when={ai.tasks().length > 0}>
        <button
          type="button"
          class="assistant-bg-trigger"
          data-testid="ai-bg-open"
          aria-haspopup="dialog"
          aria-expanded={open()}
          onClick={() => setOpen(true)}
        >
          <Layers size={12} aria-hidden="true" />
          <span>{t("ai.tasks.openSheet")}</span>
          <span class="assistant-pill" data-testid="ai-bg-active-count">{active().length}/{ai.tasks().length}</span>
          <Show when={active().length > 0}><LoaderCircle size={11} aria-hidden="true" class="animate-spin assistant-status-active" /></Show>
        </button>
      </Show>
      <Show when={open()}>
        <div class="assistant-context-overlay" data-testid="ai-bg-overlay" onClick={() => setOpen(false)}>
          <aside
            ref={panel}
            tabindex="-1"
            class="assistant-bg-sheet"
            data-testid="ai-bg-sheet"
            onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false) } }}
            role="dialog"
            aria-modal="true"
            aria-label={t("ai.tasks.sheetTitle")}
            onClick={(event) => event.stopPropagation()}
          >
            <div class="assistant-bg-sheet-head">
              <Layers size={14} aria-hidden="true" />
              <span style={{ flex: 1 }}>{t("ai.tasks.sheetTitle")}</span>
              <span class="assistant-pill">{active().length} / {ai.tasks().length}</span>
              <Show when={active().length > 0}>
                <button
                  type="button"
                  class="assistant-btn-xs"
                  data-testid="ai-bg-stop-all"
                  disabled={ai.controlBusy()}
                  onClick={async () => { for (const task of active()) await ai.cancelTask(task.id) }}
                >
                  {t("ai.tasks.stopAll")}
                </button>
              </Show>
              <button type="button" class="assistant-btn-xs" data-testid="ai-bg-close" aria-label={t("ai.tasks.sheetTitle")} onClick={() => setOpen(false)}>
                <X size={12} aria-hidden="true" />
              </button>
            </div>
            <Show when={ai.tasks().length > 0} fallback={<p class="assistant-bg-sheet-empty">{t("ai.tasks.sheetEmpty")}</p>}>
              <ul class="assistant-bg-sheet-list">
                <For each={ai.tasks()}>
                  {(task) => (
                    <li class="assistant-task-card list-none" data-testid="ai-bg-task" data-status={task.status} data-agent={task.agent} data-background={task.background ? "true" : "false"}>
                      <div class="assistant-task-card-head">
                        <span aria-hidden="true" class="assistant-task-card-icon">{taskIcon(task)}</span>
                        <span class="assistant-agent-pill">{agentLabel(task.agent)}</span>
                        <span class="assistant-task-card-title" title={task.description}>{task.description}</span>
                        <span class="assistant-pill" role="status">{t(`ai.tasks.status.${task.status}` as never)}</span>
                        <span class="assistant-meta-text">{task.background ? t("ai.tasks.background") : t("ai.tasks.inTurn")}</span>
                        <Show when={elapsed(task)}>{(value) => <span class="assistant-meta-text tabular-nums" title={t("ai.tasks.elapsed")}>{value()}</span>}</Show>
                        <Show when={isActiveTask(task)}>
                          <button
                            type="button"
                            class="assistant-btn-xs"
                            data-testid="ai-bg-cancel"
                            disabled={ai.controlBusy()}
                            aria-label={`${t("ai.controls.cancelTask")}: ${task.description}`}
                            onClick={() => void ai.cancelTask(task.id)}
                          >
                            {t("ai.controls.cancelTask")}
                          </button>
                        </Show>
                      </div>
                      <Show when={task.status === "queued"}>
                        <p class="assistant-task-card-hint">{t("ai.tasks.queuedHint")}</p>
                      </Show>
                      <Show when={task.error}>
                        {(message) => <p class="assistant-task-card-error" role="alert">{message()}</p>}
                      </Show>
                      <Show when={task.text}>
                        {(report) => (
                          <details class="assistant-task-card-details">
                            <summary class="assistant-task-card-summary">
                              <span class="font-semibold">{t("ai.tasks.report")}</span>
                              <span class="assistant-task-card-preview">{report().trim().split("\n")[0]}</span>
                            </summary>
                            <div class="assistant-markdown assistant-task-card-body" innerHTML={renderAssistantMarkdown(report())} />
                          </details>
                        )}
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </aside>
        </div>
      </Show>
    </>
  )
}
