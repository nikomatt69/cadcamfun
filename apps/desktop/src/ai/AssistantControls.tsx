/**
 * The four run controls that decide *how* the assistant works, as one quiet row
 * of chips in the composer (spec 08-ai.md §3).
 *
 * They used to be a block of stacked selects wedged between the header and the
 * transcript — the tallest thing on screen, always visible, rarely touched. As
 * chips they sit with the other per-turn controls, read as one line, and give
 * the height back to the conversation. Each keeps its label as an accessible
 * name and the agent description as a tooltip, so nothing was lost.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import Bot from "lucide-solid/icons/bot"
import Compass from "lucide-solid/icons/compass"
import ShieldCheck from "lucide-solid/icons/shield-check"
import Brain from "lucide-solid/icons/brain"
import Check from "lucide-solid/icons/check"
import ChevronUp from "lucide-solid/icons/chevron-up"
import { t } from "../i18n/index.ts"
import { useAiStore } from "./context.tsx"
import type { AiPendingQuestion } from "./types.ts"

interface ControlOption {
  readonly value: string
  readonly label: string
  readonly description?: string
}

/**
 * An icon stays visible in the composer; its complete, keyboard-reachable menu
 * opens above the control. This avoids native selects escaping below the app
 * window and keeps four run settings on one calm line at every panel width.
 */
function ControlMenu(props: {
  readonly id: string
  readonly icon: JSX.Element
  readonly label: string
  readonly value: string
  readonly title?: string
  readonly disabled?: boolean
  readonly open: boolean
  readonly options: ReadonlyArray<ControlOption>
  readonly onToggle: () => void
  readonly onClose: () => void
  readonly onChange: (value: string) => void
}): JSX.Element {
  const selected = () => props.options.find((option) => option.value === props.value)
  return (
    <div class="assistant-control-menu-root">
      <button
        type="button"
        class="assistant-control-icon"
        classList={{ "is-open": props.open }}
        disabled={props.disabled}
        aria-label={`${props.label}: ${selected()?.label ?? props.value}`}
        aria-haspopup="listbox"
        aria-expanded={props.open}
        title={props.title ?? `${props.label}: ${selected()?.label ?? props.value}`}
        data-control={props.id}
        onClick={props.onToggle}
      >
        <span aria-hidden="true">{props.icon}</span>
        <span class="assistant-control-dot" aria-hidden="true" />
      </button>
      <Show when={props.open}>
        <div class="assistant-control-popover" role="listbox" aria-label={props.label}>
          <div class="assistant-control-popover-head">
            <span>{props.label}</span>
            <span>{selected()?.label}</span>
          </div>
          <For each={props.options}>
            {(option) => {
              const active = () => option.value === props.value
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={active()}
                  class="assistant-control-option"
                  classList={{ "is-active": active() }}
                  onClick={() => {
                    props.onChange(option.value)
                    props.onClose()
                  }}
                >
                  <span class="assistant-control-option-check">{active() ? <Check size={13} aria-hidden="true" /> : null}</span>
                  <span>
                    <strong>{option.label}</strong>
                    <Show when={option.description}>{(description) => <small>{description()}</small>}</Show>
                  </span>
                </button>
              )
            }}
          </For>
          <ChevronUp class="assistant-control-popover-caret" size={11} aria-hidden="true" />
        </div>
      </Show>
    </div>
  )
}

export function AssistantControls(): JSX.Element {
  const ai = useAiStore()
  const running = () => ai.status() === "connecting" || ai.status() === "streaming" || ai.controlBusy()
  const selected = createMemo(() => ai.providers().find((p) => p.id === ai.model()?.provider)?.models.find((m) => m.id === ai.model()?.model))
  const variants = () => selected()?.variants ?? []
  const agent = createMemo(() => ai.agents().find((candidate) => candidate.id === ai.agent()))
  const [open, setOpen] = createSignal<string | undefined>()
  const changeVariant = (variant: string): void => ai.setModel((current) => {
    if (!current) return current
    const { variant: _previous, ...model } = current
    return variant ? { ...model, variant } : model
  })

  return (
    <div class="assistant-chips" data-testid="ai-controls" aria-label={t("ai.controls.label")}>
      <ControlMenu
        id="agent"
        icon={<Bot size={13} aria-hidden="true" />}
        label={t("ai.controls.agent")}
        title={agent()?.description}
        value={ai.agent()}
        disabled={running()}
        open={open() === "agent"}
        onToggle={() => setOpen((current) => current === "agent" ? undefined : "agent")}
        onClose={() => setOpen(undefined)}
        onChange={(value) => ai.setAgent(value)}
        options={[
          { value: "cadcam", label: t("ai.controls.coordinator") },
          ...ai.agents().filter((candidate) => candidate.id !== "cadcam").map((candidate) => ({ value: candidate.id, label: candidate.title, description: candidate.description }))
        ]}
      />

      <ControlMenu
        id="mode"
        icon={<Compass size={13} aria-hidden="true" />}
        label={t("ai.controls.mode")}
        value={ai.mode()}
        disabled={running()}
        open={open() === "mode"}
        onToggle={() => setOpen((current) => current === "mode" ? undefined : "mode")}
        onClose={() => setOpen(undefined)}
        onChange={(value) => ai.setMode(value as ReturnType<typeof ai.mode>)}
        options={(["general", "cad", "cam", "gcode", "toolpath"] as const).map((mode) => ({ value: mode, label: t(`ai.controls.mode.${mode}`) }))}
      />

      <ControlMenu
        id="permissions"
        icon={<ShieldCheck size={13} aria-hidden="true" />}
        label={t("ai.controls.permissions")}
        value={ai.permissionMode()}
        disabled={running()}
        open={open() === "permissions"}
        onToggle={() => setOpen((current) => current === "permissions" ? undefined : "permissions")}
        onClose={() => setOpen(undefined)}
        onChange={(value) => ai.setPermissionMode(value as ReturnType<typeof ai.permissionMode>)}
        options={(["auto", "ask", "approve"] as const).map((mode) => ({ value: mode, label: t(`ai.controls.permissions.${mode}`) }))}
      />

      <Show when={variants().length > 0}>
        <ControlMenu
          id="thinking"
          icon={<Brain size={13} aria-hidden="true" />}
          label={t("ai.controls.thinking")}
          value={ai.model()?.variant ?? ""}
          disabled={running()}
          open={open() === "thinking"}
          onToggle={() => setOpen((current) => current === "thinking" ? undefined : "thinking")}
          onClose={() => setOpen(undefined)}
          onChange={changeVariant}
          options={[
            { value: "", label: t("ai.controls.modelDefault") },
            ...variants().map((variant) => ({ value: variant, label: variant }))
          ]}
        />
      </Show>
    </div>
  )
}

/**
 * The control error is the one thing that must never be hidden behind a chip:
 * it renders as a strip above the composer for as long as it stands.
 */
export function AssistantControlError(): JSX.Element {
  const ai = useAiStore()
  return (
    <Show when={ai.controlError()}>
      {(error) => <p class="assistant-control-error" role="alert">{error()}</p>}
    </Show>
  )
}

function QuestionCard(props: { readonly request: AiPendingQuestion }): JSX.Element {
  const ai = useAiStore()
  const [answers, setAnswers] = createSignal<ReadonlyArray<ReadonlyArray<string>>>(props.request.questions.map(() => []))
  const [custom, setCustom] = createSignal<ReadonlyArray<string>>(props.request.questions.map(() => ""))
  const ready = () => answers().every((answer) => answer.length > 0 && answer.every((value) => value.trim()))
  const setAnswer = (index: number, answer: ReadonlyArray<string>) => setAnswers((current) => current.map((value, i) => i === index ? answer : value))
  return <section class="assistant-disclosure assistant-settings" data-testid="ai-question" aria-label={t("ai.controls.questions")}>
    <For each={props.request.questions}>{(question, index) => <fieldset class="mb-3">
      <legend class="text-sm font-semibold">{question.header}</legend>
      <p class="mb-2 text-xs">{question.question}</p>
      <For each={question.options}>{(option) => <label class="mb-1 flex items-start gap-2 text-xs">
        <input type={question.multiple ? "checkbox" : "radio"} name={`${props.request.requestId}-${index()}`} disabled={ai.controlBusy()} checked={answers()[index()]?.includes(option.label) ?? false}
          onChange={(e) => { setCustom((current) => current.map((value, i) => i === index() ? "" : value)); setAnswer(index(), question.multiple ? e.currentTarget.checked ? [...(answers()[index()] ?? []), option.label] : (answers()[index()] ?? []).filter((value) => value !== option.label) : [option.label]) }} />
        <span><strong>{option.label}</strong><br />{option.description}</span>
      </label>}</For>
      <Show when={question.custom !== false}>
        <input class="mt-1 w-full rounded border bg-transparent px-2 py-1 text-xs" aria-label={`${question.header}: ${t("ai.controls.customAnswer")}`} placeholder={t("ai.controls.customAnswer")} maxLength={4000} disabled={ai.controlBusy()} value={custom()[index()] ?? ""}
          onInput={(e) => { const value = e.currentTarget.value; setCustom((current) => current.map((previous, i) => i === index() ? value : previous)); setAnswer(index(), value.trim() ? [value.trim()] : []) }} />
      </Show>
    </fieldset>}</For>
    <div class="flex gap-2">
      <button type="button" class="rounded border px-3 py-1 text-xs" disabled={!ready() || ai.controlBusy()} onClick={() => void ai.replyQuestion(props.request.requestId, answers())}>{t("ai.controls.answer")}</button>
      <button type="button" class="rounded border px-3 py-1 text-xs" disabled={ai.controlBusy()} onClick={() => void ai.replyQuestion(props.request.requestId)}>{t("ai.controls.dismissQuestion")}</button>
    </div>
  </section>
}

export function AssistantQuestions(): JSX.Element {
  const ai = useAiStore()
  return <For each={ai.questions()}>{(request) => <QuestionCard request={request} />}</For>
}
