/**
 * The composer: what the user writes, what they attach, and the run controls
 * that decide how the assistant works.
 *
 * It was the bottom half of the assistant's main file. It is on its own now,
 * with the slash-command palette, the attachment row and the inline completion
 * it owns.
 */
import { For, Show, createSignal, createUniqueId, type JSX } from "solid-js"
import ArrowUp from "lucide-solid/icons/arrow-up"
import CircleGauge from "lucide-solid/icons/circle-gauge"
import Layers from "lucide-solid/icons/layers"
import Paperclip from "lucide-solid/icons/paperclip"
import Plus from "lucide-solid/icons/plus"
import Square from "lucide-solid/icons/square"
import X from "lucide-solid/icons/x"
import { t } from "../../../i18n/index.ts"
import { ACCEPT, MAX_ATTACHMENTS, type ChatAttachment } from "../lib/attachments.ts"
import { AssistantControls } from "./AssistantControls.tsx"
import { CommandPalette } from "./CommandPalette.tsx"
import { ContextGauge } from "./ContextGauge.tsx"
import { ModelPicker } from "./ModelPicker.tsx"
import { ScopeBar } from "./ScopeBar.tsx"
import { useAiStore } from "../store/context.tsx"
import type { SlashCommand } from "../lib/commands.ts"

/** How long a prompt may be. */
export const MAX_PROMPT = 4000

export interface AssistantComposerProps {
  readonly draft: string
  readonly onDraft: (next: string) => void
  readonly files: ReadonlyArray<ChatAttachment>
  readonly fileProblems: ReadonlyArray<string>
  readonly onRemoveFile: (file: ChatAttachment) => void
  readonly onFiles: (list: FileList | null) => void
  readonly onSend: (delivery: "queue" | "steer") => void
  readonly onOpenContext: () => void
  readonly onOpenProviders: () => void
  readonly paletteOpen: boolean
  readonly commands: ReadonlyArray<SlashCommand>
  readonly activeCommand: SlashCommand | undefined
  readonly onHighlightCommand: (id: string) => void
  readonly onSelectCommand: (command: SlashCommand) => void
  readonly onKeyDown: (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => void
  readonly onOpenPalette: () => void
  readonly onClosePalette: () => void
  /** What the host suggests for what is being typed; Tab takes it. */
  readonly completion: string | undefined
}

export function AssistantComposer(props: AssistantComposerProps): JSX.Element {
  const ai = useAiStore()
  const [picker, setPicker] = createSignal<HTMLInputElement | undefined>()
  const running = (): boolean => ai.status() === "streaming" || ai.status() === "connecting"
  const promptId = createUniqueId()
  const overLimit = (): boolean => props.draft.length > MAX_PROMPT

  return (
    <form
      class="assistant-composer"
      onSubmit={(event) => {
        event.preventDefault()
        props.onSend("queue")
      }}
    >
      <label class="sr-only" for={promptId}>{t("ai.input.placeholder")}</label>
      <input
        ref={setPicker}
        type="file"
        multiple
        accept={ACCEPT}
        class="hidden"
        data-testid="ai-attach-input"
        onChange={(event) => {
          props.onFiles(event.currentTarget.files)
          event.currentTarget.value = ""
        }}
      />
      <Show when={props.paletteOpen}>
        <CommandPalette
          draft={props.draft}
          activeId={props.activeCommand?.name}
          onHighlight={props.onHighlightCommand}
          onSelect={props.onSelectCommand}
        />
      </Show>

      <Show when={ai.error()}>
        {(error) => (
          <div class="assistant-composer-banner" role="status">
            <div class="assistant-composer-banner-head">
              <CircleGauge size={14} class="assistant-coral-icon" aria-hidden="true" />
              <span>{t("ai.runtime.error")}</span>
            </div>
            <p class="assistant-composer-banner-copy">{error()}</p>
            <button
              type="button"
              class="assistant-btn assistant-btn-secondary"
              onClick={() => props.onOpenProviders()}
            >
              {t("ai.providers.title")}
            </button>
          </div>
        )}
      </Show>

      <div class="assistant-compose-frame" data-command={props.paletteOpen ? "true" : undefined}>
        <Show when={props.files.length > 0 || props.fileProblems.length > 0}>
          <ul class="assistant-attachments-row" data-testid="ai-attachments">
            <For each={props.files}>{(file) => (
              <li class="assistant-attachment inline-flex items-center gap-1.5">
                <Paperclip size={11} aria-hidden="true" />
                <span class="truncate" title={file.name}>{file.name}</span>
                <button type="button" aria-label={t("ai.attach.remove", { name: file.name })} onClick={() => props.onRemoveFile(file)}>
                  <X size={10} aria-hidden="true" />
                </button>
              </li>
            )}</For>
            <For each={props.fileProblems}>{(problem) => <li class="assistant-attachment-problem">{problem}</li>}</For>
          </ul>
        </Show>
        <div class="assistant-compose-input-row">
          <button
            type="button"
            class="assistant-icon-button assistant-attach"
            title={t("ai.attach.title")}
            aria-label={t("ai.attach.title")}
            disabled={running() || props.files.length >= MAX_ATTACHMENTS}
            onClick={() => picker()?.click()}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
          <div class="assistant-compose-field">
            <textarea
              id={promptId}
              class="assistant-prompt"
              rows={1}
              maxLength={MAX_PROMPT}
              placeholder={t("ai.input.placeholder")}
              value={props.draft}
              onInput={(event) => {
                const next = event.currentTarget.value
                props.onDraft(next)
                event.currentTarget.style.height = "auto"
                event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 180)}px`
              }}
              onKeyDown={props.onKeyDown}
              aria-describedby={`${promptId}-hint`}
            />
            <Show when={props.completion !== undefined}>
              <p class="assistant-completion" data-testid="ai-completion" aria-hidden="true">{props.completion}</p>
            </Show>
          </div>
          <div class="assistant-compose-inline-actions">
            <button
              type="button"
              class="assistant-icon-button assistant-command-button"
              title={t("ai.commands.hint")}
              aria-label={t("ai.commands.open")}
              aria-expanded={props.paletteOpen}
              data-testid="ai-command-toggle"
              onClick={() => { if (props.paletteOpen) props.onClosePalette(); else props.onOpenPalette() }}
            >
              <span aria-hidden="true">/</span>
            </button>
            <button
              type="button"
              class="assistant-context-chip"
              aria-pressed={ai.includeContext()}
              onClick={() => ai.setIncludeContext((current) => !current)}
              data-enabled={ai.includeContext()}
              title={t("ai.toolbar.context")}
            >
              <Layers size={13} aria-hidden="true" />
              <span class="sr-only">{t("ai.toolbar.context")}</span>
              <Show when={ai.includeContext()}><span class="assistant-context-dot" aria-hidden="true" /></Show>
            </button>
            <Show when={props.draft.length > 0}>
              <span class="assistant-character-count" data-over={overLimit()}>{t("ai.input.charCount", { count: props.draft.length })}</span>
            </Show>
            <Show when={running()}>
              <button
                type="button"
                class="assistant-send assistant-send-icon assistant-stop"
                onClick={() => ai.abort()}
                data-testid="ai-stop"
                title={t("ai.stop")}
                aria-label={t("ai.stop")}
              >
                <Square size={11} aria-hidden="true" />
              </button>
              <button
                type="button"
                class="assistant-send assistant-send-steer"
                disabled={props.draft.trim().length === 0 || overLimit()}
                onClick={() => props.onSend("steer")}
                title={t("ai.steer.title")}
                data-testid="ai-steer"
              >
                {t("ai.steer")}
              </button>
            </Show>
            <button
              type="submit"
              class="assistant-send assistant-send-icon"
              disabled={props.draft.trim().length === 0 || overLimit()}
              data-testid="ai-send"
              title={running() ? t("ai.queue") : t("ai.send")}
              aria-label={running() ? t("ai.queue") : t("ai.send")}
            >
              <ArrowUp size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div class="assistant-composer-bar">
        <div class="assistant-composer-bar-left">
          <AssistantControls />
          <ScopeBar />
        </div>
        <div class="assistant-compose-tail">
          <ModelPicker />
          <ContextGauge alwaysShow compact onOpen={() => props.onOpenContext()} />
        </div>
      </div>

      <div id={`${promptId}-hint`} class="assistant-composer-hint sr-only">
        <span>{running() ? t("ai.input.stopHint") : t("ai.input.shortcut.hint")}</span>
        <span>{t("ai.composer.brand")}</span>
      </div>
    </form>
  )
}
