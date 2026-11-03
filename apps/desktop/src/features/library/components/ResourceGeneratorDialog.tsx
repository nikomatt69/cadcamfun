/**
 * The Resources generator dialog: one form per resource kind that hands a complete brief to the assistant.
 *
 * The page keeps listing the same rows the assistant writes (`library_edit` / `parts`); this dialog only decides
 * what to ask for — kind, quantity, visibility, project default — and shows the parameters the assistant will
 * fill. Submitting opens the docked assistant panel and sends the brief, so the user watches the real tool calls
 * and approves the real writes.
 */
import { For, Show, createSignal, createUniqueId, type JSX } from "solid-js"
import { MessageSquareText } from "lucide-solid"
import { NumberField } from "../../../shared/components/panel/ui.tsx"
import { useApp } from "../../../shared/state/context.ts"
import { useAiStore } from "../../ai/index.ts"
import { toast } from "../../../shared/ui/feedback.tsx"
import { Modal } from "../../toolpaths/components/shared.tsx"
import {
  MAX_GENERATION_COUNT,
  MAX_REQUEST_CHARS,
  MIN_GENERATION_COUNT,
  RESOURCE_GENERATION,
  buildGenerationPrompt,
  generationCount,
  type ResourceKind
} from "../lib/resource-generation.ts"
import { t, type Key } from "../../../i18n/index.ts"

const INPUT = "w-full rounded-md border border-[color:var(--ent-line-strong)] bg-[color:var(--ent-surface)] px-3 py-2 text-sm text-[color:var(--ent-text)] focus:border-[color:var(--ent-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ent-accent)]"
const LABEL = "mb-1 block text-sm font-medium text-[color:var(--ent-text)]"

/** The assistant is optional at render time (the page also mounts without the AI provider, e.g. in isolation). */
const maybeAi = (): ReturnType<typeof useAiStore> | undefined => {
  try { return useAiStore() } catch { return undefined }
}

export interface ResourceGeneratorProps {
  readonly kind: ResourceKind
  readonly open: boolean
  readonly onClose: () => void
  /** The open project, named in the component brief; the assistant works in this project. */
  readonly projectName?: string | undefined
}

export function ResourceGeneratorDialog(props: ResourceGeneratorProps): JSX.Element {
  const app = useApp()
  const ai = maybeAi()
  const spec = RESOURCE_GENERATION[props.kind]
  const parametersId = createUniqueId()
  const [request, setRequest] = createSignal("")
  const [quantity, setQuantity] = createSignal(MIN_GENERATION_COUNT)
  const [makePublic, setMakePublic] = createSignal(false)
  const [setDefault, setSetDefault] = createSignal(false)
  const [showParameters, setShowParameters] = createSignal(false)

  const submit = (): void => {
    const store = ai
    if (store === undefined) {
      toast.error(t("library.generate.unavailable"))
      return
    }
    const prompt = buildGenerationPrompt({
      kind: props.kind,
      request: request(),
      quantity: quantity(),
      makePublic: makePublic(),
      setDefault: setDefault(),
      projectName: props.projectName
    })
    // Reuse the assistant, not a second pipeline: the brief goes through the same session the panel shows.
    app.setPanelOpen(true)
    void store.send(prompt)
    const what = quantity() === 1 ? t(`library.kind.${props.kind}.oneLower` as Key) : `${quantity()} ${t(`library.kind.${props.kind}.lower` as Key)}`
    toast.success(t("library.generate.progress", { what }))
    // The next generation starts from a clean form, not from the previous request.
    setRequest("")
    setQuantity(MIN_GENERATION_COUNT)
    setMakePublic(false)
    setSetDefault(false)
    props.onClose()
  }

  return (
    <Modal open={props.open} title={t("library.generate.title", { name: t(`library.kind.${props.kind}.many` as Key) })} onClose={props.onClose} wide>
      <p class="text-sm text-[color:var(--ent-text-muted)]">
        {t("library.generate.intro", { name: t(`library.kind.${props.kind}.lower` as Key) })}
      </p>

      <Show when={props.kind === "components" && (props.projectName === undefined || props.projectName === "")}>
        <p class="rounded-md border border-[color:var(--ent-warn)] bg-[color:var(--ent-warn-soft)] px-3 py-2 text-xs text-[color:var(--ent-warn)]" role="alert" data-testid="generate-no-project">
          {t("library.generate.noProject")}
        </p>
      </Show>

      <div>
        <label for="generate-request" class={LABEL}>{t("library.generate.what")}</label>
        <textarea
          id="generate-request"
          name="request"
          rows={3}
          class={INPUT}
          maxLength={MAX_REQUEST_CHARS}
          placeholder={t(`library.generate.placeholder.${props.kind}` as Key)}
          value={request()}
          onInput={(event) => setRequest(event.currentTarget.value)}
        />
        <div class="mt-2 flex flex-wrap gap-2">
          <For each={spec.examples}>{(example, index) => (
            <button
              type="button"
              class="rounded-full border border-[color:var(--ent-line-strong)] px-3 py-1 text-xs text-[color:var(--ent-text-muted)] transition-colors hover:border-[color:var(--ent-accent)] hover:text-[color:var(--ent-accent)]"
              onClick={() => setRequest(t(`library.generate.ex.${props.kind}.${index()}` as Key))}
            >
              {t(`library.generate.ex.${props.kind}.${index()}` as Key)}
            </button>
          )}</For>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label for="generate-quantity" class={LABEL}>{t("library.generate.howMany")}</label>
          <NumberField id="generate-quantity" name="quantity" int min={String(MIN_GENERATION_COUNT)} max={String(MAX_GENERATION_COUNT)} class={INPUT} value={quantity()} accept={(value) => value >= MIN_GENERATION_COUNT} onValue={(value) => setQuantity(generationCount(value))} />
        </div>
        <div class="flex flex-col justify-end gap-2 text-sm text-[color:var(--ent-text)]">
          <label class="inline-flex items-center gap-2">
            <input type="checkbox" class="h-4 w-4 rounded border-[color:var(--ent-line-strong)] text-[color:var(--ent-accent)] focus:ring-[color:var(--ent-accent)]" checked={makePublic()} onChange={(event) => setMakePublic(event.currentTarget.checked)} />
            {t("library.generate.makePublic", { name: t(`library.kind.${props.kind}.lower` as Key), visibility: t("save.publicProject") })}
          </label>
          <Show when={props.kind !== "components"}>
            <label class="inline-flex items-center gap-2">
              <input type="checkbox" class="h-4 w-4 rounded border-[color:var(--ent-line-strong)] text-[color:var(--ent-accent)] focus:ring-[color:var(--ent-accent)]" checked={setDefault()} onChange={(event) => setSetDefault(event.currentTarget.checked)} />
              {t("library.generate.setDefault")}
            </label>
          </Show>
        </div>
      </div>

      <div class="rounded-lg border border-[color:var(--ent-line)] bg-[color:var(--ent-surface-subtle)] px-3 py-2">
        <button type="button" class="flex w-full items-center justify-between gap-3 rounded text-left text-sm font-medium text-[color:var(--ent-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ent-accent)]" onClick={() => setShowParameters(!showParameters())} aria-expanded={showParameters()} aria-controls={showParameters() ? parametersId : undefined}>
          <span>{t("library.generate.parameters", { count: spec.parameters.length })}</span>
          <span class="text-[color:var(--ent-text-faint)]">{showParameters() ? t("update.hide") : t("cad.createComponent.show")}</span>
        </button>
        <Show when={showParameters()}>
          <ul id={parametersId} class="mt-2 space-y-1">
            <For each={spec.parameters}>{(parameter) => (
              <li class="flex gap-2 text-xs text-[color:var(--ent-text-muted)]">
                <code class="font-mono text-[color:var(--ent-accent)]">{parameter.name}</code>
                <span>{t(`library.generate.hint.${props.kind}.${parameter.name}` as Key)}</span>
              </li>
            )}</For>
          </ul>
        </Show>
      </div>

      <p class="text-xs text-[color:var(--ent-text-muted)]">{t(`library.generate.note.${props.kind}` as Key)}</p>

      <div class="flex flex-wrap justify-end gap-2 border-t border-[color:var(--ent-line)] pt-4">
        <button type="button" class="rounded-md border border-[color:var(--ent-line-strong)] px-4 py-2 text-sm font-medium text-[color:var(--ent-text)] hover:bg-[color:var(--ent-surface-subtle)]" onClick={props.onClose}>{t("common.cancel")}</button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-md bg-[color:var(--ent-action)] px-4 py-2 text-sm font-medium text-[color:var(--ent-action-text)] hover:bg-[color:var(--ent-action-hover)] disabled:opacity-50"
          data-testid="generate-submit"
          disabled={request().trim() === ""}
          onClick={submit}
        >
          <MessageSquareText size={16} aria-hidden="true" />{t("library.detail.generateAi")}
        </button>
      </div>
    </Modal>
  )
}
