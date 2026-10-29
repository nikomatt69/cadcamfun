import { For, Show, createEffect, on, type JSX } from "solid-js"
import { Cpu } from "lucide-solid"
import { useApp } from "../../../../shared/state/context.ts"
import { useAiStore } from "../../../ai/index.ts"
import { geometryOf } from "../../lib/job.ts"
import { useJob } from "../../hooks/useJob.ts"
import { makeToolpathGenerator } from "../../api/generator.ts"
import { useGeneratorStore, type ToolpathSettings } from "../../store/generatorStore.ts"
import { t } from "../../../../i18n/index.ts"
import { CheckRow, INPUT, LABEL, Section } from "./ui.tsx"

/** The assistant is optional here (the panel also mounts without the AI provider, e.g. in tests). */
const maybeAi = (): ReturnType<typeof useAiStore> | undefined => {
  try { return useAiStore() } catch { return undefined }
}

function Spinner(props: { readonly class: string }): JSX.Element {
  return (
    <svg class={props.class} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

/**
 * "AI Assistance": parameter suggestions for the current job and a question box.
 *
 * Suggestions come from the sidecar (`toolpathGenerator.suggest`, deterministic, with the stock and the
 * selected element in the loop); a question goes to the nikcli assistant, which sees the CAD, the G-code and
 * the toolpath through the shared assistant context.
 */
export function AiSection(): JSX.Element {
  const app = useApp()
  const gen = useGeneratorStore()
  const job = useJob()
  const ai = maybeAi()
  const generator = makeToolpathGenerator(app.client)

  createEffect(on(
    () => [gen.settings.useAI, gen.settings.material, gen.settings.toolDiameter, gen.settings.operationType, gen.settings.machineType, gen.settings.depth, job.element()?.["id"], job.stock().depth] as const,
    ([enabled]) => {
      if (!enabled) return
      gen.setAIProcessing(true)
      void app.runtime
        .run(generator.suggest({ settings: gen.settings, geometry: geometryOf(gen, job.sources()) as never }))
        .then((result) => gen.setAiSuggestions([...result.suggestions, ...result.warnings.map((warning) => `Warning: ${warning}`)]))
        .catch((cause) => gen.flashError(cause instanceof Error ? cause.message : String(cause)))
        .finally(() => gen.setAIProcessing(false))
    }
  ))

  const ask = (question: string): void => {
    if (!ai) { gen.addAiSuggestion(t("cam.ai.replyNoAI", { material: gen.settings.material })); return }
    app.setPanelOpen(true)
    void ai.send(`Toolpath generator (${gen.settings.machineType}, ${gen.settings.operationType}, ${gen.settings.material}, tool Ø${gen.settings.toolDiameter}mm, depth ${gen.settings.depth}mm): ${question}`)
    gen.addAiSuggestion(`Question sent to the assistant: "${question}"`)
  }

  return (
    <Section id="ai" icon={Cpu} title={t("cam.gen.ai.title")} testId="ai-section">
      <CheckRow id="useAI" checked={gen.settings.useAI} onChange={(checked) => gen.updateSettings("useAI", checked)}>{t("cam.gen.ai.enable")}</CheckRow>

      <Show when={gen.settings.useAI}>
        <div>
          <label class={LABEL}>{t("cam.gen.ai.complexity")}</label>
          <select class={INPUT} value={gen.settings.aiDifficulty} onChange={(event) => gen.updateSettings("aiDifficulty", event.currentTarget.value as ToolpathSettings["aiDifficulty"])}>
            <option value="simple">{t("cam.gen.ai.simple")}</option>
            <option value="moderate">{t("cam.gen.ai.moderate")}</option>
            <option value="complex">{t("cam.gen.ai.complex")}</option>
          </select>
        </div>

        <div>
          <label class={LABEL}>{t("cam.ai.optimizeFor")}</label>
          <select class={INPUT} value={gen.settings.aiOptimize} onChange={(event) => gen.updateSettings("aiOptimize", event.currentTarget.value as ToolpathSettings["aiOptimize"])}>
            <option value="speed">{t("cam.timeline.speed")}</option>
            <option value="quality">{t("cam.gen.pp.quality")}</option>
            <option value="balance">{t("cam.gen.ai.balance")}</option>
          </select>
        </div>

        <div class="p-3 bg-blue-50 rounded-md">
          <h4 class="text-sm font-medium text-blue-800 mb-2">{t("cam.gen.ai.suggestions")}</h4>
          <Show
            when={!gen.isAIProcessing}
            fallback={<div class="flex justify-center items-center py-4"><Spinner class="animate-spin h-5 w-5 text-blue-500 mr-2" /><span class="text-sm text-blue-600">{t("cam.gen.ai.analyzing")}</span></div>}
          >
            <Show when={gen.aiSuggestions.length > 0} fallback={<p class="text-sm text-blue-600">{t("cam.gen.ai.enableHint")}</p>}>
              <ul class="space-y-2">
                <For each={gen.aiSuggestions}>
                  {(suggestion) => (
                    <li class="text-sm text-blue-700 flex items-start"><Cpu size={14} class="mt-0.5 mr-2 flex-shrink-0" /><span>{suggestion}</span></li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </div>

        <div class="mt-2 p-3 bg-gray-50 rounded-md">
          <h4 class="text-sm font-medium text-gray-700 mb-2">{t("cam.gen.ai.ask")}</h4>
          <div class="relative">
            <input
              type="text"
              class="w-full p-2 pr-10 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder={t("cam.ai.askPlaceholder")}
              onKeyDown={(event) => {
                const input = event.currentTarget
                if (event.key === "Enter" && input.value) { ask(input.value); input.value = "" }
              }}
            />
            <button
              type="button"
              class="absolute right-2 top-2 text-blue-600"
              aria-label={t("cam.ai.send")}
              onClick={() => gen.addAiSuggestion(t("cam.ai.replyNoAI", { material: gen.settings.material }) + t("cam.ai.replyTry"))}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </button>
          </div>
        </div>
      </Show>
    </Section>
  )
}
