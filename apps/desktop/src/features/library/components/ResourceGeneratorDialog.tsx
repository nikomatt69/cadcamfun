/**
 * The Resources generator dialog: one form per resource kind that hands a complete brief to the assistant.
 *
 * The page keeps listing the same rows the assistant writes (`library_edit` / `parts`); this dialog only decides
 * what to ask for — kind, quantity, visibility, project default — and shows the parameters the assistant will
 * fill. Submitting opens the docked assistant panel and sends the brief, so the user watches the real tool calls
 * and approves the real writes.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { Sparkles } from "lucide-solid"
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

const INPUT = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
const LABEL = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"

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
  const [request, setRequest] = createSignal("")
  const [quantity, setQuantity] = createSignal(MIN_GENERATION_COUNT)
  const [makePublic, setMakePublic] = createSignal(false)
  const [setDefault, setSetDefault] = createSignal(false)
  const [showParameters, setShowParameters] = createSignal(false)

  const submit = (): void => {
    const store = ai
    if (store === undefined) {
      toast.error("The assistant is not available: open a project and configure a provider, then try again.")
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
    toast.success(`Generating ${quantity() === 1 ? spec.singular.toLowerCase() : `${quantity()} ${spec.plural.toLowerCase()}`} — follow the assistant in the panel.`)
    // The next generation starts from a clean form, not from the previous request.
    setRequest("")
    setQuantity(MIN_GENERATION_COUNT)
    setMakePublic(false)
    setSetDefault(false)
    props.onClose()
  }

  return (
    <Modal open={props.open} title={`Generate ${spec.plural}`} onClose={props.onClose} wide>
      <p class="text-sm text-slate-600 dark:text-slate-400">
        The assistant builds {spec.plural.toLowerCase()} from your description and writes them through the same libraries this page lists, filling every parameter.
      </p>

      <Show when={props.kind === "components" && (props.projectName === undefined || props.projectName === "")}>
        <p class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200" role="alert" data-testid="generate-no-project">
          No project is open: the assistant builds the geometry in the open project, so open or create one first.
        </p>
      </Show>

      <div>
        <label for="generate-request" class={LABEL}>What should be generated?</label>
        <textarea
          id="generate-request"
          name="request"
          rows={3}
          class={INPUT}
          maxLength={MAX_REQUEST_CHARS}
          placeholder={spec.placeholder}
          value={request()}
          onInput={(event) => setRequest(event.currentTarget.value)}
        />
        <div class="mt-2 flex flex-wrap gap-1.5">
          <For each={spec.examples}>{(example) => (
            <button
              type="button"
              class="rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-300"
              onClick={() => setRequest(example)}
            >
              {example}
            </button>
          )}</For>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label for="generate-quantity" class={LABEL}>How many?</label>
          <input
            id="generate-quantity"
            name="quantity"
            type="number"
            min={MIN_GENERATION_COUNT}
            max={MAX_GENERATION_COUNT}
            class={INPUT}
            value={quantity()}
            onInput={(event) => setQuantity(generationCount(Number(event.currentTarget.value)))}
          />
        </div>
        <div class="flex flex-col justify-end gap-1.5 text-sm text-slate-700 dark:text-slate-300">
          <label class="inline-flex items-center gap-2">
            <input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700" checked={makePublic()} onChange={(event) => setMakePublic(event.currentTarget.checked)} />
            Make the new {spec.plural.toLowerCase()} public
          </label>
          <Show when={props.kind !== "components"}>
            <label class="inline-flex items-center gap-2">
              <input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700" checked={setDefault()} onChange={(event) => setSetDefault(event.currentTarget.checked)} />
              Set them as the project defaults
            </label>
          </Show>
        </div>
      </div>

      <div class="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40">
        <button type="button" class="flex w-full items-center justify-between text-left text-sm font-medium text-slate-700 dark:text-slate-200" onClick={() => setShowParameters(!showParameters())} aria-expanded={showParameters()}>
          <span>Parameters the assistant fills ({spec.parameters.length})</span>
          <span class="text-slate-400">{showParameters() ? "Hide" : "Show"}</span>
        </button>
        <Show when={showParameters()}>
          <ul class="mt-2 space-y-1">
            <For each={spec.parameters}>{(parameter) => (
              <li class="flex gap-2 text-xs text-slate-600 dark:text-slate-400">
                <code class="font-mono text-blue-600 dark:text-blue-400">{parameter.name}</code>
                <span>{parameter.hint}</span>
              </li>
            )}</For>
          </ul>
        </Show>
      </div>

      <p class="text-xs text-slate-500 dark:text-slate-400">{spec.note}</p>

      <div class="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
        <button type="button" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-gray-800" onClick={props.onClose}>Cancel</button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          data-testid="generate-submit"
          disabled={request().trim() === ""}
          onClick={submit}
        >
          <Sparkles size={16} aria-hidden="true" />Generate with AI
        </button>
      </div>
    </Modal>
  )
}
