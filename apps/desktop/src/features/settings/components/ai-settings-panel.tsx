/** AI settings reuse the shell AI provider; non-secret preferences live in sidecar KV. */
import { Show, createSignal, onMount, type JSX } from "solid-js"
import {
  AlertTriangle, ChevronDown, Clock, Cpu, Database, DollarSign, RefreshCw, Save, Server, Shield, Sliders, Zap
} from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { BridgeSettings, ProviderSettings, SkillsSettings, useAiStore } from "../../ai/index.ts"
import { DEFAULT_TEMPERATURE, defaultAiSettings, loadAiSettings, saveAiSettings, type AiSettings, type McpStrategy } from "./ai-settings.ts"
import { getEndpoint } from "../../../app/sidecar.ts"
import { Switch } from "../../../shared/ui/field.tsx"

type TestStatus = "idle" | "testing" | "success" | "error"

interface McpTestResult {
  readonly success: boolean
  readonly message: string
}

/** `.reference/src/lib/ai/mcpClient.ts` `testConnection`, against the sidecar base URL. */
const testConnection = async (endpointPath: string, apiKey: string | undefined): Promise<McpTestResult> => {
  try {
    const { baseUrl } = await getEndpoint()
    const response = await fetch(`${baseUrl}${endpointPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({ type: "schema" })
    })
    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, message: t("settings.ai.connectionError", { status: response.status, detail: errorText }) }
    }
    const data = (await response.json()) as { protocol?: string; resources?: unknown[]; tools?: unknown[] }
    if (data.protocol !== undefined && data.resources !== undefined && data.tools !== undefined) {
      return {
        success: true,
        message: t("settings.ai.connectionOk", { protocol: data.protocol, resources: data.resources.length, tools: data.tools.length })
      }
    }
    return { success: false, message: t("settings.ai.invalidFormat") }
  } catch (error) {
    return {
      success: false,
      message: t("settings.ai.connectionFailed", { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

const Chevron = (props: { readonly open: boolean }): JSX.Element => (
  <ChevronDown size={16} aria-hidden="true" class={`ml-2 transform transition-transform ${props.open ? "rotate-180" : ""}`} />
)

interface ToggleRowProps {
  readonly label: string
  readonly hint: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
}

const ToggleRow = (props: ToggleRowProps): JSX.Element => (
  <div class="flex items-center justify-between gap-3">
    <div>
      <label class="text-sm font-medium text-slate-700 dark:text-slate-300">{props.label}</label>
      <p class="text-xs text-slate-500 dark:text-slate-400">{props.hint}</p>
    </div>
    <Switch checked={props.checked} onChange={props.onChange} />
  </div>
)

export function AISettingsPanel(): JSX.Element {
  const app = useApp()
  const ai = useAiStore()
  const [mcpApiKey, setMcpApiKey] = createSignal("")
  const [isLoading, setIsLoading] = createSignal(true)
  const [settingsError, setSettingsError] = createSignal<string>()
  const [temperature, setTemperature] = createSignal(DEFAULT_TEMPERATURE)
  const [settings, setSettings] = createSignal<AiSettings>(defaultAiSettings())
  const [showAdvanced, setShowAdvanced] = createSignal(false)
  const [showMCPSettings, setShowMCPSettings] = createSignal(false)
  const [isSaving, setIsSaving] = createSignal(false)
  const [saveSuccess, setSaveSuccess] = createSignal(false)
  const [mcpTestStatus, setMcpTestStatus] = createSignal<TestStatus>("idle")
  const [mcpTestResult, setMcpTestResult] = createSignal<string | undefined>(undefined)
  const performance = { averageResponseTime: 0, successRate: 100, lastSync: Date.now() }

  onMount(() => {
    void app.runtime.run(loadAiSettings(app.client)).then((saved) => {
      setTemperature(saved.temperature)
      setSettings(saved.settings)
    }).catch(() => setSettingsError(t("ai.providers.failed")))
      .finally(() => setIsLoading(false))
  })

  const updateSettings = (patch: Partial<AiSettings>): void => {
    setSaveSuccess(false)
    setSettings((current) => ({ ...current, ...patch }))
  }

  const handleSaveSettings = async (): Promise<void> => {
    if (isLoading() || isSaving()) return
    setIsSaving(true)
    setSaveSuccess(false)
    setSettingsError(undefined)
    try {
      await app.runtime.run(saveAiSettings(app.client, { temperature: temperature(), settings: settings() }))
      setSaveSuccess(true)
    } catch {
      setSettingsError(t("ai.providers.failed"))
    } finally {
      setIsSaving(false)
    }
  }

  const runMcpTest = async (): Promise<void> => {
    setMcpTestStatus("testing")
    setMcpTestResult("")
    const result = await testConnection(settings().mcpEndpoint || "/api/mcp-protocol", mcpApiKey())
    setMcpTestStatus(result.success ? "success" : "error")
    setMcpTestResult(result.message)
  }

  return (
    <div class="space-y-6 p-4">
      <div class="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-700">
        <h3 class="flex items-center text-lg font-medium leading-6 text-slate-900 dark:text-white">
          <Sliders class="mr-2 h-4 w-4 text-slate-400 dark:text-slate-500" />
          {t("settings.ai.title")}
        </h3>

        <div class="flex gap-2">
          <button
            type="button"
            onClick={() => void handleSaveSettings()}
            disabled={isSaving() || isLoading()}
            class="inline-flex h-7 items-center gap-2 rounded-[5px] bg-blue-600 px-3 text-xs font-medium text-white transition-colors duration-150 ease-out hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving()
              ? <RefreshCw size={14} class="animate-spin" />
              : <Save size={14} />}
            {t("settings.ai.save")}
          </button>
        </div>
      </div>

      <Show when={saveSuccess()}>
        <div class="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
          <Cpu size={14} />
          {t("settings.ai.saved")}
        </div>
      </Show>

      <Show when={settingsError()}>
        <p role="alert" class="text-sm text-red-600 dark:text-red-400">{settingsError()}</p>
      </Show>

      <fieldset disabled={isLoading() || isSaving()} class="space-y-4 min-w-0">
        <ProviderSettings />
        <SkillsSettings />
        <BridgeSettings />

        <div>
          <label for="ai-temperature" class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            {t("settings.ai.temperature", { value: temperature().toFixed(1) })}
          </label>
          <input
            id="ai-temperature"
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={temperature()}
            onInput={(event) => {
              setSaveSuccess(false)
              setTemperature(Number.parseFloat(event.currentTarget.value))
            }}
            class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 dark:bg-slate-700"
          />
          <div class="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{t("settings.ai.precise")}</span>
            <span>{t("settings.ai.balancedTemp")}</span>
            <span>{t("settings.ai.creative")}</span>
          </div>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("settings.ai.temperatureHint")}
          </p>
        </div>

        {/* MCP (Model-Completions-Protocol) Section */}
        <div class="border-t border-slate-200 pb-2 pt-4 dark:border-slate-700">
          <div class="flex items-center justify-between gap-3">
            <div>
              <label class="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Server size={14} class="text-slate-400" />
                {t("settings.ai.mcp")}
              </label>
              <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t("settings.ai.mcpHint")}
              </p>
            </div>
            <Switch checked={settings().mcpEnabled} onChange={(checked) => updateSettings({ mcpEnabled: checked })} />
          </div>

          <Show when={settings().mcpEnabled}>
            <div class="mt-3">
              <button
                type="button"
                onClick={() => setShowMCPSettings(!showMCPSettings())}
                class="flex items-center text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              >
                {showMCPSettings() ? t("settings.ai.hideMcp") : t("settings.ai.showMcp")}
                <Chevron open={showMCPSettings()} />
              </button>

              <Show when={showMCPSettings()}>
                <div class="mt-3 space-y-3 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
                  <div>
                    <label for="mcp-endpoint" class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t("settings.ai.mcpEndpoint")}
                    </label>
                    <input
                      type="text"
                      id="mcp-endpoint"
                      placeholder="/api/mcp-protocol"
                      value={settings().mcpEndpoint ?? "/api/mcp-protocol"}
                      onInput={(event) => updateSettings({ mcpEndpoint: event.currentTarget.value })}
                      class="w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t("settings.ai.mcpDefault")}
                    </p>
                  </div>

                  <div>
                    <label for="mcp-api-key" class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t("settings.ai.mcpApiKey")}
                    </label>
                    <input
                      type="password"
                      id="mcp-api-key"
                      placeholder={t("settings.ai.mcpKeyPlaceholder")}
                      value={mcpApiKey()}
                      autocomplete="off"
                      onInput={(event) => setMcpApiKey(event.currentTarget.value)}
                      class="w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label for="mcp-strategy" class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t("settings.ai.mcpStrategy")}
                    </label>
                    <select
                      id="mcp-strategy"
                      value={settings().mcpStrategy}
                      onChange={(event) => updateSettings({ mcpStrategy: event.currentTarget.value as McpStrategy })}
                      class="w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="aggressive">{t("settings.ai.strategyAggressive")}</option>
                      <option value="balanced">{t("settings.ai.strategyBalanced")}</option>
                      <option value="conservative">{t("settings.ai.strategyConservative")}</option>
                    </select>
                    <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t("settings.ai.strategyHint")}
                    </p>
                  </div>

                  <div>
                    <label for="mcp-cache-lifetime" class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t("settings.ai.mcpCache", { hours: (settings().mcpCacheLifetime || 86400000) / (1000 * 60 * 60) })}
                    </label>
                    <input
                      id="mcp-cache-lifetime"
                      type="range"
                      min="3600000"
                      max="604800000"
                      step="3600000"
                      value={settings().mcpCacheLifetime || 86400000}
                      onInput={(event) => updateSettings({ mcpCacheLifetime: Number.parseInt(event.currentTarget.value, 10) })}
                      class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 dark:bg-slate-700"
                    />
                    <div class="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>1 hour</span>
                      <span>1 day</span>
                      <span>1 week</span>
                    </div>
                  </div>

                  <div class="pt-2">
                    <button
                      type="button"
                      onClick={() => void runMcpTest()}
                      disabled={mcpTestStatus() === "testing"}
                      class="inline-flex h-7 items-center gap-2 rounded-[5px] border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors duration-150 ease-out hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {mcpTestStatus() === "testing"
                        ? <RefreshCw size={14} class="animate-spin" />
                        : <Server size={14} />}
                      {t("settings.ai.mcpTest")}
                    </button>

                    <Show when={mcpTestStatus() !== "idle" && mcpTestResult() !== undefined}>
                      <div
                        class={`mt-2 rounded-md px-3 py-2 text-xs ${
                          mcpTestStatus() === "success"
                            ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
                            : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
                        }`}
                      >
                        {mcpTestResult()}
                      </div>
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
          </Show>
        </div>

        <div class="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
          <div class="space-y-3">
            <ToggleRow
              label={t("settings.ai.autoSuggest")}
              hint="Show suggestions based on context"
              checked={settings().autoSuggest}
              onChange={(checked) => updateSettings({ autoSuggest: checked })}
            />
            <ToggleRow
              label={t("settings.ai.cache")}
              hint="Cache AI responses for reuse"
              checked={settings().cacheEnabled}
              onChange={(checked) => updateSettings({ cacheEnabled: checked })}
            />
            <ToggleRow
              label={t("settings.ai.analytics")}
              hint="Track usage and performance"
              checked={settings().analyticsEnabled}
              onChange={(checked) => updateSettings({ analyticsEnabled: checked })}
            />
          </div>

          <div class="space-y-3">
            <ToggleRow
              label={t("settings.ai.autoModel")}
              hint="Use the best model for each task"
              checked={settings().autoModelSelection}
              onChange={(checked) => updateSettings({ autoModelSelection: checked })}
            />
            <ToggleRow
              label={t("settings.ai.costOpt")}
              hint="Balance performance and costs"
              checked={settings().costOptimization}
              onChange={(checked) => updateSettings({ costOptimization: checked })}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced())}
          class="flex items-center text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          {showAdvanced() ? t("settings.ai.hideAdvanced") : t("settings.ai.showAdvanced")}
          <Chevron open={showAdvanced()} />
        </button>

        <Show when={showAdvanced()}>
          <div class="mt-2 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-700">
            <div>
              <label for="ai-max-tokens" class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("settings.ai.maxTokens", { value: settings().maxTokens })}
              </label>
              <input
                id="ai-max-tokens"
                type="range"
                min="1000"
                max="8000"
                step="500"
                value={settings().maxTokens}
                onInput={(event) => updateSettings({ maxTokens: Number.parseInt(event.currentTarget.value, 10) })}
                class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 dark:bg-slate-700"
              />
              <div class="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>1000</span>
                <span>4000</span>
                <span>8000</span>
              </div>
            </div>

            <div>
              <label for="ai-suggestion-threshold" class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("settings.ai.suggestThreshold", { value: settings().suggestThreshold })}
              </label>
              <input
                id="ai-suggestion-threshold"
                type="range"
                min="0.1"
                max="0.9"
                step="0.1"
                value={settings().suggestThreshold}
                onInput={(event) => updateSettings({ suggestThreshold: Number.parseFloat(event.currentTarget.value) })}
                class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 dark:bg-slate-700"
              />
              <div class="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{t("settings.ai.moreSuggestions")}</span>
                <span>{t("settings.ai.balancedSuggest")}</span>
                <span>{t("settings.ai.onlyRelevant")}</span>
              </div>
            </div>

            <div class="flex justify-between">
              <button
                type="button"
                disabled
                class="flex items-center gap-2 text-sm text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
              >
                <Database size={14} />
                {t("settings.ai.clearCache")}
              </button>

              <button
                type="button"
                onClick={() => ai.clear()}
                class="flex items-center gap-2 text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
              >
                <RefreshCw size={14} />
                {t("settings.ai.clearHistory")}
              </button>
            </div>
          </div>
        </Show>
      </fieldset>

      {/* Performance summary */}
      <div class="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
        <h3 class="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <Zap size={14} class="text-slate-400" />
          {t("settings.ai.stats")}
        </h3>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">{t("settings.ai.avgResponse")}</p>
            <p class="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {Math.round(performance.averageResponseTime)} ms
            </p>
          </div>

          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">{t("settings.ai.successRate")}</p>
            <p class="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{Math.round(performance.successRate)}%</p>
          </div>
        </div>

        <Show when={settings().mcpEnabled}>
          <div class="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
            <h4 class="mb-2 flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              <Server size={14} class="text-slate-400" />
              {t("settings.ai.mcpStats")}
            </h4>
            <div class="flex gap-4">
              <div>
                <p class="text-xs text-slate-500 dark:text-slate-400">{t("settings.ai.savings")}</p>
                <p class="text-sm font-medium text-slate-900 dark:text-slate-100">
                  --
                </p>
              </div>
              <div>
                <p class="text-xs text-slate-500 dark:text-slate-400">{t("settings.ai.strategy")}</p>
                <p class="text-sm font-medium text-slate-900 dark:text-slate-100">{settings().mcpStrategy}</p>
              </div>
              <div>
                <p class="text-xs text-slate-500 dark:text-slate-400">{t("settings.ai.cacheLabel")}</p>
                <p class="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {((settings().mcpCacheLifetime || 86400000) / (1000 * 60 * 60)).toFixed(0)}h
                </p>
              </div>
            </div>
          </div>
        </Show>

        <div class="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <DollarSign size={14} />
              {t("settings.ai.costPerK", { cost: "--" })}
            </div>
            <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Clock size={14} />
              {t("settings.ai.lastUpdate", { time: new Date(performance.lastSync).toLocaleTimeString() })}
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
        <AlertTriangle size={14} class="mt-0.5 flex-none" />
        <p>
          Advanced settings can affect performance and costs. The MCP protocol helps reduce costs and improve
          performance by optimizing requests through semantic caching.
        </p>
      </div>

      <Show when={settings().mcpEnabled}>
        <div class="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          <Shield size={14} class="mt-0.5 flex-none" />
          <p>
            The MCP (Model-Completions-Protocol) is active. AI requests will be optimized through semantic caching,
            resulting in faster responses and reduced costs. The {settings().mcpStrategy} strategy is configured to{" "}
            {settings().mcpStrategy === "aggressive"
              ? "maximize savings"
              : settings().mcpStrategy === "conservative"
                ? "maximize precision"
                : "balance costs and precision"}
            .
          </p>
        </div>
      </Show>
    </div>
  )
}
