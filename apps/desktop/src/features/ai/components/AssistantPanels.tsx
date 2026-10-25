/**
 * The disclosures of the assistant: conversations, tools, skills, statistics,
 * providers, extensions and the action catalogue.
 *
 * They used to be seven booleans in the assistant's main file, each toggled on
 * its own, so opening one left the others open and the slash commands closed
 * every one of them. Now there is one value — which panel is open — and this
 * component renders it.
 */
import { For, Show, createMemo, type JSX } from "solid-js"
import { t } from "../../../i18n/index.ts"
import { ActionCatalogue } from "./ActionCatalogue.tsx"
import { CommandHelp } from "./CommandHelp.tsx"
import { CostSummary } from "./CostSummary.tsx"
import { ExtensionsSettings } from "./ExtensionsSettings.tsx"
import { ProviderSettings } from "./ProviderSettings.tsx"
import { SessionsPanel } from "./SessionsPanel.tsx"
import { SkillsSettings } from "./SkillsSettings.tsx"
import { useAiStore } from "../store/context.tsx"
import { toolTitle } from "../lib/tools.ts"
import type { PanelId } from "../lib/panels.ts"

export interface AssistantPanelsProps {
  readonly panel: PanelId | undefined
  readonly onRunCommand: (name: string) => void
}

export function AssistantPanels(props: AssistantPanelsProps): JSX.Element {
  const ai = useAiStore()
  const registeredTools = createMemo(() => ai.aiStatus()?.tools ?? [])

  return (
    <>
      <Show when={props.panel === "stats"}>
        <section class="assistant-disclosure assistant-settings" data-testid="ai-panel-stats">
          <p class="assistant-section-label">{t("ai.stats.title")}</p>
          <div class="assistant-stats-grid">
            <div class="assistant-stat-card">
              <p class="assistant-stat-value">{ai.stats().exchanges}</p>
              <p class="assistant-stat-label">{t("ai.stats.exchanges")}</p>
            </div>
            <div class="assistant-stat-card">
              <p class="assistant-stat-value">{ai.stats().toolCalls}</p>
              <p class="assistant-stat-label">{t("ai.stats.toolCalls")}</p>
            </div>
            <div class="assistant-stat-card">
              <p class="assistant-stat-value">{ai.stats().thinkingSteps}</p>
              <p class="assistant-stat-label">{t("ai.stats.thinking")}</p>
            </div>
            <div class="assistant-stat-card">
              <p class="assistant-stat-value">{formatTokens(ai.stats().totalInputTokens, ai.stats().totalOutputTokens)}</p>
              <p class="assistant-stat-label">{t("ai.stats.usage")}</p>
            </div>
          </div>
          <CostSummary />
        </section>
      </Show>

      <Show when={props.panel === "sessions"}>
        <div class="assistant-disclosure"><SessionsPanel /></div>
      </Show>
      <Show when={props.panel === "providers"}>
        <section class="assistant-disclosure assistant-settings">
          <ProviderSettings />
        </section>
      </Show>
      <Show when={props.panel === "extensions"}>
        <section class="assistant-disclosure assistant-settings"><ExtensionsSettings /></section>
      </Show>
      <Show when={props.panel === "skills"}>
        <section class="assistant-disclosure assistant-settings"><SkillsSettings /></section>
      </Show>
      <Show when={props.panel === "tools"}>
        <details class="assistant-disclosure assistant-settings" open>
          <summary class="assistant-activity-summary">{t("ai.tool.tools")} ({registeredTools().length})</summary>
          <p class="assistant-meta-text mt-1">{t("ai.tool.toolsHint")}</p>
          <ul class="assistant-tool-catalogue">
            <For each={registeredTools()}>{(tool) => <li><span>{toolTitle(tool.id)}</span><code>{tool.id}</code><p>{tool.description}</p></li>}</For>
          </ul>
        </details>
      </Show>
      <Show when={props.panel === "catalog"}>
        <section class="assistant-disclosure assistant-settings">
          <p class="assistant-section-label">{t("ai.catalog.title")}</p>
          <ActionCatalogue />
        </section>
      </Show>
      <Show when={props.panel === "help"}>
        <section class="assistant-disclosure assistant-settings">
          <CommandHelp onRun={props.onRunCommand} />
        </section>
      </Show>
    </>
  )
}

const formatTokens = (input: number, output: number): string => {
  const total = input + output
  if (total < 1000) return `${total}`
  if (total < 1000000) return `${(total / 1000).toFixed(1)}k`
  return `${(total / 1000000).toFixed(2)}M`
}
