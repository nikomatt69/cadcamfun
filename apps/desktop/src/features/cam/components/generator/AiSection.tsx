import { For, Show, createEffect, on, type JSX } from "solid-js"
import { Cpu, LoaderCircle, MessageCircle } from "lucide-solid"
import { useApp } from "../../../../shared/state/context.ts"
import { useAiStore } from "../../../ai/index.ts"
import { geometryOf } from "../../lib/job.ts"
import { useJob } from "../../hooks/useJob.ts"
import { makeToolpathGenerator } from "../../api/generator.ts"
import { useGeneratorStore, type ToolpathSettings } from "../../store/generatorStore.ts"
import { t } from "../../../../i18n/index.ts"
import { CheckRow, Group, INPUT, LABEL, Section } from "./ui.tsx"
import { SetupExamples } from "./SetupExamples.tsx"

/** The assistant is optional here (the panel also mounts without the AI provider, e.g. in tests). */
const maybeAi = (): ReturnType<typeof useAiStore> | undefined => {
  try { return useAiStore() } catch { return undefined }
}

function Spinner(props: { readonly class: string }): JSX.Element {
  return <LoaderCircle class={props.class} size={14} aria-hidden="true" />
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
        <div class="panel-field">
          <label class={LABEL}>{t("cam.gen.ai.complexity")}</label>
          <select class={INPUT} value={gen.settings.aiDifficulty} onChange={(event) => gen.updateSettings("aiDifficulty", event.currentTarget.value as ToolpathSettings["aiDifficulty"])}>
            <option value="simple">{t("cam.gen.ai.simple")}</option>
            <option value="moderate">{t("cam.gen.ai.moderate")}</option>
            <option value="complex">{t("cam.gen.ai.complex")}</option>
          </select>
        </div>

        <div class="panel-field">
          <label class={LABEL}>{t("cam.ai.optimizeFor")}</label>
          <select class={INPUT} value={gen.settings.aiOptimize} onChange={(event) => gen.updateSettings("aiOptimize", event.currentTarget.value as ToolpathSettings["aiOptimize"])}>
            <option value="speed">{t("cam.timeline.speed")}</option>
            <option value="quality">{t("cam.gen.pp.quality")}</option>
            <option value="balance">{t("cam.gen.ai.balance")}</option>
          </select>
        </div>

        <Group title={t("cam.gen.ai.suggestions")}>
          <Show
            when={!gen.isAIProcessing}
            fallback={<div class="panel-row justify-start gap-2 py-2"><Spinner class="animate-spin" /><span>{t("cam.gen.ai.analyzing")}</span></div>}
          >
            <Show when={gen.aiSuggestions.length > 0} fallback={<p class="panel-hint">{t("cam.gen.ai.enableHint")}</p>}>
              <ul class="grid gap-1.5">
                <For each={gen.aiSuggestions}>
                  {(suggestion) => (
                    <li class="flex items-start gap-2 text-[11.5px] leading-4 text-[color:var(--panel-text)]"><Cpu size={14} class="mt-px flex-none text-[color:var(--panel-text-muted)]" /><span>{suggestion}</span></li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </Group>

        <Group title={t("cam.gen.ai.ask")}>
          <div class="relative">
            <input
              type="text"
              class={`${INPUT} pr-8`}
              placeholder={t("cam.ai.askPlaceholder")}
              onKeyDown={(event) => {
                const input = event.currentTarget
                if (event.key === "Enter" && input.value) { ask(input.value); input.value = "" }
              }}
            />
            <button
              type="button"
              class="panel-icon-btn absolute right-0.5 top-0.5 h-6 w-6"
              aria-label={t("cam.ai.send")}
              onClick={() => gen.addAiSuggestion(t("cam.ai.replyNoAI", { material: gen.settings.material }) + t("cam.ai.replyTry"))}
            >
              <MessageCircle size={14} aria-hidden="true" />
            </button>
          </div>
        </Group>
      </Show>
      <SetupExamples area="ai" />
    </Section>
  )
}
