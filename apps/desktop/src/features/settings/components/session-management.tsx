/**
 * `.reference/src/components/settings/SessionManagement.tsx` — the sessions block of
 * the Account tab: current session, authentication sessions, MCP connections, API
 * tokens and the security tips.
 *
 * The legacy screen loaded `/api/auth/sessions` and `/api/mcp/sessions`, which the v6
 * contract does not expose; those two lists render empty exactly like the legacy code
 * does when the endpoint answers nothing. API tokens come from `GET /api/user/tokens`.
 * `revoke*`/`disconnect*` were already no-ops in legacy (confirm + message + reload),
 * and stay that way here.
 *
 * Styling is the workstation vocabulary: neutral translucent surfaces, one accent
 * (blue), status colours only where they carry meaning.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import {
  AlertTriangle, CheckCircle, Clock, Database, Key, Laptop, MapPin, RefreshCw,
  Shield, Smartphone, Tablet, Trash, Wifi, XCircle
} from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useRead } from "../../../app/queries.ts"

interface DeviceInfo {
  readonly browser: string
  readonly os: string
  readonly isMobile: boolean
}

interface AuthSessionRow {
  readonly id: string
  readonly deviceInfo: DeviceInfo
  readonly location?: { readonly ip: string; readonly city?: string; readonly country?: string }
  readonly lastActivity: string
  readonly isCurrent: boolean
}

interface McpSessionRow {
  readonly id: string
  readonly serverName: string
  readonly status: "connected" | "disconnected" | "error"
  readonly connectedAt: string
  readonly messageCount: number
  readonly capabilities: string[]
}

interface ApiTokenRow {
  readonly id: string
  readonly name: string
  readonly prefix: string
  readonly permissions: readonly string[]
  readonly createdAt: string
  readonly lastUsed?: string
  readonly expiresAt?: string
  readonly isActive: boolean
}

/** `.reference/src/store/authStore.ts` `detectDeviceInfo`, verbatim. */
const detectDeviceInfo = (): DeviceInfo => {
  if (typeof window === "undefined") return { browser: "unknown", os: "unknown", isMobile: false }
  const userAgent = navigator.userAgent
  const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent)
  let browser = "unknown"
  if (userAgent.includes("Chrome")) browser = "Chrome"
  else if (userAgent.includes("Firefox")) browser = "Firefox"
  else if (userAgent.includes("Safari")) browser = "Safari"
  else if (userAgent.includes("Edge")) browser = "Edge"
  let os = "unknown"
  if (userAgent.includes("Windows")) os = "Windows"
  else if (userAgent.includes("Mac")) os = "macOS"
  else if (userAgent.includes("Linux")) os = "Linux"
  else if (userAgent.includes("Android")) os = "Android"
  else if (userAgent.includes("iOS")) os = "iOS"
  return { browser, os, isMobile }
}

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString)
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case "connected": return "text-emerald-600 dark:text-emerald-400"
    case "disconnected": return "text-slate-500 dark:text-slate-400"
    case "error": return "text-red-600 dark:text-red-400"
    default: return "text-slate-500 dark:text-slate-400"
  }
}

const DeviceIcon = (props: { readonly deviceInfo: DeviceInfo }): JSX.Element => {
  if (props.deviceInfo.isMobile) return <Smartphone class="h-5 w-5 text-slate-400 dark:text-slate-500" />
  if (props.deviceInfo.os.includes("iPad")) return <Tablet class="h-5 w-5 text-slate-400 dark:text-slate-500" />
  return <Laptop class="h-5 w-5 text-slate-400 dark:text-slate-500" />
}

/** Card surface — the neutral translucent panel of the list pages. */
const CARD = "rounded-xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/60"
const SECONDARY_BUTTON = "inline-flex items-center gap-2 rounded-lg border border-slate-200/70 bg-white/70 px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-colors duration-150 ease-out hover:bg-white disabled:opacity-50 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800/70"
const ICON_BUTTON = "rounded-md p-1.5 text-slate-400 transition-colors duration-150 ease-out hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"

export function SessionManagement(): JSX.Element {
  const tokens = useRead((client) => client.user.tokens())
  const [error, setError] = createSignal<string | undefined>(undefined)
  const [success, setSuccess] = createSignal<string | undefined>(undefined)

  const authSessions: readonly AuthSessionRow[] = []
  const mcpSessions: readonly McpSessionRow[] = []
  const apiTokens = (): readonly ApiTokenRow[] => tokens.data()?.tokens ?? []
  const deviceInfo = detectDeviceInfo()
  const lastLoginMethod: string | undefined = undefined

  const reload = (): void => {
    setError(undefined)
    void tokens.refetch()
  }

  const revokeAuthSession = (sessionId: string): void => {
    if (!window.confirm(t("settings.sessions.revokeConfirm"))) return
    void sessionId
    setSuccess(t("settings.sessions.revoked"))
    reload()
  }

  const disconnectMcpSession = (sessionId: string): void => {
    if (!window.confirm(t("settings.sessions.disconnectConfirm"))) return
    void sessionId
    setSuccess(t("settings.sessions.disconnected"))
    reload()
  }

  const revokeApiToken = (tokenId: string): void => {
    if (!window.confirm(t("settings.sessions.tokenConfirm"))) return
    void tokenId
    setSuccess(t("settings.sessions.tokenRevoked"))
    reload()
  }

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-medium leading-6 text-slate-900 dark:text-white">{t("settings.sessions.title")}</h3>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.sessions.subtitle")}</p>
        </div>

        <button
          type="button"
          onClick={reload}
          disabled={tokens.loading()}
          class={SECONDARY_BUTTON}
        >
          <RefreshCw class="h-4 w-4" />
          {t("settings.sessions.refresh")}
        </button>
      </div>

      {/* Messages */}
      <Show when={error() !== undefined}>
        <div class="rounded-lg border border-red-200/70 bg-red-50/70 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
          {error()}
        </div>
      </Show>

      <Show when={success() !== undefined}>
        <div class="rounded-lg border border-emerald-200/70 bg-emerald-50/70 px-3.5 py-2.5 text-sm text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-300">
          {success()}
        </div>
      </Show>

      <Show when={tokens.error() !== undefined}>
        <div class="rounded-lg border border-red-200/70 bg-red-50/70 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
          <p>{t("settings.sessions.loadFailed")}</p>
          <p class="mt-1 break-all font-mono text-xs">{tokens.error()}</p>
        </div>
      </Show>

      {/* Current Session Info */}
      <div class={CARD + " p-6"}>
        <h4 class="mb-4 flex items-center text-sm font-medium text-slate-700 dark:text-slate-300">
          <CheckCircle class="mr-2 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          {t("settings.sessions.current")}
        </h4>
        <div class="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          <div>
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400">{t("settings.sessions.device")}</span>
            <p class="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">{deviceInfo.browser} on {deviceInfo.os}</p>
          </div>
          <div>
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400">{t("settings.sessions.loginMethod")}</span>
            <p class="mt-0.5 text-sm font-medium capitalize text-slate-900 dark:text-white">{lastLoginMethod || t("settings.sessions.unknown")}</p>
          </div>
          <div>
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400">{t("settings.sessions.expires")}</span>
            <p class="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">{t("settings.sessions.never")}</p>
          </div>
        </div>
      </div>

      {/* Auth Sessions */}
      <div class={CARD}>
        <div class="border-b border-slate-200/70 px-6 py-4 dark:border-slate-700/50">
          <h4 class="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300">
            <Shield class="mr-2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            {t("settings.sessions.authTitle", { count: authSessions.length })}
          </h4>
        </div>

        <div class="divide-y divide-slate-200/70 dark:divide-slate-700/50">
          <For each={authSessions}>
            {(session) => (
              <div class="flex items-center justify-between p-6 transition-colors duration-150 ease-out hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <div class="flex items-center space-x-4">
                  <DeviceIcon deviceInfo={session.deviceInfo} />
                  <div>
                    <h5 class="flex items-center font-medium text-slate-900 dark:text-white">
                      {session.deviceInfo.browser} on {session.deviceInfo.os}
                      <Show when={session.isCurrent}>
                        <span class="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {t("settings.sessions.currentBadge")}
                        </span>
                      </Show>
                    </h5>
                    <div class="space-y-1 text-sm text-slate-500 dark:text-slate-400">
                      <p class="flex items-center">
                        <Clock class="h-3 w-3 mr-1" />
                        {t("settings.sessions.lastActive", { when: formatTimeAgo(session.lastActivity) })}
                      </p>
                      <Show when={session.location !== undefined}>
                        <p class="flex items-center">
                          <MapPin class="h-3 w-3 mr-1" />
                          {session.location?.city}, {session.location?.country} ({session.location?.ip})
                        </p>
                      </Show>
                      <p class="font-mono text-xs text-slate-400 dark:text-slate-500">
                        {t("settings.sessions.sessionId", { id: session.id.slice(0, 8) })}
                      </p>
                    </div>
                  </div>
                </div>

                <Show when={!session.isCurrent}>
                  <button
                    type="button"
                    onClick={() => revokeAuthSession(session.id)}
                    class={ICON_BUTTON}
                    title={t("settings.sessions.revokeTitle")}
                  >
                    <Trash class="h-4 w-4" />
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* MCP Sessions */}
      <div class={CARD}>
        <div class="border-b border-slate-200/70 px-6 py-4 dark:border-slate-700/50">
          <h4 class="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300">
            <Database class="mr-2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            {t("settings.sessions.mcpTitle", { count: mcpSessions.length })}
          </h4>
        </div>

        <div class="divide-y divide-slate-200/70 dark:divide-slate-700/50">
          <For each={mcpSessions}>
            {(session) => (
              <div class="flex items-center justify-between p-6 transition-colors duration-150 ease-out hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <div class="flex items-center space-x-4">
                  <Wifi class={`h-5 w-5 ${getStatusColor(session.status)}`} />
                  <div>
                    <h5 class="font-medium text-slate-900 dark:text-white">{session.serverName}</h5>
                    <div class="space-y-1 text-sm text-slate-500 dark:text-slate-400">
                      <p class="flex items-center">
                        {t("settings.sessions.status")}
                        <span class={`ml-1 font-medium ${getStatusColor(session.status)}`}>{session.status}</span>
                      </p>
                      <p>{t("settings.sessions.connected", { when: formatTimeAgo(session.connectedAt) })}</p>
                      <p>{t("settings.sessions.messages", { count: session.messageCount })}</p>
                      <p class="text-xs">{t("settings.sessions.capabilities", { list: session.capabilities.join(", ") })}</p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => disconnectMcpSession(session.id)}
                  class={ICON_BUTTON}
                  title={t("settings.sessions.disconnectTitle")}
                >
                  <XCircle class="h-4 w-4" />
                </button>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* API Tokens */}
      <div class={CARD}>
        <div class="border-b border-slate-200/70 px-6 py-4 dark:border-slate-700/50">
          <h4 class="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300">
            <Key class="mr-2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            {t("settings.sessions.tokensTitle", { count: apiTokens().length })}
          </h4>
        </div>

        <Show when={tokens.loading()}>
          <div class="p-8 text-center">
            <div class="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-500" />
            <p class="text-sm text-slate-500 dark:text-slate-400">{t("settings.sessions.loading")}</p>
          </div>
        </Show>

        <div class="divide-y divide-slate-200/70 dark:divide-slate-700/50">
          <For each={apiTokens()}>
            {(token) => (
              <div class="flex items-center justify-between p-6 transition-colors duration-150 ease-out hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <div class="flex items-center space-x-4">
                  <Key class={`h-5 w-5 ${token.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`} />
                  <div>
                    <h5 class="flex items-center font-medium text-slate-900 dark:text-white">
                      {token.name}
                      <Show when={!token.isActive}>
                        <span class="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {t("settings.sessions.inactive")}
                        </span>
                      </Show>
                    </h5>
                    <div class="space-y-1 text-sm text-slate-500 dark:text-slate-400">
                      <p class="font-mono">{token.prefix}...</p>
                      <p>{t("settings.sessions.created", { when: formatTimeAgo(token.createdAt) })}</p>
                      <Show when={token.lastUsed !== undefined}>
                        <p>{t("settings.sessions.lastUsed", { when: formatTimeAgo(token.lastUsed ?? "") })}</p>
                      </Show>
                      <Show when={token.expiresAt !== undefined}>
                        <p>{t("settings.sessions.expiresAt", { when: formatTimeAgo(token.expiresAt ?? "") })}</p>
                      </Show>
                      <p class="text-xs">{t("settings.sessions.permissions", { list: token.permissions.join(", ") })}</p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => revokeApiToken(token.id)}
                  class={ICON_BUTTON}
                  title={t("settings.sessions.revokeTokenTitle")}
                >
                  <Trash class="h-4 w-4" />
                </button>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Security Tips */}
      <div class="rounded-xl border border-amber-200/70 bg-amber-50/70 p-6 dark:border-amber-800/50 dark:bg-amber-900/20">
        <h4 class="mb-3 flex items-center text-sm font-medium text-amber-900 dark:text-amber-200">
          <AlertTriangle class="h-4 w-4 mr-2" />
          {t("settings.sessions.tips")}
        </h4>
        <ul class="space-y-2 text-sm text-amber-800 dark:text-amber-300">
          <li>• Regularly review and revoke unused sessions and tokens</li>
          <li>• Sign out of sessions on shared or public devices</li>
          <li>• Use API tokens with minimal required permissions</li>
          <li>• Monitor for suspicious activity from unknown locations</li>
          <li>• Set appropriate expiration dates for API tokens</li>
        </ul>
      </div>
    </div>
  )
}
