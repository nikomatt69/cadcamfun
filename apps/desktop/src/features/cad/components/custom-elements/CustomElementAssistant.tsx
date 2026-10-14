import { For, Show, createSignal, type JSX } from "solid-js"
import { LoaderCircle, Sparkles } from "lucide-solid"
import { useApp } from "../../../../shared/state/context.ts"
import { t } from "../../../../i18n/index.ts"
import { useCustomElementsStore } from "../../store/customElementsStore.ts"
import type { CustomElementDefinition } from "../../types/customElements.ts"

export default function CustomElementAssistant(props: {
  readonly definition: CustomElementDefinition
  readonly onGenerated: () => void
}): JSX.Element {
  const app = useApp()
  const store = useCustomElementsStore()
  const [brief, setBrief] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string>()

  const generate = async (): Promise<void> => {
    const request = brief().trim()
    if (!request || busy()) return
    setBusy(true)
    setError(undefined)
    try {
      const current = props.definition
      const reply = await app.runtime.run(app.client.ai.completion({
        payload: {
          prompt: `Create a reusable parametric CAD custom element for Three.js from this request. Return one valid JSON object only, without Markdown fences or commentary, with exactly these fields: name (string), description (string), category (string), tags (array of strings), parameters (object keyed by JavaScript identifiers; each value has type (number|string|boolean|color|vector3|select), default, and optional min/max/step/label/description/options), geometryCode (JavaScript function body that returns THREE.BufferGeometry or THREE.Object3D), materialConfig (optional object with type and properties). The code runs with THREE and parameters in scope. Prefer robust positive dimensions, useful adjustable parameters with sensible limits, centered geometry, and a MeshStandardMaterial-compatible result. Do not use imports, browser APIs, network, filesystem, eval, or external libraries. Output JSON only.\n\nUser request:\n${request}\n\nCurrent definition to refine (if relevant):\n${JSON.stringify({ name: current.name, description: current.description, category: current.category, tags: current.tags, parameters: current.parameters, geometryCode: current.geometryCode, materialConfig: current.materialConfig })}`,
          systemPrompt: "You are a parametric CAD author. Return a compact, valid JSON custom-element definition. Never call tools or make changes to a drawing."
        }
      }))
      const text = reply.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
      const generated = JSON.parse(text) as Partial<CustomElementDefinition>
      if (typeof generated.name !== "string" || typeof generated.geometryCode !== "string" || generated.parameters === null || typeof generated.parameters !== "object") {
        throw new Error("The assistant response is missing the element name, parameters, or geometry code.")
      }
      const next: CustomElementDefinition = {
        ...current,
        ...generated,
        id: current.id,
        created: current.created,
        modified: new Date().toISOString(),
        parameters: generated.parameters as CustomElementDefinition["parameters"],
      }
      const validation = store.validateDefinition(next)
      if (!validation.valid) throw new Error(validation.errors.slice(0, 3).join(" "))
      store.setActiveDefinition(next)
      store.updatePreviewParameters(Object.fromEntries(Object.entries(next.parameters).map(([name, parameter]) => [name, parameter.default])))
      props.onGenerated()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section class="flex h-full flex-col gap-4 p-5">
      <div class="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <span class="rounded-lg bg-blue-600 p-2 text-white"><Sparkles size={17} /></span>
        <div><h3 class="text-sm font-semibold text-slate-900 dark:text-white">{t("cad.customElements.assistantHeading")}</h3><p class="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{t("cad.customElements.assistantDescription")}</p></div>
      </div>
      <label class="text-xs font-semibold uppercase tracking-wide text-slate-500" for="custom-element-assistant-prompt">{t("cad.customElements.assistantPromptLabel")}</label>
      <textarea id="custom-element-assistant-prompt" class="min-h-36 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white" value={brief()} onInput={(event) => setBrief(event.currentTarget.value)} placeholder={t("cad.customElements.assistantPlaceholder")} />
      <div class="flex flex-wrap gap-2">
        <For each={["A mounting bracket with two slotted holes", "A knurled adjustment knob with a center bore", "A cable gland with threaded body and hex nut"]}>
          {(example) => <button type="button" class="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-700 dark:border-slate-600 dark:text-slate-300 dark:hover:text-blue-300" onClick={() => setBrief(example)}>{example}</button>}
        </For>
      </div>
      <Show when={error()}>{(message) => <p role="alert" class="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{message()}</p>}</Show>
      <div class="mt-auto flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
        <p class="text-xs text-slate-500 dark:text-slate-400">{t("cad.customElements.assistantReviewHint")}</p>
        <button type="button" class="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={!brief().trim() || busy()} onClick={() => void generate()}>
          <Show when={busy()} fallback={<Sparkles size={16} />}><LoaderCircle size={16} class="animate-spin" /></Show>{busy() ? t("cad.customElements.assistantGenerating") : t("cad.customElements.assistantGenerate")}
        </button>
      </div>
    </section>
  )
}
