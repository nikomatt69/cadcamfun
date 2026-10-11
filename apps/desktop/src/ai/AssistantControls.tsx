import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { useAiStore } from "./context.tsx"
import { t } from "../i18n/index.ts"
import type { AiPendingQuestion } from "./types.ts"

export function AssistantControls(): JSX.Element {
  const ai = useAiStore()
  const running = () => ai.status() === "connecting" || ai.status() === "streaming" || ai.controlBusy()
  const selected = createMemo(() => ai.providers().find((p) => p.id === ai.model()?.provider)?.models.find((m) => m.id === ai.model()?.model))
  const variants = () => selected()?.variants ?? []
  const changeVariant = (variant: string) => ai.setModel((current) => {
    if (!current) return current
    const { variant: _previous, ...model } = current
    return variant ? { ...model, variant } : model
  })
  return <section class="assistant-disclosure assistant-settings" data-testid="ai-controls">
    <div class="grid grid-cols-2 gap-2">
      <label class="flex min-w-0 flex-col gap-1 text-xs">{t("ai.controls.agent")}
        <select class="w-full min-w-0 truncate rounded border bg-transparent px-2 py-1" value={ai.agent()} disabled={running()} onChange={(e) => ai.setAgent(e.currentTarget.value)}>
          <option value="cadcam">{t("ai.controls.coordinator")}</option>
          <For each={ai.agents().filter((agent) => agent.id !== "cadcam")}>{(agent) => <option value={agent.id}>{agent.title}</option>}</For>
        </select>
      </label>
      <label class="flex min-w-0 flex-col gap-1 text-xs">{t("ai.controls.mode")}
        <select class="w-full min-w-0 truncate rounded border bg-transparent px-2 py-1" value={ai.mode()} disabled={running()} onChange={(e) => ai.setMode(e.currentTarget.value as ReturnType<typeof ai.mode>)}>
          <For each={["general", "cad", "cam", "gcode", "toolpath"] as const}>{(mode) => <option value={mode}>{t(`ai.controls.mode.${mode}`)}</option>}</For>
        </select>
      </label>
      <label class="flex min-w-0 flex-col gap-1 text-xs">{t("ai.controls.permissions")}
        <select class="w-full min-w-0 truncate rounded border bg-transparent px-2 py-1" value={ai.permissionMode()} disabled={running()} onChange={(e) => ai.setPermissionMode(e.currentTarget.value as ReturnType<typeof ai.permissionMode>)}>
          <For each={["auto", "ask", "approve"] as const}>{(mode) => <option value={mode}>{t(`ai.controls.permissions.${mode}`)}</option>}</For>
        </select>
      </label>
      <label class="flex min-w-0 flex-col gap-1 text-xs">{t("ai.controls.thinking")}
        <select class="w-full min-w-0 truncate rounded border bg-transparent px-2 py-1" value={ai.model()?.variant ?? ""} disabled={running() || variants().length === 0} onChange={(e) => changeVariant(e.currentTarget.value)}>
          <option value="">{t("ai.controls.modelDefault")}</option>
          <For each={variants()}>{(variant) => <option value={variant}>{variant}</option>}</For>
        </select>
      </label>
    </div>
    <Show when={ai.agents().find((agent) => agent.id === ai.agent())}>{(agent) => <p class="mt-2 text-xs">{agent().description}</p>}</Show>
    <Show when={ai.controlError()}>{(error) => <p role="alert" class="mt-2 text-xs text-red-500">{error()}</p>}</Show>
  </section>
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
