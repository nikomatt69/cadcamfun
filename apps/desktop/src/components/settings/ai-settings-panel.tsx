/** AI settings reuse the shell AI provider; non-secret preferences live in sidecar KV. */
import { Show, createSignal, onMount, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import {
  AlertTriangle, Clock, Cpu, Database, DollarSign, RefreshCw, Save, Server, Shield, Sliders, Zap
} from "lucide-solid"
import { t } from "../../i18n/index.ts"
import { useApp } from "../../state/context.ts"
import { useAiStore } from "../../ai/context.tsx"
import { ProviderSettings } from "../../ai/ProviderSettings.tsx"
import { SkillsSettings } from "../../ai/SkillsSettings.tsx"
import { DEFAULT_TEMPERATURE, defaultAiSettings, loadAiSettings, saveAiSettings, type AiSettings, type McpStrategy } from "./ai-settings.ts"
import { getEndpoint } from "../../app/sidecar.ts"

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
      return { success: false, message: `Connection error: ${response.status} - ${errorText}` }
    }
    const data = (await response.json()) as { protocol?: string; resources?: unknown[]; tools?: unknown[] }
    if (data.protocol !== undefined && data.resources !== undefined && data.tools !== undefined) {
      return {
        success: true,
        message: `Connessione riuscita. Protocollo: ${data.protocol}, ${data.resources.length} risorse, ${data.tools.length} strumenti disponibili.`
      }
    }
    return { success: false, message: "The response format is invalid." }
  } catch (error) {
    return {
      success: false,
      message: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

const Chevron = (props: { readonly open: boolean }): JSX.Element => (
  <svg
    class={`ml-1 w-4 h-4 transform transition-transform ${props.open ? "rotate-180" : ""}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
  </svg>
)

interface ToggleRowProps {
  readonly label: string
  readonly hint: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
}

const ToggleRow = (props: ToggleRowProps): JSX.Element => (
  <div class="flex justify-between items-center">
    <div>
      <label class="text-sm font-medium text-gray-700 dark:text-gray-300">{props.label}</label>
      <p class="text-xs text-gray-500 dark:text-gray-400">{props.hint}</p>
    </div>
    <div class="relative inline-block w-12 align-middle select-none">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
        class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-gray-300 border-4 border-gray-300 dark:border-gray-600 appearance-none cursor-pointer"
      />
      <label
        class={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
          props.checked ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-800"
        }`}
      />
    </div>
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
    <div class="p-4 space-y-6">
      <div class="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-semibold flex items-center">
          <Sliders class="mr-2 text-blue-500" size={20} />
          {t("settings.ai.title")}
        </h2>

        <div class="flex space-x-2">
          <Motion.button
            onClick={() => void handleSaveSettings()}
            disabled={isSaving() || isLoading()}
            hover={{ scale: 1.02 }}
            press={{ scale: 0.98 }}
            transition={{ duration: 0.2 }}
            class="flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving()
              ? <RefreshCw size={14} class="mr-1.5 animate-spin" />
              : <Save size={14} class="mr-1.5" />}
            {t("settings.ai.save")}
          </Motion.button>
        </div>
      </div>

      <Show when={saveSuccess()}>
        <div class="p-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm rounded flex items-center">
          <Cpu size={14} class="mr-2" />
          {t("settings.ai.saved")}
        </div>
      </Show>

      <Show when={settingsError()}>
        <p role="alert" class="text-sm text-red-600 dark:text-red-400">{settingsError()}</p>
      </Show>

      <fieldset disabled={isLoading() || isSaving()} class="space-y-4 min-w-0">
        <ProviderSettings />
        <SkillsSettings />

        <div>
          <label for="ai-temperature" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
            class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span>Preciso (0.0)</span>
            <span>Equilibrato (0.5)</span>
            <span>Creativo (1.0)</span>
          </div>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Control the randomness of responses. Lower values produce more consistent results, higher values more
            creative.
          </p>
        </div>

        {/* MCP (Model-Completions-Protocol) Section */}
        <div class="pt-4 pb-2 border-t border-gray-200 dark:border-gray-700">
          <div class="flex justify-between items-center">
            <div>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                <Server size={16} class="mr-1.5 text-blue-500" />
                {t("settings.ai.mcp")}
              </label>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Optimize AI requests with advanced semantic caching
              </p>
            </div>
            <div class="relative inline-block w-12 align-middle select-none">
              <input
                type="checkbox"
                checked={settings().mcpEnabled}
                onChange={(event) => updateSettings({ mcpEnabled: event.currentTarget.checked })}
                class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-gray-300 border-4 border-gray-300 dark:border-gray-600 appearance-none cursor-pointer"
              />
              <label
                class={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                  settings().mcpEnabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-800"
                }`}
              />
            </div>
          </div>

          <Show when={settings().mcpEnabled}>
            <div class="mt-3">
              <button
                type="button"
                onClick={() => setShowMCPSettings(!showMCPSettings())}
                class="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center"
              >
                {showMCPSettings() ? t("settings.ai.hideMcp") : t("settings.ai.showMcp")}
                <Chevron open={showMCPSettings()} />
              </button>

              <Show when={showMCPSettings()}>
                <div class="mt-3 space-y-3 pl-2 border-l-2 border-blue-200 dark:border-blue-800">
                  <div>
                    <label for="mcp-endpoint" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("settings.ai.mcpEndpoint")}
                    </label>
                    <input
                      type="text"
                      id="mcp-endpoint"
                      placeholder="/api/mcp-protocol"
                      value={settings().mcpEndpoint ?? "/api/mcp-protocol"}
                      onInput={(event) => updateSettings({ mcpEndpoint: event.currentTarget.value })}
                      class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
                    />
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Default: uses the application&apos;s local endpoint.
                    </p>
                  </div>

                  <div>
                    <label for="mcp-api-key" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("settings.ai.mcpApiKey")}
                    </label>
                    <input
                      type="password"
                      id="mcp-api-key"
                      placeholder="Enter your MCP API key"
                      value={mcpApiKey()}
                      autocomplete="off"
                      onInput={(event) => setMcpApiKey(event.currentTarget.value)}
                      class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
                    />
                  </div>

                  <div>
                    <label for="mcp-strategy" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("settings.ai.mcpStrategy")}
                    </label>
                    <select
                      id="mcp-strategy"
                      value={settings().mcpStrategy}
                      onChange={(event) => updateSettings({ mcpStrategy: event.currentTarget.value as McpStrategy })}
                      class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
                    >
                      <option value="aggressive">Aggressiva (massimo risparmio)</option>
                      <option value="balanced">Bilanciata (predefinita)</option>
                      <option value="conservative">Conservativa (massima precisione)</option>
                    </select>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      The strategy determines when to reuse similar responses from previous requests.
                    </p>
                  </div>

                  <div>
                    <label for="mcp-cache-lifetime" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                      class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span>1 hour</span>
                      <span>1 day</span>
                      <span>1 week</span>
                    </div>
                  </div>

                  <div class="pt-2">
                    <Motion.button
                      onClick={() => void runMcpTest()}
                      disabled={mcpTestStatus() === "testing"}
                      hover={{ scale: 1.02 }}
                      press={{ scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                      class="flex items-center text-sm px-3 py-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                    >
                      {mcpTestStatus() === "testing"
                        ? <RefreshCw size={14} class="mr-1.5 animate-spin" />
                        : <Server size={14} class="mr-1.5" />}
                      {t("settings.ai.mcpTest")}
                    </Motion.button>

                    <Show when={mcpTestStatus() !== "idle" && mcpTestResult() !== undefined}>
                      <div
                        class={`mt-2 p-2 text-xs rounded ${
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

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
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
          class="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center"
        >
          {showAdvanced() ? t("settings.ai.hideAdvanced") : t("settings.ai.showAdvanced")}
          <Chevron open={showAdvanced()} />
        </button>

        <Show when={showAdvanced()}>
          <div class="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
            <div>
              <label for="ai-max-tokens" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>1000</span>
                <span>4000</span>
                <span>8000</span>
              </div>
            </div>

            <div>
              <label for="ai-suggestion-threshold" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>More suggestions (0.1)</span>
                <span>Balanced (0.5)</span>
                <span>Only relevant (0.9)</span>
              </div>
            </div>

            <div class="flex justify-between">
              <button
                type="button"
                disabled
                class="flex items-center text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Database size={14} class="mr-1" />
                {t("settings.ai.clearCache")}
              </button>

              <button
                type="button"
                onClick={() => ai.clear()}
                class="flex items-center text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
              >
                <RefreshCw size={14} class="mr-1" />
                {t("settings.ai.clearHistory")}
              </button>
            </div>
          </div>
        </Show>
      </fieldset>

      {/* Performance summary */}
      <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 mt-4">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
          <Zap size={16} class="mr-1 text-yellow-500" />
          {t("settings.ai.stats")}
        </h3>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <p class="text-xs text-gray-500 dark:text-gray-400">{t("settings.ai.avgResponse")}</p>
            <p class="text-lg font-medium text-gray-900 dark:text-gray-100">
              {Math.round(performance.averageResponseTime)} ms
            </p>
          </div>

          <div>
            <p class="text-xs text-gray-500 dark:text-gray-400">{t("settings.ai.successRate")}</p>
            <p class="text-lg font-medium text-gray-900 dark:text-gray-100">{Math.round(performance.successRate)}%</p>
          </div>
        </div>

        <Show when={settings().mcpEnabled}>
          <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <h4 class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
              <Server size={12} class="mr-1 text-blue-500" />
              {t("settings.ai.mcpStats")}
            </h4>
            <div class="flex space-x-4">
              <div>
                <p class="text-xs text-gray-500 dark:text-gray-400">{t("settings.ai.savings")}</p>
                <p class="text-sm font-medium text-green-600 dark:text-green-400">
                  --
                </p>
              </div>
              <div>
                <p class="text-xs text-gray-500 dark:text-gray-400">{t("settings.ai.strategy")}</p>
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{settings().mcpStrategy}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500 dark:text-gray-400">{t("settings.ai.cacheLabel")}</p>
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {((settings().mcpCacheLifetime || 86400000) / (1000 * 60 * 60)).toFixed(0)}h
                </p>
              </div>
            </div>
          </div>
        </Show>

        <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <div class="flex items-center text-xs text-gray-500 dark:text-gray-400">
              <DollarSign size={12} class="mr-1" />
              {t("settings.ai.costPerK", { cost: "--" })}
            </div>
            <div class="flex items-center text-xs text-gray-500 dark:text-gray-400">
              <Clock size={12} class="mr-1" />
              {t("settings.ai.lastUpdate", { time: new Date(performance.lastSync).toLocaleTimeString() })}
            </div>
          </div>
        </div>
      </div>

      <div class="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-xs rounded-lg flex items-start">
        <AlertTriangle size={14} class="mr-2 flex-shrink-0 mt-0.5" />
        <p>
          Advanced settings can affect performance and costs. The MCP protocol helps reduce costs and improve
          performance by optimizing requests through semantic caching.
        </p>
      </div>

      <Show when={settings().mcpEnabled}>
        <div class="p-3 mt-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 text-xs rounded-lg flex items-start">
          <Shield size={14} class="mr-2 flex-shrink-0 mt-0.5" />
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
