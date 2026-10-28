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
import ShieldCheck from "lucide-solid/icons/shield-check"
import Brain from "lucide-solid/icons/brain"
import Check from "lucide-solid/icons/check"
import ChevronDown from "lucide-solid/icons/chevron-down"
import CircleGauge from "lucide-solid/icons/circle-gauge"
import { t } from "../../../i18n/index.ts"
import { createDismissable } from "../lib/dismiss.ts"
import { useAiStore } from "../store/context.tsx"
import type { AiPendingQuestion } from "../lib/types.ts"

interface ControlOption {
  readonly value: string
  readonly label: string
  readonly description?: string
  readonly dot?: string
}

/** The dot that marks the two work postures in the agent menu: blue builds, yellow plans. */
const AGENT_DOTS: Readonly<Record<string, string>> = { build: "#2f7bff", plan: "#e9b949" }

/**
 * An icon + quiet label stays visible in the composer rail; its complete,
 * keyboard-reachable menu opens above the control.
 */
function ControlMenu(props: {
  readonly id: string
  readonly icon: JSX.Element
  readonly label: string
  readonly value: string
  readonly dot?: string
  readonly showValue?: boolean
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
        classList={{ "is-open": props.open, "has-label": props.showValue === true }}
        disabled={props.disabled}
        aria-label={`${props.label}: ${selected()?.label ?? props.value}`}
        aria-haspopup="listbox"
        aria-expanded={props.open}
        title={props.title ?? `${props.label}: ${selected()?.label ?? props.value}`}
        data-control={props.id}
        onClick={props.onToggle}
      >
        <span class="assistant-control-glyph" aria-hidden="true">{props.icon}</span>
        <Show when={props.dot}>{(dot) => <span class="assistant-agent-dot" style={{ background: dot(), margin: 0 }} aria-hidden="true" />}</Show>
        <Show when={props.showValue}>
          <span class="assistant-control-label">{selected()?.label ?? props.value}</span>
          <ChevronDown size={11} class="assistant-control-chevron" aria-hidden="true" />
        </Show>
        <Show when={!props.showValue}>
          <span class="assistant-control-dot" aria-hidden="true" />
        </Show>
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
                    <Show when={option.dot}>{(dot) => <span class="assistant-agent-dot" style={{ background: dot() }} aria-hidden="true" />}</Show>
                    <strong>{option.label}</strong>
                    <Show when={option.description}>{(description) => <small>{description()}</small>}</Show>
                  </span>
                </button>
              )
            }}
          </For>
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

  // One rule for every menu in the assistant: click outside or Escape closes it.
  createDismissable({ open: () => open() !== undefined, root: ".assistant-control-menu-root", onDismiss: () => setOpen(undefined) })

  return (
    <div class="assistant-chips" data-testid="ai-controls" aria-label={t("ai.controls.label")}>
      <ControlMenu
        id="permissions"
        icon={<ShieldCheck size={12} aria-hidden="true" />}
        label={t("ai.controls.permissions")}
        title={ai.permissionMode() === "auto" ? t("ai.controls.permissions.autoHint") : undefined}
        value={ai.permissionMode()}
        showValue={true}
        disabled={running()}
        open={open() === "permissions"}
        onToggle={() => setOpen((current) => current === "permissions" ? undefined : "permissions")}
        onClose={() => setOpen(undefined)}
        onChange={(value) => ai.setPermissionMode(value as ReturnType<typeof ai.permissionMode>)}
        options={(["auto", "ask", "approve"] as const).map((mode) => ({ value: mode, label: t(`ai.controls.permissions.${mode}`) }))}
      />

      <ControlMenu
        id="agent"
        icon={<Bot size={12} aria-hidden="true" />}
        dot={AGENT_DOTS[ai.agent()]}
        label={t("ai.controls.agent")}
        title={agent()?.description}
        value={ai.agent()}
        showValue={true}
        disabled={running()}
        open={open() === "agent"}
        onToggle={() => setOpen((current) => current === "agent" ? undefined : "agent")}
        onClose={() => setOpen(undefined)}
        onChange={(value) => ai.setAgent(value)}
        options={ai.agents().map((candidate) => ({ value: candidate.id, label: candidate.title, description: candidate.description, ...(AGENT_DOTS[candidate.id] ? { dot: AGENT_DOTS[candidate.id]! } : {}) }))}
      />

      {/* No mode picker: the agent picks CAD, CAM, G-code or toolpath focus itself, per task (spec 08-ai.md). */}

      <Show when={variants().length > 0}>
        <ControlMenu
          id="thinking"
          icon={<Brain size={12} aria-hidden="true" />}
          label={t("ai.controls.thinking")}
          value={ai.model()?.variant ?? ""}
          showValue={true}
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
 * it renders as an enterprise alert banner above the composer for as long as it stands.
 */
export function AssistantControlError(): JSX.Element {
  const ai = useAiStore()
  return (
    <Show when={ai.controlError()}>
      {(error) => (
        <div class="assistant-control-error" role="alert">
          <div class="assistant-control-error-head">
            <CircleGauge size={14} class="assistant-coral-icon" aria-hidden="true" />
            <span>{t("ai.runtime.error")}</span>
          </div>
          <p class="assistant-control-error-body">{error()}</p>
        </div>
      )}
    </Show>
  )
}

function QuestionCard(props: { readonly request: AiPendingQuestion }): JSX.Element {
  const ai = useAiStore()
  const [answers, setAnswers] = createSignal<ReadonlyArray<ReadonlyArray<string>>>(props.request.questions.map(() => []))
  const [custom, setCustom] = createSignal<ReadonlyArray<string>>(props.request.questions.map(() => ""))
  const ready = () => answers().every((answer) => answer.length > 0 && answer.every((value) => value.trim()))
  const setAnswer = (index: number, answer: ReadonlyArray<string>) => setAnswers((current) => current.map((value, i) => i === index ? answer : value))
  return (
    <section class="assistant-disclosure assistant-settings assistant-question-card" data-testid="ai-question" aria-label={t("ai.controls.questions")}>
      <For each={props.request.questions}>
        {(question, index) => (
          <fieldset class="assistant-question-group">
            <legend class="assistant-question-legend">{question.header}</legend>
            <p class="assistant-question-prompt">{question.question}</p>
            <div class="assistant-question-options">
              <For each={question.options}>
                {(option) => (
                  <label class="assistant-question-option">
                    <input
                      type={question.multiple ? "checkbox" : "radio"}
                      name={`${props.request.requestId}-${index()}`}
                      disabled={ai.controlBusy()}
                      checked={answers()[index()]?.includes(option.label) ?? false}
                      onChange={(e) => {
                        setCustom((current) => current.map((value, i) => i === index() ? "" : value))
                        setAnswer(
                          index(),
                          question.multiple
                            ? e.currentTarget.checked
                              ? [...(answers()[index()] ?? []), option.label]
                              : (answers()[index()] ?? []).filter((value) => value !== option.label)
                            : [option.label]
                        )
                      }}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                )}
              </For>
            </div>
            <Show when={question.custom !== false}>
              <input
                class="assistant-field mt-2"
                aria-label={`${question.header}: ${t("ai.controls.customAnswer")}`}
                placeholder={t("ai.controls.customAnswer")}
                maxLength={4000}
                disabled={ai.controlBusy()}
                value={custom()[index()] ?? ""}
                onInput={(e) => {
                  const value = e.currentTarget.value
                  setCustom((current) => current.map((previous, i) => i === index() ? value : previous))
                  setAnswer(index(), value.trim() ? [value.trim()] : [])
                }}
              />
            </Show>
          </fieldset>
        )}
      </For>
      <div class="assistant-card-actions">
        <button
          type="button"
          class="assistant-btn assistant-btn-primary"
          disabled={!ready() || ai.controlBusy()}
          onClick={() => void ai.replyQuestion(props.request.requestId, answers())}
        >
          {t("ai.controls.answer")}
        </button>
        <button
          type="button"
          class="assistant-btn assistant-btn-secondary"
          disabled={ai.controlBusy()}
          onClick={() => void ai.replyQuestion(props.request.requestId)}
        >
          {t("ai.controls.dismissQuestion")}
        </button>
      </div>
    </section>
  )
}

export function AssistantQuestions(): JSX.Element {
  const ai = useAiStore()
  return <For each={ai.questions()}>{(request) => <QuestionCard request={request} />}</For>
}

/**
 * The permissions the agent is waiting on, answered in the composer's dock: next to where the user types, never
 * inside the conversation, so a request cannot scroll away and is always one click from an answer.
 */
export function AssistantPermissions(): JSX.Element {
  const ai = useAiStore()
  return (
    <Show when={ai.permissions().length > 0}>
      <ul class="assistant-permissions" data-testid="ai-permissions">
        <For each={ai.permissions()}>
          {(request) => (
            <li class="assistant-permission" data-testid="permission">
              <div class="assistant-permission-copy">
                <CircleGauge size={14} class="assistant-coral-icon" aria-hidden="true" />
                <span>{t("ai.message.permission", { permission: request.permission })}</span>
                <Show when={request.patterns.length > 0}>
                  <code class="assistant-permission-patterns" title={request.patterns.join("\n")}>{request.patterns.join(", ")}</code>
                </Show>
              </div>
              <div class="assistant-card-actions mt-0">
                <button type="button" class="assistant-btn assistant-btn-secondary" onClick={() => void ai.replyPermission(request.requestId, "reject")}>
                  {t("ai.message.permission.deny")}
                </button>
                <button type="button" class="assistant-btn assistant-btn-secondary" onClick={() => void ai.replyPermission(request.requestId, "always")}>
                  {t("ai.message.permission.remember")}
                </button>
                <button type="button" class="assistant-btn assistant-btn-primary" onClick={() => void ai.replyPermission(request.requestId, "once")}>
                  {t("ai.message.permission.grant")}
                </button>
              </div>
            </li>
          )}
        </For>
      </ul>
    </Show>
  )
}
