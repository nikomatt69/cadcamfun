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
  todo.status === "completed" ? <Check size={12} aria-hidden="true" class="text-green-600" />
    : todo.status === "in_progress" ? <LoaderCircle size={12} aria-hidden="true" class="animate-spin text-blue-600" />
      : todo.status === "cancelled" ? <X size={12} aria-hidden="true" class="text-gray-400" />
        : <Circle size={12} aria-hidden="true" class="text-gray-400" />

const taskIcon = (task: AiTask): JSX.Element =>
  task.status === "completed" ? <Check size={12} aria-hidden="true" class="text-green-600" />
    : task.status === "running" || task.status === "queued" ? <LoaderCircle size={12} aria-hidden="true" class="animate-spin text-blue-600" />
      : <X size={12} aria-hidden="true" class={task.status === "error" ? "text-red-600" : "text-gray-400"} />

export function AgentActivity(): JSX.Element {
  const ai = useAiStore()
  const running = (): boolean => ai.status() === "connecting" || ai.status() === "streaming"
  const done = (): number => ai.plan().filter((x) => x.status === "completed").length
  return (
    <Show when={ai.plan().length > 0 || ai.goal() !== undefined || running() || ai.tasks().length > 0}>
      <section class="border-b border-gray-200 bg-gray-50/70 px-4 py-2 text-xs dark:border-gray-700 dark:bg-gray-800/60" data-testid="ai-activity" aria-live="polite">
        <Show when={ai.goal()}>
          {(goal) => (
            <p class="mb-1 flex flex-wrap items-center gap-x-2" data-testid="ai-goal">
              <span class="font-semibold">{t("ai.agent.goal")}</span>
              <span class="min-w-0 flex-1 truncate" title={goal().objective}>{goal().objective}</span>
              <span class="rounded bg-gray-200 px-1.5 text-[10px] dark:bg-gray-700">{t(`ai.agent.goal.${goal().status}` as never)}</span>
              <span class="text-[10px] text-gray-500">{t("ai.agent.iteration", { n: goal().iteration })}</span>
              {/* A goal is read and changed with the same line `/goal` takes; while the agent works a message would join its turn, so the buttons wait. */}
              <Show when={!running()}>
                <span class="flex gap-1" data-testid="ai-goal-controls">
                  <Show when={goal().status === "active" || goal().status === "budget_limited"}>
                    <button type="button" class="rounded border px-1.5 text-[10px]" data-testid="ai-goal-pause" onClick={() => void ai.send("/goal pause")}>{t("ai.agent.goal.pause")}</button>
                  </Show>
                  <Show when={goal().status === "paused" || goal().status === "blocked" || goal().status === "usage_limited"}>
                    <button type="button" class="rounded border px-1.5 text-[10px]" data-testid="ai-goal-resume" onClick={() => void ai.send("/goal resume")}>{t("ai.agent.goal.resume")}</button>
                  </Show>
                  <button type="button" class="rounded border px-1.5 text-[10px]" data-testid="ai-goal-clear" onClick={() => void ai.send("/goal clear")}>{t("ai.agent.goal.clear")}</button>
                </span>
              </Show>
            </p>
          )}
        </Show>
        <Show when={ai.plan().length > 0}>
          <details open data-testid="ai-plan">
            <summary class="cursor-pointer font-semibold">{t("ai.agent.plan")} {done()}/{ai.plan().length}</summary>
            <ul class="mt-1 space-y-0.5">
              <For each={ai.plan()}>{(todo) => (
                <li class="flex items-start gap-1.5" classList={{ "text-gray-400 line-through": todo.status === "completed" || todo.status === "cancelled", "font-medium": todo.status === "in_progress" }} data-status={todo.status}>
                  <span class="mt-0.5">{icon(todo)}</span>
                  <span>{todo.content}</span>
                </li>
              )}</For>
            </ul>
          </details>
        </Show>
        <Show when={ai.tasks().length > 0}>
          <details open class="mt-1" data-testid="ai-tasks">
            <summary class="cursor-pointer font-semibold" title={t("ai.tasks.linkedHint")}>{t("ai.tasks.title")} {ai.tasks().filter((x) => x.status === "completed").length}/{ai.tasks().length}</summary>
            <Show when={ai.tasks().some((x) => x.status === "queued" || x.status === "running")}>
              <button type="button" class="mt-1 rounded border px-2 py-1" data-testid="ai-tasks-stop" disabled={ai.controlBusy()} onClick={async () => { for (const task of ai.tasks().filter((x) => x.status === "queued" || x.status === "running")) await ai.cancelTask(task.id) }}>{t("ai.tasks.stopAll")}</button>
            </Show>
            <ul class="mt-1 space-y-1">
              <For each={ai.tasks()}>{(task) => (
                <li data-testid="ai-task" data-status={task.status} data-agent={task.agent}>
                  <details>
                    <summary class="flex cursor-pointer flex-wrap items-center gap-x-2">
                      <span class="mt-0.5">{taskIcon(task)}</span>
                      <span class="rounded bg-blue-100 px-1.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">{agentLabel(task.agent)}</span>
                      <span class="min-w-0 flex-1 truncate" title={task.description}>{task.description}</span>
                      <span class="text-[10px] text-gray-500">{t(`ai.tasks.status.${task.status}` as never)} · {task.background ? t("ai.tasks.background") : t("ai.tasks.inTurn")}</span>
                    </summary>
                    <Show when={task.status === "queued" || task.status === "running"}>
                      <button type="button" class="mt-1 rounded border px-2 py-1" disabled={ai.controlBusy()} onClick={() => void ai.cancelTask(task.id)}>{t("ai.controls.cancelTask")}</button>
                    </Show>
                    <Show when={task.text ?? task.error}>
                      {(report) => <pre class="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-gray-100 p-1.5 text-[10px] dark:bg-gray-800" data-testid="ai-task-report">{report()}</pre>}
                    </Show>
                  </details>
                </li>
              )}</For>
            </ul>
          </details>
        </Show>
        <Show when={running()}>
          <p class="mt-1 flex flex-wrap items-center gap-x-3 text-gray-600 dark:text-gray-300" data-testid="ai-status-line">
            <Show when={ai.activity().step > 0}><span>{t("ai.agent.step", { n: ai.activity().step })}</span></Show>
            <Show when={ai.activity().preparing}>{(p) => <span data-testid="ai-preparing">{t("ai.agent.preparing", { tool: p().tool, size: kb(p().chars) })}</span>}</Show>
            <Show when={ai.activity().retry}>{(r) => <span class="text-amber-700 dark:text-amber-300" data-testid="ai-retry">{t("ai.agent.retry", { n: r().attempt })} · {r().message}</span>}</Show>
            <Show when={ai.activity().compacted}><span>{t("ai.agent.compacted")}</span></Show>
          </p>
        </Show>
      </section>
    </Show>
  )
}
