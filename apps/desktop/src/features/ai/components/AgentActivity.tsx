/**
 * What the agent is doing, in the transcript's own terms: the goal it works toward, its plan as a checklist, the step it is on,
 * a tool it is still writing (a long call is visibly alive), a provider retry, a compaction. Nothing here is decoration: every
 * line is a fact from the host's events, and the panel is absent when the agent has said and done nothing of the sort.
 */
import { For, Show, type JSX } from "solid-js"
import Check from "lucide-solid/icons/check"
import Circle from "lucide-solid/icons/circle"
import LoaderCircle from "lucide-solid/icons/loader-circle"
import X from "lucide-solid/icons/x"
import { t } from "../../../i18n/index.ts"
import { useAiStore } from "../store/context.tsx"
import type { AiTask, AiTodo } from "../lib/types.ts"
import { agentLabel } from "./ToolRow.tsx"

const kb = (chars: number): string => (chars < 1000 ? `${chars} B` : `${(chars / 1000).toFixed(1)} KB`)

const icon = (todo: AiTodo): JSX.Element =>
  todo.status === "completed" ? <Check size={12} aria-hidden="true" class="assistant-status-ok" />
    : todo.status === "in_progress" ? <LoaderCircle size={12} aria-hidden="true" class="animate-spin assistant-status-active" />
      : todo.status === "cancelled" ? <X size={12} aria-hidden="true" class="assistant-status-muted" />
        : <Circle size={12} aria-hidden="true" class="assistant-status-muted" />

const taskIcon = (task: AiTask): JSX.Element =>
  task.status === "completed" ? <Check size={12} aria-hidden="true" class="assistant-status-ok" />
    : task.status === "running" || task.status === "queued" ? <LoaderCircle size={12} aria-hidden="true" class="animate-spin assistant-status-active" />
      : <X size={12} aria-hidden="true" class={task.status === "error" ? "assistant-status-error" : "assistant-status-muted"} />

export function AgentActivity(): JSX.Element {
  const ai = useAiStore()
  const running = (): boolean => ai.status() === "connecting" || ai.status() === "streaming"
  const done = (): number => ai.plan().filter((x) => x.status === "completed").length
  return (
    <Show when={ai.plan().length > 0 || ai.goal() !== undefined || running() || ai.tasks().length > 0}>
      <section class="assistant-activity" data-testid="ai-activity" aria-live="polite">
        <Show when={ai.goal()}>
          {(goal) => (
            <p class="assistant-goal-row" data-testid="ai-goal">
              <span class="assistant-goal-label">{t("ai.agent.goal")}</span>
              <span class="assistant-goal-objective" title={goal().objective}>{goal().objective}</span>
              <span class="assistant-pill" data-status={goal().status}>{t(`ai.agent.goal.${goal().status}` as never)}</span>
              <span class="assistant-meta-text">{t("ai.agent.iteration", { n: goal().iteration })}</span>
              {/* A goal is read and changed with the same line `/goal` takes; while the agent works a message would join its turn, so the buttons wait. */}
              <Show when={!running()}>
                <span class="assistant-goal-controls" data-testid="ai-goal-controls">
                  <Show when={goal().status === "active" || goal().status === "budget_limited"}>
                    <button type="button" class="assistant-btn-xs" data-testid="ai-goal-pause" onClick={() => void ai.send("/goal pause")}>{t("ai.agent.goal.pause")}</button>
                  </Show>
                  <Show when={goal().status === "paused" || goal().status === "blocked" || goal().status === "usage_limited"}>
                    <button type="button" class="assistant-btn-xs assistant-btn-xs-primary" data-testid="ai-goal-resume" onClick={() => void ai.send("/goal resume")}>{t("ai.agent.goal.resume")}</button>
                  </Show>
                  <button type="button" class="assistant-btn-xs" data-testid="ai-goal-clear" onClick={() => void ai.send("/goal clear")}>{t("ai.agent.goal.clear")}</button>
                </span>
              </Show>
            </p>
          )}
        </Show>
        <Show when={ai.plan().length > 0}>
          <details open class="assistant-plan-details" data-testid="ai-plan">
            <summary class="assistant-activity-summary">
              <span>{t("ai.agent.plan")}</span>
              <span class="assistant-pill">{done()}/{ai.plan().length}</span>
            </summary>
            <ul class="assistant-plan-list">
              <For each={ai.plan()}>{(todo) => (
                <li class="assistant-plan-item" classList={{ "is-done": todo.status === "completed" || todo.status === "cancelled", "is-active": todo.status === "in_progress" }} data-status={todo.status}>
                  <span class="assistant-plan-icon">{icon(todo)}</span>
                  <span>{todo.content}</span>
                </li>
              )}</For>
            </ul>
          </details>
        </Show>
        <Show when={ai.tasks().length > 0}>
          <details open class="assistant-tasks-details" data-testid="ai-tasks">
            <summary class="assistant-activity-summary" title={t("ai.tasks.linkedHint")}>
              <span>{t("ai.tasks.title")}</span>
              <span class="assistant-pill">{ai.tasks().filter((x) => x.status === "completed").length}/{ai.tasks().length}</span>
            </summary>
            <Show when={ai.tasks().some((x) => x.status === "queued" || x.status === "running")}>
              <button type="button" class="assistant-btn-xs mt-1.5" data-testid="ai-tasks-stop" disabled={ai.controlBusy()} onClick={async () => { for (const task of ai.tasks().filter((x) => x.status === "queued" || x.status === "running")) await ai.cancelTask(task.id) }}>{t("ai.tasks.stopAll")}</button>
            </Show>
            <ul class="assistant-tasks-list">
              <For each={ai.tasks()}>{(task) => (
                <li class="assistant-task-item" data-testid="ai-task" data-status={task.status} data-agent={task.agent}>
                  <details>
                    <summary class="assistant-task-item-summary">
                      <span class="assistant-plan-icon">{taskIcon(task)}</span>
                      <span class="assistant-agent-pill">{agentLabel(task.agent)}</span>
                      <span class="assistant-task-item-title" title={task.description}>{task.description}</span>
                      <span class="assistant-meta-text">{t(`ai.tasks.status.${task.status}` as never)} · {task.background ? t("ai.tasks.background") : t("ai.tasks.inTurn")}</span>
                    </summary>
                    <Show when={task.status === "queued" || task.status === "running"}>
                      <button type="button" class="assistant-btn-xs mt-1.5" disabled={ai.controlBusy()} onClick={() => void ai.cancelTask(task.id)}>{t("ai.controls.cancelTask")}</button>
                    </Show>
                    <Show when={task.text ?? task.error}>
                      {(report) => <pre class="assistant-code-block mt-1.5 max-h-48" data-testid="ai-task-report">{report()}</pre>}
                    </Show>
                  </details>
                </li>
              )}</For>
            </ul>
          </details>
        </Show>
        <Show when={running()}>
          <p class="assistant-status-line" data-testid="ai-status-line">
            <Show when={ai.activity().step > 0}><span>{t("ai.agent.step", { n: ai.activity().step })}</span></Show>
            <Show when={ai.activity().preparing}>{(p) => <span data-testid="ai-preparing">{t("ai.agent.preparing", { tool: p().tool, size: kb(p().chars) })}</span>}</Show>
            <Show when={ai.activity().retry}>{(r) => <span class="assistant-status-warn" data-testid="ai-retry">{t("ai.agent.retry", { n: r().attempt })} · {r().message}</span>}</Show>
            <Show when={ai.activity().compacted}><span>{t("ai.agent.compacted")}</span></Show>
          </p>
        </Show>
      </section>
    </Show>
  )
}
