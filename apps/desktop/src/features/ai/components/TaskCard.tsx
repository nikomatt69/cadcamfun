/**
 * A job handed to a subagent, shown where it was handed over: in the message that started it. The card follows the host's
 * own record of the task (the store's task list, polled while anything runs), so a background task keeps moving after its
 * turn has ended: queued, working with a running clock, then its report or its error. Nothing here is invented; a task the
 * host no longer lists falls back to what the tool call itself returned.
 */
import { createEffect, createMemo, createSignal, onCleanup, Show, type JSX } from "solid-js"
import Check from "lucide-solid/icons/check"
import Clock from "lucide-solid/icons/clock"
import Copy from "lucide-solid/icons/copy"
import LoaderCircle from "lucide-solid/icons/loader-circle"
import X from "lucide-solid/icons/x"
import { t } from "../../../i18n/index.ts"
import { renderAssistantMarkdown } from "../lib/markdown.ts"
import { formatElapsed, record, taskOfCall } from "../lib/task-card.ts"
import type { AiTask, AiToolCall } from "../lib/types.ts"
import { useAiStore } from "../store/context.tsx"
import { agentLabel } from "./ToolRow.tsx"

const active = (status: AiTask["status"]): boolean => status === "queued" || status === "running"

export interface TaskCardProps {
  readonly call: AiToolCall
}

export function TaskCard(props: TaskCardProps): JSX.Element {
  const ai = useAiStore()
  const returned = createMemo(() => taskOfCall(props.call))
  // The store has the freshest state; the call's own result is what the card shows before the first poll and after a restart.
  const task = createMemo<AiTask | undefined>(() => {
    const first = returned()
    if (first === undefined) return undefined
    const live = ai.tasks().find((candidate) => candidate.id === first.id)
    return live === undefined ? first : { ...first, ...live }
  })
  const failedToStart = (): boolean => props.call.status === "error"
  const [now, setNow] = createSignal(Date.now())
  createEffect(() => {
    const current = task()
    if (current === undefined || !active(current.status)) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })
  const elapsed = (): string | undefined => {
    const current = task()
    if (current === undefined) return undefined
    const from = current.startedAt ?? (current.status === "queued" ? undefined : current.createdAt)
    if (from === undefined) return undefined
    return formatElapsed((current.finishedAt ?? now()) - from)
  }
  const [copied, setCopied] = createSignal(false)
  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // No clipboard in this context: the report stays selectable.
    }
  }
  const title = (): string => task()?.description || (typeof record(props.call.input)?.["description"] === "string" ? String(record(props.call.input)!["description"]) : "")
  const agent = (): string => task()?.agent ?? (typeof record(props.call.input)?.["agent"] === "string" ? String(record(props.call.input)!["agent"]) : "unico")
  const status = (): AiTask["status"] | "starting" | "failed" => failedToStart() ? "failed" : task()?.status ?? "starting"
  const label = (): string => status() === "starting" ? t("ai.tasks.starting") : status() === "failed" ? t("ai.tasks.status.error") : t(`ai.tasks.status.${status() as AiTask["status"]}` as never)

  return (
    <li class="list-none rounded-md border text-xs shadow-sm" classList={{
      "border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30": status() === "running" || status() === "queued" || status() === "starting",
      "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20": status() === "completed",
      "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30": status() === "error" || status() === "failed",
      "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60": status() === "cancelled"
    }} data-testid="ai-task-card" data-status={status()} data-agent={agent()} data-background={task()?.background === false ? "false" : "true"}>
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5">
        <span aria-hidden="true" class="flex shrink-0 items-center">
          <Show when={status() === "running" || status() === "starting"}><LoaderCircle size={13} class="animate-spin text-blue-600" /></Show>
          <Show when={status() === "queued"}><Clock size={13} class="text-blue-600" /></Show>
          <Show when={status() === "completed"}><Check size={13} class="text-green-600" /></Show>
          <Show when={status() === "error" || status() === "failed"}><X size={13} class="text-red-600" /></Show>
          <Show when={status() === "cancelled"}><X size={13} class="text-gray-400" /></Show>
        </span>
        <span class="rounded bg-blue-100 px-1.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-900/50 dark:text-blue-200" data-testid="ai-task-agent">{agentLabel(agent())}</span>
        <span class="min-w-0 flex-1 truncate font-medium" title={title()}>{title()}</span>
        <span class="shrink-0 rounded-full border px-1.5 text-[10px]" data-testid="ai-task-status" role="status">{label()}</span>
        <Show when={task()}>
          {(current) => <span class="shrink-0 text-[10px] text-gray-500" data-testid="ai-task-mode">{current().background ? t("ai.tasks.background") : t("ai.tasks.inTurn")}</span>}
        </Show>
        <Show when={elapsed()}>{(value) => <span class="shrink-0 text-[10px] tabular-nums text-gray-500" data-testid="ai-task-elapsed" title={t("ai.tasks.elapsed")}>{value()}</span>}</Show>
        <Show when={task() !== undefined && active(task()!.status)}>
          <button type="button" class="shrink-0 rounded border px-1.5 text-[10px] hover:bg-white/60 disabled:opacity-50 dark:hover:bg-gray-700" data-testid="ai-task-cancel" disabled={ai.controlBusy()}
            aria-label={`${t("ai.controls.cancelTask")}: ${title()}`} onClick={() => void ai.cancelTask(task()!.id)}>{t("ai.controls.cancelTask")}</button>
        </Show>
      </div>
      <Show when={status() === "queued"}>
        <p class="px-2 pb-1.5 text-[10px] text-gray-500" data-testid="ai-task-hint">{t("ai.tasks.queuedHint")}</p>
      </Show>
      <Show when={task()?.error ?? (failedToStart() ? props.call.output : undefined)}>
        {(message) => <p class="whitespace-pre-wrap break-words border-t border-red-200 px-2 py-1.5 text-red-700 dark:border-red-900 dark:text-red-300" role="alert" data-testid="ai-task-error">{message()}</p>}
      </Show>
      <Show when={task()?.text}>
        {(report) => (
          <details class="border-t border-inherit px-2 py-1.5" data-testid="ai-task-details">
            <summary class="flex cursor-pointer items-center gap-2">
              <span class="font-semibold">{t("ai.tasks.report")}</span>
              <span class="min-w-0 flex-1 truncate text-gray-500" data-testid="ai-task-preview">{report().trim().split("\n")[0]}</span>
              <button type="button" class="inline-flex shrink-0 items-center gap-1 rounded border px-1.5 text-[10px] font-normal" data-testid="ai-task-copy" aria-label={t("ai.tasks.copyReport")}
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); void copy(report()) }}>
                {copied() ? <Check size={10} aria-hidden="true" /> : <Copy size={10} aria-hidden="true" />}{copied() ? t("ai.tasks.copied") : t("ai.tasks.copyReport")}
              </button>
            </summary>
            <div class="assistant-markdown mt-1 max-h-72 overflow-auto text-xs" data-testid="ai-task-report" innerHTML={renderAssistantMarkdown(report())} />
          </details>
        )}
      </Show>
    </li>
  )
}
